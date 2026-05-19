"""
Train an LSTM classifier on MediaPipe hand-landmark sequences (.npy).

Run from backend/src:
    python model.py
"""

from __future__ import annotations

import json
import os
import random
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import tensorflow as tf
from sklearn import metrics
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
from tensorflow.keras.layers import BatchNormalization, Dense, Dropout, LSTM
from tensorflow.keras.models import Sequential
from tensorflow.keras.utils import to_categorical

from landmark_augmentation import AugmentConfig, augment_training_set
from utils.logger import get_logger

SRC_DIR = Path(__file__).resolve().parent
DATA_DIR = SRC_DIR / "data"
CONFIG_PATH = SRC_DIR / "config.json"
MODEL_PATH = SRC_DIR / "my_model.keras"
CHECKPOINT_DIR = SRC_DIR / "checkpoints" / "lstm"
MANIFEST_PATH = CHECKPOINT_DIR / "epoch_manifest.json"
METADATA_PATH = SRC_DIR / "model_metadata.json"
SCALER_PATH = SRC_DIR / "landmark_scaler.npz"

logger = get_logger("model")


@dataclass
class TrainConfig:
    val_size: float = 0.15
    test_size: float = 0.10
    random_state: int = 34
    epochs: int = 1000
    batch_size: int = 16
    patience: int = 25
    checkpoint_interval: int = 10
    lstm_units: tuple[int, int, int] = (64, 128, 64)
    dense_units: int = 64
    dropout: float = 0.35
    learning_rate: float = 1e-3
    augment: AugmentConfig = field(default_factory=AugmentConfig)


def set_seeds(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    tf.random.set_seed(seed)


def load_class_names() -> list[str]:
    if CONFIG_PATH.is_file():
        with CONFIG_PATH.open(encoding="utf-8") as f:
            config = json.load(f)
        classes = config.get("classes")
        if classes:
            return list(classes)

    if not DATA_DIR.is_dir():
        raise FileNotFoundError(f"Data directory not found: {DATA_DIR}")

    return sorted(
        name
        for name in os.listdir(DATA_DIR)
        if (DATA_DIR / name).is_dir() and not name.startswith(".")
    )


def list_sequence_ids(action: str) -> list[int]:
    action_dir = DATA_DIR / action
    sequence_ids = sorted(
        int(p.name) for p in action_dir.iterdir() if p.is_dir() and p.name.isdigit()
    )
    if not sequence_ids:
        raise ValueError(f"No sequences found for action '{action}'")
    return sequence_ids


def discover_frames(action: str) -> int:
    action_dir = DATA_DIR / action
    sequence_ids = list_sequence_ids(action)
    first_seq = action_dir / str(sequence_ids[0])
    frame_count = len(list(first_seq.glob("*.npy")))
    if frame_count == 0:
        raise ValueError(f"No .npy frames in {first_seq}")
    return frame_count


def load_landmark_sequence(action: str, sequence_id: int, frames: int) -> np.ndarray:
    seq_dir = DATA_DIR / action / str(sequence_id)
    frames_data = []
    for frame in range(frames):
        path = seq_dir / f"{frame}.npy"
        if not path.is_file():
            raise FileNotFoundError(f"Missing frame: {path}")
        frames_data.append(np.load(path))
    return np.stack(frames_data, axis=0)


def load_dataset(
    actions: list[str], frames: int
) -> tuple[np.ndarray, np.ndarray, dict[str, int], dict[str, int]]:
    label_map = {label: idx for idx, label in enumerate(actions)}
    sequence_counts: dict[str, int] = {}
    landmarks: list[np.ndarray] = []
    labels: list[int] = []

    for action in actions:
        sequence_ids = list_sequence_ids(action)
        sequence_counts[action] = len(sequence_ids)
        for sequence_id in sequence_ids:
            landmarks.append(load_landmark_sequence(action, sequence_id, frames))
            labels.append(label_map[action])

    x = np.asarray(landmarks, dtype=np.float32)
    y = to_categorical(labels, num_classes=len(actions)).astype(np.float32)
    return x, y, label_map, sequence_counts


def normalize_features(
    x_train: np.ndarray, x_val: np.ndarray, x_test: np.ndarray
) -> tuple[np.ndarray, np.ndarray, np.ndarray, StandardScaler]:
    n_train, seq_len, n_features = x_train.shape
    scaler = StandardScaler()
    scaler.fit(x_train.reshape(n_train, -1))

    def transform(x: np.ndarray) -> np.ndarray:
        n, _, _ = x.shape
        scaled = scaler.transform(x.reshape(n, -1))
        return scaled.reshape(n, seq_len, n_features).astype(np.float32)

    return transform(x_train), transform(x_val), transform(x_test), scaler


def save_scaler(scaler: StandardScaler, feature_dim: int, sequence_length: int) -> None:
    np.savez(
        SCALER_PATH,
        mean=scaler.mean_.astype(np.float32),
        scale=scaler.scale_.astype(np.float32),
        feature_dim=np.int32(feature_dim),
        sequence_length=np.int32(sequence_length),
    )


def build_model(
    num_classes: int,
    sequence_length: int,
    feature_dim: int,
    cfg: TrainConfig,
) -> Sequential:
    u1, u2, u3 = cfg.lstm_units
    model = Sequential(
        [
            LSTM(
                u1,
                return_sequences=True,
                activation="relu",
                input_shape=(sequence_length, feature_dim),
            ),
            Dropout(cfg.dropout),
            LSTM(u2, return_sequences=True, activation="relu"),
            Dropout(cfg.dropout),
            LSTM(u3, return_sequences=False, activation="relu"),
            BatchNormalization(),
            Dense(cfg.dense_units, activation="relu"),
            Dropout(cfg.dropout),
            Dense(num_classes, activation="softmax"),
        ]
    )
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=cfg.learning_rate),
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


