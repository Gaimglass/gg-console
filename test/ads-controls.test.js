const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createAdsControls } = require('../src/electron/ads-controls');
const { createShortcutControls } = require('../src/electron/events/shortcut-controls');

const baseColor = { r: 10, g: 20, b: 30 };
const adsColor = { r: 255, g: 0, b: 0 };
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function fixture(write) {
  let time = 0, nextTimer = 0;
  const timers = new Map();
  const writes = [], errors = [];
  let device = { connectionId: 1, color: baseColor, brightness: 0.5, on: true, index: 0,
    defaultColors: [{ color: baseColor, enabled: true }, { color: { r: 0, g: 50, b: 255 }, enabled: true }] };
  const controls = createAdsControls({
    getDeviceState: () => structuredClone(device),
    writeState: async state => {
      writes.push(structuredClone(state));
      const result = write ? await write(state) : 'okay';
      if (result === 'okay' && device) device = { ...device, ...structuredClone(state) };
      return result;
    },
    now: () => time,
    setTimer: (callback, delay) => { timers.set(++nextTimer, { callback, at: time + delay }); return nextTimer; },
    clearTimer: id => timers.delete(id),
    logger: { warn: (...args) => errors.push(args) },
  });
  controls.configure({ enabled: true, color: adsColor, speed: 100, adsMouseButton: 2, adsControllerButton: 6 });
  return {
    controls, writes, errors, timers,
    get device() { return device; }, set device(value) { device = value; },
    async advance(ms) {
      await settle();
      const end = time + ms;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        time = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
        await settle();
      }
      time = end;
      await settle();
    },
  };
}

test('mouse ADS enters and restores the normal color without any renderer callback', async () => {
  const f = fixture();
  f.controls.mouse(1, true);
  assert.equal(f.writes.length, 0);
  f.controls.mouse(2, true);
  await f.advance(100);
  assert.deepEqual(f.device.color, adsColor);
  assert.deepEqual(f.controls.getState().color, baseColor);
  assert.equal(f.device.brightness, 0.5);
  f.controls.mouse(2, false);
  await f.advance(100);
  assert.deepEqual(f.device.color, baseColor);
  assert.equal(f.timers.size, 0);
});

test('rapid reversals keep only the latest desired state while one USB write is blocked', async () => {
  const gate = deferred();
  let calls = 0, inFlight = 0, maximum = 0;
  const f = fixture(async () => {
    maximum = Math.max(maximum, ++inFlight);
    if (++calls === 1) await gate.promise;
    inFlight--;
    return 'okay';
  });
  f.controls.mouse(2, true);
  await settle();
  for (let i = 0; i < 500; i++) {
    f.controls.mouse(2, false);
    f.controls.mouse(2, true);
  }
  f.controls.mouse(2, false);
  await f.advance(1000);
  assert.equal(f.writes.length, 1);
  gate.resolve();
  await f.advance(100);
  assert.equal(maximum, 1);
  assert.equal(f.writes.length, 2);
  assert.deepEqual(f.device.color, baseColor);
  assert.equal(f.timers.size, 0);
});

test('keyboard brightness and slot changes during ADS preserve the normal color for release', async () => {
  const f = fixture();
  const broadcasts = [];
  const shortcuts = createShortcutControls({
    getState: f.controls.getState, readState: async () => {}, writeState: f.controls.setState,
    writeIndex: async index => { f.device.index = index; return `okay ${index}`; },
    broadcast: state => broadcasts.push(state), showFeedback() {}, logger: console,
  });
  f.controls.mouse(2, true);
  await f.advance(100);
  await shortcuts.run('brightness+');
  assert.equal(f.device.brightness, 0.55);
  assert.deepEqual(f.device.color, adsColor);
  assert.deepEqual(broadcasts.at(-1).color, baseColor);
  await shortcuts.run('s2');
  const selected = f.device.defaultColors[1].color;
  assert.deepEqual(f.device.color, adsColor);
  assert.deepEqual(broadcasts.at(-1).color, selected);
  f.controls.mouse(2, false);
  await f.advance(100);
  assert.deepEqual(f.device.color, selected);
  assert.equal(f.device.brightness, 0.55);
});

