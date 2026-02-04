
// BrightnessMonitor.rsx
const ipcRenderer = window.ipcRenderer;

export default function BrightnessMonitor({ update, destroy, props }) {
  // --- props snapshot (root-scope executes once) ---
  let { onBrightnessChange, ledOn, enabled, captureRegion } = props;
  // --- stable instance state (replaces refs) ---
  let currentOnBrightnessChange = onBrightnessChange;

  let videoEl = null;
  let gl = null;
  let glLoseContext = null;
  let stream = null;
  let intervalId = null;
  let texCoordBuffer = null;

  // Store last-known settings for stable event handlers (OS resume/suspend)
  let currentEnabled = !!enabled;
  let currentLedOn = !!ledOn;
  let currentCaptureRegion = captureRegion;

  ipcRenderer.on("os-resume", handleOnOsResume);
  ipcRenderer.on("os-suspend", handleOnOsSuspend);

  // --- props update: replaces dependency array logic ---
  update((prev, next) => {
    // snapshots
    currentOnBrightnessChange = next.onBrightnessChange;
    currentEnabled = next.enabled;
    currentLedOn = next.ledOn;
    currentCaptureRegion = next.captureRegion;

    // diffs
    const enabledChanged = prev.enabled !== next.enabled;
    const ledChanged = prev.ledOn !== next.ledOn;
    const regionChanged = prev.captureRegion !== next.captureRegion;

    // lifecycle changes dominate
    if (enabledChanged || ledChanged) {
      if (!currentEnabled || !currentLedOn) {
        cleanup();
      } else {
        restartIfActive();
      }
      return;
    }

    // live region update
    if (regionChanged) {
      updateCaptureRegion(currentCaptureRegion ?? 100);
    }
  });

  // --- unmount cleanup: match React effect cleanup ---
  destroy(() => {
    cleanup();
    ipcRenderer.removeListener("os-resume", handleOnOsResume);
    ipcRenderer.removeListener("os-suspend", handleOnOsSuspend);
  });

  function cleanup() {
    if (intervalId) {
      console.log("cleanup clearinterval");
      clearInterval(intervalId);
      intervalId = null;
    }

    
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    
    if (videoEl) {
      try {
        videoEl.srcObject = null;
      } catch {
        // ignore
      }
      videoEl = null;
    }

    if (gl) {
      if (glLoseContext) {
        try {
          glLoseContext.loseContext();
        } catch {
          // ignore
        }
        glLoseContext = null;
      }
      gl = null;
    }
  }

  function createProgram(gl, vertexSource, fragmentSource) {
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertexSource);
    gl.compileShader(vertexShader);

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentSource);
    gl.compileShader(fragmentShader);

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    return program;
  }

  function calculateBrightness(gl, video, texture) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    gl.viewport(0, 0, 16, 16);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    const pixels = new Uint8Array(16 * 16 * 4);
    gl.readPixels(0, 0, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    let totalR = 0,
      totalG = 0,
      totalB = 0;

    for (let i = 0; i < pixels.length; i += 4) {
      totalR += pixels[i];
      totalG += pixels[i + 1];
      totalB += pixels[i + 2];
    }

    const pixelCount = 16 * 16;
    const avgR = totalR / pixelCount;
    const avgG = totalG / pixelCount;
    const avgB = totalB / pixelCount;

    return (avgR + avgG + avgB) / 3 / 255;
  }

  function updateCaptureRegion(regionPercent) {
    if (!gl || !texCoordBuffer) return;

    const p = Math.max(0.1, Math.min(1.0, regionPercent / 100));
    const half = p / 2;
    const cx = 0.5;
    const cy = 0.5;

    const minX = cx - half;
    const maxX = cx + half;
    const minY = cy - half;
    const maxY = cy + half;

    const texCoords = new Float32Array([
      minX, maxY,
      maxX, maxY,
      minX, minY,
      maxX, minY,
    ]);

    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, texCoords);
    console.log("Updated capture region to", regionPercent, "%");
  }

  async function waitForVideo(video) {
    if (video.readyState >= 1) return;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(), 3000);
      video.onloadedmetadata = () => {
        clearTimeout(timeout);
        resolve();
      };
    });
  }

  async function setupBrightnessMonitor() {
    try {
      // 1) Request screen sources from main process via IPC
      const sources = await ipcRenderer.invoke("get-screen-sources");
      if (!sources || sources.length === 0) return;

      // Use the first screen (primary display)
      const primaryScreen = sources[0];

      // 2) Get screen stream using getUserMedia with the screen source
      const s = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: primaryScreen.id,
            minWidth: 320,
            maxWidth: 320,
            minHeight: 180,
            maxHeight: 180,
            minFrameRate: 10,
            maxFrameRate: 10,
          },
        },
      });

      stream = s;

      // 3) Setup video element
      const video = document.createElement("video");
      video.srcObject = s;
      video.autoplay = true;
      video.muted = true;
      videoEl = video;

      // 4) Setup WebGL canvas for GPU acceleration
      const canvas = document.createElement("canvas");
      canvas.width = 16;
      canvas.height = 16;

      const g = canvas.getContext("webgl", {
        preserveDrawingBuffer: true,
        antialias: false,
      });

      if (!g) return;

      gl = g;
      glLoseContext = gl.getExtension("WEBGL_lose_context");

      // 5) Setup WebGL shaders and program
      const vertexShaderSource = `
        attribute vec2 a_position;
        attribute vec2 a_texCoord;
        varying vec2 v_texCoord;
        void main() {
          gl_Position = vec4(a_position, 0.0, 1.0);
          v_texCoord = a_texCoord;
        }
      `;

      const fragmentShaderSource = `
        precision mediump float;
        uniform sampler2D u_texture;
        varying vec2 v_texCoord;
        void main() {
          gl_FragColor = texture2D(u_texture, v_texCoord);
        }
      `;

      const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
      gl.useProgram(program);

      // Geometry
      const positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW
      );

      texCoordBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(8), gl.DYNAMIC_DRAW);

      const positionLocation = gl.getAttribLocation(program, "a_position");
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

      const texCoordLocation = gl.getAttribLocation(program, "a_texCoord");
      gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
      gl.enableVertexAttribArray(texCoordLocation);
      gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

      // Create texture
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      updateCaptureRegion(currentCaptureRegion ?? 100);
      
      // 6) Wait for video to be ready
      await waitForVideo(videoEl);

      // Abort if another setup already created interval (or cleaned up / restarted)
      if (intervalId !== null) return;

      // 7) Start sampling loop at 20 FPS
      intervalId = setInterval(() => {
        if (!videoEl || !gl) return;

        if (!videoEl.paused && !videoEl.ended && videoEl.readyState >= 2) {
          const brightness = calculateBrightness(gl, videoEl, texture);

          // Use latest callback (avoid stale closure)
          if (typeof currentOnBrightnessChange === "function") {
            currentOnBrightnessChange(brightness);
          }
        }
      }, 50);
    } catch {
      cleanup();
    }
  }

  function restartIfActive() {
    cleanup();
    if (currentEnabled && currentLedOn) {
      setupBrightnessMonitor();
    }
  }

  // --- OS power events (stable handlers that read current* vars) ---
  function handleOnOsResume() {
    cleanup();
    if (currentEnabled && currentLedOn) {
      setupBrightnessMonitor();
    }
  }

  function handleOnOsSuspend() {
    cleanup();
  }

  // --- init: match React effect behavior on mount ---
  cleanup();
  if (currentEnabled && currentLedOn) {
    setupBrightnessMonitor();
  }

 
}
