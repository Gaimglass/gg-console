import React, { useState, useEffect, useRef } from 'react';

import styles from './css/AppCalibrate.module.css'
import {ReactComponent as Close} from './assets/xmark-solid.svg';

var crosshairs = require('./electron/crosshairs');
const electron = window.require('electron');
const ipcRenderer  = electron.ipcRenderer;



export default function AppCalibrate() {
  
  const canvasRef = useRef(null);
  const [showCrosshairs, setShowCrosshairs] = useState(false);

  var prevTime = 0;
  var renderQueue = []; // might be state, not sure
  var xhairs;
    
  useEffect(()=>{
    document.getElementsByTagName('body')[0].classList.add(styles.bodyCalibrate) // remove margin
    document.addEventListener('keydown', handleClick);

    document.getElementById("canvas").style.display = '';
    if (renderQueue.length === 0){
      // first time only;
      initXhairs();
    }

    return ()=>{
      document.removeEventListener("keydown", handleClick);
      document.getElementsByTagName('body')[0].classList.remove(styles.bodyCalibrate)
    }
  }, [])

  function close() {
    window.close();
  }
  function handleClick(event) {
    if (event.key === 'Escape' || event.keyCode === 27) {
        close();
      }
  }

  function initXhairs() {
    const ctx = canvasRef.current.getContext("2d");
    xhairs = new crosshairs.Crosshairs(ctx);
    renderQueue.push(xhairs);
    window.requestAnimationFrame(render.bind(this, ctx, renderQueue, 0));
  }

  function render(ctx, renderQueue, preTime, time) {
    if(prevTime === 0) {
        prevTime = time;
    }
    var dt = time - prevTime;
    ctx.save();
    renderQueue.forEach((r)=>{
        r.draw(dt, time);
    });
    ctx.restore();
    prevTime = time;
    //console.log('render ',time);
    window.requestAnimationFrame(render.bind(this, ctx, renderQueue, prevTime));
    
  }

  return (
    <div id="container">
      <button onClick={close} class={styles.close}>
        <Close></Close>
      </button>
      <canvas ref={canvasRef} width="1" height="1" id="canvas"></canvas>
    </div>
    )
}