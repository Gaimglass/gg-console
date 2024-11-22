const { SerialPort } = require('serialport')
const { ReadlineParser } = require('@serialport/parser-readline');
const { SERIAL_COMMANDS } = require('./serial-codes');

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

let port = null;
let parser = null;
let deviceInfo = {}

// Hack to delay sending data until the arduino is ready. When connecting
// to the serial port through the arduino's USB port, it causes a restart and 1 second delay.
// https://forum.arduino.cc/t/how-do-use-rx-and-tx-pins/948694
// let serialReady = ()=>(console.error("Promise not created"));

// Connect to the serial port of the Arduino Uno USB device
async function initializeUsb(mainWindow) {
  if (port) {
    // do not try to connect twice to an open port, this will cause an Access defined error
    disconnectUsb(); // this function reconnects automatically
    return;
  }
  const ports =  await SerialPort.list();
  let path = '';
  for (let i = 0; i < ports.length; i++) {
    const vendorId = ports[i].vendorId;
    const productId = ports[i].productId;
    // hard coded to Arduino (2341) and 5400 for now
    
    // TODO do not consider the productID for now so we can connect to any arduino. Note this will always connect to the
    // first one found so you must only connect one at a time.
    if (productId === '5400' && vendorId === '2341') {
      //console.log({productId, vendorId})
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
      console.log("port error")
      console.log(e.message)
      setTimeout(()=>{
        //disconnectUsb({reconnect: false}); // TODO, I'm not convinced we need to call disconnect here? if
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
      //console.log("Gaimglass:", data);
      
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
        console.error(err)
        disconnectUsb();
        return;
      }
      // send previous state to GG if there was any
      mainWindow.webContents.send('usb-connected');
      console.log('Seral port open');
    });

    port.on("close", (options) => {
      console.log('Serial port closed');
      let mergedOptions = {
        reconnect: true,
        delay: 800,
        ...options
      }
      port = null;
      mainWindow.webContents.send('usb-disconnected');
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
      //console.log("retry")
      connectUsb(mainWindow);
    }, 800);
    return false;
    
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
  if ( SERIAL_COMMANDS.UPDATE_MAIN_LED === messageId) {
    mainWindow.webContents.send('update-main-led-state-from-gg', ggResponse);
  }
  if ( SERIAL_COMMANDS.UPDATE_DEFAULT_LEDS === messageId) {
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
    }, options);
  }
}


/**
 * Write a command string to Gaimglass over the serial port and return a promise
 * that will contain the response from Gaimglass. The response may contain data when
 * requested or it simply may be an "okay" status when new state has been received.
 */
async function writeCommand(command, commandStr='') {
  
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
    //console.log("Write Command:", command, commandStr, port.path);
    port.write(`${command}${commandStr}\n`);
  });

  return Promise.race([serialResponse, serialTimeout]);
}


module.exports = {
  connectUsb,
  writeCommand,
  disconnectUsb,
  initializeUsb,
}
