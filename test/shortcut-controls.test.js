const assert = require('node:assert/strict');
const test = require('node:test');
const { createShortcutControls, formatControlState } = require('../src/electron/events/shortcut-controls');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function fixture(overrides = {}) {
  let state = {
    connectionId: 1, color: { r: 10, g: 20, b: 30 }, brightness: 0.5, on: true, index: 0,
    defaultColors: [{ color: { r: 10, g: 20, b: 30 }, enabled: true }, { color: { r: 20, g: 110, b: 255 }, enabled: true }],
  };
  const writes = [];
  const indices = [];
  const feedback = [];
  const broadcasts = [];
  const failures = [];
  const options = {
    getState: () => structuredClone(state),
    readState: async () => ({ ok: true }),
    writeState: async value => {
      writes.push(structuredClone(value));
      state = { ...state, color: { ...value.color }, brightness: value.brightness, on: value.on };
      return 'okay';
    },
    writeIndex: async index => { indices.push(index); state.index = index; return `okay ${index}`; },
    showFeedback: notification => feedback.push(notification),
    broadcast: value => broadcasts.push(value),
    logger: { warn: (...args) => failures.push(args) },
  };
  const controller = createShortcutControls({ ...options, ...overrides });
  return { controller, options, writes, indices, feedback, broadcasts, failures, get state() { return state; }, set state(value) { state = value; } };
}

test('shortcuts write and show feedback without awaiting the UI renderer', async () => {
  const neverRendered = deferred();
  const f = fixture({ broadcast: () => neverRendered.promise });
  await f.controller.run('s2');
  assert.deepEqual(f.writes[0].color, { r: 20, g: 110, b: 255 });
  assert.deepEqual(f.indices, [1]);
  assert.deepEqual(f.feedback, [{ type: 'color-slot', slot: 2, color: { r: 20, g: 110, b: 255 } }]);
  assert.equal(f.state.index, 1);
  neverRendered.resolve();
});

test('a burst preserves every brightness step and limit while using one device write', async () => {
  const f = fixture();
  await Promise.all([...Array(15)].map(() => f.controller.run('brightness+')).concat([...Array(3)].map(() => f.controller.run('brightness-'))));
  assert.equal(f.writes.length, 1);
  assert.equal(f.state.brightness, 0.85);
  assert.deepEqual(f.feedback, [{ type: 'brightness', value: 0.85 }]);
  await Promise.all([...Array(30)].map(() => f.controller.run('brightness-')));
  assert.equal(f.state.brightness, 0.075);
});

test('plain index acknowledgements remain supported, while rejected and mismatched slots stay quiet', async () => {
  for (const response of ['okay', 'error', 'okay 0', 'okay 8', 'okay 1 extra', undefined]) {
    const f = fixture({ writeIndex: async index => {
      if (response === 'okay') f.state.index = index;
      return response;
    } });
    await f.controller.run('s2');
    assert.equal(f.feedback.length, response === 'okay' ? 1 : 0, String(response));
    assert.equal(f.failures.length, response === 'okay' ? 0 : 1, String(response));
  }
});

test('presses arriving during a write become one next write with the correct color, brightness and power', async () => {
  const gate = deferred();
  let inFlight = 0;
  let maxInFlight = 0;
  let calls = 0;
  const f = fixture({
    writeState: async state => {
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      if (++calls === 1) await gate.promise;
      const result = await f.options.writeState(state);
      inFlight--;
      return result;
    },
  });
  const finished = f.controller.run('brightness+');
  await Promise.resolve();
  f.controller.run('brightness+');
  f.controller.run('brightness+');
  f.controller.run('brightness+');
  f.controller.run('s2');
  f.controller.run('led');
  gate.resolve();
  await finished;
  assert.equal(maxInFlight, 1);
  assert.equal(f.writes.length, 2);
  assert.equal(f.state.brightness, 0.7);
  assert.equal(f.state.on, false);
  assert.equal(f.state.index, 1);
  assert.deepEqual(f.state.color, { r: 20, g: 110, b: 255 });
  assert.deepEqual(f.indices, [1]);
});

test('later shortcuts use externally updated device state, and UI snapshots contain confirmed state', async () => {
  const f = fixture();
  await f.controller.run('brightness+');
  f.state.brightness = 0.2;
  await f.controller.run('brightness+');
  assert.equal(f.state.brightness, 0.25);
  assert.equal(f.broadcasts.at(-1).brightness, 0.25);
  assert.equal(formatControlState(f.state), 'color=10,20,30&brightness=0.25&ledOn=1&index=0');
});

test('a connection replacement cancels queued old actions and does not announce stale success', async () => {
  const gate = deferred();
  const f = fixture({ writeState: async () => { await gate.promise; return 'okay'; } });
  const finished = f.controller.run('brightness+');
  await Promise.resolve();
  f.controller.run('s2');
  f.state.connectionId = 2;
  gate.resolve();
  await finished;
  assert.equal(f.feedback.length, 0);
  assert.equal(f.broadcasts.length, 0);
  assert.equal(f.indices.length, 0);
  assert.equal(f.failures.length, 1);
});

test('off LEDs and unavailable slots stay quiet, and a following toggle still works', async () => {
  const f = fixture();
  f.state.on = false;
  await f.controller.run('brightness+');
  await f.controller.run('s2');
  assert.equal(f.writes.length, 0);
  await f.controller.run('led');
  assert.equal(f.state.on, true);
  await f.controller.run('s8');
  assert.equal(f.writes.length, 1);
  f.state.defaultColors[1].enabled = false;
  await f.controller.run('s2');
  assert.equal(f.writes.length, 1);
});

test('an uninitialized device is read once and a failed write can recover on the next press', async () => {
  let ready = false;
  let reads = 0;
  let rejectWrite = true;
  const f = fixture({
    getState: () => ready ? f.options.getState() : null,
    readState: async () => { reads++; ready = true; },
    writeState: async state => {
      if (rejectWrite) throw new Error('USB disconnected');
      return f.options.writeState(state);
    },
  });
  await f.controller.run('brightness+');
  assert.equal(reads, 1);
  assert.equal(f.feedback.length, 0);
  assert.equal(f.failures.length, 1);
  rejectWrite = false;
  await f.controller.run('brightness+');
  assert.equal(f.state.brightness, 0.55);
  assert.equal(f.feedback.length, 1);
});

test('shutdown does not send any additional device writes', async () => {
  const f = fixture({ isQuitting: () => true });
  await f.controller.run('led');
  assert.equal(f.writes.length, 0);
  assert.equal(f.feedback.length, 0);
});
