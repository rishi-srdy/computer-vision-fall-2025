# config_paths.py
import os
import uuid
import threading
from pathlib import Path
from flask import session

# =====================================================
# Base directories
# =====================================================
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR   = BASE_DIR / "data"
FACES_DIR  = DATA_DIR / "faces"
MODELS_DIR = DATA_DIR / "models"
RUNTIME    = BASE_DIR / "runtime"

for p in (DATA_DIR, FACES_DIR, MODELS_DIR, RUNTIME / "uploads", RUNTIME / "cache"):
    p.mkdir(parents=True, exist_ok=True)

# =====================================================
# Module 1 – Calibration & Measurement
# =====================================================
M1_DIR      = RUNTIME / "module1"
M1_CAPT_DIR = M1_DIR / "captures"
M1_CAL_DIR  = M1_DIR / "calib"

for p in (M1_DIR, M1_CAPT_DIR, M1_CAL_DIR):
    p.mkdir(parents=True, exist_ok=True)

# =====================================================
# Module 2 – Template → Blur → Deblur
# =====================================================
M2_DIR      = RUNTIME / "module2"
M2_SESSIONS = M2_DIR / "sessions"

for p in (M2_DIR, M2_SESSIONS):
    p.mkdir(parents=True, exist_ok=True)

# =====================================================
# Module 3 – CV Tasks (uploads + outputs)
# =====================================================
IMG_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp"}

M3_UPLOAD_BASE   = os.path.join(BASE_DIR, "uploads", "module3")
M3_STATIC_DIR    = os.path.join(BASE_DIR, "static", "outputs", "module3")

os.makedirs(M3_UPLOAD_BASE, exist_ok=True)
os.makedirs(M3_STATIC_DIR, exist_ok=True)

for t in ["task1", "task2", "task3", "task4", "task5"]:
    os.makedirs(os.path.join(M3_UPLOAD_BASE, t), exist_ok=True)
    os.makedirs(os.path.join(M3_STATIC_DIR, t), exist_ok=True)

def m3_upload_dir(task_num: int) -> str:
    """Return path to module3 uploads/task{N} directory."""
    return os.path.join(M3_UPLOAD_BASE, f"task{int(task_num)}")

# =====================================================
# Module 4 – Panorama + SIFT
# =====================================================
M4_DIR      = RUNTIME / "module4"
M4_SESSIONS = M4_DIR / "sessions"

for p in (M4_DIR, M4_SESSIONS):
    p.mkdir(parents=True, exist_ok=True)

def m4_rid() -> str:
    """Get or create a per-user session id for Module 4."""
    rid = session.get("m4_rid")
    if not rid:
        rid = uuid.uuid4().hex[:8]
        session["m4_rid"] = rid
    return rid

def m4_session_dir() -> Path:
    """Return module4 session directory with uploads/outputs created."""
    sd = M4_SESSIONS / m4_rid()
    (sd / "uploads").mkdir(parents=True, exist_ok=True)
    (sd / "outputs").mkdir(parents=True, exist_ok=True)
    return sd

# =====================================================
# Module 6 – SAM2 video & masks
# =====================================================
MODULE6_DIR       = BASE_DIR / "static" / "module6"
MODULE6_DATA_DIR  = MODULE6_DIR / "data"
MODULE6_VIDEO_PATH = MODULE6_DATA_DIR / "input_video.mp4"

for p in (MODULE6_DIR, MODULE6_DATA_DIR):
    p.mkdir(parents=True, exist_ok=True)

# =====================================================
# Module 7 – Stereo + Pose tracking
# =====================================================
M7_DIR           = RUNTIME / "module7"
M7_TASK1_DIR     = M7_DIR / "task1"
M7_TASK1_UPLOADS = M7_TASK1_DIR / "uploads"
M7_TASK3_DIR     = M7_DIR / "task3_data"

for p in (M7_DIR, M7_TASK1_DIR, M7_TASK1_UPLOADS, M7_TASK3_DIR):
    p.mkdir(parents=True, exist_ok=True)

# =====================================================
# MediaPipe initialization for Task 3
# =====================================================
try:
    import mediapipe as mp
    HAVE_MEDIAPIPE = True
except ImportError:
    mp = None
    HAVE_MEDIAPIPE = False

if HAVE_MEDIAPIPE:
    mp_pose    = mp.solutions.pose
    mp_hands   = mp.solutions.hands
    mp_drawing = mp.solutions.drawing_utils

    M7_POSE = mp_pose.Pose(
        model_complexity=1,
        enable_segmentation=False,
    )

    M7_HANDS = mp_hands.Hands(
        max_num_hands=2,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )

else:
    mp_pose = None
    mp_hands = None
    mp_drawing = None
    M7_POSE = None
    M7_HANDS = None

# Pose/Hands CSV logging
M7_T3_LOCK = threading.Lock()
M7_T3_FRAME_IDX = 0
M7_T3_CSV_PATH = M7_TASK3_DIR / "pose_hand_log.csv"

# =====================================================
# Shared types / validation
# =====================================================
ALLOWED_IMG        = {"png", "jpg", "jpeg", "webp"}
ALLOWED_STEREO_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp"}