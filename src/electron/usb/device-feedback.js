const { SERIAL_COMMANDS } = require('./serial-codes');

function numberInRange(value, min, max, integer = false) {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max && (!integer || Number.isInteger(number)) ? number : undefined;
}

function parseState(payload, defaults = false) {
  const state = {};
  if (typeof payload !== 'string') return state;
  const params = new URLSearchParams(payload);
  const brightness = numberInRange(params.get('brightness'), 0, 1);
  const on = numberInRange(params.get('ledOn'), 0, 1, true);
  const index = numberInRange(params.get('index'), 0, 7, true);
  if (brightness !== undefined) state.brightness = brightness;
  if (on !== undefined) state.on = Boolean(on);
  if (index !== undefined) state.index = index;
  const color = defaults ? params.getAll('color')[index] : params.get('color');
  const channels = color?.split(',').slice(0, 3).map(channel => numberInRange(channel, 0, 255, true));
  if (channels?.length === 3 && channels.every(channel => channel !== undefined)) {
    const [r, g, b] = channels;
    state.color = { r, g, b };
  }
  return state;
}

function createDeviceFeedback() {
  let state = {};
  const remember = update => { state = { ...state, ...update }; };

  return {
    // Reads and acknowledged app writes keep the baseline current without showing feedback.
    recordResponse(command, request, response) {
      if (command === SERIAL_COMMANDS.GET_MAIN_LED) {
        remember(parseState(response));
      } else if (command === SERIAL_COMMANDS.GET_DEFAULT_LEDS) {
        const { index } = parseState(response, true);
        if (index !== undefined) remember({ index });
      } else if (response?.trim() === 'okay') {
        if (command === SERIAL_COMMANDS.SET_MAIN_LED && request.length === 14) {
          remember(parseState(`color=${request.slice(0, 3)},${request.slice(3, 6)},${request.slice(6, 9)}&brightness=${request.slice(9, 13)}&ledOn=${request.slice(13)}`));
        } else if (command === SERIAL_COMMANDS.SET_DEFAULT_INDEX) {
          remember(parseState(`index=${request.trim()}`));
        } else if (command === SERIAL_COMMANDS.SET_LED_ON) {
          remember(parseState(`ledOn=${request.trim()}`));
        }
      }
    },

    fromDevice(messageId, payload) {
      if (![SERIAL_COMMANDS.UPDATE_MAIN_LED, SERIAL_COMMANDS.UPDATE_DEFAULT_LEDS].includes(messageId)) return null;
      const previous = state;
      const next = parseState(payload, messageId === SERIAL_COMMANDS.UPDATE_DEFAULT_LEDS);
      remember(next);

      // A snapshot can change multiple fields; the most specific action wins.
      if (previous.on !== undefined && next.on !== undefined && next.on !== previous.on) {
        return { type: 'power', on: next.on };
      }
      if (previous.index !== undefined && next.index !== undefined && next.index !== previous.index) {
        return { type: 'color-slot', slot: next.index + 1, color: next.color };
      }
      if (previous.brightness !== undefined && next.brightness !== undefined && next.brightness !== previous.brightness) {
        return { type: 'brightness', value: next.brightness };
      }
      if (previous.color && next.color && state.index !== undefined &&
        ['r', 'g', 'b'].some(channel => next.color[channel] !== previous.color[channel])) {
        return { type: 'color-slot', slot: state.index + 1, color: next.color };
      }
      return null;
    },
  };
}

module.exports = { createDeviceFeedback };
