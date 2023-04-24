const electron = require('electron');
const usb = require('usb');
const Store = require('electron-store');

const { connectUsb, setColor, waitForSerial, setLEDOn, getMainLED, getDefaultLEDs, setMainLED, disconnectUsb, serialDisconnected } = require('./usb');

// Module to control application life.
const app = electron.app;

// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow;

const path = require('path');
const url = require('url');

// use electron store for persistent data after app closes
const store = new Store();

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;
let ggConnected = false;

async function createWindow() {
  const isMac = process.platform === 'darwin';
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1100,
    frame: false,
    minHeight:600,
    minWidth:400,
    backgroundColor: '#282c34',
    titleBarStyle: 'hidden',
    titleBarOverlay: true,
    webPreferences: {
      nodeIntegration: true,
      enableRemoteModule: true,
      contextIsolation: false,
    }
  });

  connectUsb();

    // and load the index.html of the app.
  const startUrl = process.env.ELECTRON_START_URL || url.format({
      pathname: path.join(__dirname, '../../build/index.html'),
      protocol: 'file:',
      slashes: true
  });
  console.log("startUrl:", startUrl);
  mainWindow.loadURL(startUrl);

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  console.log("on window-all-close");
  disconnectUsb();
  if (process.platform !== 'darwin') { 
    app.quit()
  }
});

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  console.log("on activate");
  if (mainWindow === null) {
     createWindow()
  }
});


//
// Synchronous
//

electron.ipcMain.on('get-led-state', async (event) => {
  try {
    const result = await getMainLED();
    console.log("okay result", result);
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

electron.ipcMain.on('get-default-colors', async (event, color) => {
  try {
    const ledStateStr = await getDefaultLEDs();
    event.returnValue = ledStateStr;
  } catch(err) {
    event.returnValue = err;
  }
});

electron.ipcMain.on('set-default-color', async (event, color) => {
  //setColor(color.red, color.green, color.blue, true);
  //event.returnValue = 'okay';
});

electron.ipcMain.on('get-gg-state', async (event) => {
  try {
    const ledStateStr = ''//await getMainLED();
    const defaultColors = ''//await getDefaultLEDs();
    event.returnValue = `${ledStateStr}&${defaultColors}`;
    //getDefaultLEDs()
    //event.returnValue = await getStatus();
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
  mainWindow.restore();
  event.returnValue = 'okay';
});

electron.ipcMain.on('window-minimize', async (event) => {
  mainWindow.minimize();
  event.returnValue = 'okay';
});

electron.ipcMain.on('window-close', async (event) => {
  mainWindow.close();
  event.returnValue = 'okay';
});


// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.