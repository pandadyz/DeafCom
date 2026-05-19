import asyncio
import time
from collections import deque

import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

import realtime_optimized as legacy_sign

router = APIRouter(tags=["sign"])


@router.websocket("/ws")
async def websocket_legacy_compat(websocket: WebSocket):
    await legacy_sign.websocket_endpoint(websocket)


@router.websocket("/ws/sign")
async def websocket_sign(websocket: WebSocket):
    await websocket.accept()
    client_id = f"{websocket.client.host}:{websocket.client.port}"
    legacy_sign.logger.info(f"[sign] Client connected: {client_id}")

    last_processed_at = 0.0
    fps_window_started = time.monotonic()
    processed_frames = 0
    realtime_fps = 0.0
    word_window: deque[str | None] = deque(maxlen=legacy_sign.CFG.stabilization_window)
    sequence_buffer: deque[np.ndarray] = deque(maxlen=legacy_sign.CFG.sequence_length)

    try:
        while True:
            try:
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=legacy_sign.CFG.ws_receive_timeout,
                )
            except asyncio.TimeoutError:
                legacy_sign.logger.warning(f"[sign] Client {client_id} timeout.")
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                break

            if data == "ping":
                await websocket.send_json({"pong": True})
                continue

            now = time.monotonic()
            min_interval = 1.0 / legacy_sign.CFG.max_client_fps
            if now - last_processed_at < min_interval:
                continue
            last_processed_at = now

            keypoints = legacy_sign.decode_and_preprocess(data)
            if keypoints is None:
                await websocket.send_json({"error": "invalid_frame", "detections": []})
                continue

            sequence_buffer.append(keypoints)

            if len(sequence_buffer) < legacy_sign.CFG.sequence_length:
                await websocket.send_json(
                    {
                        "error": None,
                        "event": "buffering",
                        "source": "ws/sign",
                        "buffer_progress": len(sequence_buffer)
                        / legacy_sign.CFG.sequence_length,
                        "detections": [],
                    }
                )
                continue

            infer_start = time.perf_counter()
            sequence_array = np.array(list(sequence_buffer))
            prediction = await asyncio.to_thread(legacy_sign.infer_sequence, sequence_array)
            latency_ms = round((time.perf_counter() - infer_start) * 1000, 2)

            detections = [prediction] if prediction else []
            candidate_word = legacy_sign.pick_candidate_word(detections)
            word_window.append(candidate_word)
            stable_word = legacy_sign.get_stable_word(word_window)
            candidate_signs = legacy_sign.get_candidate_signs(detections)

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
                    "source": "ws/sign",
                    "stable_word": stable_word,
                    "candidate_signs": candidate_signs,
                    "detections": detections,
                    "server_fps": round(realtime_fps, 2),
                    "latency_ms": latency_ms,
                }
            )
    except WebSocketDisconnect:
        legacy_sign.logger.info(f"[sign] Client {client_id} disconnected.")
    except Exception as exc:
        legacy_sign.logger.error(f"[sign] Unexpected error [{client_id}]: {exc}", exc_info=True)
    finally:
        legacy_sign.logger.info(f"[sign] Connection closed: {client_id}")


@router.get("/health")
async def sign_health() -> dict:
    return await legacy_sign.health()
