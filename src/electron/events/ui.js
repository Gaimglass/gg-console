const electron = require('electron');
const { getMainLED, getDefaultLEDs, setMainLED, setDefaultColors, setDefaultIndex, } = require('../usb/serial-commands');

//
// Synchronous events from UI
//

function registerUIEvents(mainWindow) {
  console.log("initializeUIEvents")
  electron.ipcMain.on('get-led-state', async (event) => {
    try {
      const result = await getMainLED();
      event.returnValue = result;
    } catch(err) {
      event.returnValue = err;
    }
  });
  
  electron.ipcMain.on('set-led-state', async (event, ledState) => {
    try {
      const result = await setMainLED(ledState.color, ledState.brightness, ledState.ledOn);
      event.returnValue = result;
    } catch(err) {
      event.returnValue = err;
    }
  });
  
  electron.ipcMain.on('set-default-index', async (event, index) => {
    try {
      const result = await setDefaultIndex(index);
      event.returnValue = result;
    } catch(err) {
      event.returnValue = err;
    }
  });
  
  
  electron.ipcMain.on('get-default-colors', async (event) => { 
    try {
      const ledStateStr = await getDefaultLEDs();
      event.returnValue = ledStateStr;
    } catch(err) {
      event.returnValue = err;
    }
  });
  
  electron.ipcMain.on('set-default-colors', async (event, colors) => {
    try {
      const result = await setDefaultColors(colors);
      event.returnValue = result;
    } catch(err) {
      event.returnValue = err;
    }
  });
  
  
  // Windows commands
  
  electron.ipcMain.on('get-app-state', async (event) => {
    event.returnValue = {
      isMaximized: mainWindow.isMaximized(),
      isMac: process.platform === 'darwin'
      // add others... 
      // TODO these should be pulled from the electron store at boot time and saved there on close
    };
  });

  electron.ipcMain.on('window-maximize', async (event) => {
    mainWindow.maximize();
    event.returnValue = 'okay';
  });
  
  electron.ipcMain.on('window-restore', async (event) => {
    event.returnValue = 'okay';
  });
  
  electron.ipcMain.on('window-minimize', async (event) => {
    mainWindow.minimize();
    event.returnValue = 'okay';
  });
  
  electron.ipcMain.on('window-close', async (event) => {
    // hide to try, not exit
    mainWindow.setSkipTaskbar(true);
    mainWindow.hide();
    event.returnValue = 'okay';
  });
}

module.exports = {
  registerUIEvents
}