def split_dataset(
    x: np.ndarray,
    y: np.ndarray,
    cfg: TrainConfig,
) -> tuple[np.ndarray, ...]:
    x_train, x_hold, y_train, y_hold = train_test_split(
        x,
        y,
        test_size=cfg.val_size + cfg.test_size,
        random_state=cfg.random_state,
        stratify=np.argmax(y, axis=1),
    )
    relative_test = cfg.test_size / (cfg.val_size + cfg.test_size)
    x_val, x_test, y_val, y_test = train_test_split(
        x_hold,
        y_hold,
        test_size=relative_test,
        random_state=cfg.random_state,
        stratify=np.argmax(y_hold, axis=1),
    )
    return x_train, x_val, x_test, y_train, y_val, y_test


def clear_periodic_checkpoints() -> None:
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
    for path in CHECKPOINT_DIR.glob("epoch_*.keras"):
        path.unlink(missing_ok=True)
    if MANIFEST_PATH.is_file():
        MANIFEST_PATH.unlink()


class PeriodicEpochCheckpoint(tf.keras.callbacks.Callback):
    """Save a checkpoint every N epochs and log validation metrics."""

    def __init__(self, directory: Path, interval: int = 10):
        super().__init__()
        self.directory = directory
        self.interval = interval
        self.directory.mkdir(parents=True, exist_ok=True)
        self.records: list[dict] = []

    def on_epoch_end(self, epoch: int, logs: dict | None = None) -> None:
        logs = logs or {}
        ep = epoch + 1
        record = {
            "epoch": ep,
            "loss": float(logs.get("loss", 0.0)),
            "val_loss": float(logs.get("val_loss", 0.0)),
            "accuracy": float(logs.get("accuracy", 0.0)),
            "val_accuracy": float(logs.get("val_accuracy", 0.0)),
        }

        if ep % self.interval == 0:
            checkpoint_name = f"epoch_{ep:03d}.keras"
            checkpoint_path = self.directory / checkpoint_name
            self.model.save(checkpoint_path)
            record["checkpoint"] = checkpoint_name
            logger.info(
                f"Checkpoint saved: {checkpoint_name} "
                f"(val_loss={record['val_loss']:.5f}, val_acc={record['val_accuracy']:.4f})"
            )

        self.records.append(record)


