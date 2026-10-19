import { useEffect, useRef } from 'react';
import styles from './css/CalibrationCanvas.module.css';
import { Crosshairs } from './Crosshairs';

export default function CalibrationCanvas({ color }) {
  const canvasRef = useRef(null);
  const xhairsRef = useRef(null);

  useEffect(() => {
    document.body.classList.add(styles.bodyCalibrate);
    const ctx = canvasRef.current.getContext('2d');
    xhairsRef.current = new Crosshairs(ctx, { r: 80, g: 255, b: 40, a: 1 });
    let previousTime;
    let animationFrame;
    const render = time => {
      const dt = previousTime === undefined ? 0 : time - previousTime;
      ctx.save();
      xhairsRef.current.draw(dt, time);
      ctx.restore();
      previousTime = time;
      animationFrame = window.requestAnimationFrame(render);
    };
    animationFrame = window.requestAnimationFrame(render);

    return () => {
      document.body.classList.remove(styles.bodyCalibrate);
      window.cancelAnimationFrame(animationFrame);
      xhairsRef.current = null;
    };
  }, []);

  useEffect(() => {
    xhairsRef.current?.setColor(color);
  }, [color]);

  return <canvas ref={canvasRef} width="1" height="1" id="canvas" className={styles.canvas} style={{ opacity: color?.a ?? 1 }} />;
}
