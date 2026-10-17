const { SERIAL_COMMANDS } = require('../usb/serial-codes');
const { isCommandAcknowledged } = require('../usb/serial-response');

function usableState(state) {
  return state && typeof state.on === 'boolean' && Number.isFinite(state.brightness) &&
    ['r', 'g', 'b'].every(channel => Number.isFinite(state.color?.[channel]));
}

// Device actions stay on Electron's main process, independently of renderer scheduling.
function createShortcutControls({ getState, readState, writeState, writeIndex, showFeedback, broadcast, isQuitting = () => false, logger = console }) {
  let pending = [];
  let running;

  async function drain() {
    while (pending.length && !isQuitting()) {
      let batch;
      try {
        let snapshot = getState();
        if (!usableState(snapshot) || (pending.some(action => /^s[1-8]$/.test(action.command)) && !snapshot.defaultColors)) {
          await readState('shortcut-state');
          snapshot = getState();
        }
        batch = pending.splice(0);
        if (!usableState(snapshot)) throw new Error('Device state is unavailable');
        const state = { ...snapshot, color: { ...snapshot.color } };
        let notification;
        for (const action of batch) {
          if (action.connectionId !== undefined && action.connectionId !== snapshot.connectionId) continue;
          if (action.command === 'led') {
            state.on = !state.on;
            notification = { type: 'power', on: state.on };
          } else if (!state.on) {
            continue;
          } else if (action.command === 'brightness+' || action.command === 'brightness-') {
            const delta = action.command === 'brightness+' ? 0.05 : -0.05;
            state.brightness = Math.max(0.075, Math.min(1, Number((state.brightness + delta).toFixed(3))));
            notification = { type: 'brightness', value: state.brightness };
          } else if (/^s[1-8]$/.test(action.command)) {
            const index = Number(action.command[1]) - 1;
            const selected = snapshot.defaultColors?.[index];
            if (!selected?.enabled || !selected.color) {
              continue;
            }
            state.index = index;
            state.color = { ...selected.color };
            notification = { type: 'color-slot', slot: index + 1, color: state.color };
          } else continue;
        }
        if (!notification) continue;
        const result = await writeState(state);
        if (!isCommandAcknowledged(SERIAL_COMMANDS.SET_MAIN_LED, '', result)) throw new Error(`Device rejected LED state: ${result}`);
        if (getState()?.connectionId !== snapshot.connectionId) throw new Error('Connection changed during shortcut');
        if (Number.isInteger(state.index) && state.index !== getState().index) {
          const result = await writeIndex(state.index);
          if (!isCommandAcknowledged(SERIAL_COMMANDS.SET_DEFAULT_INDEX, state.index, result)) throw new Error(`Device rejected color index: ${result}`);
          if (getState()?.connectionId !== snapshot.connectionId) throw new Error('Connection changed during shortcut');
        }
        const confirmed = getState();
        broadcast(confirmed);
        showFeedback(notification);
      } catch (error) {
        if (!batch) pending = [];
        logger.warn('[Shortcuts] device action failed:', error.message);
      }
    }
    pending = [];
  }

  return {
    run(command) {
      if (isQuitting()) return Promise.resolve();
      pending.push({ command, connectionId: getState()?.connectionId });
      return schedule();
    },
  };

  function schedule() {
    running ||= Promise.resolve().then(drain).finally(() => {
      running = null;
      if (pending.length) return schedule();
    });
    return running;
  }
}

function formatControlState(state) {
  const { r, g, b } = state.color;
  return `color=${r},${g},${b}&brightness=${state.brightness}&ledOn=${Number(state.on)}${Number.isInteger(state.index) ? `&index=${state.index}` : ''}`;
}

let controls;
function runDeviceShortcut(command) {
  if (!controls) {
    const { BrowserWindow, app } = require('electron');
    const { getDeviceControlState, readDeviceState } = require('../usb/usb');
    const { setMainLED, setDefaultIndex } = require('../usb/serial-commands');
    const { showActionOverlay } = require('../overlay');
    controls = createShortcutControls({
      getState: getDeviceControlState,
      readState: readDeviceState,
      writeState: state => setMainLED(state.color, state.brightness, state.on),
      writeIndex: setDefaultIndex,
      showFeedback: showActionOverlay,
      broadcast: state => {
        const message = formatControlState(state);
        for (const window of BrowserWindow.getAllWindows()) {
          if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('update-main-led-state-from-gg', message);
        }
      },
      isQuitting: () => app.isQuitting,
      logger: require('electron-log/main'),
    });
  }
  return controls.run(command);
}

module.exports = { createShortcutControls, runDeviceShortcut, formatControlState };
