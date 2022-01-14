const SerialPort = require('serialport')
const Readline = require('@serialport/parser-readline');

// Serial Commands
const SET_MAIN_LED_COLOR = "0";
const GET_MAIN_LED_COLOR = "1";

const SET_MAIN_LED_MUTE = "2";
const GET_MAIN_LED_MUTE = "3";

const SET_GAME_LINK_LED = "4";
const GET_GAME_LINK_LED = "5";

let port = null;
let parser = null;

// Connect to the serial port of the Arduino Uno USB device
async function initializeUsb() {
  const ports = await SerialPort.list();
  let path = '';

  ports.forEach(portCandidate => {
    // Arduino Uno
    if (portCandidate.vendorId === "10C4" && portCandidate.productId === "EA60") {
      path = portCandidate.path;
    }
  })

  if (path) {
    port = new SerialPort(path, { baudRate: 115200 });
    parser = port.pipe(new Readline({ delimiter: '\n' }));

    // Read the port data
    port.on("open", () => {
      console.log('serial port open');
    });

    port.on("close", () => {
      console.log('serial port closed');
      connectUsb();
    });

    parser.on('data', data => {
      console.log('got word from arduino:', data);
    });
    return true;
  } else {
    console.log('Arduino USB port not found');
    return false;
  }
}

// Attempt to connect to the USB device and if not successful, retry every 1500ms.
function connectUsb() {
  console.log("connectUsb");
  const intervalID  = setInterval(async () => {
    console.log("setInterval");
    const isConnected = await initializeUsb();
    console.log({isConnected});
    if (isConnected) {
      clearInterval(intervalID);
    }
  }, 1500) 
}

function setColor(red, green, blue) {
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
    const rExponent = 2;
    const gExponent = 2;
    const bExponent = 2.6;
    const rScale = 255/(Math.pow(255, rExponent)/255);
    const gScale = 255/(Math.pow(255, gExponent)/255);
    const bScale = 255/(Math.pow(255, bExponent)/255);
    
    red = Math.round(Math.pow(red,rExponent)/255 * rScale);
    green = Math.round(Math.pow(green,gExponent)/255 * gScale);
    blue = Math.round(Math.pow(blue,bExponent)/255 * bScale);

    const sRed = `${red}`.padStart(3, 0)
    const sGreen = `${green}`.padStart(3, 0)
    const sBlue = `${blue}`.padStart(3, 0)
    console.log(`${SET_MAIN_LED_COLOR}${sRed}${sGreen}${sBlue}\n`);
    port.write(`${SET_MAIN_LED_COLOR}${sRed}${sGreen}${sBlue}\n`);
  }
  else {
    throw new Error("USB port not initialized");
  }
}

function getColor(red, blue, green) {
  // TODO...
  return {
    r:0,
    g:0,
    b:0,
  }
}

function setMute(mute) {

}

function getMute() {
  return false;
}

module.exports = {
  connectUsb,
  initializeUsb,
  setColor
}
