const {writeCommand} = require('./usb');
const {SERIAL_COMMANDS} = require('./serial-codes');


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

function setAlpha(ambientValue, exponent) {

  const commandStr = `${ambientValue.toFixed(2)}${exponent.toFixed(1)}` // e.g. "0.851.6" = 85% ambient, exponent 1.6
  return writeCommand(SERIAL_COMMANDS.SET_AMBIENT, commandStr);
}

function setDefaultIndex(index) {
  return writeCommand(SERIAL_COMMANDS.SET_DEFAULT_INDEX, index.toString().padStart(2));
}

function setLEDOn(on) {
  console.log("+" + on.toString().padStart(2).substring(0,3) + "+");
  return writeCommand(SERIAL_COMMANDS.SET_LED_ON, on.toString().padStart(2));
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
  return writeCommand(SERIAL_COMMANDS.SET_DEFAULT_LEDS, commandStr);
}

function getMainLED() {
  return writeCommand(SERIAL_COMMANDS.GET_MAIN_LED);
}

function getDefaultLEDs() {
  return writeCommand(SERIAL_COMMANDS.GET_DEFAULT_LEDS);
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