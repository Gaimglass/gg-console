import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RgbaColorPicker } from 'react-colorful';
import DefaultColors from './DefaultColors';

import styles from './css/AppCalibrate.module.css';
import Close from './assets/xmark-solid.svg?react';
import { useThrottle } from './Utils';
import { Crosshairs } from './Crosshairs';

const ipcRenderer = window.ipcRenderer;

export default function AppCalibrate() {
  const [color, setColor] = useState(null);
  const [defaultColors, setDefaultColors] = useState([]);
  const canvasRef = useRef(null);
  const xhairsRef = useRef(null);
  const pendingColorRef = useRef(null);
  const enabledDefaultColors = defaultColors.filter(swatch => swatch.enabled).slice(0, 8);

  const sendColorChange = useCallback((newColor) => {
    // Use the main picker's current-color path so saved swatches are untouched.
    ipcRenderer.send('change-current-color', newColor);
  }, []);
  const sendColorChangeThrottled = useThrottle(sendColorChange, 50);

  const handleColorChange = useCallback((newColor) => {
    pendingColorRef.current = newColor;
    setColor(newColor);
    sendColorChangeThrottled(newColor);
  }, [sendColorChangeThrottled]);

  const handleColorSync = useCallback((newColor) => {
    const pending = pendingColorRef.current;
    if (pending) {
      // Earlier device writes can finish while a newer color is still queued.
      // Keep the immediate React preview until the latest color is acknowledged.
      if (['r', 'g', 'b', 'a'].every(channel => pending[channel] === newColor[channel])) {
        pendingColorRef.current = null;
      }
      return;
    }
    setColor(newColor);
  }, []);

  useEffect(() => {
    if (color) xhairsRef.current?.setColor(color);
  }, [color]);

  useEffect(() => {
    document.body.classList.add(styles.bodyCalibrate);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') window.close();
    };
    document.addEventListener('keydown', handleKeyDown);

    const ctx = canvasRef.current.getContext('2d');
    xhairsRef.current = new Crosshairs(ctx, { r: 80, g: 255, b: 40, a: 1 });
    let previousTime;
    let animationFrame;
    const render = (time) => {
      const dt = previousTime === undefined ? 0 : time - previousTime;
      ctx.save();
      xhairsRef.current.draw(dt, time);
      ctx.restore();
      previousTime = time;
      animationFrame = window.requestAnimationFrame(render);
    };
    animationFrame = window.requestAnimationFrame(render);

    // Seed from the main React state without reading or writing the device.
    ipcRenderer.on('color-sync-from-other-window', handleColorSync);
    ipcRenderer.on('default-colors-sync-from-other-window', setDefaultColors);
    ipcRenderer.send('request-color-sync');
    ipcRenderer.send('request-default-colors-sync');

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.classList.remove(styles.bodyCalibrate);
      ipcRenderer.removeListener('color-sync-from-other-window', handleColorSync);
      ipcRenderer.removeListener('default-colors-sync-from-other-window', setDefaultColors);
      sendColorChangeThrottled.cancel?.();
      window.cancelAnimationFrame(animationFrame);
      xhairsRef.current = null;
    };
  }, [handleColorSync, sendColorChangeThrottled]);

  return (
    <div id="container">
      <canvas ref={canvasRef} width="1" height="1" id="canvas" className={styles.canvas} style={{ opacity: color?.a ?? 1 }} />
      {color && (
        <div className={styles.colorPicker} role="group" aria-label="Current color">
          <RgbaColorPicker color={color} onChange={handleColorChange} />
          {enabledDefaultColors.length > 0 && (
            <DefaultColors
              readOnly
              colors={enabledDefaultColors}
              selectedColor={color}
              onChangeColor={newColor => handleColorChange({ ...newColor, a: color.a })}
            />
          )}
        </div>
      )}
      <button onClick={() => window.close()} className={styles.close} aria-label="Close calibration">
        <Close />
      </button>
    </div>
  );
}
