"""Augmentations for MediaPipe hand-landmark sequences (T, 126)."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

LEFT_HAND_SLICE = slice(0, 63)
RIGHT_HAND_SLICE = slice(63, 126)
HAND_DIM = 63
JOINTS_PER_HAND = 21


@dataclass
class AugmentConfig:
    copies_per_sample: int = 5
    noise_std: float = 0.02
    scale_range: tuple[float, float] = (0.88, 1.12)
    time_shift_max: int = 3
    flip_prob: float = 0.5
    mirror_x_prob: float = 0.4
    dropout_joint_prob: float = 0.08
    temporal_mask_prob: float = 0.35
    rotation_prob: float = 0.45
    rotation_deg_range: tuple[float, float] = (-12.0, 12.0)
    strong_prob: float = 0.55


def _swap_hands(sequence: np.ndarray) -> np.ndarray:
    out = sequence.copy()
    out[:, LEFT_HAND_SLICE] = sequence[:, RIGHT_HAND_SLICE]
    out[:, RIGHT_HAND_SLICE] = sequence[:, LEFT_HAND_SLICE]
    return out


def _mirror_x(sequence: np.ndarray) -> np.ndarray:
    out = sequence.copy()
    for hand_slice in (LEFT_HAND_SLICE, RIGHT_HAND_SLICE):
        hand = out[:, hand_slice].reshape(-1, JOINTS_PER_HAND, 3)
        hand[:, :, 0] = 1.0 - hand[:, :, 0]
        out[:, hand_slice] = hand.reshape(hand.shape[0], HAND_DIM)
    return out


def _add_noise(sequence: np.ndarray, std: float, rng: np.random.Generator) -> np.ndarray:
    return sequence + rng.normal(0.0, std, sequence.shape).astype(np.float32)


def _scale_sequence(
    sequence: np.ndarray, scale_range: tuple[float, float], rng: np.random.Generator
) -> np.ndarray:
    scale = rng.uniform(scale_range[0], scale_range[1])
    return (sequence * scale).astype(np.float32)


def _time_shift(sequence: np.ndarray, max_shift: int, rng: np.random.Generator) -> np.ndarray:
    if max_shift <= 0:
        return sequence
    shift = int(rng.integers(-max_shift, max_shift + 1))
    if shift == 0:
        return sequence
    return np.roll(sequence, shift=shift, axis=0).astype(np.float32)


def _temporal_mask(sequence: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    out = sequence.copy()
    n_frames = out.shape[0]
    n_mask = int(rng.integers(1, min(3, n_frames)))
    mask_ids = rng.choice(n_frames, size=n_mask, replace=False)
    for idx in mask_ids:
        prev_idx = max(0, idx - 1)
        next_idx = min(n_frames - 1, idx + 1)
        out[idx] = 0.5 * (out[prev_idx] + out[next_idx])
    return out.astype(np.float32)


def _rotate_hand_plane(
    hand: np.ndarray, deg_range: tuple[float, float], rng: np.random.Generator
) -> np.ndarray:
    joints = hand.reshape(JOINTS_PER_HAND, 3).copy()
    wrist = joints[0, :2]
    theta = np.deg2rad(rng.uniform(deg_range[0], deg_range[1]))
    cos_t, sin_t = np.cos(theta), np.sin(theta)
    xy = joints[:, :2] - wrist
    rot_x = cos_t * xy[:, 0] - sin_t * xy[:, 1]
    rot_y = sin_t * xy[:, 0] + cos_t * xy[:, 1]
    joints[:, 0] = rot_x + wrist[0]
    joints[:, 1] = rot_y + wrist[1]
    return joints.reshape(HAND_DIM)


def _rotate_sequence(
    sequence: np.ndarray, deg_range: tuple[float, float], rng: np.random.Generator
) -> np.ndarray:
    out = sequence.copy()
    for t in range(out.shape[0]):
        out[t, LEFT_HAND_SLICE] = _rotate_hand_plane(
            out[t, LEFT_HAND_SLICE], deg_range, rng
        )
        out[t, RIGHT_HAND_SLICE] = _rotate_hand_plane(
            out[t, RIGHT_HAND_SLICE], deg_range, rng
        )
    return out.astype(np.float32)


def _joint_dropout(
    sequence: np.ndarray, prob: float, rng: np.random.Generator
) -> np.ndarray:
    out = sequence.copy()
    for hand_start in (0, HAND_DIM):
        hand = out[:, hand_start : hand_start + HAND_DIM].reshape(-1, JOINTS_PER_HAND, 3)
        mask = rng.random(JOINTS_PER_HAND) < prob
        hand[:, mask, :] = 0.0
        out[:, hand_start : hand_start + HAND_DIM] = hand.reshape(hand.shape[0], HAND_DIM)
    return out


def augment_sequence(
    sequence: np.ndarray,
    cfg: AugmentConfig,
    rng: np.random.Generator,
    *,
    strong: bool = True,
) -> np.ndarray:
    out = sequence.astype(np.float32, copy=True)
    out = _scale_sequence(out, cfg.scale_range, rng)
    out = _time_shift(out, cfg.time_shift_max, rng)

    if strong:
        if rng.random() < cfg.temporal_mask_prob:
            out = _temporal_mask(out, rng)
        if rng.random() < cfg.rotation_prob:
            out = _rotate_sequence(out, cfg.rotation_deg_range, rng)

    out = _add_noise(out, cfg.noise_std if strong else cfg.noise_std * 0.5, rng)

    if rng.random() < cfg.flip_prob:
        out = _swap_hands(out)
    if rng.random() < cfg.mirror_x_prob:
        out = _mirror_x(out)
    if strong and cfg.dropout_joint_prob > 0:
        out = _joint_dropout(out, cfg.dropout_joint_prob, rng)
    return out


def augment_training_set(
    x_train: np.ndarray,
    y_train: np.ndarray,
    cfg: AugmentConfig | None = None,
    seed: int = 34,
) -> tuple[np.ndarray, np.ndarray]:
    cfg = cfg or AugmentConfig()
    if cfg.copies_per_sample <= 0:
        return x_train, y_train

    rng = np.random.default_rng(seed)
    augmented_x: list[np.ndarray] = []
    augmented_y: list[np.ndarray] = []

    for sample, label in zip(x_train, y_train):
        augmented_x.append(sample)
        augmented_y.append(label)
        for _ in range(cfg.copies_per_sample):
            strong = rng.random() < cfg.strong_prob
            augmented_x.append(augment_sequence(sample, cfg, rng, strong=strong))
            augmented_y.append(label)

    x_out = np.asarray(augmented_x, dtype=np.float32)
    y_out = np.asarray(augmented_y, dtype=np.float32)
    perm = rng.permutation(len(x_out))
    return x_out[perm], y_out[perm]
