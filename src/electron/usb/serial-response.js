const { SERIAL_COMMANDS } = require('./serial-codes');

function isCommandAcknowledged(command, request, response) {
  if (typeof response !== 'string') return false;
  const value = response.trim();
  if (value === 'okay') return true;
  // SET_DEFAULT_INDEX echoes the selected zero-based slot on current firmware.
  const selected = /^okay ([0-7])$/.exec(value);
  return command === SERIAL_COMMANDS.SET_DEFAULT_INDEX && Boolean(selected) && Number(selected[1]) === Number(request);
}

module.exports = { isCommandAcknowledged };
