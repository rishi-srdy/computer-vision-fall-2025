// static/module6/main.js
// Module 6 – Real-Time Tracking
// Uses browser webcam for "marker" and "markerless" modes,
// and precomputed frames for "sam2".

document.addEventListener("DOMContentLoaded", () => {
  const modeButtons   = document.querySelectorAll(".m6-controls [data-mode]");
  const videoEl       = document.getElementById("m6Video");
  const canvasEl      = document.getElementById("m6Canvas");
  const outputImg     = document.getElementById("m6Output");
  const statusEl      = document.getElementById("m6Status");
  const sam2Controls  = document.getElementById("m6_sam2_controls");
  const slider        = document.getElementById("m6_slider");

  if (!canvasEl) {
    console.error("m6Canvas not found on page.");
    return;
  }

  const ctx = canvasEl.getContext("2d");

  // Backend endpoints
  const SAM2_BASE      = "/module/6/sam2_frame/";       // GET /module/6/sam2_frame/<frame_id>
  const PROCESS_BASE   = "/module/6/process_frame";     // POST /module/6/process_frame/<mode>
  const SET_MODE_BASE  = "/module/6/set_mode";          // GET  /module/6/set_mode/<mode>

  // Webcam / processing state
  let currentMode   = "marker";   // "marker", "markerless", "sam2"
  let stream        = null;       // MediaStream from getUserMedia
  let frameTimer    = null;       // setInterval for sending frames

  // SAM2 playback state
  let currentFrame  = 0;
  const totalFrames = 199;        // assuming frames 0..198 exist
  let playing       = false;
  let playTimer     = null;

  // ----------------------------------------------------
  // Webcam helpers
  // ----------------------------------------------------
  async function startCamera() {
    if (stream) return; // already running
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      statusEl.textContent = "getUserMedia() not supported in this browser.";
      return;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoEl.srcObject = stream;
      statusEl.textContent = `Camera ON (${currentMode}).`;
    } catch (err) {
      console.error("Camera error:", err);
      statusEl.textContent = "Could not access camera: " + err.message;
      stream = null;
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    if (videoEl) {
      videoEl.srcObject = null;
    }
  }

  function stopFrameLoop() {
    if (frameTimer) {
      clearInterval(frameTimer);
      frameTimer = null;
    }
  }

  function startFrameLoop() {
    // Only for marker / markerless
    if (currentMode === "sam2") return;
    stopFrameLoop();

    // ~5–7 FPS is enough
    frameTimer = setInterval(() => {
      sendFrameOnce().catch(err => {
        console.error("sendFrameOnce error:", err);
      });
    }, 150);
  }

  async function sendFrameOnce() {
    if (!stream || !videoEl || !videoEl.videoWidth || !videoEl.videoHeight) {
      return;
    }

    const w = videoEl.videoWidth;
    const h = videoEl.videoHeight;

    canvasEl.width = w;
    canvasEl.height = h;
    ctx.drawImage(videoEl, 0, 0, w, h);

    // Grab JPEG blob
    const blob = await new Promise((resolve, reject) => {
      canvasEl.toBlob(b => {
        if (b) resolve(b);
        else reject(new Error("toBlob failed"));
      }, "image/jpeg", 0.9);
    });

    const form = new FormData();
    form.append("frame", blob, "frame.jpg");

    try {
      const resp = await fetch(`${PROCESS_BASE}/${currentMode}`, {
        method: "POST",
        body: form,
      });

      if (!resp.ok) {
        statusEl.textContent = `Processing error (${resp.status})`;
        return;
      }

      const outBlob = await resp.blob();
      const url = URL.createObjectURL(outBlob);
      outputImg.src = url;
    } catch (err) {
      console.error("Processing fetch error:", err);
      statusEl.textContent = "Processing error: " + err.message;
    }
  }

  // ----------------------------------------------------
  // SAM2 helpers
  // ----------------------------------------------------
  function loadFrame(n) {
    currentFrame = Math.max(0, Math.min(totalFrames - 1, n));
    // For SAM2 we show only the outputImg
    outputImg.src = `${SAM2_BASE}${currentFrame}?t=${Date.now()}`;
    slider.value = currentFrame;
  }

  function nextFrame() {
    if (currentFrame < totalFrames - 1) {
      loadFrame(currentFrame + 1);
    }
  }

  function prevFrame() {
    if (currentFrame > 0) {
      loadFrame(currentFrame - 1);
    }
  }

  function restart() {
    loadFrame(0);
  }

  function stopSam2Playback() {
    playing = false;
    if (playTimer) {
      clearInterval(playTimer);
      playTimer = null;
    }
    const playBtn = document.querySelector(".m6-sam2-controls [data-action='play']");
    if (playBtn) {
      playBtn.textContent = "▶️ Play";
    }
  }

  function togglePlay() {
    const playBtn = document.querySelector(".m6-sam2-controls [data-action='play']");
    if (!playBtn) return;

    playing = !playing;
    playBtn.textContent = playing ? "⏸️ Pause" : "▶️ Play";

    if (playing) {
      playTimer = setInterval(() => {
        if (currentFrame < totalFrames - 1) {
          nextFrame();
        } else {
          // reached end -> stop
          stopSam2Playback();
        }
      }, 100); // ~10 fps
    } else {
      if (playTimer) {
        clearInterval(playTimer);
        playTimer = null;
      }
    }
  }

  // ----------------------------------------------------
  // Mode switching
  // ----------------------------------------------------
  function setMode(mode) {
    if (currentMode === mode) return;
    currentMode = mode;

    // Let backend know (optional, but keeps your existing route alive)
    fetch(`${SET_MODE_BASE}/${mode}`).catch(() => {});

    // Update button styling
    modeButtons.forEach(btn => {
      const isActive = btn.dataset.mode === mode;
      btn.classList.toggle("ghost", !isActive);
    });

    if (mode === "sam2") {
      // Turn off webcam + frame loop
      stopFrameLoop();
      stopCamera();

      // Hide webcam preview (optional)
      videoEl.style.display = "none";

      // Show SAM2 playback controls
      sam2Controls.style.display = "flex";
      statusEl.textContent = "SAM2 segmentation playback mode.";

      // Start at currentFrame (0 by default)
      loadFrame(currentFrame);
    } else {
      // marker / markerless
      sam2Controls.style.display = "none";
      stopSam2Playback();

      // Show webcam preview
      videoEl.style.display = "block";

      statusEl.textContent = `Mode: ${mode}. Using webcam for tracking.`;

      // Ensure camera + frame loop are running
      startCamera().then(() => {
        startFrameLoop();
      });
    }
  }

  // ----------------------------------------------------
  // Event wiring
  // ----------------------------------------------------
  // Mode buttons
  modeButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      setMode(mode);
    });
  });

  // SAM2 controls (prev / play / next / restart)
  sam2Controls.addEventListener("click", (e) => {
    const action = e.target.dataset.action;
    if (!action) return;

    if (action === "prev")     prevFrame();
    if (action === "next")     nextFrame();
    if (action === "restart")  restart();
    if (action === "play")     togglePlay();
  });

  // Slider scrub
  slider.addEventListener("input", (e) => {
    const n = parseInt(e.target.value, 10);
    if (!Number.isNaN(n)) {
      loadFrame(n);
    }
  });

  // Clean up on page unload
  window.addEventListener("beforeunload", () => {
    stopFrameLoop();
    stopSam2Playback();
    stopCamera();
  });

  // ----------------------------------------------------
  // Initial state: marker mode
  // ----------------------------------------------------
  // Ensure a sane starting point
  videoEl.style.display = "block";
  sam2Controls.style.display = "none";
  statusEl.textContent = "Select a mode to begin. Marker / Markerless will use your webcam.";

  setMode("marker");
});
