const {writeCommand} = require('./usb');
const {SERIAL_COMMANDS} = require('./serial-codes');


// Commands

// TEMPORARY: source labels distinguish Electron shortcuts from renderer writes.
// Remove these labels with the USB investigation diagnostics.
function setMainLED(color, brightness, ledOn, source = 'renderer') {
  const commandStr = 
    `${color.r}`.padStart(3, 0) + 
    `${color.g}`.padStart(3, 0) +
    `${color.b}`.padStart(3, 0) +
    `${brightness.toFixed(2)}` +
    Number(ledOn);
    return writeCommand(SERIAL_COMMANDS.SET_MAIN_LED, commandStr, source);
}

function setAlpha(ambientValue, exponent) {

  const commandStr = `${ambientValue.toFixed(2)}${exponent.toFixed(1)}` // e.g. "0.851.6" = 85% ambient, exponent 1.6
  return writeCommand(SERIAL_COMMANDS.SET_AMBIENT, commandStr, 'renderer');
}

function setDefaultIndex(index, source = 'renderer') {
  return writeCommand(SERIAL_COMMANDS.SET_DEFAULT_INDEX, index.toString().padStart(2), source);
}

function setLEDOn(on) {
  return writeCommand(SERIAL_COMMANDS.SET_LED_ON, on.toString().padStart(2), 'shutdown');
}



/*
function setAuxLED(color, ledOn) {
  // todo...
  return writeCommand(SERIAL_COMMANDS.SET_AUX_LED);
}
*/

function setDefaultColors(colors) {
  const defaultColorStrs = [];
  colors.forEach((defaultColor) => {
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
    return writeCommand(SERIAL_COMMANDS.SET_DEFAULT_LEDS, commandStr, 'renderer');
}

function getMainLED() {
  return writeCommand(SERIAL_COMMANDS.GET_MAIN_LED, '', 'renderer');
}

function getDefaultLEDs() {
  return writeCommand(SERIAL_COMMANDS.GET_DEFAULT_LEDS, '', 'renderer');
}

module.exports = {
  getMainLED,
  getDefaultLEDs,
  setMainLED,
  setAlpha,
  setLEDOn,
  setDefaultColors,
  //setAuxLED,
  setDefaultIndex,
}
