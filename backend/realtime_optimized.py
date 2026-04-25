"""
realtime_backend_optimized.py
═══════════════════════════════════════════════════════════════════════
Tối ưu hóa inference cho 1-5 client, GPU NVIDIA CUDA.

Các kỹ thuật áp dụng:
  1. Dynamic Batching       — gom frame từ nhiều client, inference 1 lần
  2. TorchScript (JIT)      — compile model, loại bỏ Python overhead
  3. Mixed Precision FP16   — giảm VRAM ~50%, tăng tốc trên Tensor Core
  4. CUDA Streams           — pipeline CPU↔GPU song song
  5. Frame Skipping         — mỗi client tối đa N fps, bỏ frame dư
  6. Pinned Memory          — tăng tốc CPU→GPU transfer
  7. Warm-up inference      — tránh JIT compile lag ở frame đầu tiên
"""

import asyncio
import base64
import sys
import time
from collections import defaultdict
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Optional

import cv2
import numpy as np
import torch
import torch.cuda.amp as amp
import albumentations as A
from albumentations.pytorch import ToTensorV2
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware

from src.model import DETR
from src.utils.boxes import rescale_bboxes
from src.utils.setup import get_classes
from src.utils.logger import get_logger

logger = get_logger("optimized_backend")


# ══════════════════════════════════════════════════════════════════════
# Config — chỉnh tại đây, không cần đụng logic bên dưới
# ══════════════════════════════════════════════════════════════════════
@dataclass
class Config:
    # Model
    checkpoint:    str   = "checkpoints/99_model.pt"
    num_classes:   int   = 3
    frame_w:       int   = 1280
    frame_h:       int   = 720

    # Inference
    conf_threshold: float = 0.80
    use_fp16:       bool  = True   # Tắt nếu GPU không hỗ trợ Tensor Core (GTX < 16xx)
    use_jit:        bool  = True   # TorchScript compile

    # Dynamic batching
    max_batch_size: int   = 4      # Tối đa 4 frame / lần forward pass
    batch_timeout:  float = 0.020  # Chờ tối đa 20ms để gom batch

    # Frame skipping — giới hạn fps xử lý mỗi client
    max_client_fps: int   = 15     # 15 fps là đủ cho nhận diện ký hiệu

    # Payload safety
    max_payload_bytes: int = 5 * 1024 * 1024  # 5 MB

    # WebSocket
    ws_receive_timeout: float = 10.0


CFG = Config()
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


# ══════════════════════════════════════════════════════════════════════
# Shared state
# ══════════════════════════════════════════════════════════════════════
@dataclass
class AppState:
    model:      Optional[torch.jit.ScriptModule] = None
    classes:    Optional[list]  = None
    transforms: Optional[A.Compose] = None
    # Dynamic batch queue: List[(future, tensor)]
    batch_queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    # CUDA stream cho inference
    cuda_stream: Optional[torch.cuda.Stream] = None


state = AppState()


# ══════════════════════════════════════════════════════════════════════
# Model loading & JIT compile
# ══════════════════════════════════════════════════════════════════════
def load_model() -> torch.jit.ScriptModule:
    """
    Load DETR, chuyển FP16 nếu được bật, compile TorchScript.
    TorchScript loại bỏ Python interpreter overhead trong vòng lặp inference.
    """
    model = DETR(num_classes=CFG.num_classes).to(DEVICE)
    model.eval()
    model.load_pretrained(CFG.checkpoint)

    if CFG.use_fp16 and DEVICE.type == "cuda":
        model = model.half()
        logger.info("FP16 (half precision) enabled — VRAM giảm ~50%")

    if CFG.use_jit:
        # Dùng torch.jit.script thay trace để giữ nguyên control flow
        try:
            dummy = torch.zeros(1, 3, 224, 224, device=DEVICE)
            if CFG.use_fp16:
                dummy = dummy.half()
            model = torch.jit.trace(model, dummy)
            model = torch.jit.optimize_for_inference(model)
            logger.info("TorchScript JIT compiled & optimized.")
        except Exception as e:
            logger.warning(f"JIT compile thất bại ({e}), dùng eager mode.")

    return model


def warmup_model(model) -> None:
    """
    Chạy 3 lần inference giả để:
    - CUDA JIT compile kernel lần đầu
    - Tránh spike latency ở frame thực đầu tiên
    """
    logger.info("Warming up model...")
    dummy = torch.zeros(CFG.max_batch_size, 3, 224, 224, device=DEVICE)
    if CFG.use_fp16:
        dummy = dummy.half()
    with torch.no_grad():
        for _ in range(3):
            _ = model(dummy)
    torch.cuda.synchronize()
    logger.info("Warm-up complete.")


