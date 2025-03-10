const { globalShortcut} = require('electron')
const { toggleCalibrateWindow } = require('../calibrateWindow');

// https://www.electronjs.org/docs/latest/api/accelerator

function getAccelerator(value) {
  let accelerator = '';
  const modifiers = value.split('+');
  const button = modifiers.pop();
  const electronModifiers = [];
  for (let i = 0; i < modifiers.length; i++) {
    switch (modifiers[i]) {
      case "Control":
        electronModifiers.push('CommandOrControl')
        break;
      default:
        electronModifiers.push(modifiers[i])
    }
  }
  const modifiersStr = electronModifiers.join("+");
  if (modifiersStr.length > 0) {
    accelerator = `${modifiersStr}+${button}`
  } else {
    accelerator = button;
  }
  return accelerator;
}

/**
 * Note Duplicates must be detected client side before calling this function
 * 
 * @param {*} mainWindow 
 * @param {*} command 
 * @param {*} value 
 * @returns 
 */
function enableShortcut(mainWindow, command, value) {
  let error = null
  const accelerator = getAccelerator(value);
  if (accelerator.trim()==='') {
    // not bound to any buttons
    return null;
  }
  const action = getActionForCommand(command);
  if (action) {
    try{
      const result = globalShortcut.register(accelerator, () => {
        action(mainWindow, command);
      })
      if (!result) {
        error = 'This key binding is already in use'
      }
    } 
    catch(e) {
      console.warn("Invalid accelerator", e.message)
      error = 'Invalid key binding2'
    }
  }
  return error;
}

/**
 * 
 * @param {*} mainWindow 
 * @param {*} bindings {<command>: accelerator>, ...}
 * @returns 
 */
function enableShortcuts(mainWindow, bindings) {
  disableShortcuts();
  const errors = {};
  for (const [command, accelerator] of Object.entries(bindings)) {
    const action = getActionForCommand(command);
    if (accelerator.trim()==='') {
      // not bound to any buttons
      continue;
    }
    if (action) {
      try{
        const result = globalShortcut.register(accelerator, () => {
          action(mainWindow, command);
        })
        if(!result) {
          errors[command] = 'This key binding is already in use'
        }
      } 
      catch(e) {
        console.warn("Invalid accelerator", e.message, {accelerator})
        errors[command] = 'Invalid key binding'
      }
    }
  }
  return errors;
}


function getActionForCommand(command) {
  switch(command) {
    case "brightness-":
      return (mainWindow)=>{
        mainWindow.webContents.send('shortcut-decrease-brightness');
      }
    case "brightness+":
      return (mainWindow)=>{
        mainWindow.webContents.send('shortcut-increase-brightness');
      }
    case "led":
      return (mainWindow)=>{
        mainWindow.webContents.send('shortcut-toggle-led');
      }
    case "s1":
    case "s2":
    case "s3":
    case "s4":
    case "s5":
    case "s6":
    case "s7":
    case "s8":
      return (mainWindow, command)=>{
        mainWindow.webContents.send('shortcut-switch-color', command[1]);
      }
    case "calibrate":
      return ()=>{
        toggleCalibrateWindow();
      }
    default:
      console.warn(`Unknown command name: ${command}`)
      return null;
  }
}

function disableShortcuts() {
  globalShortcut.unregisterAll();
}

module.exports = {
  disableShortcuts,
  enableShortcut,
  enableShortcuts,
}