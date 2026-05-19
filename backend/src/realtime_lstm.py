"""
Real-time sign language recognition using trained LSTM model.
"""

import json
import sys
from collections import deque
from pathlib import Path

import cv2
import numpy as np
import tensorflow as tf
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

from my_functions import draw_landmarks, image_process, keypoint_extraction

# Paths
SRC_DIR = Path(__file__).resolve().parent
MODEL_PATH = SRC_DIR / "my_model.keras"
SCALER_PATH = SRC_DIR / "landmark_scaler.npz"
METADATA_PATH = SRC_DIR / "model_metadata.json"

# Load metadata
with open(METADATA_PATH, encoding="utf-8") as f:
    metadata = json.load(f)

CLASSES = metadata["classes"]
SEQUENCE_LENGTH = metadata["sequence_length"]
FEATURE_DIM = metadata["feature_dim"]

# Load model
model = tf.keras.models.load_model(MODEL_PATH)
model.summary()

# Load scaler
scaler_data = np.load(SCALER_PATH)
scaler_mean = scaler_data["mean"]
scaler_scale = scaler_data["scale"]

print(f"Model loaded: {MODEL_PATH}")
print(f"Classes: {CLASSES}")
print(f"Sequence length: {SEQUENCE_LENGTH}")
print(f"Feature dimension: {FEATURE_DIM}")


def normalize_landmarks(landmarks: np.ndarray) -> np.ndarray:
    """Normalize landmarks using the saved scaler."""
    n, seq_len, n_features = landmarks.shape
    flattened = landmarks.reshape(n, -1)
    scaled = (flattened - scaler_mean) / scaler_scale
    return scaled.reshape(n, seq_len, n_features).astype(np.float32)


# Initialize MediaPipe HandLandmarker
base_options = python.BaseOptions(model_asset_path="hand_landmarker.task")
options = vision.HandLandmarkerOptions(base_options=base_options, num_hands=2)
landmarker = vision.HandLandmarker.create_from_options(options)

# Initialize camera
_camera_api = cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY
cap = cv2.VideoCapture(0, _camera_api)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

if not cap.isOpened():
    print("Cannot access camera.")
    sys.exit(1)

print("Camera initialized. Press 'q' to quit.")

# Buffer for storing landmark sequences
sequence_buffer = deque(maxlen=SEQUENCE_LENGTH)
predictions_history = deque(maxlen=10)

while True:
    ret, frame = cap.read()
    if not ret:
        print("Failed to read frame from camera")
        break

    # Process frame and extract landmarks
    results = image_process(frame, landmarker)
    keypoints = keypoint_extraction(results)

    # Add to buffer
    sequence_buffer.append(keypoints)

    # Draw landmarks
    draw_landmarks(frame, results)

    # Make prediction if buffer is full
    if len(sequence_buffer) == SEQUENCE_LENGTH:
        # Prepare input
        sequence = np.array(sequence_buffer, dtype=np.float32)
        sequence = sequence.reshape(1, SEQUENCE_LENGTH, FEATURE_DIM)
        sequence = normalize_landmarks(sequence)

        # Predict
        prediction = model.predict(sequence, verbose=0)[0]
        predicted_class_idx = np.argmax(prediction)
        confidence = float(prediction[predicted_class_idx])
        predicted_class = CLASSES[predicted_class_idx]

        # Add to history for smoothing
        predictions_history.append(predicted_class_idx)

        # Get most common prediction in history
        if len(predictions_history) > 0:
            most_common = max(set(predictions_history), key=predictions_history.count)
            smoothed_class = CLASSES[most_common]
        else:
            smoothed_class = predicted_class

        # Display prediction
        text = f"Prediction: {smoothed_class} ({confidence:.2%})"
        cv2.putText(
            frame,
            text,
            (20, 50),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.5,
            (0, 255, 0),
            3,
            cv2.LINE_AA,
        )

        # Display all class probabilities
        y_offset = 100
        for idx, class_name in enumerate(CLASSES):
            prob = float(prediction[idx])
            prob_text = f"{class_name}: {prob:.2%}"
            color = (0, 255, 0) if idx == predicted_class_idx else (255, 255, 255)
            cv2.putText(
                frame,
                prob_text,
                (20, y_offset),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                color,
                2,
                cv2.LINE_AA,
            )
            y_offset += 30

    # Display buffer status
    buffer_text = f"Buffer: {len(sequence_buffer)}/{SEQUENCE_LENGTH}"
    cv2.putText(
        frame,
        buffer_text,
        (20, frame.shape[0] - 30),
        cv2.FONT_HERSHEY_SIMPLEX,
        1,
        (255, 255, 0),
        2,
        cv2.LINE_AA,
    )

    cv2.imshow("Sign Language Recognition", frame)

    if cv2.waitKey(1) & 0xFF == ord("q"):
        print("Quitting...")
        break

cap.release()
cv2.destroyAllWindows()
