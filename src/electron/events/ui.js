const electron = require('electron');

const { getMainLED, getDefaultLEDs, setMainLED, setAlpha, setDefaultColors, setDefaultIndex, } = require('../usb/serial-commands');
const { readDeviceState } = require('../usb/usb');
const { checkForUpdates, updateAndRestart, getUpdateStatus } = require('../updates')
const { toggleCalibrationFullscreen, exitCalibrationFullscreen } = require('../calibrateFullscreen');
const { disableShortcuts, enableShortcuts, validateShortcut, resumeShortcuts } = require('./shortcuts')
const { setADS } = require('./mouse')
const { showActionOverlay, configureActionOverlay, getActionOverlayStatus } = require('../overlay');


function registerUIEvents(mainWindow, app) {
  electron.ipcMain.handle('get-device-state', (_event, reason) => readDeviceState(reason));

  electron.ipcMain.handle('set-overlay-settings', (_event, settings) => {
    configureActionOverlay(settings);
  });
  electron.ipcMain.handle('preview-action-overlay', (_event, notification) => showActionOverlay(notification));
  electron.ipcMain.handle('get-overlay-status', () => getActionOverlayStatus());

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
      // Only explicit user actions produce feedback; ADS, ambient and startup writes stay quiet.
      if (ledState.feedback === 'brightness') showActionOverlay({ type: 'brightness', value: ledState.brightness });
      else if (ledState.feedback === 'power') showActionOverlay({ type: 'power', on: ledState.ledOn });
    } catch(err) {
      event.returnValue = err;
    }
  });

  electron.ipcMain.on('set-ambient', async (event, value, exponent) => {
    try {
      const result = await setAlpha(value, exponent);
      event.returnValue = result;
    } catch(err) {
      event.returnValue = err;
    }
  });

  electron.ipcMain.on('set-default-index', async (event, index, color) => {
    try {
      const result = await setDefaultIndex(index);
      event.returnValue = result;
      showActionOverlay({ type: 'color-slot', slot: index + 1, color });
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
      isFullscreen: mainWindow.isFullScreen(),
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
    if (mainWindow.isFullScreen()) {
      exitCalibrationFullscreen(mainWindow);
      event.returnValue = 'okay';
      return;
    }
    // hide to try, not exit
    mainWindow.setSkipTaskbar(true);
    mainWindow.hide();
    event.returnValue = 'okay';
  });


  electron.ipcMain.handle('restart-and-update-app', async () => {
    try {
      updateAndRestart();
      return 'okay';
    } catch(err) {
      console.warn(err);
      return { error: err.message || String(err) };
    }
  });

  //
  // Non-blocking handlers
  //

  electron.ipcMain.handle('get-default-colors', async () => {
    try {
      const ledStateStr = await getDefaultLEDs();
      return { ok: true, data: ledStateStr };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  electron.ipcMain.handle('get-update-status', () => getUpdateStatus());
  electron.ipcMain.handle('check-for-updates', async () => {
    try {
      return await checkForUpdates();
    } catch(err) {
      return {
        ...getUpdateStatus(),
        error: getUpdateStatus().error || err.message || String(err),
      };
    }
  });

  electron.ipcMain.handle('calibrate-gaimglass', async () => {
    toggleCalibrationFullscreen(mainWindow);
  });

  electron.ipcMain.handle('exit-calibrate-fullscreen', () => exitCalibrationFullscreen(mainWindow));

  electron.ipcMain.handle('set-enable-shortcuts', async (event, bindings) => {
    void event;
    return enableShortcuts(mainWindow, bindings)
  });

  electron.ipcMain.handle('validate-shortcut', async (event, command, value) => {
    void event;
    return validateShortcut(mainWindow, command, value)
  });

  electron.ipcMain.handle('set-disable-shortcuts', async () => {
    disableShortcuts();
  });

  electron.ipcMain.handle('set-resume-shortcuts', async () => resumeShortcuts(mainWindow));


  electron.ipcMain.handle('set-enable-ads', async (event, ads) => {
    void event;
    return setADS(mainWindow, ads)
  });

  electron.ipcMain.handle('get-screen-sources', async () => {
    try {
      const { desktopCapturer } = electron;
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 320, height: 180 }
      });
      return sources;
    } catch (error) {
      console.error('Error getting screen sources:', error);
      return [];
    }
  });

}

module.exports = {
  registerUIEvents
}