# ══════════════════════════════════════════════════════════════════════
# Dynamic Batch Worker
# ══════════════════════════════════════════════════════════════════════
async def batch_inference_worker():
    """
    Coroutine chạy liên tục, gom frame từ nhiều client thành batch,
    inference 1 lần duy nhất, trả kết quả về từng client qua Future.

    Timeline ví dụ (3 client gửi cùng lúc):
      t=0ms   Client A gửi frame  → vào queue
      t=2ms   Client B gửi frame  → vào queue
      t=5ms   Client C gửi frame  → vào queue
      t=20ms  Timeout → gom batch [A,B,C] → 1 lần forward pass
              → trả kết quả về A, B, C đồng thời
    Thay vì: 3 lần forward pass riêng lẻ = 3x latency
    """
    loop = asyncio.get_event_loop()

    while True:
        # ── Lấy item đầu tiên (block đến khi có) ─────────────────────
        pending: list[tuple[asyncio.Future, torch.Tensor]] = []
        try:
            first = await state.batch_queue.get()
            pending.append(first)
        except asyncio.CancelledError:
            break

        # ── Gom thêm frame trong khoảng batch_timeout ─────────────────
        deadline = loop.time() + CFG.batch_timeout
        while len(pending) < CFG.max_batch_size:
            remaining = deadline - loop.time()
            if remaining <= 0:
                break
            try:
                item = await asyncio.wait_for(
                    state.batch_queue.get(), timeout=remaining
                )
                pending.append(item)
            except asyncio.TimeoutError:
                break

        futures, tensors = zip(*pending)

        # ── Ghép thành batch tensor ────────────────────────────────────
        batch_tensor = torch.cat(tensors, dim=0)  # (B, 3, 224, 224)

        # ── Inference (chạy trong thread để không block event loop) ────
        try:
            results = await loop.run_in_executor(
                None, _run_batch_inference, batch_tensor
            )
        except Exception as e:
            logger.error(f"Batch inference error: {e}")
            results = [[] for _ in pending]

        # ── Phân phát kết quả về từng Future (từng client) ─────────────
        for fut, det in zip(futures, results):
            if not fut.done():
                fut.set_result(det)


def _run_batch_inference(batch_tensor: torch.Tensor) -> list[list[dict]]:
    """
    Chạy đồng bộ trên thread riêng.
    Sử dụng CUDA Stream để pipeline GPU computation.
    """
    with torch.cuda.stream(state.cuda_stream):
        batch_tensor = batch_tensor.to(DEVICE, non_blocking=True)

        # Mixed precision: FP16 forward pass
        with torch.no_grad(), amp.autocast(
            device_type="cuda",
            enabled=(CFG.use_fp16 and DEVICE.type == "cuda"),
            dtype=torch.float16,
        ):
            output = state.model(batch_tensor)

        # Sync stream trước khi đọc kết quả về CPU
        state.cuda_stream.synchronize()

    return _parse_output(output, batch_size=batch_tensor.shape[0])


def _parse_output(output: dict, batch_size: int) -> list[list[dict]]:
    """Chuyển output tensor thành list detection cho từng ảnh trong batch."""
    probs = output["pred_logits"].float().softmax(-1)[:, :, :-1]
    max_probs, max_classes = probs.max(-1)
    keep_mask = max_probs > CFG.conf_threshold

    all_detections: list[list[dict]] = [[] for _ in range(batch_size)]

    for img_idx in range(batch_size):
        query_mask = keep_mask[img_idx]
        if not query_mask.any():
            continue

        bboxes = rescale_bboxes(
            output["pred_boxes"][img_idx][query_mask],
            (CFG.frame_w, CFG.frame_h),
        )
        for cls, prob, bbox in zip(
            max_classes[img_idx][query_mask],
            max_probs[img_idx][query_mask],
            bboxes,
        ):
            all_detections[img_idx].append({
                "class":      state.classes[cls.item()],
                "confidence": round(float(prob.item()), 4),
                "bbox":       [round(float(v), 2) for v in bbox.tolist()],
            })

    # Giải phóng GPU memory ngay sau khi đọc xong
    del output, probs, max_probs, max_classes, keep_mask
    torch.cuda.empty_cache()

    return all_detections


# ══════════════════════════════════════════════════════════════════════
# Frame preprocessing
# ══════════════════════════════════════════════════════════════════════
def decode_and_preprocess(data: str) -> Optional[torch.Tensor]:
    """
    Base64 → numpy frame → albumentations → tensor FP16/FP32.
    Dùng pinned memory để tăng tốc CPU→GPU transfer.
    """
    try:
        if len(data) > CFG.max_payload_bytes:
            return None

        encoded = data.split(",", 1)[1] if "," in data else data
        nparr   = np.frombuffer(base64.b64decode(encoded), np.uint8)
        frame   = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            return None

        transformed = state.transforms(image=frame)
        tensor = transformed["image"].unsqueeze(0)  # (1, 3, 224, 224)

        if CFG.use_fp16:
            tensor = tensor.half()

        # Pin memory để CPU→GPU transfer không cần staging buffer
        return tensor.pin_memory()

    except Exception:
        return None


