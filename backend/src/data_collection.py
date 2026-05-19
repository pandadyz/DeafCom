"""
Record hand-landmark sequences for LSTM training.

Examples:
    # First session (creates sequences 0..39 per class)
    python data_collection.py

    # Extra session from another person/lighting (appends sequences 40..49)
    python data_collection.py --append --sequences 10 --session nguoi_2
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import cv2
import keyboard
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

from my_functions import draw_landmarks, image_process, keypoint_extraction

SRC_DIR = Path(__file__).resolve().parent
CONFIG_PATH = SRC_DIR / "config.json"
DATA_DIR = SRC_DIR / "data"
DEFAULT_FRAMES = 10
DEFAULT_SEQUENCES = 40


def load_class_names() -> list[str]:
    if CONFIG_PATH.is_file():
        with CONFIG_PATH.open(encoding="utf-8") as f:
            config = json.load(f)
        classes = config.get("classes")
        if classes:
            return list(classes)
    return ["xin_chao", "cam_on", "toi_yeu_ban", "giup_do", "xin_loi"]


def list_sequence_ids(action_dir: Path) -> list[int]:
    return sorted(
        int(path.name)
        for path in action_dir.iterdir()
        if path.is_dir() and path.name.isdigit()
    )


def next_sequence_start(action_dir: Path) -> int:
    ids = list_sequence_ids(action_dir)
    return ids[-1] + 1 if ids else 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect sign-language landmark sequences.")
    parser.add_argument(
        "--append",
        action="store_true",
        help="Append new sequences after existing ones (for new person/lighting).",
    )
    parser.add_argument(
        "--sequences",
        type=int,
        default=DEFAULT_SEQUENCES,
        help=f"Number of sequences per class in this session (default: {DEFAULT_SEQUENCES}).",
    )
    parser.add_argument(
        "--frames",
        type=int,
        default=DEFAULT_FRAMES,
        help=f"Frames per sequence (default: {DEFAULT_FRAMES}).",
    )
    parser.add_argument(
        "--session",
        type=str,
        default="default",
        help="Session label shown on screen (e.g. nguoi_2, sang, toi).",
    )
    parser.add_argument(
        "--start-sequence",
        type=int,
        default=None,
        help="Override first sequence index (default: 0 or auto when --append).",
    )
    return parser.parse_args()


def build_sequence_plan(actions: list[str], args: argparse.Namespace) -> dict[str, list[int]]:
    plan: dict[str, list[int]] = {}
    for action in actions:
        action_dir = DATA_DIR / action
        action_dir.mkdir(parents=True, exist_ok=True)

        if args.start_sequence is not None:
            start = args.start_sequence
        elif args.append:
            start = next_sequence_start(action_dir)
        else:
            start = 0

        plan[action] = list(range(start, start + args.sequences))
    return plan


def main() -> None:
    args = parse_args()
    actions = load_class_names()
    sequence_plan = build_sequence_plan(actions, args)

    print("=== Sign language data collection ===")
    print(f"Session: {args.session}")
    print(f"Frames/sequence: {args.frames}")
    for action, seq_ids in sequence_plan.items():
        print(f"  {action}: sequences {seq_ids[0]}..{seq_ids[-1]} ({len(seq_ids)} total)")

    for action, seq_ids in sequence_plan.items():
        for sequence in seq_ids:
            os.makedirs(DATA_DIR / action / str(sequence), exist_ok=True)

    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY)
    if not cap.isOpened():
        print("Cannot access camera.")
        sys.exit(1)

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    cap.set(cv2.CAP_PROP_FPS, 30)

    base_options = python.BaseOptions(model_asset_path=str(SRC_DIR / "hand_landmarker.task"))
    options = vision.HandLandmarkerOptions(base_options=base_options, num_hands=2)

    with vision.HandLandmarker.create_from_options(options) as landmarker:
        aborted = False
        for action in actions:
            for sequence in sequence_plan[action]:
                for frame in range(args.frames):
                    if frame == 0:
                        while True:
                            if keyboard.is_pressed(" "):
                                break
                            _, image = cap.read()
                            results = image_process(image, landmarker)
                            draw_landmarks(image, results)
                            cv2.putText(
                                image,
                                f'[{args.session}] "{action}" seq {sequence}',
                                (20, 20),
                                cv2.FONT_HERSHEY_SIMPLEX,
                                0.6,
                                (0, 0, 255),
                                2,
                                cv2.LINE_AA,
                            )
                            cv2.putText(
                                image,
                                "Press SPACE when ready",
                                (20, 450),
                                cv2.FONT_HERSHEY_SIMPLEX,
                                1,
                                (0, 0, 255),
                                2,
                                cv2.LINE_AA,
                            )
                            cv2.imshow("Camera", image)
                            cv2.waitKey(1)
                            if cv2.getWindowProperty("Camera", cv2.WND_PROP_VISIBLE) < 1:
                                aborted = True
                                break
                        if aborted:
                            break
                    else:
                        _, image = cap.read()
                        results = image_process(image, landmarker)
                        draw_landmarks(image, results)
                        cv2.putText(
                            image,
                            f'[{args.session}] "{action}" seq {sequence} frame {frame}',
                            (20, 20),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            0.6,
                            (0, 0, 255),
                            2,
                            cv2.LINE_AA,
                        )
                        cv2.imshow("Camera", image)
                        cv2.waitKey(1)

                    if cv2.getWindowProperty("Camera", cv2.WND_PROP_VISIBLE) < 1:
                        aborted = True
                        break

                    keypoints = keypoint_extraction(results)
                    frame_path = DATA_DIR / action / str(sequence) / f"{frame}.npy"
                    np.save(frame_path, keypoints)
                if aborted:
                    break
            if aborted:
                break

    cap.release()
    cv2.destroyAllWindows()
    print("Collection finished.")


if __name__ == "__main__":
    main()
