const electron = require('electron');
//const Store = require('electron-store');
const log = require('electron-log/main');
const fs = require('fs');

const { registerUIEvents } = require('./events/ui');
const { registerMouseEvents } = require('./events/mouse');
const { initializeUsb,  disconnectUsb } = require('./usb/usb');
const { setLEDOn } = require('./usb/serial-commands');

// Module to control application life.
const app = electron.app;
// https://stackoverflow.com/questions/70267992/win10-electron-error-passthrough-is-not-supported-gl-is-disabled-angle-is
//app.disableHardwareAcceleration()

// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow;

const path = require('path');
const url = require('url');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
var mainWindow;
var isDev = process.env.NODE_ENV === 'development'
console.log(process.env.NODE_ENV, "process.env.NODE_ENV")
// task tray object reference
var tray = 1;


const mouseState = {
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

function checkStartHidden() {
  let hideOnStart = false;
  process.argv.forEach(arg=>{
    console.log("arg: ", arg)
    if (arg.indexOf('hidden')>-1) {
      console.log("hiding app")
      mainWindow.setSkipTaskbar(true);
      mainWindow.hide();
      hideOnStart = true;
    }
  })
  if (!hideOnStart) {
    console.log("showing app")
    mainWindow.show();
  };
}

if (!gotTheLock) {
  app.quit()
} else {
  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.
  app.on('ready', ()=>{
    createWindow();
    registerUIEvents(mainWindow, app, isDev)
    registerMouseEvents(mainWindow, mouseState)
    /*electron.powerMonitor.on("lock-screen", () => {
    });*/
    electron.powerMonitor.on("suspend", () => {
      // Turn off the LED when sleeping
      mainWindow.webContents.send('os-suspend');
    });
    electron.powerMonitor.on("resume", () => {
      // Reconnect on wake. Sometimes the power turns off the device and we need to reconnect the USB port
      mainWindow.webContents.send('os-resume');
      disconnectUsb(app);
    });
    checkStartHidden();
  });

  // Quit when all windows are closed.
  app.on('window-all-closed', function () {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    disconnectUsb(app);
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

  // Set up the app on startup. Do not do this in dev mode or it will
  // add the dev exe path to windows start registry
  if (!isDev) {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
      scope: "user",
      enabled : true,
      args: [`"--hidden"`]
    })
  }

}

async function createWindow() {
  
  const isMac = process.platform === 'darwin';
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 720,
    height: 585,
    frame: false,
    show: false,
    icon: path.join(__dirname, '../assets/gg_icon.png'),
    /* minHeight:600,
    minWidth:700, */
    //autoHideMenuBar: true, //https://stackoverflow.com/questions/45850802/hiding-the-window-menu-when-app-is-full-screen-on-windows
    maximizable: false,
    fullscreenable: false,
    resizable: false,
    backgroundColor: '#282c34',
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? true : false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
      nodeIntegration: true,
      enableRemoteModule: true,
      contextIsolation: true,
      // Enable screen capture API
      enableBlinkFeatures: 'GetDisplayMedia',
    }
  });

  //const appIcon = new electron.Tray('./assets/gg_icon.png')
  if (isDev) {
    // Open the DevTools
    const devtools = new BrowserWindow({ width: 900, height: 500 });
    mainWindow.webContents.setDevToolsWebContents(devtools.webContents);  
    mainWindow.webContents.openDevTools({mode: 'detach'});
    // HACK to move this stupid devtools window
    mainWindow.webContents.once('did-finish-load', function () {
        var windowBounds = mainWindow.getBounds();
        devtools.setPosition(windowBounds.x + windowBounds.width, windowBounds.y);
    });

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

  initializeUsb(mainWindow, app, isDev);
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
    } else {
      // we are shutting down the app and the UI is not reliable. Just force the LED off
      setLEDOn(0);
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