def save_epoch_manifest(records: list[dict], best: dict) -> None:
    payload = {"epochs": records, "best": best}
    with MANIFEST_PATH.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)


def select_best_epoch_checkpoint(
    x_val: np.ndarray,
    y_val: np.ndarray,
) -> tuple[Path, dict]:
    candidates = sorted(CHECKPOINT_DIR.glob("epoch_*.keras"))
    if not candidates:
        raise FileNotFoundError(
            f"No periodic checkpoints in {CHECKPOINT_DIR}. "
            f"Train at least {TrainConfig.checkpoint_interval} epochs."
        )

    best_path: Path | None = None
    best_metrics: dict = {}
    best_val_loss = float("inf")

    for path in candidates:
        epoch = int(path.stem.split("_")[1])
        model = tf.keras.models.load_model(path)
        val_loss, val_accuracy = model.evaluate(x_val, y_val, verbose=0)
        val_loss = float(val_loss)
        val_accuracy = float(val_accuracy)

        logger.info(
            f"Eval checkpoint epoch_{epoch:03d}: val_loss={val_loss:.5f}, val_acc={val_accuracy:.4f}"
        )

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_path = path
            best_metrics = {
                "epoch": epoch,
                "val_loss": val_loss,
                "val_accuracy": val_accuracy,
                "checkpoint": path.name,
            }

    if best_path is None:
        raise RuntimeError("Failed to select a best checkpoint.")

    return best_path, best_metrics


def save_metadata(
    actions: list[str],
    label_map: dict[str, int],
    sequence_counts: dict[str, int],
    frames: int,
    feature_dim: int,
    history: dict,
    test_metrics: dict[str, float],
    augment: AugmentConfig,
    train_samples: int,
    best_epoch: dict,
) -> None:
    payload = {
        "classes": actions,
        "label_map": label_map,
        "sequence_length": frames,
        "feature_dim": feature_dim,
        "sequences_per_class": sequence_counts,
        "model_path": MODEL_PATH.name,
        "scaler_path": SCALER_PATH.name if SCALER_PATH.is_file() else None,
        "checkpoint_dir": str(CHECKPOINT_DIR.relative_to(SRC_DIR)),
        "augmentation": {
            "copies_per_sample": augment.copies_per_sample,
            "noise_std": augment.noise_std,
            "scale_range": list(augment.scale_range),
            "time_shift_max": augment.time_shift_max,
            "flip_prob": augment.flip_prob,
            "mirror_x_prob": augment.mirror_x_prob,
            "temporal_mask_prob": augment.temporal_mask_prob,
        },
        "best_epoch": best_epoch,
        "test_metrics": test_metrics,
        "training": {
            "train_samples": train_samples,
            "epochs_ran": len(history.get("loss", [])),
            "best_val_loss": float(min(history.get("val_loss", [float("inf")]))),
            "best_val_accuracy": float(max(history.get("val_accuracy", [0.0]))),
        },
    }
    with METADATA_PATH.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)


def evaluate_model(
    model: tf.keras.Model,
    x_test: np.ndarray,
    y_test: np.ndarray,
    class_names: list[str],
) -> dict[str, float]:
    probabilities = model.predict(x_test, verbose=0)
    predictions = np.argmax(probabilities, axis=1)
    test_labels = np.argmax(y_test, axis=1)

    accuracy = float(metrics.accuracy_score(test_labels, predictions))
    f1_macro = float(metrics.f1_score(test_labels, predictions, average="macro", zero_division=0))

    logger.info(f"Test accuracy: {accuracy:.4f}")
    logger.info(f"Test F1 (macro): {f1_macro:.4f}")
    logger.info(
        "\n"
        + metrics.classification_report(
            test_labels, predictions, target_names=class_names, zero_division=0
        )
    )

    return {"accuracy": accuracy, "f1_macro": f1_macro}


