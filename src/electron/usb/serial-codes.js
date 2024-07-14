const SERIAL_COMMANDS = {
  SET_MAIN_LED: '000',
  SET_AUX_LED: '001',
  SET_DEFAULT_LEDS: '002',
  SET_DEFAULT_INDEX: '003',
  
  GET_MAIN_LED: '128',
  GET_DEFAULT_LEDS: '129',
  GET_DEVICE_INFO: '130',
  
  // when a button is pushed on the GG
  UPDATE_MAIN_LED: '130',
  UPDATE_DEFAULT_LEDS: '131',
}

const foo = "test"

module.exports = {
  SERIAL_COMMANDS
}