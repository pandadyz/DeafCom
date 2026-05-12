"""
Simple realtime backend for SignDETR.

Design goals:
1) Keep data flow easy to understand.
2) Keep latency stable for 1-3 clients.
3) Send predictable JSON payload to frontend.
"""

import asyncio
import base64
import sys
import time
from collections import Counter, deque
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Optional

import albumentations as A
import cv2
import numpy as np
import torch
import torch.cuda.amp as amp
from albumentations.pytorch import ToTensorV2
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware

from src.model import DETR
from src.utils.boxes import rescale_bboxes
from src.utils.logger import get_logger
from src.utils.setup import get_classes

logger = get_logger("optimized_backend")


@dataclass
class Config:
    checkpoint: str = "checkpoints/99_model.pt"
    num_classes: int = 3
    input_size: int = 224
    conf_threshold: float = 0.85
    max_payload_bytes: int = 5 * 1024 * 1024
    max_client_fps: int = 15
    ws_receive_timeout: float = 30.0
    use_fp16: bool = False
    stabilization_window: int = 12
    stabilization_ratio: float = 0.65
    min_stable_votes: int = 3


CFG = Config()
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


class RuntimeState:
    model: Optional[torch.nn.Module] = None
    classes: Optional[list[str]] = None
    transforms: Optional[A.Compose] = None


state = RuntimeState()


def load_model() -> torch.nn.Module:
    model = DETR(num_classes=CFG.num_classes).to(DEVICE)
    model.eval()
    model.load_pretrained(CFG.checkpoint)
    if CFG.use_fp16 and DEVICE.type == "cuda":
        model = model.half()
    return model


