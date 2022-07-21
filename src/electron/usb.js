const { SerialPort } = require('serialport')
const { ReadlineParser } = require('@serialport/parser-readline');
const electron = require('electron');

// Serial Commands
const SET_MAIN_LED_COLOR = 0;
const GET_MAIN_LED_COLOR = 1;

const SET_MAIN_LED_MUTE = 2;
const GET_MAIN_LED_MUTE = 3;

const SET_GAME_LINK_LED = 4;
const GET_GAME_LINK_LED = 5;

const WRITE_DEFAULT_LED_COLOR = 6;
const READ_DEFAULT_LED_COLOR = 7;

const GET_STATUS = 8;

let port = null;
let parser = null;

// Hack to delay sending data until the arduino is ready. When connecting
// to the serial port through the arduino's USB port, it causes a restart and 1 second delay.
// https://forum.arduino.cc/t/how-do-use-rx-and-tx-pins/948694
let serialReady = ()=>(console.error("Promise not created 1"));

// Serial result messages. Each message begins with a unit name followed by colon.
const serialDataResults = {
  'status': null,
  'color': null,
};

// Connect to the serial port of the Arduino Uno USB device
async function initializeUsb() {
  const ports =  await SerialPort.list();
  let path = '';

  ports.forEach((portCandidate, index) => {
      
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

    parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

    parser.on('data', data => {
      console.log("Gaimglass:", data);
      const parts = data.split(':');
      const messageName = parts[0];
      if (serialDataResults[messageName]) {
        serialDataResults[messageName].resolve(data);
        serialDataResults[messageName] = null; // ensure its only called once.
      }
    });

    // Read the port data
    port.on("open", () => {
      // Leonardo won't send a data event if the app reconnects but the Leonard has not restarted.
      // just resolve the serialReady().
      // TODO: is this okay to leave here, rather than inside on `data`? Figure out a better, best practice way to do this
      serialReady(); // resolve the promise
      console.log('serial port open');
    });

    port.on("close", () => {
      console.log('serial port closed');
      connectUsb();
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



function processSerialData(data) {
  console.log('got word from arduino:', data);
  const [command, values] = data.split(":");
  if (command === "status") {
    electron.ipcMain.sendSync("status", values);
  }
}

function setMute(value) {
  const command = String.fromCharCode(SET_MAIN_LED_MUTE);
  //console.log(`setMute: ${command}${Number(value)}`);
  port.write(`${command}${Number(value)}\n`);
}


function setColor(red, green, blue, makeDefault=false) {
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

    // scale values, use non-linear mapping to simulate more realistic color dim levels

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

function getStatus() {
  const command = String.fromCharCode(GET_STATUS);
  return writeCommand(command, 'status');
}

function getColor(red, blue, green) {
  // TODO...
  return {
    r:0,
    g:0,
    b:0,
  }
}

function writeCommand(commandStr, messageName) {
  if (serialDataResults[messageName]) {
    // A previous request has not finished or will never finish
    // ignore for now?
    console.error("duplicate promise detected")
  }
  
  const promise = new Promise((resolve, reject)=>{
    serialDataResults[messageName] = {
      resolve,
      reject
    }
    port.write(`${commandStr}\n`);
  });
  return promise;
}


module.exports = {
  waitForSerial,
  connectUsb,
  initializeUsb,
  setColor,
  setMute,
  getStatus,
}
