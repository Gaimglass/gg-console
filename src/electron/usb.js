const { SerialPort } = require('serialport')
const { ReadlineParser } = require('@serialport/parser-readline');

// Serial Commands
const SET_MAIN_LED = '000';
const SET_AUX_LED = '001';
const SET_DEFAULT_LEDS = '002';

const GET_MAIN_LED = '128';
const GET_DEFAULT_LEDS = '129';


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
  [GET_DEFAULT_LEDS]: null
};


let port = null;
let parser = null;

// Hack to delay sending data until the arduino is ready. When connecting
// to the serial port through the arduino's USB port, it causes a restart and 1 second delay.
// https://forum.arduino.cc/t/how-do-use-rx-and-tx-pins/948694
let serialReady = ()=>(console.error("Promise not created"));


// Connect to the serial port of the Arduino Uno USB device
async function initializeUsb() {
  const ports =  await SerialPort.list();
  let path = '';

  ports.forEach((portCandidate, index) => {
     // console.log(portCandidate);
    // Mac and Windows have difference casing, because of course they do, sigh.
    const productId = portCandidate.productId?.toLowerCase();
    const vendorId = portCandidate.vendorId?.toLowerCase();
    if (
      // Arduino Metro Uno
      (vendorId === "10c4" && productId === "ea60") ||
      // Arduino Leonardo
      (vendorId === "2341" && productId === "8036")) {
    // Aux Serial USB, TX, RX (only), this won't force reset when connecting
    //if (portCandidate.vendorId === "10C4" && portCandidate.productId === "EA60" && portCandidate.serialNumber === "0001") {
      path = portCandidate.path;
    }
  })

  if (path) {
    
    port = new SerialPort({
      path,
      baudRate: 115200,
    })

    // todo, is this \n or \r\n ?
    parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    parser.on('data', data => {
      const parts = data.split(':');
      const messageId = parts[0].padStart(3,0);
      const ggResponse = parts[1];
      //console.log({ggResponse});
      console.log("Gaimglass:", data);
      
      if (serialMessageResults[messageId]) {
        serialMessageResults[messageId].resolve(ggResponse);
        serialMessageResults[messageId] = null; // ensure its only called once.
      }
    });

    // Read the port data
    port.on("open", () => {
      // Leonardo won't send a data event if the app reconnects but the Leonard has not restarted.
      // just resolve the serialReady().
      // TODO: is this okay to leave here, rather than inside on `data`? Figure out a better, best practice way to do this
      serialReady(); // resolve the promise
      console.log('Serial port open');
    });

    port.on("close", (options) => {
      console.log('Serial port closed');
      port = null;
      if (options.reconnect !== false) {
        // if the port was not closed by the gg app, then attempt to reconnect
        connectUsb(); 
      }
    });

    return true;
    
  } else {
    console.log('Arduino USB port not found');
    return false;
  }
}


// Hack to delay the arduino until setup() is finished after connecting
// the serial port
function waitForSerial() {
  return new Promise((resolve, reject)=>{
    console.log("serialReady = resolve");
    serialReady = resolve;
  });
}

// Attempt to connect to the USB device and if not successful, retry every 1500ms.
function connectUsb() {
  return new Promise((resolve, reject)=>{
    console.log("connectUsb");
    const intervalID  = setInterval(async () => {
      console.log("setInterval");
      const isConnected = await initializeUsb();
      console.log({isConnected});
      if (isConnected) {
        console.log("clear Interval");
        clearInterval(intervalID);      
        resolve();
      }
    }, 1500) 
  })
}

function disconnectUsb() {
  if (port) {
    port.close(function (err) {
      port = null;
    }, {reconnect: false});
  }
}


/**
 * @deprecated
 */
function _setColor(red, green, blue, makeDefault=false) {
  if (port) {
    if (red < 0) {
      red = 0;
    } else if(red > 255) {
      red = 255;
    }
    if (blue < 0) {
      blue = 0;
    } else if(blue > 255) {
      blue = 255;
    }
    if (green < 0) {
      green = 0;
    } else if(green > 255) {
      green = 255;
    }

    // scale values, use non-linear mapping to simulate more realistic c olor dim levels

    // a higher value means more accurate dim colors, but not as bright
    const rExponent = 2.4;
    const gExponent = 2;
    const bExponent = 2.6;
    /*const rExponent = 1;
    const gExponent = 1;
    const bExponent = 1;*/
    
    const rScale = 255/(Math.pow(255, rExponent)/255);
    const gScale = 255/(Math.pow(255, gExponent)/255);
    const bScale = 255/(Math.pow(255, bExponent)/255);
    
    red = Math.round(Math.pow(red,rExponent)/255 * rScale);
    green = Math.round(Math.pow(green,gExponent)/255 * gScale);
    blue = Math.round(Math.pow(blue,bExponent)/255 * bScale);

   let command;
   if (makeDefault) {
     command = String.fromCharCode(WRITE_DEFAULT_LED_COLOR);
   } else {
     console.log("SET_MAIN_LED_COLOR");
     command = String.fromCharCode(SET_MAIN_LED_COLOR);
   }

    const sRed = `${red}`.padStart(3, 0)
    const sGreen = `${green}`.padStart(3, 0)
    const sBlue = `${blue}`.padStart(3, 0)
    
    console.log(`${command}${sRed}${sGreen}${sBlue}\n`);
    try {
      port.write(`${command}${sRed}${sGreen}${sBlue}\n`);
    }catch(e) {
      console.log("e",e);
    }
  }
  else {
    throw new Error("USB port not initialized");
  }
}


/**
 * Write a command string to Gaimglass over the serial port and return a promise
 * that will contain the response from Gaimglass. The response may contain data when
 * requested or it simply may be an "okay" status when new state has been received.
 */
 function writeCommand(command, commandStr='') {

  if (!port || !port.port.fd) {
     return Promise.reject(new Error('Port has closed'));
  }

  const serialTimeout = new Promise((_, reject) => {
    setTimeout(()=>{
      reject(new Error('Serial port timed out'));
    } ,150)
  });

  const serialResponse = new Promise((resolve, reject)=>{
    serialMessageResults[command] = {
      resolve,
      reject
    }
    console.log(">>>write command", command, commandStr);
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
    `${brightness}`.padStart(4, 0) +
    Number(ledOn);

    return writeCommand(SET_MAIN_LED, commandStr);
}

function setAuxLED(color, ledOn) {
  // todo...
  return writeCommand(SET_AUX_LED);
}

function setDefaultLEDs() {
  // todo...
  return writeCommand(SET_DEFAULT_LEDS);
}

function getMainLED() {
  return writeCommand(GET_MAIN_LED);
}

function getDefaultLEDs() {
  return writeCommand(GET_DEFAULT_LEDS);
}

module.exports = {
  waitForSerial,
  connectUsb,

  disconnectUsb,
  initializeUsb,

  // commands
  getMainLED,
  getDefaultLEDs,

  setMainLED,
  setDefaultLEDs,
  setAuxLED,
}