test('a UI color edit while ADS is held changes the release color without replacing the ADS color', async () => {
  const f = fixture();
  f.controls.mouse(2, true);
  await f.advance(100);
  const color = { r: 0, g: 255, b: 0 };
  await f.controls.setState({ color, brightness: 0.75, on: true });
  assert.deepEqual(f.device.color, adsColor);
  assert.equal(f.device.brightness, 0.75);
  f.controls.mouse(2, false);
  await f.advance(100);
  assert.deepEqual(f.device.color, color);
});

test('physical brightness updates and refreshes during ADS do not save a transient color as normal', async () => {
  const f = fixture();
  f.controls.mouse(2, true);
  await f.advance(100);
  const previous = structuredClone(f.device);
  f.device.brightness = 0.8;
  f.controls.observeDeviceState(f.device, 'device', previous);
  await f.advance(10);
  f.controls.observeDeviceState(f.device, 'read');
  await f.advance(10);
  assert.deepEqual(f.controls.getState().color, baseColor);
  f.controls.mouse(2, false);
  await f.advance(100);
  assert.deepEqual(f.device.color, baseColor);
  assert.equal(f.device.brightness, 0.8);
});

test('physical color selection during ADS becomes the release color', async () => {
  const f = fixture();
  f.controls.mouse(2, true);
  await f.advance(100);
  const previous = structuredClone(f.device);
  const selected = { r: 0, g: 80, b: 255 };
  f.device = { ...f.device, color: selected, index: 1 };
  f.controls.observeDeviceState(f.device, 'device', previous);
  await f.advance(100);
  assert.deepEqual(f.device.color, adsColor);
  f.controls.mouse(2, false);
  await f.advance(100);
  assert.deepEqual(f.device.color, selected);
});

test('controller trigger hysteresis, overlapping inputs and controller disconnect are handled in main', async () => {
  const f = fixture();
  const trigger = value => f.controls.controller({ type: 'xinput', state: { bLeftTrigger: value } });
  trigger(81);
  await f.advance(100);
  trigger(70);
  await f.advance(100);
  assert.deepEqual(f.device.color, adsColor);
  f.controls.mouse(2, true);
  trigger(59);
  await f.advance(100);
  assert.deepEqual(f.device.color, adsColor, 'mouse still holds ADS');
  f.controls.mouse(2, false);
  await f.advance(100);
  assert.deepEqual(f.device.color, baseColor);
  trigger(200);
  await f.advance(100);
  f.controls.controller(null);
  await f.advance(100);
  assert.deepEqual(f.device.color, baseColor);
});

test('controller digital buttons and settings changes release an old binding', async () => {
  const f = fixture();
  const configure = next => f.controls.configure({ enabled: true, color: adsColor, speed: 100,
    adsMouseButton: 2, adsControllerButton: 0, ...next });
  configure({});
  f.controls.controller({ type: 'xinput', state: { wButtons: ['XINPUT_GAMEPAD_A'] } });
  await f.advance(100);
  assert.deepEqual(f.device.color, adsColor);
  configure({ adsControllerButton: 1 });
  await f.advance(100);
  assert.deepEqual(f.device.color, baseColor);
  f.controls.mouse(2, true);
  await f.advance(100);
  configure({ enabled: false });
  await f.advance(100);
  assert.deepEqual(f.device.color, baseColor);
  f.controls.mouse(2, true);
  await f.advance(100);
  assert.deepEqual(f.device.color, baseColor);
});

test('power off and suspend cancel ADS timers and keep the device off after release', async () => {
  for (const suspend of [false, true]) {
    const f = fixture();
    f.controls.mouse(2, true);
    await f.advance(20);
    if (suspend) await f.controls.suspend();
    else await f.controls.setState({ ...f.controls.getState(), on: false });
    const count = f.writes.length;
    f.controls.mouse(2, false);
    await f.advance(1000);
    assert.equal(f.device.on, false);
    assert.equal(f.timers.size, 0);
    assert.equal(f.writes.length, count);
  }
});

