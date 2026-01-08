import React from 'react';
import AppColorPicker from "./AppColorPicker";
import AppCalibrate from "./AppCalibrate";
import { SettingsProvider } from './SettingsProvider';
import { ControllerProvider } from './ControllerProvider';

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

function AppMainContent() {
  // Read window type from Electron's additionalArguments
  const windowType = window.argv.find(arg => arg.startsWith('--window-type='))?.split('=')[1];
  const isCalibrate = windowType === 'calibrate';
  
  return (
    <>
      {isCalibrate ? <AppCalibrate /> : <AppColorPicker />}
    </>
  );
}

export default function AppMain() {
  return (
    <SettingsProvider>
      <ControllerProvider>
        <AppMainContent />
      </ControllerProvider> 
    </SettingsProvider>
  );
}