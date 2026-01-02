import React, { useEffect, useRef, useCallback } from 'react';

import styles from './css/AppCalibrate.module.css';
import { ReactComponent as Close } from './assets/xmark-solid.svg';
import { useThrottle } from './Utils';
import { Crosshairs } from './Crosshairs';

const ipcRenderer  = window.ipcRenderer;

export default function AppCalibrate() {
  const canvasRef = useRef(null);
  const prevTimeRef = useRef(0);
  const renderQueueRef = useRef([]);
  const xhairsRef = useRef(null);

  // Copied from AppColorPicker
  function parseMainLedFromGG(message) {
    if (!message || typeof message !== 'string') {
      console.warn('parseMainLedFromGG: Invalid message', message);
      return { r: 80, g: 255, b: 40, a: 1 }; // Return default color
    }
    const params = message.split('&');
    const c = {};
    params.forEach((param) => {
      const [key, value] = param.split('=');
      switch (key) {
        case 'color': {
          const [r, g, b] = value.split(',');
          c.r = Number(r);
          c.g = Number(g);
          c.b = Number(b);
          break;
        }
        case 'brightness':
          c.a = Number(value);
          break;
        default:
          break;
      }
    });
    return c;
  }

  const handleUpdateColor = useCallback((message) => {
    // listen for 'update-main-led-state-from-gg' IPC messages and updates the crosshairs color
    const color = parseMainLedFromGG(message);
    if (xhairsRef.current) {
      xhairsRef.current.setColor(color);
    }
  }, []);

  const handleUpdateColorThrottled = useThrottle(handleUpdateColor, 50);
  
  const handleColorSync = useCallback((evt, color, ledOn) => {
    if (xhairsRef.current && ledOn) {
      xhairsRef.current.setColor(color);
    }
  }, []);

  useEffect(() => {
    document.getElementsByTagName('body')[0].classList.add(styles.bodyCalibrate);
    document.addEventListener('keydown', handleClick);

    const canvas = document.getElementById('canvas');
    if (canvas) {
      canvas.style.display = '';
    }

    loadMainLedFromGG();

    // Listen for real-time color updates from the device
    ipcRenderer.on('update-main-led-state-from-gg', handleUpdateColorThrottled);

    // Listen for color changes from other windows (e.g., AppColorPicker)
    ipcRenderer.on('color-sync-from-other-window', handleColorSync);

    return () => {
      document.removeEventListener('keydown', handleClick);
      document.getElementsByTagName('body')[0].classList.remove(styles.bodyCalibrate);
      ipcRenderer.removeListener('update-main-led-state-from-gg', handleUpdateColorThrottled);
      ipcRenderer.removeListener('color-sync-from-other-window', handleColorSync);
      handleUpdateColorThrottled.cancel?.(); // Cancel any pending throttled calls
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    window.close();
  }

  function handleClick(event) {
    if (event.key === 'Escape' || event.keyCode === 27) {
      close();
    }
  }

  function initXhairs(color) {
    const ctx = canvasRef.current.getContext('2d');
    xhairsRef.current = new Crosshairs(ctx, color);
    renderQueueRef.current.push(xhairsRef.current);
    window.requestAnimationFrame(render);
  }

  function render(time) {
    if (prevTimeRef.current === 0) {
      prevTimeRef.current = time;
    }
    const dt = time - prevTimeRef.current;
    const ctx = canvasRef.current?.getContext('2d');
    
    if (ctx) {
      ctx.save();
      renderQueueRef.current.forEach((r) => {
        r.draw(dt, time);
      });
      ctx.restore();
    }
    
    prevTimeRef.current = time;
    window.requestAnimationFrame(render);
  }

  // Copied from AppColorPicker
  function loadMainLedFromGG() {
    const result = ipcRenderer.sendSync('get-led-state');
    const color = parseMainLedFromGG(result);
    initXhairs(color);
  }

  return (
    <div id="container">
      <button onClick={close} className={styles.close}>
        <Close />
      </button>
      <canvas ref={canvasRef} width="1" height="1" id="canvas" />
    </div>
  );
}