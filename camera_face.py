# camera_face.py
import os
import json
from pathlib import Path

import cv2 as cv
import numpy as np

from config_paths import BASE_DIR, DATA_DIR, FACES_DIR, MODELS_DIR

# ----------------------------
# Camera (global singleton)
# ----------------------------
CAM_INDEX = int(os.environ.get("CAM_INDEX", "0"))
_camera = cv.VideoCapture(CAM_INDEX)

if not _camera.isOpened():
    _camera = None


def get_camera():
    """Return a global cv.VideoCapture, re-opening if needed."""
    global _camera
    if _camera is None or (hasattr(_camera, "isOpened") and not _camera.isOpened()):
        cam = cv.VideoCapture(CAM_INDEX)
        if not cam.isOpened():
            raise RuntimeError("Camera not available.")
        _camera = cam
    return _camera


# ----------------------------
# Face detection (Haar) & helpers
# ----------------------------
CASCADE = cv.CascadeClassifier(
    cv.data.haarcascades + "haarcascade_frontalface_default.xml"
)


def detect_largest_face(gray):
    faces = CASCADE.detectMultiScale(
        gray,
        scaleFactor=1.2,
        minNeighbors=5,
        minSize=(80, 80),
    )
    if len(faces) == 0:
        return None
    x, y, w, h = max(faces, key=lambda r: r[2] * r[3])
    return (x, y, w, h)


def prepare_face_roi(frame_bgr):
    """
    Convert BGR frame → gray, pick largest face, crop to 200x200.
    Returns (roi, (x,y,w,h), gray) or (None, None, None) if no face.
    """
    gray = cv.cvtColor(frame_bgr, cv.COLOR_BGR2GRAY)
    box = detect_largest_face(gray)
    if box is None:
        return None, None, None
    x, y, w, h = box
    roi = gray[y:y + h, x:x + w]
    roi = cv.resize(roi, (200, 200), interpolation=cv.INTER_AREA)
    return roi, (x, y, w, h), gray


def jpeg_bytes(frame_bgr):
    ok, buf = cv.imencode(".jpg", frame_bgr, [cv.IMWRITE_JPEG_QUALITY, 80])
    return buf.tobytes() if ok else None


# ----------------------------
# LBPH Model utils
# ----------------------------
META_PATH = MODELS_DIR / "model_meta.json"
DEFAULT_THRESHOLD = 60.0

if META_PATH.exists():
    try:
        _meta = json.loads(META_PATH.read_text())
        LBPH_THRESHOLD = float(_meta.get("threshold", DEFAULT_THRESHOLD))
    except Exception:
        LBPH_THRESHOLD = DEFAULT_THRESHOLD
else:
    LBPH_THRESHOLD = DEFAULT_THRESHOLD


def lbph_create():
    """Create LBPH recognizer (requires opencv-contrib-python)."""
    return cv.face.LBPHFaceRecognizer_create(
        radius=1,
        neighbors=8,
        grid_x=8,
        grid_y=8,
    )


MODEL_PATH  = MODELS_DIR / "lbph.yml"
LABELS_PATH = DATA_DIR / "labels.json"


def load_labels():
    if LABELS_PATH.exists():
        return json.loads(LABELS_PATH.read_text())
    return {}


def save_labels(mapping):
    LABELS_PATH.write_text(json.dumps(mapping, indent=2))


def ensure_model_trained():
    """Return a loaded LBPH model or None if no model file yet."""
    if not MODEL_PATH.exists():
        return None
    model = lbph_create()
    model.read(str(MODEL_PATH))
    return model