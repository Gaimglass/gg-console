import { useEffect, useRef } from 'react';

const electron = window.require('electron');
const ipcRenderer = electron.ipcRenderer;

export default function BrightnessMonitor({ enabled }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const glRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      cleanup();
      return;
    }

    setupBrightnessMonitor();

    return cleanup;
  }, [enabled]);

  async function setupBrightnessMonitor() {
    try {
      // 1. Request screen sources from main process via IPC
      const sources = await ipcRenderer.invoke('get-screen-sources');

      if (!sources || sources.length === 0) {
        console.error('No screen sources available');
        return;
      }

      // Use the first screen (primary display)
      const primaryScreen = sources[0];

      // 2. Get screen stream using getUserMedia with the screen source
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
            maxFrameRate: 10
          }
        }
      });

      streamRef.current = stream;

      // 2. Setup video element
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.muted = true;
      videoRef.current = video;

      // 3. Setup WebGL canvas for GPU acceleration
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      canvasRef.current = canvas;

      const gl = canvas.getContext('webgl', { 
        preserveDrawingBuffer: true,
        antialias: false 
      });
      
      if (!gl) {
        console.error('WebGL not supported');
        return;
      }
      
      glRef.current = gl;

      // 4. Setup WebGL shaders and program
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

      // Setup geometry
      const positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,  1, -1,  -1, 1,  1, 1
      ]), gl.STATIC_DRAW);

      const texCoordBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        0, 1,  1, 1,  0, 0,  1, 0
      ]), gl.STATIC_DRAW);

      const positionLocation = gl.getAttribLocation(program, 'a_position');
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

      const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
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

      // 5. Wait for video to be ready
      await new Promise((resolve) => {
        video.addEventListener('loadedmetadata', resolve, { once: true });
      });

      // 6. Start sampling loop at 10fps
      intervalRef.current = setInterval(() => {
        if (!video.paused && !video.ended && video.readyState >= 2) {
          const brightness = calculateBrightness(gl, video, texture);
          // Send to main process
          ipcRenderer.send('ambient-brightness-update', brightness);
        }
      }, 100); // 10 times per second

    } catch (error) {
      console.error('Error setting up brightness monitor:', error);
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
    // Upload video frame to GPU as texture
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    // Draw to 1x1 canvas (GPU downsamples automatically)
    gl.viewport(0, 0, 1, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Read single pixel (average brightness)
    const pixels = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // Calculate brightness (0.0 - 1.0)
    const brightness = (pixels[0] + pixels[1] + pixels[2]) / 3 / 255;
    return brightness;
  }

  function cleanup() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current = null;
    }

    if (glRef.current) {
      glRef.current = null;
    }

    canvasRef.current = null;
  }

  // This component doesn't render anything visible
  return null;
}