test('disconnect and shutdown discard pending ADS writes and stale completions', async () => {
  for (const dispose of [false, true]) {
    const gate = deferred();
    const f = fixture(() => gate.promise);
    f.controls.mouse(2, true);
    await settle();
    f.controls.mouse(2, false);
    if (dispose) f.controls.dispose();
    else { f.device = null; f.controls.observeDeviceState(null, 'disconnected'); }
    gate.reject(new Error('Port closed'));
    await f.advance(1000);
    assert.equal(f.writes.length, 1);
    assert.equal(f.timers.size, 0);
  }
});

test('reconnection uses the new device baseline and does not replay held inputs', async () => {
  const f = fixture();
  f.controls.mouse(2, true);
  await f.advance(100);
  f.device = null;
  f.controls.observeDeviceState(null, 'disconnected');
  const color = { r: 30, g: 50, b: 70 };
  f.device = { connectionId: 2, color, brightness: 0.2, on: true };
  f.controls.observeDeviceState(f.device, 'read');
  const count = f.writes.length;
  await f.advance(1000);
  assert.equal(f.writes.length, count);
  f.controls.mouse(2, true);
  await f.advance(100);
  f.controls.mouse(2, false);
  await f.advance(100);
  assert.deepEqual(f.device.color, color);
  assert.equal(f.device.brightness, 0.2);
});

test('a failed or rejected write stops animation and a later control can recover from confirmed state', async () => {
  for (const response of ['error', undefined]) {
    let fail = true;
    const f = fixture(() => {
      if (fail && response === undefined) throw new Error('Serial port timed out');
      return fail ? response : 'okay';
    });
    await assert.rejects(f.controls.setState({ color: adsColor, brightness: 0.8, on: true }));
    assert.deepEqual(f.controls.getState().color, baseColor);
    assert.equal(f.controls.getState().brightness, 0.5);
    assert.equal(f.timers.size, 0);
    fail = false;
    await f.controls.setState({ ...f.controls.getState(), brightness: 0.55 });
    assert.equal(f.device.brightness, 0.55);
    assert.deepEqual(f.device.color, baseColor);
  }
});

function loadInputModule(name, replacements, extras = {}) {
  const filename = path.join(__dirname, '../src/electron/events', name);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, console, ...extras,
    require(id) {
      if (!(id in replacements)) throw new Error(`Unexpected dependency: ${id}`);
      return replacements[id];
    },
  }, { filename });
  return module.exports;
}

test('native mouse edges go directly to main ADS controls without a BrowserWindow', () => {
  const handlers = {}, received = [];
  const module = loadInputModule('mouse.js', {
    '../ads-controls': { getAdsControls: () => ({ mouse: (...args) => received.push(args) }) },
    'global-mouse-events': { on: (event, callback) => { handlers[event] = callback; } },
  });
  module.registerMouseEvents();
  handlers.mousedown({ button: 2 });
  handlers.mouseup({ button: 2 });
  assert.deepEqual(received, [[2, true], [2, false]]);
});

test('XInput delivers ADS before renderer updates, releases packet zero on disconnect and never overlaps polls', async () => {
  let poll, calls = 0;
  const gate = deferred(), received = [];
  const module = loadInputModule('controller.js', {
    '../ads-controls': { getAdsControls: () => ({ controller: value => received.push(['ads', value.type]) }) },
    'node-hid': {},
    'xinput-ffi': { getState: async () => { calls++; return gate.promise; } },
  }, { setInterval: callback => { poll = callback; } });
  module.setupController({ webContents: { send: (_channel, value) => received.push(['renderer', value.type]) } });
  const pending = poll();
  await poll();
  assert.equal(calls, 1);
  gate.resolve({ dwPacketNumber: 0, gamepad: { bLeftTrigger: 255 } });
  await pending;
  assert.deepEqual(received, [['ads', 'xinput'], ['renderer', 'xinput']]);
  const disconnected = loadInputModule('controller.js', {
    '../ads-controls': { getAdsControls: () => ({ controller: value => received.push(['ads', value.type]) }) },
    'node-hid': {},
    'xinput-ffi': { getState: async () => calls++ === 1 ? { dwPacketNumber: 0, gamepad: {} } : null },
  }, { setInterval: callback => { poll = callback; } });
  disconnected.setupController({ webContents: { send: (_channel, value) => received.push(['renderer', value.type]) } });
  await poll();
  await poll();
  assert.deepEqual(received.slice(-2), [['ads', null], ['renderer', null]]);
});
