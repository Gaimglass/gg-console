const {app, globalShortcut} = require('electron')
const { toggleCalibrateWindow } = require('../calibrateWindow')

// https://www.electronjs.org/docs/latest/api/accelerator

// [{<accelerator>, <command>}, ...]
let registeredCommands = []


function enableShortcuts(mainWindow, bindings) {
  // https://www.electronjs.org/docs/latest/api/accelerator
  for (const [command, value] of Object.entries(bindings)) {
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
    accelerator = [modifiersStr, button].join('+')
    registeredCommands.push([accelerator, command]);
  }

  for (let i = 0; i < registeredCommands.length; i++) {
    const registeredCommand = registeredCommands[i]
    const accelerator = registeredCommand[0]
    const command = registeredCommand[1];
    const action = getActionForCommand(command);

    if(action) {
      try{
        globalShortcut.register(accelerator, () => {
          action(mainWindow, command);
        })
      } 
      catch(e) {
        console.warn("Invalid accelerator", e.message)
      }
    }
  }
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
  
  for(let i = 0; i < registeredCommands.length; i++) {
    const accelerator = registeredCommands[i][0];
    globalShortcut.unregister(accelerator)
  }
  registeredCommands = [];
}
module.exports = {
  disableShortcuts,
  enableShortcuts,
}