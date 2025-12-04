// static/module1/main.js
// Module 1 — Calibrate & Measure using BROWSER webcam

// -----------------------------
// DOM references
// -----------------------------
let m1Video;          // <video> live preview
let m1CanvasCap;      // hidden canvas to capture frames
let m1CapCtx;

let m1MeasureCanvas;
let m1MeasureCtx;

let m1Stream = null;  // MediaStream from getUserMedia

// Measurement state
let m1LoadedImage = null;
let m1ImgName = null;
let m1ImgWidth = 0;
let m1ImgHeight = 0;
let m1DrawScale = 1;
let m1DrawOffsetX = 0;
let m1DrawOffsetY = 0;
let m1Points = [];    // points in image coordinates [[x,y], ...]

// -----------------------------
// Camera ON/OFF
// -----------------------------
async function m1StartCamera() {
  const statusBar = document.getElementById("statusBar");
  const toggleBtn = document.getElementById("toggleBtn");
  const captureCalibBtn = document.getElementById("captureCalibBtn");
  const captureImgBtn = document.getElementById("captureImgBtn");

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    statusBar.textContent = "getUserMedia not supported in this browser.";
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    m1Stream = stream;
    m1Video.srcObject = stream;

    toggleBtn.textContent = "Turn Camera Off";
    statusBar.textContent = "Camera is ON. Hold chessboard / object in view.";
    captureCalibBtn.disabled = false;
    captureImgBtn.disabled = false;
  } catch (err) {
    console.error("Camera error:", err);
    statusBar.textContent = "Could not access camera: " + err.message;
  }
}

function m1StopCamera() {
  const statusBar = document.getElementById("statusBar");
  const toggleBtn = document.getElementById("toggleBtn");
  const captureCalibBtn = document.getElementById("captureCalibBtn");
  const captureImgBtn = document.getElementById("captureImgBtn");

  if (m1Stream) {
    m1Stream.getTracks().forEach(t => t.stop());
    m1Stream = null;
  }
  if (m1Video) {
    m1Video.srcObject = null;
  }

  toggleBtn.textContent = "Turn Camera On";
  statusBar.textContent = "Camera is OFF";
  captureCalibBtn.disabled = true;
  captureImgBtn.disabled = true;
}

// -----------------------------
// Capture a frame → /measure/capture
// -----------------------------
async function m1CaptureFrame(mode) {
  const lastSave = document.getElementById("lastSave");
  const statusBar = document.getElementById("statusBar");

  if (!m1Stream || !m1Video || !m1Video.videoWidth) {
    lastSave.textContent = "Camera not ready. Turn it ON first.";
    return;
  }

  const w = m1Video.videoWidth;
  const h = m1Video.videoHeight;

  m1CanvasCap.width = w;
  m1CanvasCap.height = h;
  m1CapCtx.drawImage(m1Video, 0, 0, w, h);

  lastSave.textContent = "Capturing...";

  try {
    const blob = await new Promise((resolve, reject) => {
      m1CanvasCap.toBlob(b => {
        if (b) resolve(b);
        else reject(new Error("toBlob failed"));
      }, "image/jpeg", 0.9);
    });

    const form = new FormData();
    form.append("frame", blob, "frame.jpg");

    const resp = await fetch(`/measure/capture?mode=${encodeURIComponent(mode)}`, {
      method: "POST",
      body: form,
    });

    const js = await resp.json().catch(() => ({}));

    if (!resp.ok || !js.ok) {
      lastSave.textContent = js.error || js.msg || "Capture failed.";
      return;
    }

    lastSave.textContent =
      (mode === "calib"
        ? "Saved calibration image: "
        : "Saved object image: ") + (js.path || "");
  } catch (err) {
    console.error(err);
    lastSave.textContent = "Capture error: " + err.message;
  }
}

// -----------------------------
// Calibration → /measure/calibrate
// -----------------------------
async function m1RunCalibration() {
  const rowsEl = document.getElementById("rows");
  const colsEl = document.getElementById("cols");
  const squareEl = document.getElementById("square");
  const status = document.getElementById("calibStatus");

  const rows = parseInt(rowsEl.value || "6", 10);
  const cols = parseInt(colsEl.value || "9", 10);
  const square = parseFloat(squareEl.value || "25");

  status.textContent = "Running calibration...";

  try {
    const resp = await fetch("/measure/calibrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows,
        cols,
        square_size: square,
      }),
    });

    const js = await resp.json().catch(() => ({}));

    if (!resp.ok || !js.ok) {
      status.textContent = "❌ " + (js.error || js.msg || "Calibration failed.");
      return;
    }

    status.textContent =
      `✅ Calibration OK. Reprojection error: ${js.reprojection_error.toFixed(4)}. ` +
      `Saved: ${js.npz}`;
  } catch (err) {
    console.error(err);
    status.textContent = "❌ Calibration error: " + err.message;
  }
}

