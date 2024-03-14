const { SerialPort } = require('serialport')
const { ReadlineParser } = require('@serialport/parser-readline');

// Serial Commands
const SET_MAIN_LED = '000';
const SET_AUX_LED = '001';
const SET_DEFAULT_LEDS = '002';
const SET_DEFAULT_INDEX = '003';

const GET_MAIN_LED = '128';
const GET_DEFAULT_LEDS = '129';
const GET_DEVICE_INFO = '130'

// when a button is pushed on the GG
const UPDATE_MAIN_LED = '130';
const UPDATE_DEFAULT_LEDS = '131'



// Serial result promise resolvers
//  <message ID> : {
//    resolve,
//    reject
//  }, ...
const serialMessageResults = {
  [SET_MAIN_LED]: null,
  [SET_AUX_LED]: null,
  [SET_DEFAULT_LEDS]: null,
  [GET_MAIN_LED]: null,
  [GET_DEFAULT_LEDS]: null,
  [GET_DEVICE_INFO]: null,
};


let port = null;
let parser = null;
let deviceInfo = {}

// Hack to delay sending data until the arduino is ready. When connecting
// to the serial port through the arduino's USB port, it causes a restart and 1 second delay.
// https://forum.arduino.cc/t/how-do-use-rx-and-tx-pins/948694
// let serialReady = ()=>(console.error("Promise not created"));

// Connect to the serial port of the Arduino Uno USB device
async function initializeUsb(mainWindow) {
  const ports =  await SerialPort.list();


  let path = '';
  for (let i = 0; i < ports.length; i++) {
    const vendorId = ports[i].vendorId;
    const productId = ports[i].productId;
    // hard coded to Arduino (2341) and 5400 for now
    if (productId === '5400' && vendorId === '2341') {
      path = ports[i]?.path;
      break;
    }
  }


  if (path) {
    port = new SerialPort({
      path,
      baudRate: 115200,
    })

    port.on('error', (e) => {
      console.log("port error", e)
      setTimeout(()=>{
        disconnectUsb({reconnect: false}); // TODO, I'm not convinced we need to call disconnect here? if
        // This error happens when we have port we tried to connect to that is taken and won't allow connections. 
        // Normally we would not call connectUsb followed by disconnectUsb, but because the nextPortCandidateIndex is different,
        // we need to so we can connect to the next port candidate
        connectUsb(mainWindow);
      }, 800)
      
    })

    // todo, is this \n or \r\n ?
    parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    parser.on('data', data => {
      const parts = data.split(':');
      const messageId = parts[0].padStart(3,0);
      const ggResponse = parts[1];
      console.log("Gaimglass:", data);
      
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
        const result = await getDeviceInfo();
        const [name, version] = result.split('&');
        deviceInfo.name = name.split('=')[1]
        deviceInfo.version = version.split('=')[1]
        
        if (deviceInfo.name !== 'ggpro') {
          throw new Error("Invalid device name");
        }
      } catch(err) {
        disconnectUsb();
        return;
      }
      mainWindow.webContents.send('usb-connected');
      console.log('Serial port open');
    });

    port.on("close", (options) => {
      console.log('Serial port closed');
      let mergedOptions = {
        reconnect: true,
        delay: 800,
        ...options
      }
      mainWindow.webContents.send('usb-disconnected');
      port = null;
      if (mergedOptions.reconnect) {
        setTimeout(()=>{
          connectUsb(mainWindow);
        }, mergedOptions.delay);
      }
    });
    return true
    
  } else {
    setTimeout(()=>{
      // retry after a short delay
      connectUsb(mainWindow);
    }, 800);
    return false;
    
  }
}

// Messages directly from GG that are not provoked from the console. This could be a button
// press for example
function handleUnprovokedMessages(mainWindow, messageId, ggResponse) {
  // Uninitiated messages. When a user presses a button on the device
  if ( UPDATE_MAIN_LED === messageId) {
    mainWindow.webContents.send('update-main-led-state-from-gg', ggResponse);
  }
  if ( UPDATE_DEFAULT_LEDS === messageId) {
    mainWindow.webContents.send('update-default-colors-from-gg', ggResponse);
  }
}

// Attempt to connect to the USB device
async function connectUsb(mainWindow) {
  return initializeUsb(mainWindow);
}

async function disconnectUsb(options) {
  if (port) {
    port.close(function (err) {
      port = null;
    }, options);
  }
}

/**
 * Write a command string to Gaimglass over the serial port and return a promise
 * that will contain the response from Gaimglass. The response may contain data when
 * requested or it simply may be an "okay" status when new state has been received.
 */
 function writeCommand(command, commandStr='') {

  if (!port || !port.port?.fd) {
     return Promise.reject(new Error('Port has closed'));
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
    console.log("Write Command:", command, commandStr, port.path);
    port.write(`${command}${commandStr}\n`);
  });

  return Promise.race([serialResponse, serialTimeout]);
}


// Commands

function setMainLED(color, brightness, ledOn) {
  const commandStr = 
    `${color.r}`.padStart(3, 0) + 
    `${color.g}`.padStart(3, 0) +
    `${color.b}`.padStart(3, 0) +
    `${brightness.toFixed(2)}` +
    Number(ledOn);
    return writeCommand(SET_MAIN_LED, commandStr);
}

function setDefaultIndex(index) {
  return writeCommand(SET_DEFAULT_INDEX, index.toString().padStart(2));
}


function setAuxLED(color, ledOn) {
  // todo...
  return writeCommand(SET_AUX_LED);
}

function setDefaultColors(colors) {
  const defaultColorStrs = [];
  colors.forEach((defaultColor, index) => {
    const color = defaultColor.color;
    const enabled = Number(defaultColor.enabled);
    defaultColorStrs.push(
    `${color.r}`.padStart(3, 0) + 
    `${color.g}`.padStart(3, 0) +
    `${color.b}`.padStart(3, 0) +
    `${enabled}`)
  })
  for (let i = defaultColorStrs.length; i < 8; i++) {
    // send disabled colors to fill buffer
    defaultColorStrs.push(`000`+`000`+`000`+`0`)
  }
    const commandStr = defaultColorStrs.join(',')
  return writeCommand(SET_DEFAULT_LEDS, commandStr);
}


function getMainLED() {
  return writeCommand(GET_MAIN_LED);
}

function getDeviceInfo() {
  return writeCommand(GET_DEVICE_INFO);
}

function getDefaultLEDs() {
  return writeCommand(GET_DEFAULT_LEDS);
}


module.exports = {
  connectUsb,

  disconnectUsb,
  initializeUsb,

  // commands
  getMainLED,
  getDefaultLEDs,

  setMainLED,
  setDefaultColors,
  setAuxLED,
  setDefaultIndex,

  // debug helper
  //setComPort,
}
