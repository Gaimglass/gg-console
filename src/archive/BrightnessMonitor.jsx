/**
 * @deprecated
 */

import { useEffect, useRef } from 'react';
import { useSettings } from './SettingsProvider';

const ipcRenderer = window.ipcRenderer;

/**
 * The BrightnessMonitor React component captures a region of the user's screen using Electron and WebGL,
 * processes the video feed in real time, and calculates the average brightness of the selected area.
 */

export default function BrightnessMonitor({ onBrightnessChange, ledOn }) {
  const { ambientSettings } = useSettings();
  const { enabled, captureRegion } = ambientSettings;

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const glRef = useRef(null);
  const glLoseContextRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);

  const programRef = useRef(null);
  const texCoordBufferRef = useRef(null);

  const onBrightnessChangeRef = useRef(onBrightnessChange);

  // Keep callback ref updated to avoid stale closures
  useEffect(() => {
    onBrightnessChangeRef.current = onBrightnessChange;
  }, [onBrightnessChange]);

  const handleOnOsResume = () => {
    cleanup();
    if (enabled && ledOn) {
      setupBrightnessMonitor();
    }
  };

  const handleOnOsSuspend = () => {
    cleanup();
  };

  /**
   * SETUP / TEARDOWN
   * Runs only when enabled / ledOn changes
   */
  useEffect(() => {
    if (!enabled || !ledOn) {
      cleanup();
      return;
    }

    cleanup();
    setupBrightnessMonitor();

    ipcRenderer.on('os-resume', handleOnOsResume);
    ipcRenderer.on('os-suspend', handleOnOsSuspend);

    return () => {
      cleanup();
      ipcRenderer.removeListener('os-resume', handleOnOsResume);
      ipcRenderer.removeListener('os-suspend', handleOnOsSuspend);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ledOn]);

  /**
   * LIGHTWEIGHT REGION UPDATE
   * No teardown, no context loss
   */
  useEffect(() => {
    updateCaptureRegion(captureRegion);
  }, [captureRegion]);

  async function setupBrightnessMonitor() {
    try {
      const sources = await ipcRenderer.invoke('get-screen-sources');
      if (!sources || sources.length === 0) return;

      const primaryScreen = sources[0];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
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

      streamRef.current = stream;

      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.muted = true;
      videoRef.current = video;

      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      canvasRef.current = canvas;

      const gl = canvas.getContext('webgl', {
        preserveDrawingBuffer: true,
        antialias: false,
      });

      if (!gl) return;

      glRef.current = gl;
      glLoseContextRef.current = gl.getExtension('WEBGL_lose_context');

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
      programRef.current = program;

      // Geometry
      const positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW
      );

      const positionLocation = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

      // Texture coordinates (DYNAMIC)
      const texCoordBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]),
        gl.DYNAMIC_DRAW
      );
      texCoordBufferRef.current = texCoordBuffer;

      const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
      gl.enableVertexAttribArray(texCoordLocation);
      gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

      updateCaptureRegion(captureRegion);

      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      await waitForVideo(video);

      if (intervalRef.current !== null) return;

      intervalRef.current = setInterval(() => {
        if (video.readyState >= 2 && !video.paused && !video.ended) {
          const brightness = calculateBrightness(gl, video, texture);
          onBrightnessChangeRef.current?.(brightness);
        }
      }, 50);
    } catch {
      cleanup();
    }
  }

  function updateCaptureRegion(regionPercent) {
    const gl = glRef.current;
    const texCoordBuffer = texCoordBufferRef.current;
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
  }

  function createProgram(gl, vs, fs) {
    const v = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(v, vs);
    gl.compileShader(v);

    const f = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(f, fs);
    gl.compileShader(f);

    const p = gl.createProgram();
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    return p;
  }

  function calculateBrightness(gl, video, texture) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    gl.viewport(0, 0, 16, 16);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    const pixels = new Uint8Array(16 * 16 * 4);
    gl.readPixels(0, 0, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    let r = 0, g = 0, b = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      r += pixels[i];
      g += pixels[i + 1];
      b += pixels[i + 2];
    }

    return (r + g + b) / (3 * 16 * 16 * 255);
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

  function cleanup() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current = null;
    }

    if (glRef.current && glLoseContextRef.current) {
      glLoseContextRef.current.loseContext();
      glLoseContextRef.current = null;
    }

    glRef.current = null;
    programRef.current = null;
    texCoordBufferRef.current = null;
    canvasRef.current = null;
  }
  return null;
}
