import React, { useEffect, useRef } from 'react';

import styles from './css/AppCalibrate.module.css'
import {ReactComponent as Close} from './assets/xmark-solid.svg';
import  { getMessageResult } from './Utils'
import { Crosshairs } from './Crosshairs';

const electron = window.require('electron');
const ipcRenderer  = electron.ipcRenderer;

export default function AppCalibrate() {
  
  const canvasRef = useRef(null);
  
  var prevTime = 0;
  var renderQueue = []; // might be state, not sure
  var xhairs;
    
  useEffect(()=>{
    document.getElementsByTagName('body')[0].classList.add(styles.bodyCalibrate) // remove margin
    document.addEventListener('keydown', handleClick);

    document.getElementById("canvas").style.display = '';

    
    loadMainLedFromGG();

    return ()=>{
      document.removeEventListener("keydown", handleClick);
      document.getElementsByTagName('body')[0].classList.remove(styles.bodyCalibrate)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function close() {
    window.close();
  }

  function handleClick(event) {
    if (event.key === 'Escape' || event.keyCode === 27) {
        close();
      }
  }

  function initXhairs(color) {
    const ctx = canvasRef.current.getContext("2d");
    xhairs = new Crosshairs(ctx, color);
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
    window.requestAnimationFrame(render.bind(this, ctx, renderQueue, prevTime));
  }

  // copied from AppGaimglass
  function parseMainLedFromGG(message) { 
    const params = message.split('&');
    let c = {};
    //let led;
    params.forEach(param => {
      const [key, value] = param.split('=');
      // eslint-disable-next-line default-case
      switch(key) {
        case 'color':
          const [r,g,b] = value.split(',');
          c.r = Number(r);
          c.g = Number(g);
          c.b = Number(b);
          break;
        /*case 'ledOn':
          led = Boolean(Number(value));
          break;*/
        case 'brightness':
          c.a = Number(value);
          break;
      }
    });
    return c;
  }
  
  // copied from AppGaimglass
  async function loadMainLedFromGG() { 
    getMessageResult(ipcRenderer.sendSync('get-led-state'), (result) => {
      const color = parseMainLedFromGG(result);
      initXhairs(color);
    });
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