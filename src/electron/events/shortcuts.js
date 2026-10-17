const { globalShortcut} = require('electron')
const { toggleCalibrateWindow } = require('../calibrateWindow');
const { runDeviceShortcut } = require('./shortcut-controls');
let currentBindings = {};
let shortcutsPaused = false;

// https://www.electronjs.org/docs/latest/tutorial/keyboard-shortcuts

function getAccelerator(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Probe OS availability without activating a shortcut while the user records it.
 * 
 * @param {*} mainWindow 
 * @param {*} command 
 * @param {*} value 
 * @returns 
 */
function validateShortcut(mainWindow, command, value) {
  let error = null
  const accelerator = getAccelerator(value);
  if (accelerator.trim()==='') {
    // not bound to any buttons
    return null;
  }
  const action = getActionForCommand(command);
  const duplicate = Object.entries(currentBindings).find(([other, binding]) => other !== command && getAccelerator(binding).toLowerCase() === accelerator.toLowerCase());
  if (duplicate) return 'This shortcut is already assigned to another Gaimglass action.';
  if (!shortcutsPaused && getAccelerator(currentBindings[command]).toLowerCase() === accelerator.toLowerCase() && globalShortcut.isRegistered(accelerator)) return null;
  if (action) {
    try{
      const result = globalShortcut.register(accelerator, () => {
        action(mainWindow, command);
      })
      if (!result) {
        error = 'Unavailable: another app or the system may be using this shortcut.'
      } else {
        globalShortcut.unregister(accelerator);
      }
    } 
    catch(e) {
      console.warn("Invalid accelerator", e.message)
      error = 'This key combination is not supported. Choose another shortcut.'
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
  currentBindings = { ...bindings };
  if (shortcutsPaused) return {};
  return registerBindings(mainWindow);
}

function registerBindings(mainWindow) {
  globalShortcut.unregisterAll();
  const errors = {};
  for (const [command, value] of Object.entries(currentBindings)) {
    const accelerator = getAccelerator(value);
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
          errors[command] = 'Unavailable: another app or the system may be using this shortcut.'
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
    case "brightness+":
    case "led":
    case "s1":
    case "s2":
    case "s3":
    case "s4":
    case "s5":
    case "s6":
    case "s7":
    case "s8":
      return (_mainWindow, command)=>{
        void runDeviceShortcut(command);
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
  shortcutsPaused = true;
  globalShortcut.unregisterAll();
}

function resumeShortcuts(mainWindow) {
  shortcutsPaused = false;
  return registerBindings(mainWindow);
}

module.exports = {
  disableShortcuts,
  validateShortcut,
  enableShortcuts,
  resumeShortcuts,
}
