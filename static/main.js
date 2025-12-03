// =============================
// Webcam helpers (browser side)
// =============================

async function _setupCamera(videoEl) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert("Camera access not supported in this browser.");
    return null;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    videoEl.srcObject = stream;
    await videoEl.play();
    return stream;
  } catch (err) {
    console.error("getUserMedia error:", err);
    alert("Could not access your camera. Please allow camera permission.");
    return null;
  }
}

// called from login.html
window.initLoginCamera = async function (videoId) {
  const video = document.getElementById(videoId);
  if (!video) {
    console.warn("Login video element not found:", videoId);
    return;
  }
  if (video._streamReady) return;  // don't re-init

  const stream = await _setupCamera(video);
  if (stream) {
    video._streamReady = true;
    video._stream = stream;
  }
};

// called from register.html
window.initRegisterCamera = async function (videoId) {
  const video = document.getElementById(videoId);
  if (!video) {
    console.warn("Register video element not found:", videoId);
    return;
  }
  if (video._streamReady) return;

  const stream = await _setupCamera(video);
  if (stream) {
    video._streamReady = true;
    video._stream = stream;
  }
};

function _canvasToBlob(canvas, type = "image/jpeg", quality = 0.9) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function _grabFrame(videoId, canvasId) {
  const video = document.getElementById(videoId);
  const canvas = document.getElementById(canvasId);

  if (!video || !canvas) {
    console.error("Missing video or canvas", videoId, canvasId);
    return null;
  }
  if (!video.videoWidth || !video.videoHeight) {
    console.warn("Video metadata not ready; cannot grab frame yet.");
    return null;
  }

  const ctx = canvas.getContext("2d");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const blob = await _canvasToBlob(canvas, "image/jpeg", 0.9);
  return blob;
}

// =============================
// Registration flow
// =============================

async function startCapture() {
  const nameEl = document.getElementById("username");
  const cntEl = document.getElementById("count");
  const numEl = document.getElementById("num");
  const statusEl = document.getElementById("status");

  const username = (nameEl.value || "").trim();
  const target = Math.max(1, Math.min(25, parseInt(numEl.value || "10", 10)));

  if (!username) {
    alert("Enter a username first.");
    return;
  }

  cntEl.textContent = "0";
  statusEl.textContent = "Capturing…";

  for (let i = 0; i < target; i++) {
    // 1) grab a frame from browser webcam
    const blob = await _grabFrame("regVideo", "regCanvas");
    if (!blob) {
      statusEl.textContent = "Could not capture frame from camera.";
      break;
    }

    // 2) send to backend as multipart/form-data
    const form = new FormData();
    form.append("username", username);
    form.append("frame", blob, `frame_${i + 1}.jpg`);

    const r = await fetch("/api/capture", { method: "POST", body: form });
    const js = await r.json();

    if (!js.ok) {
      statusEl.textContent = js.msg || "Capture failed.";
      break;
    }

    cntEl.textContent = String(js.count);

    // small delay so user can slightly move their face
    await new Promise((res) => setTimeout(res, 400));
  }

  statusEl.textContent = `Captured ${cntEl.textContent} image(s).`;
}

async function trainModel() {
  const msgEl = document.getElementById("trainMsg");
  msgEl.textContent = "Training...";
  try {
    const r = await fetch("/api/train", { method: "POST" });
    const js = await r.json();
    msgEl.textContent = js.msg || (js.ok ? "Trained." : "Train failed.");
  } catch (err) {
    console.error(err);
    msgEl.textContent = "Error calling /api/train";
  }
}

// =============================
// Login / authentication flow
// =============================

async function authenticate() {
  const msgEl = document.getElementById("authMsg");
  msgEl.textContent = "Checking…";

  // 1) grab a single frame from login camera
  const blob = await _grabFrame("loginVideo", "loginCanvas");
  if (!blob) {
    msgEl.textContent = "Could not capture frame from camera. Is it allowed?";
    return;
  }

  // 2) send to backend as multipart/form-data
  const form = new FormData();
  form.append("frame", blob, "login_frame.jpg");

  try {
    const r = await fetch("/api/auth", { method: "POST", body: form });
    const js = await r.json();

    if (!js.ok) {
      msgEl.textContent = js.msg || "Auth failed.";
      return;
    }

    if (js.matched && js.redirect) {
      window.location.href = js.redirect;
    } else if (js.matched) {
      msgEl.textContent = `✅ Welcome, ${js.username} (conf: ${js.confidence.toFixed(2)})`;
    } else {
      const c = typeof js.confidence === "number" ? js.confidence.toFixed(2) : js.confidence;
      msgEl.textContent = `❌ Not recognized (${js.username}) — conf: ${c}`;
    }
  } catch (err) {
    console.error(err);
    msgEl.textContent = "Error calling /api/auth";
  }
}

// expose to global scope for inline HTML onclick handlers
window.startCapture = startCapture;
window.trainModel = trainModel;
window.authenticate = authenticate;
