import { useEffect, useRef } from 'react';
import { useSettings } from './SettingsProvider';

const ipcRenderer  = window.ipcRenderer;

/**
 * The BrightnessMonitor React component captures a region of the user's screen using Electron and WebGL, 
 * processes the video feed in real time, and calculates the average brightness of the selected area. 
 * It sets up a hidden video and WebGL canvas, samples the screen at regular intervals, and uses GPU acceleration 
 * to efficiently downscale and analyze the image. The calculated brightness value is then passed to a callback,
 * allowing the parent component to react to changes in screen brightness for the ambient lighting adjustment. 
 * The component manages resource cleanup and responds to system suspend/resume events to ensure robust operation.
 */

/**
 * The BrightnessMonitor React component captures a region of the user's screen using Electron and WebGL, 
 * processes the video feed in real time, and calculates the average brightness of the selected area. 
 * It sets up a hidden video and WebGL canvas, samples the screen at regular intervals, and uses GPU acceleration 
 * to efficiently downscale and analyze the image. The calculated brightness value is then passed to a callback,
 * allowing the parent component to react to changes in screen brightness for the ambient lighting adjustment. 
 * The component manages resource cleanup and responds to system suspend/resume events to ensure robust operation.
 */

export default function BrightnessMonitor({ onBrightnessChange }) {
  const { ambientSettings } = useSettings();
  const { enabled, captureRegion } = ambientSettings;
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const glRef = useRef(null);
  const glLoseContextRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const onBrightnessChangeRef = useRef(onBrightnessChange);

  // Keep callback ref updated to avoid stale closures

  const handleOnOsResume = () => {
    // Always cleanup first to restart with new settings
    //console.log('[BrightnessMonitor] starting restart on OS resume');
    cleanup();
    if (enabled) {
      setupBrightnessMonitor();
      //console.log('[BrightnessMonitor] Restarted on OS resume');
    }
  }

  const handleOnOsSuspend = () => {
    // Always cleanup first to restart with new settings
    //console.log('[BrightnessMonitor] suspend');
    cleanup();
  }

  useEffect(() => {
    onBrightnessChangeRef.current = onBrightnessChange;
  }, [onBrightnessChange]);

  useEffect(() => {
    if (!enabled) {
      cleanup();
      return;
    }
    // Always cleanup first to restart with new settings
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
  }, [enabled, captureRegion]);

  async function setupBrightnessMonitor() {
    //console.log('[BrightnessMonitor] Setting up with region:', captureRegion);
    try {
      // 1. Request screen sources from main process via IPC
      const sources = await ipcRenderer.invoke('get-screen-sources');

      if (!sources || sources.length === 0) {
        //console.error('No screen sources available');
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
      // Use 16x16 to properly average the capture region
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      canvasRef.current = canvas;

      const gl = canvas.getContext('webgl', { 
        preserveDrawingBuffer: true,
        antialias: false 
      });
      
      if (!gl) {
        //console.error('WebGL not supported');
        return;
      }
      
      glRef.current = gl;
      // Get extension to properly dispose context later
      glLoseContextRef.current = gl.getExtension('WEBGL_lose_context');

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

      // Calculate texture coordinates based on capture region percentage
      // Clamp between 10% and 100%
      const regionPercent = Math.max(0.1, Math.min(1.0, captureRegion / 100));
      const halfRegion = regionPercent / 2;
      const centerX = 0.5;
      const centerY = 0.5;
      
      // Calculate the centered region bounds
      const minX = centerX - halfRegion;
      const maxX = centerX + halfRegion;
      const minY = centerY - halfRegion;
      const maxY = centerY + halfRegion;

      // Update texture coordinates to sample only the centered region
      // Format: [bottom-left, bottom-right, top-left, top-right]
      const centeredTexCoords = new Float32Array([
        minX, maxY,  // bottom-left
        maxX, maxY,  // bottom-right
        minX, minY,  // top-left
        maxX, minY   // top-right
      ]);
      
      gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, centeredTexCoords, gl.STATIC_DRAW);

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

      // 5. Wait for video to be ready with retry logic
      let retries = 0;
      const maxRetries = 2;
      
      while (retries <= maxRetries) {
        try {
          await new Promise((resolve, reject) => {
            // If metadata already loaded, resolve immediately
            if (video.readyState >= 1) {
              resolve();
              return;
            }
            
            // Set timeout to prevent hanging forever - don't cleanup here, let outer catch handle it
            const timeout = setTimeout(() => {
              reject(new Error('Video metadata loading timed out after 3 seconds'));
            }, 3000);
            
            // Listen for successful metadata load
            const onLoaded = () => {
              clearTimeout(timeout);
              video.removeEventListener('error', onError);
              resolve();
            };
            
            // Listen for video errors
            const onError = (e) => {
              clearTimeout(timeout);
              video.removeEventListener('loadedmetadata', onLoaded);
              reject(new Error(`Video error: ${e.message || 'Unknown error'}`));
            };
            
            video.addEventListener('loadedmetadata', onLoaded, { once: true });
            video.addEventListener('error', onError, { once: true });
          });
          
          // Success - break out of retry loop
          break;
          
        } catch (err) {
          retries++;
          if (retries > maxRetries) {
            throw new Error(`Failed to load video after ${maxRetries} retries: ${err.message}`);
          }
          // Wait 500ms before retry
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // Final check - abort if cleanup was called OR if another setup already created interval
      if (intervalRef.current !== null) {
        //console.warn('[BrightnessMonitor] Aborted - interval already exists or cleanup called');
        return;
      }

      // 6. Start sampling loop at 20 FPS
      intervalRef.current = setInterval(() => {
        if (!video.paused && !video.ended && video.readyState >= 2) {
          const brightness = calculateBrightness(gl, video, texture);
          // Call callback directly instead of IPC - use ref to avoid stale closure
          if (onBrightnessChangeRef.current) {
            onBrightnessChangeRef.current(brightness);
          }
        }
        else {
          //console.warn('[BrightnessMonitor] Video not ready for sampling', video);
        }

      }, 50); // 20 times per second

    } catch (error) {
      cleanup();
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

    // Draw to 16x16 canvas (GPU downsamples the selected region)
    gl.viewport(0, 0, 16, 16);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Read all 16x16 pixels and average them for true region sampling
    const pixels = new Uint8Array(16 * 16 * 4);
    gl.readPixels(0, 0, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // Average all pixels
    let totalR = 0, totalG = 0, totalB = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      totalR += pixels[i];
      totalG += pixels[i + 1];
      totalB += pixels[i + 2];
    }
    const pixelCount = 16 * 16;
    const avgR = totalR / pixelCount;
    const avgG = totalG / pixelCount;
    const avgB = totalB / pixelCount;

    // Calculate brightness (0.0 - 1.0)
    const brightness = (avgR + avgG + avgB) / 3 / 255;
    return brightness;
  }

  function cleanup() {
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      //console.log('cleanup, clear interval');
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      //console.log('cleanup, clear streamRef');
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current = null;
      //console.log('cleanup, clear videoRef');
    }

    if (glRef.current) {
      // Properly dispose WebGL context to prevent "too many contexts" warning
      if (glLoseContextRef.current) {
        glLoseContextRef.current.loseContext();
        glLoseContextRef.current = null;
        //console.log('cleanup, lose WebGL context');
      }
      glRef.current = null;
      //console.log('cleanup, glRef');
    }

    canvasRef.current = null;
    //console.log('cleanup, canvasRef');
  }

  // This component doesn't render anything visible
  return null;
}