def train_model(cfg: TrainConfig | None = None) -> None:
    cfg = cfg or TrainConfig()
    set_seeds(cfg.random_state)

    actions = load_class_names()
    missing = [a for a in actions if not (DATA_DIR / a).is_dir()]
    if missing:
        raise FileNotFoundError(f"Missing data folders for classes: {missing}")

    frames = discover_frames(actions[0])
    for action in actions[1:]:
        frame_n = discover_frames(action)
        if frame_n != frames:
            raise ValueError(
                f"Inconsistent frame count for '{action}': expected {frames}, got {frame_n}"
            )

    x, y, label_map, sequence_counts = load_dataset(actions, frames)
    total_samples = len(x)
    min_seq = min(sequence_counts.values())
    max_seq = max(sequence_counts.values())

    logger.print_table(
        "Dataset",
        ["Classes", "Frames/seq", "Samples", "Seq/class (min-max)"],
        [[len(actions), frames, total_samples, f"{min_seq}-{max_seq}"]],
    )

    feature_dim = x.shape[2]

    x_train, x_val, x_test, y_train, y_val, y_test = split_dataset(x, y, cfg)
    x_train, y_train = augment_training_set(
        x_train, y_train, cfg.augment, seed=cfg.random_state
    )
    logger.info(
        f"Training samples after augmentation: {len(x_train)} "
        f"(+{cfg.augment.copies_per_sample} copies/sample)"
    )
    x_train, x_val, x_test, scaler = normalize_features(x_train, x_val, x_test)
    save_scaler(scaler, feature_dim, frames)

    clear_periodic_checkpoints()

    model = build_model(len(actions), frames, feature_dim, cfg)
    model.summary(print_fn=logger.info)

    epoch_checkpoint = PeriodicEpochCheckpoint(
        CHECKPOINT_DIR, interval=cfg.checkpoint_interval
    )

    callbacks = [
        epoch_checkpoint,
        EarlyStopping(
            monitor="val_loss",
            patience=cfg.patience,
            restore_best_weights=False,
            verbose=1,
        ),
        ReduceLROnPlateau(
            monitor="val_loss",
            factor=0.5,
            patience=8,
            min_lr=1e-6,
            verbose=1,
        ),
    ]

    history = model.fit(
        x_train,
        y_train,
        validation_data=(x_val, y_val),
        epochs=cfg.epochs,
        batch_size=cfg.batch_size,
        callbacks=callbacks,
        verbose=1,
    )

    best_checkpoint_path, best_epoch_metrics = select_best_epoch_checkpoint(x_val, y_val)
    best_model = tf.keras.models.load_model(best_checkpoint_path)
    best_model.save(MODEL_PATH)

    logger.info(
        f"Best epoch: {best_epoch_metrics['epoch']} "
        f"(val_loss={best_epoch_metrics['val_loss']:.5f}, "
        f"val_acc={best_epoch_metrics['val_accuracy']:.4f}) "
        f"-> {MODEL_PATH.name}"
    )

    save_epoch_manifest(epoch_checkpoint.records, best_epoch_metrics)

    test_metrics = evaluate_model(best_model, x_test, y_test, actions)
    save_metadata(
        actions,
        label_map,
        sequence_counts,
        frames,
        feature_dim,
        history.history,
        test_metrics,
        cfg.augment,
        len(x_train),
        best_epoch_metrics,
    )
    logger.info(f"Metadata saved to {METADATA_PATH}")
    logger.info(f"Epoch manifest saved to {MANIFEST_PATH}")


if __name__ == "__main__":
    train_model()
