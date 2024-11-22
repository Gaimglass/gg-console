const electron = require('electron');
const Store = require('electron-store');
const log = require('electron-log/main');
const fs = require('fs');

const { registerUIEvents } = require('./events/ui');
//const { registerMouseEvents } = require('./events/mouse');
const { connectUsb,  disconnectUsb } = require('./usb/usb');
const { registerKeyboardShortcuts } = require('./events/shortcuts');

// Module to control application life.
const app = electron.app;
// https://stackoverflow.com/questions/70267992/win10-electron-error-passthrough-is-not-supported-gl-is-disabled-angle-is
app.disableHardwareAcceleration()

// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow;

const path = require('path');
const url = require('url');

// Electron store for persistent data after app closes.
// TODO: Use this for custom keyboard shortcuts.
const store = new Store();

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
var mainWindow;
var isDev = false;
// task tray object reference
var tray = 1;


var mouseState = {
  down: false
}

// https://www.electronforge.io/config/makers/squirrel.windows
// run this as early in the main process as possible
if (require('electron-squirrel-startup')) app.quit();


//const appIcon = new electron.Tray('./assets/gg_icon.png')

// Windows task try icon and menu
function createTray() {
  let appIcon = new electron.Tray(path.join(__dirname, '../assets/gg_icon32.ico'));
  const contextMenu = electron.Menu.buildFromTemplate([{
          label: 'Show', click: function () {
              mainWindow.show();
          }
      }, {
          label: 'Exit', click: function () {
              app.isQuitting = true;
              app.quit();
          }
      }
  ]);

  appIcon.on('double-click', function (event) {
      mainWindow.show();
      mainWindow.setSkipTaskbar(false);
  });
  appIcon.setToolTip('Gaimglass Console');
  appIcon.setContextMenu(contextMenu);
  return appIcon;
}


// single lock (required on Windows to prevent multiple instances)
const additionalData = {}
const gotTheLock = app.requestSingleInstanceLock(additionalData)


if (!gotTheLock) {
  app.quit()
} else {
  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.
  app.on('ready', ()=>{
    createWindow();
    registerUIEvents(mainWindow, app, isDev)
    //registerMouseEvents(mainWindow)
    registerKeyboardShortcuts(mainWindow);
    /*electron.powerMonitor.on("lock-screen", () => {
    });*/
    electron.powerMonitor.on("suspend", () => {
      // Turn off the LED when sleeping
      mainWindow.webContents.send('deactivate-led');
    });
    electron.powerMonitor.on("resume", () => {
      // Reconnect on wake. Sometimes the power turns off the device and we need to reconnect the USB port
      connectUsb(mainWindow);
    });

  });

  // Quit when all windows are closed.
  app.on('window-all-closed', function () {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    disconnectUsb({reconnect: false});
    if (process.platform !== 'darwin') { 
      app.quit()
    }
  });

  app.on('activate', function () {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
      createWindow()
    }
  });

  app.on('second-instance', (event, commandLine, workingDirectory, additionalData) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      mainWindow.show();
      mainWindow.setSkipTaskbar(false);
      mainWindow.focus()
    }
  })
}

async function createWindow() {
  
  const isMac = process.platform === 'darwin';
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 720,
    height: 500,
    frame: false,
    icon: path.join(__dirname, '../assets/gg_icon.png'),
    /* minHeight:600,
    minWidth:700, */
    maximizable: false,
    fullscreenable: false,
    resizable: false,
    backgroundColor: '#282c34',
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? true : false,
    webPreferences: {
      nodeIntegration: true,
      enableRemoteModule: true,
      contextIsolation: false,
    }
  });

  //const appIcon = new electron.Tray('./assets/gg_icon.png')
  
  if (process.env.NODE_ENV === 'development') {
    // Open the DevTools
    isDev = true;
    mainWindow.webContents.openDevTools();
  } else {
    if(isMac) {
      // todo https://www.npmjs.com/package/electron-log
    } else {
      console.log = log.log
      console.warn = log.warn
      console.error = log.error
      fs.unlink(`${process.env.APPDATA}/Gaimglass/logs/main.log`, (err) => {
        if (err) {
          console.error(`Error removing file: ${err}`);
          return;
        }
      });
    }
  }

  connectUsb(mainWindow);

  // and load the index.html of the app.
  const startUrl = process.env.ELECTRON_START_URL || url.format({
      pathname: path.join(__dirname, '../../build/index.html'),
      protocol: 'file:',
      slashes: true
  });

  mainWindow.loadURL(startUrl);

  // create the try in Windows
  if (process.platform !== 'darwin') {
    tray = createTray();
  }

  // Emitted when the window is closed.
  mainWindow.on('close', function (e) {
    if (!app.isQuitting) {
      // just hide the app, don't close it
      e.preventDefault();
      mainWindow.setSkipTaskbar(true);
      mainWindow.hide();
    }
  });
  
  mainWindow.on('closed', function () { 
    // De-reference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element
    mainWindow = null
  })

  mainWindow.on('minimize', function (event) {
    
  });

  mainWindow.on('restore', function (event) {
    
  });

  mainWindow.on('show', function (event) {
    
  });
}
