const { SerialPort } = require('serialport')
const { ReadlineParser } = require('@serialport/parser-readline');
const { SERIAL_COMMANDS } = require('./serial-codes');
const { BrowserWindow } = require('electron');

// Serial result promise resolvers
//  <message ID> : {
//    resolve,
//    reject
//  }, ...
const serialMessageResults = {
  [SERIAL_COMMANDS.SET_MAIN_LED]: null,
  [SERIAL_COMMANDS.SET_AUX_LED]: null,
  [SERIAL_COMMANDS.SET_DEFAULT_LEDS]: null,
  [SERIAL_COMMANDS.GET_MAIN_LED]: null,
  [SERIAL_COMMANDS.GET_DEFAULT_LEDS]: null,
  [SERIAL_COMMANDS.GET_DEVICE_INFO]: null,
};

//let electronApp;
let port = null;
let parser = null;
let deviceInfo = {}
let isDev = false;
let intervalId = null;
let isConnecting = false;
let mainWindowRef = null;


// Connect to the serial port of the Arduino Uno USB device
async function connectUsb(mainWindow, _isDev, app) {
  isDev = _isDev;
  mainWindowRef = mainWindow;
  if (isConnecting || port?.isOpen || port?.closing) {
    return;
  }
  isConnecting = true;
  
  try {
  const ports =  await SerialPort.list();
  let path = '';
  for (let i = 0; i < ports.length; i++) {
    const vendorId = ports[i].vendorId;
    const productId = ports[i].productId;
    // TODO: register a real vendor id with usb.org
    // hard coded to Arduino (2341) and 5400 for now
    if (productId === '5400' && vendorId === '2341') {
      //console.log({productId, vendorId})
      path = ports[i]?.path;
      break;
    }
  }
  if (path) {
    if (port?.isOpen) {
      console.error("port already connected", port)
      isConnecting = false;
      return;
    }
    port = new SerialPort({
      path,
      baudRate: 115200,
    })
    

    port.on('error', (e) => {
      console.log("[port error]", e.message)
      isConnecting = false;
      disconnectUsb(app);
    })

    // todo, is this \n or \r\n ?
    parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    parser.on('data', data => {

      const parts = data.split(':');
      const messageId = parts[0].padStart(3,0);
      const ggResponse = parts[1];
      
      if (isDev) {
        console.log("Gaimglass response:", {data});
      }
      
      if (serialMessageResults[messageId]) {
        serialMessageResults[messageId].resolve(ggResponse);
        serialMessageResults[messageId] = null; // ensure its only called once.
      } else {
        // Uninitiated messages. When a user presses a button on the device
        handleUnprovokedMessages(mainWindow, messageId, ggResponse);
      }
    });

    // Read the port data
    port.on("open", async () => {
      try {
        if (!port.isOpen) {
          throw new Error('Port did not open correctly')
        }
        const result = await getDeviceInfo();
        const [name, version] = result.split('&');
        deviceInfo.name = name.split('=')[1]
        deviceInfo.version = version.split('=')[1]

        if (deviceInfo.name !== 'ggpro') {
          throw new Error(`Invalid device name, expected "ggpro" and found ${deviceInfo.name}`);
        }
        // Connection successful, release lock
        isConnecting = false;
      } catch(err) {
        console.log("on port open error", err)
        isConnecting = false;
        disconnectUsb(app);
        return;
      }
      // send previous state to GG if there was any
      mainWindow.webContents.send('usb-connected');
    });

    port.on("close", (error) => {
      if (error) {
        console.log('Serial port closed with error:', error.message);
      } else {
        console.log('Serial port closed successfully');
      }
      mainWindow.webContents.send('usb-disconnected');
    });
    return true
  } else {
    // No device found, release lock
    isConnecting = false;
  }
  } catch(error) {
    console.error("connectUsb error:", error);
    isConnecting = false;
    throw error;
  }
}

// Special initialize command that we need local to this file, moving to serial-commands.js would cause a 
// circular import issue
function getDeviceInfo() {
  return writeCommand(SERIAL_COMMANDS.GET_DEVICE_INFO);
}

// Messages directly from GG that are not provoked from the console. This could be a button
// press for example
function handleUnprovokedMessages(mainWindow, messageId, ggResponse) {
  // Uninitiated messages. When a user presses a button on the device
  // Broadcast to all windows, not just main window
  const allWindows = BrowserWindow.getAllWindows();
  
  if ( SERIAL_COMMANDS.UPDATE_MAIN_LED === messageId) {
    allWindows.forEach(win => {
      win.webContents.send('update-main-led-state-from-gg', ggResponse);
    });
  }
  if ( SERIAL_COMMANDS.UPDATE_DEFAULT_LEDS === messageId) {
    allWindows.forEach(win => {
      win.webContents.send('update-default-colors-from-gg', ggResponse);
    }); 
  }
}

// Attempt to connect to the USB device
async function initializeUsb(mainWindow, app, isDev) {
  //electronApp = app;
  // set up connection loop.
  startConnectThink(mainWindow, app, isDev)
}

async function startConnectThink(mainWindow, app, isDev) {
  if (intervalId) {
    clearInterval(intervalId)
    console.warn("startConnectThink called twice")

  }
  intervalId = setInterval(()=>{
    // check the connection evyarnery 800ms and reconnect if needed
    connectUsb(mainWindow, isDev, app);
  }, 800);
}

async function disconnectUsb(electronApp) {
  // Stop reconnection attempts during cleanup
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  
  if (port) {
    // Remove all listeners to prevent memory leaks
    port.removeAllListeners();
    if (parser) {
      parser.removeAllListeners();
      parser = null;
    }
    
    return new Promise((resolve) => {
      const cleanup = () => {
        port = null;
        isConnecting = false;
        // Restart reconnection loop
        if (mainWindowRef && electronApp) {
          startConnectThink(mainWindowRef, electronApp, isDev);
        }
        resolve();
      };
      
      if (port.isOpen) {
        port.close((error) => {
          if (error) {
            console.error("Error closing port:", error);
          }
          cleanup();
        });
      } else {
        console.log(`disconnectUsb: port exists but not open (isOpen=${port.isOpen})`);
        // Force destroy the port object
        try {
          port.destroy();
        } catch (e) {
          console.error("Error destroying port:", e);
        }
        cleanup();
      }
    });
  }
}


/**
 * Write a command string to Gaimglass over the serial port and return a promise
 * that will contain the response from Gaimglass. The response may contain data when
 * requested or it simply may be an "okay" status when new state has been received.
 */
async function writeCommand(command, commandStr='') {
  if (!port || !port.isOpen || port.destroyed) {
    // Silent fail - UI will retry on usb-connected event
    return Promise.reject(new Error('Port not available'));
  }

  const serialTimeout = new Promise((_, reject) => {
    setTimeout(()=>{
      // Do not change this message unless also changing getMessageResult() in App.js in react
      reject(new Error('Serial port timed out'));
    } ,150)
  });

  const serialResponse = new Promise((resolve, reject)=>{
    serialMessageResults[command] = {
      resolve,
      reject
    }
    if (isDev) {
      console.log("Write Command:", command, commandStr, port.path);
    }
    port.write(`${command}${commandStr}\n`);
  });

  return Promise.race([serialResponse, serialTimeout]);
}


module.exports = {
  initializeUsb,
  writeCommand,
  disconnectUsb,
}
