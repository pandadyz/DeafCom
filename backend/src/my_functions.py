import mediapipe as mp
from mediapipe.tasks.python import vision
import cv2
import numpy as np

def draw_landmarks(image, results):
    """
    Draw the landmarks on the image.

    Args:
        image (numpy.ndarray): The input image.
        results: The landmarks detected by Mediapipe.

    Returns:
        None
    """
    # Draw landmarks for detected hands using manual drawing
    if results.hand_landmarks:
        for hand_landmarks in results.hand_landmarks:
            for landmark in hand_landmarks:
                x = int(landmark.x * image.shape[1])
                y = int(landmark.y * image.shape[0])
                cv2.circle(image, (x, y), 5, (0, 255, 0), -1)

def image_process(image, landmarker):
    """
    Process the image and obtain sign landmarks.

    Args:
        image (numpy.ndarray): The input image.
        landmarker: The Mediapipe HandLandmarker object.

    Returns:
        results: The processed results containing sign landmarks.
    """
    # Convert the image from BGR to RGB
    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    # Create MediaPipe Image object
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=image_rgb)
    # Process the image using the landmarker
    results = landmarker.detect(mp_image)
    return results

def keypoint_extraction(results):
    """
    Extract the keypoints from the sign landmarks.

    Args:
        results: The processed results containing sign landmarks.

    Returns:
        keypoints (numpy.ndarray): The extracted keypoints.
    """
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
