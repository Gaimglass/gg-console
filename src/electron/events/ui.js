const electron = require('electron');
const path = require('path');
const url = require('url');

const { getMainLED, getDefaultLEDs, setMainLED, setDefaultColors, setDefaultIndex, } = require('../usb/serial-commands');
const { checkForUpdates, updateAndRestart } = require('../updates')
const { toggleCalibrateWindow } = require('../calibrateWindow')

const BrowserWindow = electron.BrowserWindow;

function registerUIEvents(mainWindow, app, isDev) {
  //
  // Synchronous events from UI to electron
  //
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
  
  //
  // Windows commands
  //
  electron.ipcMain.on('get-app-state', async (event) => {
    event.returnValue = {
      isMaximized: mainWindow.isMaximized(),
      isMac: process.platform === 'darwin',
      version: app.getVersion()
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


  electron.ipcMain.on('restart-and-update-app', async (event) => {
    try {
      updateAndRestart(app);
    } catch(err) {
      console.warn(err)
    }
    event.returnValue = 'okay';
  });

  //
  // Non-blocking handlers
  //

  electron.ipcMain.handle('check-for-updates', async (event) => {
    try {
      console.log("check for updates...")
      const result = await checkForUpdates(app.getVersion(), isDev);
      return {
        ...result
      };
    } catch(err) {
      console.error("check for updates error: ", err.message)
      return {
        error: err.message
      };
    }
  });

  electron.ipcMain.handle('calibrate-gaimglass', async (event) => {
    toggleCalibrateWindow()
  });

}

module.exports = {
  registerUIEvents
}
