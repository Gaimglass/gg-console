const { SERIAL_COMMANDS } = require('./usb/serial-codes');
const { isCommandAcknowledged } = require('./usb/serial-response');

const BUTTONS = {
  0: 'XINPUT_GAMEPAD_A', 1: 'XINPUT_GAMEPAD_B', 2: 'XINPUT_GAMEPAD_X', 3: 'XINPUT_GAMEPAD_Y',
  4: 'XINPUT_GAMEPAD_LEFT_SHOULDER', 5: 'XINPUT_GAMEPAD_RIGHT_SHOULDER',
  8: 'XINPUT_GAMEPAD_BACK', 9: 'XINPUT_GAMEPAD_START',
  10: 'XINPUT_GAMEPAD_LEFT_THUMB', 11: 'XINPUT_GAMEPAD_RIGHT_THUMB',
  12: 'XINPUT_GAMEPAD_DPAD_UP', 13: 'XINPUT_GAMEPAD_DPAD_DOWN',
  14: 'XINPUT_GAMEPAD_DPAD_LEFT', 15: 'XINPUT_GAMEPAD_DPAD_RIGHT', 16: 'XINPUT_GAMEPAD_GUIDE',
};
const copyColor = color => ({ r: color.r, g: color.g, b: color.b });
const validColor = color => ['r', 'g', 'b'].every(key => Number.isFinite(color?.[key]) && color[key] >= 0 && color[key] <= 255);
const validState = state => validColor(state?.color) && typeof state.on === 'boolean' &&
  Number.isFinite(state.brightness) && state.brightness >= 0 && state.brightness <= 1;