// -----------------------------
// Capture list + load image
// -----------------------------
async function m1RefreshCaptures() {
  const select = document.getElementById("imageSelect");
  const result = document.getElementById("measureResult");

  select.innerHTML = "";
  result.textContent = "";

  try {
    const resp = await fetch("/measure/list_captures");
    const js = await resp.json().catch(() => ({}));

    if (!resp.ok || !js.ok) {
      result.textContent = js.error || "Could not list captures.";
      return;
    }

    if (!js.files || js.files.length === 0) {
      result.textContent = "No captures yet. Capture an object image first.";
      return;
    }

    js.files.forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });

    result.textContent = `Loaded ${js.files.length} capture(s).`;
  } catch (err) {
    console.error(err);
    result.textContent = "Error loading capture list: " + err.message;
  }
}

function m1RedrawMeasureCanvas() {
  if (!m1MeasureCtx) return;

  m1MeasureCtx.clearRect(0, 0, m1MeasureCanvas.width, m1MeasureCanvas.height);

  if (m1LoadedImage) {
    m1MeasureCtx.drawImage(
      m1LoadedImage,
      m1DrawOffsetX,
      m1DrawOffsetY,
      m1ImgWidth * m1DrawScale,
      m1ImgHeight * m1DrawScale
    );
  }

  // Draw points
  m1MeasureCtx.fillStyle = "#ff4444";
  m1MeasureCtx.strokeStyle = "#ff4444";
  m1MeasureCtx.lineWidth = 2;

  m1Points.forEach((pt, idx) => {
    const [xImg, yImg] = pt;
    const x = m1DrawOffsetX + xImg * m1DrawScale;
    const y = m1DrawOffsetY + yImg * m1DrawScale;

    m1MeasureCtx.beginPath();
    m1MeasureCtx.arc(x, y, 5, 0, Math.PI * 2);
    m1MeasureCtx.fill();

    m1MeasureCtx.font = "14px system-ui";
    m1MeasureCtx.fillText(String(idx + 1), x + 8, y - 8);
  });

  if (m1Points.length === 2) {
    const [x1, y1] = m1Points[0];
    const [x2, y2] = m1Points[1];
    const cx1 = m1DrawOffsetX + x1 * m1DrawScale;
    const cy1 = m1DrawOffsetY + y1 * m1DrawScale;
    const cx2 = m1DrawOffsetX + x2 * m1DrawScale;
    const cy2 = m1DrawOffsetY + y2 * m1DrawScale;

    m1MeasureCtx.beginPath();
    m1MeasureCtx.moveTo(cx1, cy1);
    m1MeasureCtx.lineTo(cx2, cy2);
    m1MeasureCtx.stroke();
  }
}

function m1SetupCanvasClick() {
  if (!m1MeasureCanvas) return;

  m1MeasureCanvas.addEventListener("click", evt => {
    if (!m1LoadedImage) return;

    const rect = m1MeasureCanvas.getBoundingClientRect();

    // Convert from CSS pixels (clientX/Y) to canvas pixels
    const scaleX = m1MeasureCanvas.width  / rect.width;
    const scaleY = m1MeasureCanvas.height / rect.height;

    const xCanvas = (evt.clientX - rect.left) * scaleX;
    const yCanvas = (evt.clientY - rect.top)  * scaleY;

    // Canvas coords → image coords (account for centering & zoom)
    const xImg = (xCanvas - m1DrawOffsetX) / m1DrawScale;
    const yImg = (yCanvas - m1DrawOffsetY) / m1DrawScale;

    // Ignore clicks outside the drawn image
    if (
      xImg < 0 || xImg > m1ImgWidth ||
      yImg < 0 || yImg > m1ImgHeight
    ) {
      return;
    }

    if (m1Points.length >= 2) {
      m1Points = [];
    }

    m1Points.push([xImg, yImg]);
    m1RedrawMeasureCanvas();

    const result = document.getElementById("measureResult");
    result.textContent = `Selected ${m1Points.length} point(s).`;
  });
}