def decode_and_preprocess(data: str) -> Optional[torch.Tensor]:
    try:
        if len(data) > CFG.max_payload_bytes:
            return None

        encoded = data.split(",", 1)[1] if "," in data else data
        nparr = np.frombuffer(base64.b64decode(encoded), np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            return None

        transformed = state.transforms(image=frame)
        tensor = transformed["image"].unsqueeze(0)
        if CFG.use_fp16 and DEVICE.type == "cuda":
            tensor = tensor.half()
        return tensor
    except Exception:
        return None


def infer_single_frame(tensor: torch.Tensor) -> list[dict]:
    tensor = tensor.to(DEVICE, non_blocking=True)

    try:
        with torch.no_grad(), amp.autocast(
            enabled=(CFG.use_fp16 and DEVICE.type == "cuda"),
            dtype=torch.float16,
        ):
            output = state.model(tensor)

        probs = output["pred_logits"].float().softmax(-1)[:, :, :-1]
        max_probs, max_classes = probs.max(-1)
        
        # Debug logging for confidence scores
        if max_probs[0].max() > 0.5:  # Only log if there's something significant
            logger.debug(f"Max confidence: {max_probs[0].max().item():.4f}")
            logger.debug(f"Threshold: {CFG.conf_threshold}")
        
        keep_mask = max_probs[0] > CFG.conf_threshold

        detections: list[dict] = []
        if keep_mask.any():
            bboxes = rescale_bboxes(
                output["pred_boxes"][0][keep_mask],
                (CFG.input_size, CFG.input_size),
            )
            for cls, prob, bbox in zip(
                max_classes[0][keep_mask],
                max_probs[0][keep_mask],
                bboxes,
            ):
                detections.append(
                    {
                        "class": state.classes[cls.item()],
                        "confidence": round(float(prob.item()), 4),
                        "bbox": [round(float(v), 2) for v in bbox.tolist()],
                    }
                )
        return detections
    except Exception as e:
        logger.error(f"Model inference failed: {e}")
        return []


def pick_candidate_word(detections: list[dict]) -> Optional[str]:
    if not detections:
        return None
    best = max(detections, key=lambda item: item["confidence"])
    return str(best["class"])


def get_stable_word(window: deque[Optional[str]]) -> Optional[str]:
    observed = [word for word in window if word]
    if not observed:
        return None
    word, count = Counter(observed).most_common(1)[0]
    if count < CFG.min_stable_votes:
        return None
    if (count / len(observed)) < CFG.stabilization_ratio:
        return None
    return word


def get_candidate_signs(detections: list[dict], limit: int = 3) -> list[str]:
    if not detections:
        return []
    sorted_detections = sorted(detections, key=lambda item: item["confidence"], reverse=True)
    candidates: list[str] = []
    for det in sorted_detections:
        sign = str(det["class"])
        if sign not in candidates:
            candidates.append(sign)
        if len(candidates) >= limit:
            break
    return candidates


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.print_banner()
    logger.realtime("Starting simple realtime sign language server...")
    logger.info(f"Device: {DEVICE}")

    state.transforms = A.Compose(
        [
            A.Resize(CFG.input_size, CFG.input_size),
            A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ToTensorV2(),
        ]
    )

    try:
        state.model = load_model()
        state.classes = get_classes()
    except FileNotFoundError:
        logger.error(f"Checkpoint không tồn tại: {CFG.checkpoint}")
        sys.exit(1)

    if DEVICE.type == "cuda":
        logger.info("Warming up model...")
        dummy = torch.zeros(1, 3, CFG.input_size, CFG.input_size, device=DEVICE)
        if CFG.use_fp16:
            dummy = dummy.half()
        with torch.no_grad():
            _ = state.model(dummy)
        torch.cuda.synchronize()
        logger.info("Warm-up complete.")

    yield
    logger.info("Server shutdown complete.")


app = FastAPI(title="Sign Language Detection - Simple", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    client_id = f"{websocket.client.host}:{websocket.client.port}"
    logger.info(f"Client connected: {client_id}")

    last_processed_at = 0.0
    fps_window_started = time.monotonic()
    processed_frames = 0
    realtime_fps = 0.0
    word_window: deque[Optional[str]] = deque(maxlen=CFG.stabilization_window)

    try:
        while True:
            try:
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=CFG.ws_receive_timeout,
                )
            except asyncio.TimeoutError:
                logger.warning(f"Client {client_id} timeout.")
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                break

            if data == "ping":
                await websocket.send_json({"pong": True})
                continue

            now = time.monotonic()
            min_interval = 1.0 / CFG.max_client_fps
            if now - last_processed_at < min_interval:
                continue
            last_processed_at = now

            tensor = decode_and_preprocess(data)
            if tensor is None:
                await websocket.send_json({"error": "invalid_frame", "detections": []})
                continue

            infer_start = time.perf_counter()
            detections = await asyncio.to_thread(infer_single_frame, tensor)
            latency_ms = round((time.perf_counter() - infer_start) * 1000, 2)
            candidate_word = pick_candidate_word(detections)
            word_window.append(candidate_word)
            stable_word = get_stable_word(word_window)
            candidate_signs = get_candidate_signs(detections)

            processed_frames += 1
            elapsed = time.monotonic() - fps_window_started
            if elapsed >= 1.0:
                realtime_fps = processed_frames / elapsed
                processed_frames = 0
                fps_window_started = time.monotonic()

            await websocket.send_json(
                {
                    "error": None,
                    "event": "detecting",
                    "stable_word": stable_word,
                    "candidate_signs": candidate_signs,
                    "detections": detections,
                    "server_fps": round(realtime_fps, 2),
                    "latency_ms": latency_ms,
                }
            )

    except WebSocketDisconnect:
        logger.info(f"Client {client_id} disconnected.")
    except Exception as e:
        logger.error(f"Unexpected error [{client_id}]: {e}", exc_info=True)
    finally:
        logger.info(f"Connection closed: {client_id}")


@app.get("/health")
async def health():
    mem = {}
    if DEVICE.type == "cuda":
        mem = {
            "vram_allocated_mb": round(torch.cuda.memory_allocated() / 1e6, 1),
            "vram_reserved_mb": round(torch.cuda.memory_reserved() / 1e6, 1),
        }

    return {
        "status": "ok",
        "device": str(DEVICE),
        "fp16": CFG.use_fp16,
        "max_fps": CFG.max_client_fps,
        "input_size": CFG.input_size,
        "model_loaded": state.model is not None,
        "classes": state.classes,
        **mem,
    }


if __name__ == "__main__":
    import uvicorn

    loop_policy = "none" if sys.platform == "win32" else "uvloop"
    uvicorn.run(
        "realtime_optimized:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        workers=1,
        loop=loop_policy,
    )