// ADS owns its timers and device writes in main; the UI only edits settings/base state.
function createAdsControls({ getDeviceState, writeState, now = () => performance.now(),
  setTimer = setTimeout, clearTimer = clearTimeout, logger = console }) {
  let settings = { enabled: false, color: { r: 255, g: 255, b: 255 }, speed: 1 };
  const held = new Set();
  let connectionId;
  let base;
  let confirmedBase;
  let current;
  let target;
  let lastStepAt;
  let timer;
  let running;
  let background;
  let dirty = false;
  let generation = 0;
  let stateVersion = 0;
  let disposed = false;

  function cancelTimer() {
    if (timer !== undefined) clearTimer(timer);
    timer = undefined;
  }

  function reset() {
    cancelTimer();
    generation++;
    stateVersion++;
    held.clear();
    base = confirmedBase = current = target = undefined;
    connectionId = undefined;
    dirty = false;
  }

  function synchronize() {
    const state = getDeviceState();
    if (!validState(state)) {
      if (base) reset();
      return null;
    }
    if (!base || connectionId !== state.connectionId) {
      reset();
      connectionId = state.connectionId;
      base = { color: copyColor(state.color), brightness: state.brightness, on: state.on };
      confirmedBase = structuredClone(base);
      current = copyColor(base.color);
    }
    return state;
  }

  function getState() {
    const state = synchronize();
    return state ? { ...state, ...base, color: copyColor(base.color) } : null;
  }

  function retarget() {
    cancelTimer();
    target = copyColor(settings.enabled && held.size ? settings.color : base.color);
    lastStepAt = now();
    dirty = true;
  }

  function step() {
    if (!target) return;
    const time = now();
    const distance = settings.speed * 35 * Math.max(0, time - lastStepAt) / 1000;
    lastStepAt = time;
    for (const key of ['r', 'g', 'b']) {
      const delta = target[key] - current[key];
      current[key] += Math.sign(delta) * Math.min(Math.abs(delta), distance);
    }
    if (['r', 'g', 'b'].every(key => current[key] === target[key])) target = undefined;
  }

  function quietlyFlush() {
    const task = flush();
    if (background === task) return;
    background = task;
    void task.catch(error => logger.warn('[ADS] device write failed:', error.message)).finally(() => {
      if (background === task) background = undefined;
    });
  }

  function flush() {
    if (running) return running;
    const startedGeneration = generation;
    running = Promise.resolve().then(async () => {
      // One request in flight. Input/state changes overwrite the next desired state.
      while (dirty && !disposed) {
        if (!synchronize() || startedGeneration !== generation) throw new Error('ADS connection changed');
        dirty = false;
        step();
        const requestedBase = structuredClone(base);
        const version = stateVersion;
        const state = { color: Object.fromEntries(Object.entries(current).map(([key, value]) => [key, Math.round(value)])),
          brightness: base.brightness, on: base.on };
        const result = await writeState(state);
        if (startedGeneration !== generation || getDeviceState()?.connectionId !== connectionId) throw new Error('ADS connection changed');
        if (!isCommandAcknowledged(SERIAL_COMMANDS.SET_MAIN_LED, '', result)) throw new Error(`Device rejected LED state: ${result}`);
        if (version === stateVersion) confirmedBase = requestedBase;
      }
      if (target && !disposed) {
        timer = setTimer(() => {
          timer = undefined;
          dirty = true;
          quietlyFlush();
        }, 1);
      }
      return 'okay';
    }).catch(error => {
      if (startedGeneration === generation) {
        cancelTimer();
        target = undefined;
        dirty = false;
        const state = getDeviceState();
        if (validState(state)) current = copyColor(state.color);
      }
      throw error;
    }).finally(() => {
      running = undefined;
      if (dirty && !disposed) quietlyFlush();
    });
    return running;
  }

  function setHeld(source, down) {
    if (disposed || !synchronize()) return;
    if (down && (!settings.enabled || !base.on)) return;
    if (held.has(source) === down) return;
    if (down) held.add(source);
    else held.delete(source);
    retarget();
    quietlyFlush();
  }

  async function setState(state) {
    if (disposed || !synchronize()) throw new Error('Device state is unavailable');
    if (!validState(state)) throw new Error('Invalid LED state');
    const version = ++stateVersion;
    const writeGeneration = generation;
    base = { color: copyColor(state.color), brightness: state.brightness, on: state.on };
    if (!base.on) {
      held.clear();
      target = undefined;
      cancelTimer();
      current = copyColor(base.color);
    } else if (held.size || target) {
      retarget();
    } else {
      current = copyColor(base.color);
    }
    dirty = true;
    try {
      return await flush();
    } catch (error) {
      if (writeGeneration === generation && version === stateVersion) base = structuredClone(confirmedBase);
      throw error;
    }
  }

  function observeDeviceState(state, reason, previous) {
    if (!validState(state)) {
      reset();
      return state;
    }
    synchronize();
    const colorChanged = !previous?.color || ['r', 'g', 'b'].some(key => previous.color[key] !== state.color[key]);
    // Reads during ADS contain a transient color, not a new normal color.
    if (reason === 'device' ? colorChanged || previous?.index !== state.index : !held.size && !target && !running) {
      base.color = copyColor(state.color);
    }
    base.brightness = state.brightness;
    base.on = state.on;
    confirmedBase = structuredClone(base);
    stateVersion++;
    if (!base.on) {
      held.clear();
      target = undefined;
      cancelTimer();
      current = copyColor(base.color);
    } else if (held.size || target) {
      retarget();
      quietlyFlush();
    } else {
      current = copyColor(base.color);
    }
    return getState();
  }

  return {
    getState, setState, observeDeviceState, reset,
    configure(next) {
      if (disposed) return;
      const previous = settings;
      const wasHeld = held.size > 0;
      settings = { ...next, enabled: !!next?.enabled,
        color: validColor(next?.color) ? copyColor(next.color) : previous.color,
        speed: Number.isFinite(next?.speed) && next.speed > 0 ? next.speed : 1 };
      if (!settings.enabled) held.clear();
      if (previous.adsMouseButton !== settings.adsMouseButton) held.delete('mouse');
      if (previous.adsControllerButton !== settings.adsControllerButton) held.delete('controller');
      if (synchronize() && (wasHeld || held.size || target || previous.enabled && !settings.enabled)) {
        retarget();
        quietlyFlush();
      }
    },
    mouse(button, down) {
      if (button === settings.adsMouseButton) setHeld('mouse', down);
    },
    controller(gamepad) {
      const state = gamepad?.type === 'xinput' ? gamepad.state : null;
      if (!state) { setHeld('controller', false); return; }
      const button = settings.adsControllerButton;
      if (button === 6 || button === 7) {
        const value = state[button === 6 ? 'bLeftTrigger' : 'bRightTrigger'] ?? 0;
        if (value > 80) setHeld('controller', true);
        else if (value < 60) setHeld('controller', false);
      } else {
        setHeld('controller', !!state.wButtons?.includes(BUTTONS[button]));
      }
    },
    suspend() {
      const state = getState();
      return state ? setState({ ...state, on: false }) : Promise.resolve();
    },
    dispose() { reset(); disposed = true; },
  };
}

let controls;
function getAdsControls() {
  if (!controls) {
    const { getDeviceControlState, setDeviceStateObserver } = require('./usb/usb');
    const { setMainLED } = require('./usb/serial-commands');
    controls = createAdsControls({
      getDeviceState: getDeviceControlState,
      writeState: state => setMainLED(state.color, state.brightness, state.on),
      logger: require('electron-log/main'),
    });
    setDeviceStateObserver(controls.observeDeviceState);
  }
  return controls;
}

module.exports = { createAdsControls, getAdsControls };
