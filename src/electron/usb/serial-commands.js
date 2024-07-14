const {writeCommand} = require('./usb');
const {SERIAL_COMMANDS} = require('./serial-codes');


// Serial Commands
/*
const SET_MAIN_LED = '000';
const SET_AUX_LED = '001';
const SET_DEFAULT_LEDS = '002';
const SET_DEFAULT_INDEX = '003';

const GET_MAIN_LED = '128';
const GET_DEFAULT_LEDS = '129';
const GET_DEVICE_INFO = '130'

// when a button is pushed on the GG
const UPDATE_MAIN_LED = '130';
const UPDATE_DEFAULT_LEDS = '131'*/



// Commands

function setMainLED(color, brightness, ledOn) {
  const commandStr = 
    `${color.r}`.padStart(3, 0) + 
    `${color.g}`.padStart(3, 0) +
    `${color.b}`.padStart(3, 0) +
    `${brightness.toFixed(2)}` +
    Number(ledOn);
    return writeCommand(SERIAL_COMMANDS.SET_MAIN_LED, commandStr);
}

function setDefaultIndex(index) {
  return writeCommand(SERIAL_COMMANDS.SET_DEFAULT_INDEX, index.toString().padStart(2));
}


function setAuxLED(color, ledOn) {
  // todo...
  return writeCommand(SERIAL_COMMANDS.SET_AUX_LED);
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
  return writeCommand(SERIAL_COMMANDS.SET_DEFAULT_LEDS, commandStr);
}


function getMainLED() {
  return writeCommand(SERIAL_COMMANDS.GET_MAIN_LED);
}


function getDefaultLEDs() {
  return writeCommand(SERIAL_COMMANDS.GET_DEFAULT_LEDS);
}

module.exports = {

  // commands
  getMainLED,
  getDefaultLEDs,
  setMainLED,
  setDefaultColors,
  setAuxLED,
  setDefaultIndex,
}