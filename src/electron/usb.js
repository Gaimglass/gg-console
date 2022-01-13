const { getRoles } = require("@testing-library/react");

// Serial Commands
const SET_MAIN_LED_COLOR = "0";
const GET_MAIN_LED_COLOR = "1";

const SET_MAIN_LED_MUTE = "2";
const GET_MAIN_LED_MUTE = "3";

const SET_GAME_LINK_LED = "4";
const GET_GAME_LINK_LED = "5";

let port = null;
let parser = null;

async function initializeUsb() {
  const ports = await SerialPort.list();
  let path = '';

  ports.forEach(_port => {
    // Arduino Uno
    _port.vendorId === "10C4" && _port.productId === "EA60"
    path = port.path;
  })

  port = new SerialPort(path, { baudRate: 115200 });
  parser = port.pipe(new Readline({ delimiter: '\n' }));

  // Read the port data
  port.on("open", () => {
    console.log('serial port open');
  });

  parser.on('data', data => {
    console.log('got word from arduino:', data);
  });
  
  // setInterval(()=>{
  //     if(red == 255) {
  //         dir = -1;
  //     }
  //     if(red == 0) {
  //         dir = 1;
  //     }
  //     red = red + dir;
  //     const sRed = `${red}`.padStart(3, 0)
  //     //port.write(`000000${sRed}\n`);
  //     port.write(`170081001\n`);
  // },1000)
  

  // const port = new SerialPort('/dev/ttyACM0', { baudRate: 9600 });
  // const parser = port.pipe(new Readline({ delimiter: '\n' }));
  // // Read the port data
  // port.on("open", () => {
  // console.log('serial port open');
  // });
  // parser.on('data', data =>{
  // console.log('got word from arduino:', data);
}



function setColor(red, blue, green) {
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
    const sRed = `${red}`.padStart(3, 0)
    const sGreen = `${green}`.padStart(3, 0)
    const sBlue = `${blue}`.padStart(3, 0)
    port.write(`${SET_MAIN_LED_COLOR}${red}${green}${blue}\n`);
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
  initializeUsb,
  setColor
}
