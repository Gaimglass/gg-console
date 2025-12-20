import React, { useEffect } from 'react';
import AppColorPicker from "./AppColorPicker";
import AppCalibrate from "./AppCalibrate";
import BrightnessMonitor from './BrightnessMonitor';
import { SettingsProvider, useSettings } from './SettingsProvider';

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
  const { ambientSettings } = useSettings();

  // Read window type from Electron's additionalArguments
  const windowType = process.argv.find(arg => arg.startsWith('--window-type='))?.split('=')[1];
  const isCalibrate = windowType === 'calibrate';
  
  return (
    <>
      {isCalibrate ? <AppCalibrate /> : <AppColorPicker />}
      {/* Brightness monitor runs independently, enabled by settings */}
      {!isCalibrate && <BrightnessMonitor enabled={ambientSettings.enabled} />}
    </>
  );
}

export default function AppMain() {
  return (
    <SettingsProvider>
      <AppMainContent />
    </SettingsProvider>
  );
}