async function m1LoadSelectedCapture() {
  const select = document.getElementById("imageSelect");
  const result = document.getElementById("measureResult");
  const name = select.value;

  if (!name) {
    result.textContent = "Select a capture first.";
    return;
  }

  const img = new Image();
  img.onload = () => {
    m1LoadedImage = img;
    m1ImgName = name;
    m1ImgWidth = img.width;
    m1ImgHeight = img.height;

    const cw = m1MeasureCanvas.width;
    const ch = m1MeasureCanvas.height;

    const scale = Math.min(cw / img.width, ch / img.height);
    m1DrawScale = scale;
    m1DrawOffsetX = (cw - img.width * scale) / 2;
    m1DrawOffsetY = (ch - img.height * scale) / 2;

    m1Points = [];
    m1RedrawMeasureCanvas();
    result.textContent = `Loaded ${name}. Click two points to measure.`;
  };
  img.onerror = () => {
    result.textContent = "Failed to load image.";
  };

  img.src = `/measure/captures/${encodeURIComponent(name)}`;
}

// -----------------------------
// Measurement → /measure/measure_perspective
// -----------------------------
async function m1DoMeasure() {
  const result = document.getElementById("measureResult");

  if (!m1ImgName) {
    result.textContent = "Load an image first.";
    return;
  }
  if (m1Points.length !== 2) {
    result.textContent = "Click exactly two points on the image.";
    return;
  }

  const zInput = document.getElementById("zInput");
  const Z = parseFloat(zInput.value || "0");

  const payload = {
    image_name: m1ImgName,
    p1: m1Points[0],
    p2: m1Points[1],
    z_world: Z,
  };

  try {
    const resp = await fetch("/measure/measure_perspective", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const js = await resp.json().catch(() => ({}));

    if (!resp.ok || !js.ok) {
      result.textContent = js.error || "Measure failed.";
      return;
    }

    result.textContent =
      `Approx distance: ${js.length_world.toFixed(3)} (same units as Z). ` +
      `ΔX=${js.dX_world.toFixed(3)}, ΔY=${js.dY_world.toFixed(3)}.`;
  } catch (err) {
    console.error(err);
    result.textContent = "Measure error: " + err.message;
  }
}

function m1ClearPoints() {
  m1Points = [];
  m1RedrawMeasureCanvas();
  const result = document.getElementById("measureResult");
  result.textContent = "Points cleared.";
}

// -----------------------------
// Init
// -----------------------------
function initModule1Page() {
  // main elements
  m1Video = document.getElementById("m1Video");
  m1CanvasCap = document.getElementById("m1Canvas");
  if (m1CanvasCap) {
    m1CapCtx = m1CanvasCap.getContext("2d");
  }

  m1MeasureCanvas = document.getElementById("measureCanvas");
  m1MeasureCtx = m1MeasureCanvas.getContext("2d");

  const toggleBtn = document.getElementById("toggleBtn");
  const captureCalibBtn = document.getElementById("captureCalibBtn");
  const captureImgBtn = document.getElementById("captureImgBtn");
  const calibrateBtn = document.getElementById("calibrateBtn");
  const refreshListBtn = document.getElementById("refreshListBtn");
  const loadImageBtn = document.getElementById("loadImageBtn");
  const measureBtn = document.getElementById("measureBtn");
  const clearPointsBtn = document.getElementById("clearPointsBtn");

  // toggle camera
  toggleBtn.addEventListener("click", () => {
    if (m1Stream) m1StopCamera();
    else m1StartCamera();
  });

  // capture
  captureCalibBtn.addEventListener("click", () => m1CaptureFrame("calib"));
  captureImgBtn.addEventListener("click", () => m1CaptureFrame("img"));

  // calibration
  calibrateBtn.addEventListener("click", m1RunCalibration);

  // measurement
  refreshListBtn.addEventListener("click", m1RefreshCaptures);
  loadImageBtn.addEventListener("click", m1LoadSelectedCapture);
  measureBtn.addEventListener("click", m1DoMeasure);
  clearPointsBtn.addEventListener("click", m1ClearPoints);

  // canvas clicks
  m1SetupCanvasClick();

  // optional: auto-refresh capture list
  m1RefreshCaptures();
}

// Run when module1 page loads
document.addEventListener("DOMContentLoaded", initModule1Page);
