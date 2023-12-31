const electron = require('electron');
const Store = require('electron-store');


let mouseEvents = {
  on: ()=>{} // stub
}

try {
  const globalMouseEvents = require("global-mouse-events");
  mouseEvents = globalMouseEvents;
} catch (e) {
  // Mac
}


const { connectUsb, setColor, setLEDOn, getMainLED, getDefaultLEDs, setMainLED, setDefaultColors, setDefaultIndex, disconnectUsb, resume, serialDisconnected } = require('./usb');
const { registerKeyboardShortcuts } = require('./shortcuts');

// Module to control application life.
const app = electron.app;
// https://stackoverflow.com/questions/70267992/win10-electron-error-passthrough-is-not-supported-gl-is-disabled-angle-is
app.disableHardwareAcceleration()

// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow;

const path = require('path');
const url = require('url');

// use electron store for persistent data after app closes
const store = new Store();

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
var mainWindow;
var tray;


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
    registerKeyboardShortcuts(mainWindow);
    /*electron.powerMonitor.on("lock-screen", () => {
    });*/
    electron.powerMonitor.on("suspend", () => {
      // Turn off the LED when sleeping
      mainWindow.webContents.send('deactivate-led');
      /*setTimeout(()=>{
        disconnectUsb({
          reconnect: false
        });
      }, 50)*/
    });
    electron.powerMonitor.on("resume", () => {
      // Always force a disconnect on wake. Sometimes (but not always) we see that the USB connection is broken
      // but the port is still open. This happens when the PC sleeps and the GG cycles and goes
      // full bright for a few seconds before turning off. I don't know how to prevent this behavior
      
      disconnectUsb({
        delay: 0,
        reconnect: true // this will force a reconnection
      });
      // connectUsb(mainWindow); // use connectUsb if we have previously disconnected on suspect
      // Doing so will will prevent the GG from waking the PC if a button is pushed and the device did not cycle.
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
    console.log("11")
    if (mainWindow === null) {
      createWindow()
    }
  });

  app.on('second-instance', (event, commandLine, workingDirectory, additionalData) => {
    // Someone tried to run a second instance, we should focus our window.
    console.log("22")
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
    width: 1400,
    width: 720,
    height: 500,
    frame: false,
    icon: path.join(__dirname, '../assets/gg_icon.png'),
    /* minHeight:600,
    minWidth:700, */
    maximizable: false, // BUG: F11 still works for some reason
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
    mainWindow.webContents.openDevTools();
  }

  
  // TODO remove the await and allow the UI to load before port is ready, this is buggy at present.
  // UI also needs to load if USB is unplugged
  connectUsb(mainWindow);

  mouseEvents.on("mouseup", event => {
    if (event.button === 2) {
      if (mouseState.down) {
        mainWindow.webContents.send('update-mouse-up', event);
        mouseState.down = false;
      }
    }
  });
  
  mouseEvents.on("mousedown", event => {
    //console.log(event); // { x: 2962, y: 483, button: 1 }
    if (event.button === 2) {
      if (!mouseState.down) {
        mainWindow.webContents.send('update-mouse-down', event);
        mouseState.down = true;
      }
    }
  });
  
  
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
    // Dereference the window object, usually you would store windows
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


//
// Synchronous events from UI
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
