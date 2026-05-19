"""
Simple realtime backend for SignDETR.

Design goals:
1) Keep data flow easy to understand.
2) Keep latency stable for 1-3 clients.
3) Send predictable JSON payload to frontend.
"""

import asyncio
import base64
import json
import sys
import time
from collections import Counter, deque
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import numpy as np
import tensorflow as tf
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware

from src.utils.logger import get_logger

logger = get_logger("optimized_backend")


BACKEND_DIR = Path(__file__).resolve().parent
SRC_DIR = BACKEND_DIR / "src"
DEFAULT_CLASSES = ["xin_chao", "cam_on", "toi_yeu_ban", "giup_do", "xin_loi"]


@dataclass
class Config:
    checkpoint: str = "src/my_model.keras"
    metadata_path: str = "src/model_metadata.json"
    scaler_path: str = "src/landmark_scaler.npz"
    num_classes: int = 5
    sequence_length: int = 10
    conf_threshold: float = 0.5
    max_payload_bytes: int = 5 * 1024 * 1024
    max_client_fps: int = 15
    ws_receive_timeout: float = 30.0
    stabilization_window: int = 12
    stabilization_ratio: float = 0.65
    min_stable_votes: int = 3
    classes: list = field(default_factory=lambda: list(DEFAULT_CLASSES))


CFG = Config()


def _resolve_backend_path(relative: str) -> Path:
    path = Path(relative)
    return path if path.is_absolute() else BACKEND_DIR / path


def load_runtime_config() -> None:
    metadata_file = _resolve_backend_path(CFG.metadata_path)
    if metadata_file.is_file():
        with metadata_file.open(encoding="utf-8") as f:
            metadata = json.load(f)
        CFG.classes = metadata.get("classes", CFG.classes)
        CFG.sequence_length = int(metadata.get("sequence_length", CFG.sequence_length))
        CFG.num_classes = len(CFG.classes)
        logger.info(f"Loaded model metadata from {metadata_file}")


def apply_landmark_scaler(sequence: np.ndarray) -> np.ndarray:
    scaler_file = _resolve_backend_path(CFG.scaler_path)
    if not scaler_file.is_file():
        return sequence

    params = np.load(scaler_file)
    mean = params["mean"]
    scale = params["scale"]
    n_frames, n_features = sequence.shape
    flat = sequence.reshape(1, -1)
    scaled = (flat - mean) / scale
    return scaled.reshape(n_frames, n_features).astype(np.float32)


class RuntimeState:
    model: Optional[tf.keras.Model] = None
    hand_landmarker: Optional[object] = None


state = RuntimeState()


def load_model() -> tf.keras.Model:
    model = tf.keras.models.load_model(CFG.checkpoint)
    return model


def decode_and_preprocess(data: str) -> Optional[np.ndarray]:
    try:
        if len(data) > CFG.max_payload_bytes:
            return None

        encoded = data.split(",", 1)[1] if "," in data else data
        nparr = np.frombuffer(base64.b64decode(encoded), np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            return None

        # Extract landmarks using mediapipe task-based API
        image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=image_rgb)
        results = state.hand_landmarker.detect(mp_image)
        
        # Initialize keypoints for both hands
        lh = np.zeros(63)
        rh = np.zeros(63)
        
        # Extract keypoints from detected hands
        if results.hand_landmarks:
            if len(results.hand_landmarks) >= 1:
                # First hand
                lh = np.array([[res.x, res.y, res.z] for res in results.hand_landmarks[0]]).flatten()
            if len(results.hand_landmarks) >= 2:
                # Second hand
                rh = np.array([[res.x, res.y, res.z] for res in results.hand_landmarks[1]]).flatten()
            
            # Concatenate the keypoints for both hands
            keypoints = np.concatenate([lh, rh])
            return keypoints
        else:
            # No hands detected - return None to indicate no gesture
            return None
    except Exception as e:
        logger.error(f"Preprocessing failed: {e}")
        return None


def infer_sequence(sequence: np.ndarray) -> dict:
    try:
        sequence = apply_landmark_scaler(sequence)
        # Reshape sequence for LSTM input (1, sequence_length, features)
        sequence = sequence.reshape(1, CFG.sequence_length, -1)
        
        # Make prediction
        predictions = state.model.predict(sequence, verbose=0)
        predicted_class = np.argmax(predictions[0])
        confidence = float(predictions[0][predicted_class])
        
        if confidence > CFG.conf_threshold:
            return {
                "class": CFG.classes[predicted_class],
                "confidence": round(confidence, 4),
            }
        return None
    except Exception as e:
        logger.error(f"Model inference failed: {e}")
        return None


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

    try:
        load_runtime_config()
        state.model = load_model()
        logger.info(f"Model loaded from: {CFG.checkpoint}")
    except FileNotFoundError:
        logger.error(f"Checkpoint không tồn tại: {CFG.checkpoint}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        sys.exit(1)

    # Initialize mediapipe hand landmarker
    try:
        landmarker_path = str(_resolve_backend_path("src/hand_landmarker.task"))
        base_options = python.BaseOptions(model_asset_path=landmarker_path)
        options = vision.HandLandmarkerOptions(base_options=base_options, num_hands=2)
        state.hand_landmarker = vision.HandLandmarker.create_from_options(options)
        logger.info("MediaPipe HandLandmarker initialized")
    except Exception as e:
        logger.error(f"Failed to initialize MediaPipe: {e}")
        sys.exit(1)

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
    sequence_buffer: deque[np.ndarray] = deque(maxlen=CFG.sequence_length)

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

            keypoints = decode_and_preprocess(data)
            if keypoints is None:
                # No hands detected - clear buffers and return empty detections
                sequence_buffer.clear()
                word_window.clear()
                await websocket.send_json({
                    "error": None,
                    "event": "no_hands",
                    "stable_word": None,
                    "candidate_signs": [],
                    "detections": [],
                    "server_fps": round(realtime_fps, 2),
                })
                continue

            # Add keypoints to sequence buffer
            sequence_buffer.append(keypoints)

            # Only make prediction when buffer is full
            if len(sequence_buffer) == CFG.sequence_length:
                infer_start = time.perf_counter()
                sequence_array = np.array(list(sequence_buffer))
                prediction = await asyncio.to_thread(infer_sequence, sequence_array)
                latency_ms = round((time.perf_counter() - infer_start) * 1000, 2)
                
                detections = [prediction] if prediction else []
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
            else:
                # Send waiting status while buffering
                await websocket.send_json(
                    {
                        "error": None,
                        "event": "buffering",
                        "buffer_progress": len(sequence_buffer) / CFG.sequence_length,
                        "detections": [],
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
    return {
        "status": "ok",
        "model_loaded": state.model is not None,
        "hand_landmarker_loaded": state.hand_landmarker is not None,
        "max_fps": CFG.max_client_fps,
        "sequence_length": CFG.sequence_length,
        "classes": CFG.classes,
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