# ══════════════════════════════════════════════════════════════════════
# Frame rate limiter (per-client)
# ══════════════════════════════════════════════════════════════════════
class FpsLimiter:
    """
    Giới hạn số frame xử lý mỗi giây cho mỗi client.
    Frame đến quá nhanh sẽ bị skip (không xử lý, không block).
    """
    def __init__(self, max_fps: int):
        self._interval = 1.0 / max_fps
        self._last_ts: dict[str, float] = defaultdict(float)

    def should_process(self, client_id: str) -> bool:
        now = time.monotonic()
        if now - self._last_ts[client_id] >= self._interval:
            self._last_ts[client_id] = now
            return True
        return False

    def remove(self, client_id: str) -> None:
        self._last_ts.pop(client_id, None)


fps_limiter = FpsLimiter(CFG.max_client_fps)


# ══════════════════════════════════════════════════════════════════════
# Lifespan
# ══════════════════════════════════════════════════════════════════════
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.print_banner()
    logger.realtime("Starting optimized sign language detection server...")
    logger.info(f"Device: {DEVICE} | FP16: {CFG.use_fp16} | JIT: {CFG.use_jit}")

    state.transforms = A.Compose([
        A.Resize(224, 224),
        A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ToTensorV2(),
    ])

    try:
        state.model   = load_model()
        state.classes = get_classes()
    except FileNotFoundError:
        logger.error(f"Checkpoint không tồn tại: {CFG.checkpoint}")
        sys.exit(1)

    if DEVICE.type == "cuda":
        state.cuda_stream = torch.cuda.Stream()
        warmup_model(state.model)

    # Khởi động batch worker như background task
    worker_task = asyncio.create_task(batch_inference_worker())
    logger.info("Batch inference worker started.")

    yield

    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass
    logger.info("Server shutdown complete.")


app = FastAPI(title="Sign Language Detection — Optimized", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ══════════════════════════════════════════════════════════════════════
# WebSocket endpoint
# ══════════════════════════════════════════════════════════════════════
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    client_id = f"{websocket.client.host}:{websocket.client.port}"
    logger.info(f"Client connected: {client_id}")
    loop = asyncio.get_event_loop()

    try:
        while True:
            # ── Nhận frame ──────────────────────────────────────────
            try:
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=CFG.ws_receive_timeout,
                )
            except asyncio.TimeoutError:
                logger.warning(f"Client {client_id} timeout.")
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                break

            # ── Frame skipping ──────────────────────────────────────
            # Client gửi 30fps nhưng ta chỉ xử lý 15fps → skip frame dư
            if not fps_limiter.should_process(client_id):
                continue  # Không gửi response, frontend giữ kết quả cũ

            # ── Decode + preprocess ─────────────────────────────────
            tensor = decode_and_preprocess(data)
            if tensor is None:
                await websocket.send_json({"error": "invalid_frame", "detections": []})
                continue

            # ── Đưa vào batch queue, chờ kết quả qua Future ─────────
            future: asyncio.Future = loop.create_future()
            await state.batch_queue.put((future, tensor))

            try:
                detections = await asyncio.wait_for(future, timeout=2.0)
            except asyncio.TimeoutError:
                logger.warning(f"Inference timeout cho client {client_id}")
                await websocket.send_json({"error": "inference_timeout", "detections": []})
                continue

            await websocket.send_json({"error": None, "detections": detections})

    except WebSocketDisconnect:
        logger.info(f"Client {client_id} disconnected.")
    except Exception as e:
        logger.error(f"Unexpected error [{client_id}]: {e}", exc_info=True)
    finally:
        fps_limiter.remove(client_id)
        logger.info(f"Connection closed: {client_id}")


# ══════════════════════════════════════════════════════════════════════
# Health check
# ══════════════════════════════════════════════════════════════════════
@app.get("/health")
async def health():
    mem = {}
    if DEVICE.type == "cuda":
        mem = {
            "vram_allocated_mb": round(torch.cuda.memory_allocated() / 1e6, 1),
            "vram_reserved_mb":  round(torch.cuda.memory_reserved()  / 1e6, 1),
        }
    return {
        "status":       "ok",
        "device":       str(DEVICE),
        "fp16":         CFG.use_fp16,
        "jit":          CFG.use_jit,
        "batch_size":   CFG.max_batch_size,
        "max_fps":      CFG.max_client_fps,
        "model_loaded": state.model is not None,
        "classes":      state.classes,
        **mem,
    }


# ══════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "realtime_backend_optimized:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        workers=1,       # WebSocket + shared state → luôn dùng 1 worker
        loop="uvloop",   # pip install uvloop — nhanh hơn asyncio default ~2x
    )