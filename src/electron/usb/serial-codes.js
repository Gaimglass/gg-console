//
// These need to match up with the codes on the firmware of the device.
//
const SERIAL_COMMANDS = {
  // command from the UI to the GG
  SET_MAIN_LED: '000',
  SET_AUX_LED: '001',
  SET_DEFAULT_LEDS: '002',
  SET_DEFAULT_INDEX: '003',
  
  GET_MAIN_LED: '128',
  GET_DEFAULT_LEDS: '129',
  GET_DEVICE_INFO: '130',
  
  // when a button is pushed on the GG and we need to update the UI
  UPDATE_MAIN_LED: '130',
  UPDATE_DEFAULT_LEDS: '131',
}

module.exports = {
  SERIAL_COMMANDS
}