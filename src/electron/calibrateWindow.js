const electron = require('electron');
const path = require('path');
const BrowserWindow = electron.BrowserWindow;

const url = require('url');
var calibrateWindow = null;

function toggleCalibrateWindow() {
  if (calibrateWindow) {
    closeCalibrateWindow();
    return;
  }
  try {
    calibrateWindow = new BrowserWindow({
      //frame: false,
      show: false,
      fullscreenable: true,
      autoHideMenuBar: true,
      //maximizable: false,
      resizable: false,
      backgroundColor: 'black',
      webPreferences: {
        backgroundThrottling: false,
        nodeIntegration: true,
        enableRemoteModule: true,
        contextIsolation: false,
      }
    });

    calibrateWindow.once('ready-to-show', () => {
      calibrateWindow.show()
    })

    calibrateWindow.on('closed', function () { 
      // De-reference the window object, usually you would store windows
      // in an array if your app supports multi windows, this is the time
      // when you should delete the corresponding element
      calibrateWindow = null
    })
    
    
    //calibrateWindow.webContents.openDevTools({mode: 'detach'});
    

    const startUrl = process.env.ELECTRON_START_URL || url.format({
      pathname: path.join(__dirname, '../../build/index.html'),
      protocol: 'file:',
      slashes: true
    });
    const urlObject  = new URL(startUrl);
    urlObject.search = new URLSearchParams({app: "calibrate"}); // let the UI know to render the calibrate page
    calibrateWindow.loadURL(urlObject.toString());
    calibrateWindow.maximize();
    calibrateWindow.setFullScreen(true)
    return "ok";
  } catch(err) {
    console.error(err);
    return {
      error: err.message
    };
  }
}

function closeCalibrateWindow() {
  if (calibrateWindow) {
   calibrateWindow.close();
  }
}

module.exports = {
  toggleCalibrateWindow,
  closeCalibrateWindow
}


