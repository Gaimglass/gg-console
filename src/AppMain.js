import React, { useEffect } from 'react';
import AppColorPicker from "./AppColorPicker";
import AppCalibrate from "./AppCalibrate";
import  { getKeyBindings, getADSSettings } from './Utils'

const electron = window.require('electron');
const ipcRenderer  = electron.ipcRenderer;

/*
let gp;
// TODO poll the game pad with requestAnimationFrame after it connects. We might need to do this for each gp and listen to all of them.

window.addEventListener('gamepadconnected', (event) => {
  console.log('✅ 🎮 A gamepad was connected:', event.gamepad);
  //gp = event.gamepad
  gp = navigator.getGamepads()[0];
  console.log({gp})
});


setInterval(()=>{
  gp = navigator.getGamepads()[0];
  if (gp?.buttons[2].pressed) {
    // respond to button being pressed
    console.log("button pressed")
  } else {
    console.log(0)
  }
},10)*/


export default function AppMain() {

  function sendAppSettings() {
    const bindings = getKeyBindings();
    ipcRenderer.invoke('set-enable-shortcuts', bindings);

    const ads = getADSSettings();
    ipcRenderer.invoke('set-enable-ads', ads);
    
  }

  useEffect(()=>{
    sendAppSettings();
  }, [])

  const params = new URLSearchParams(window.location.search);
  const isCalibrate = params.get('app') === 'calibrate'
  return (
    <>
      {isCalibrate ? <AppCalibrate></AppCalibrate> : <AppColorPicker></AppColorPicker>}
    </>
    
  )
}