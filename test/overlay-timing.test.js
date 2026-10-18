const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { colors, readAndErase } = require('../src/electron/overlay/frame-marker');
const { createOverlayTiming, createTimingWriter } = require('../src/electron/overlay/timing');

function stampedBitmap(sequence, width = 316, height = 112) {
  const bitmap = Buffer.alloc(width * height * 4, 30);
  const stamp = colors(sequence);
  for (let y = 0; y < Math.ceil(2 * height / 112); y++) {
    for (let x = 0; x < Math.ceil(8 * width / 316); x++) {
      const [r, g, b] = stamp[Math.min(3, Math.floor((x + 0.5) * 316 / width / 2))];
      bitmap.set([b, g, r, 255], (y * width + x) * 4);
    }
  }
  return bitmap;
}

function fixture(options = {}) {
  let now = 0;
  const records = [];
  const timers = new Map();
  let timerId = 0;
  const timing = createOverlayTiming({ write: record => records.push(record), now: () => now, wallNow: () => 100000 + now,
    session: 'test', setTimer: callback => { timers.set(++timerId, callback); return timerId; }, clearTimer: id => timers.delete(id), ...options });
  const window = Object.assign(new EventEmitter(), { id: 1, webContents: Object.assign(new EventEmitter(), { send() {} }) });
  timing.attach(window, 'game');
  return { timing, window, records, timers, advance: ms => { now += ms; } };
}

test('pixel stamps survive fractional DPI and 32-bit sequence values, and are erased without touching card pixels', () => {
  for (const scale of [1, 1.25, 1.5, 1.75, 2, 2.25, 3]) {
    for (const sequence of [1, 255, 256, 65536, 0x12345678, 0xffffffff]) {
      const width = Math.round(316 * scale);
      const height = Math.round(112 * scale);
      const bitmap = stampedBitmap(sequence, width, height);
      assert.equal(readAndErase(bitmap, width, height), sequence, `${scale}x / ${sequence}`);
      for (let y = 0; y < Math.ceil(2 * height / 112); y++) {
        assert.ok(bitmap.subarray(y * width * 4, (y * width + Math.ceil(8 * width / 316)) * 4).every(value => value === 0));
      }
      assert.equal(bitmap[(50 * width + 100) * 4], 30);
    }
  }
  const invalid = stampedBitmap(42);
  invalid[(316 + 5) * 4 + 1] ^= 1; // corrupt the sampled checksum cell
  assert.equal(readAndErase(invalid, 316, 112), null);
  assert.equal(readAndErase(Buffer.alloc(4), 316, 112), null);
});

test('stale paints retain their actual request ID and native transfer has its own duration', () => {
  const { timing, window, records, advance } = fixture();
  const first = timing.begin('overlay');
  timing.send(window, { type: 'power', on: true }, first, 'game');
  advance(100);
  const latest = timing.begin('overlay');
  timing.send(window, { type: 'power', on: false }, latest, 'game');
  const image = { getSize: () => ({ width: 316, height: 112 }), getBitmap: () => { advance(40); return stampedBitmap(first.sequence); } };
  timing.transfer(window, image, bitmap => { assert.ok(bitmap.subarray(0, 32).every(value => value === 0)); advance(700); });
  const captured = records.find(record => record.stage === 'paint.bitmap-ready');
  assert.equal(captured.id, first.id);
  assert.equal(captured.latestSequence, latest.sequence);
  assert.equal(captured.capturedSequence, first.sequence);
  assert.equal(captured.paintElapsedMs, 100);
  assert.equal(captured.bitmapMs, 40);
  assert.equal(captured.firstPaint, true);
  assert.equal(records.find(record => record.stage === 'native.send.end').durationMs, 700);
  assert.equal(records.find(record => record.stage === 'frame.transferred').displayed, 'unknown');
  timing.dispose();
});

test('unidentified frames are not credited to the latest request and transparent frames are distinguished', () => {
  const { timing, window, records } = fixture();
  const trace = timing.begin('overlay');
  timing.send(window, { type: 'power', on: true }, trace, 'game');
  const image = sequence => ({ getSize: () => ({ width: 316, height: 112 }), getBitmap: () => {
    const bitmap = sequence ? stampedBitmap(sequence) : Buffer.alloc(316 * 112 * 4);
    bitmap[(90 * 316 + 160) * 4 + 3] = 0;
    return bitmap;
  } });
  timing.transfer(window, image(null), () => {});
  timing.transfer(window, image(trace.sequence), () => {});
  const paints = records.filter(record => record.stage === 'paint.bitmap-ready');
  assert.equal(paints[0].id, undefined);
  assert.equal(paints[0].correlation, 'unidentified');
  assert.equal(paints[1].firstPaint, true);
  assert.equal(paints[1].firstVisiblePaint, false);
  assert.equal(trace.firstVisiblePaint, false);
  timing.dispose();
});

test('late renderer acknowledgements preserve local durations and only dispatched IDs from that window are accepted', () => {
  const { timing, window, records, advance, timers } = fixture();
  const trace = timing.begin('overlay');
  timing.send(window, { type: 'power', on: true }, trace, 'game');
  advance(3000);
  const sample = { id: trace.id, sequence: trace.sequence, stage: 'dom-updated', rendererMs: 25, sinceReceivedMs: 5, durationMs: 5 };
  window.webContents.emit('ipc-message', {}, 'action-overlay:timing', sample);
  const result = records.find(record => record.stage === 'renderer.dom-updated');
  assert.equal(result.elapsedMs, 3000);
  assert.equal(result.durationMs, 5);
  assert.equal(result.sinceReceivedMs, 5);
  const count = records.length;
  window.webContents.emit('ipc-message', {}, 'action-overlay:timing', { ...sample, id: 'spoofed' });
  window.webContents.emit('ipc-message', {}, 'action-overlay:timing', { ...sample, stage: 'displayed' });
  const undispatched = timing.begin('overlay');
  const afterBegin = records.length;
  window.webContents.emit('ipc-message', {}, 'action-overlay:timing', { ...sample, id: undispatched.id, sequence: undispatched.sequence });
  assert.equal(afterBegin, count + 1);
  assert.equal(records.length, afterBegin);
  timing.dispose();
  assert.equal(window.webContents.listenerCount('ipc-message'), 0);
  assert.equal(timers.size, 0);
});

test('native exceptions retain a begin and failed end, and a logging failure cannot break the operation', () => {
  const { timing, records } = fixture();
  const trace = timing.begin('overlay');
  assert.throws(() => timing.measure(trace, 'native.send', () => { throw new Error('receiver failed'); }), /receiver failed/);
  assert.deepEqual(records.slice(-2).map(record => [record.stage, record.ok]), [['native.send.begin', undefined], ['native.send.end', false]]);
  timing.dispose();
  const broken = fixture({ write: () => { throw new Error('log unavailable'); } });
  assert.equal(broken.timing.measure(broken.timing.begin('overlay'), 'native.send', () => 42), 42);
  broken.timing.dispose();
});

test('clock round trips bound renderer execution separately from delayed acknowledgements', () => {
  const { timing, window, records, advance } = fixture();
  let token;
  window.webContents.send = (channel, value) => { if (channel === 'action-overlay:clock') token = value; };
  const trace = timing.begin('overlay');
  timing.send(window, { type: 'power', on: true }, trace, 'game');
  advance(4);
  window.webContents.emit('ipc-message', {}, 'action-overlay:timing', { stage: 'clock', token, rendererMs: 102 });
  advance(996);
  window.webContents.emit('ipc-message', {}, 'action-overlay:timing', {
    id: trace.id, sequence: trace.sequence, stage: 'dom-updated', rendererMs: 120, durationMs: 5,
  });
  const result = records.find(record => record.stage === 'renderer.dom-updated');
  assert.equal(result.rendererElapsedMinMs, 17);
  assert.equal(result.rendererElapsedMaxMs, 23);
  assert.equal(result.ackDelayMinMs, 977);
  assert.equal(result.ackDelayMaxMs, 983);
  assert.equal(result.clockUncertaintyMs, 6);
  timing.dispose();
});

test('a delayed main heartbeat records a stall independently of renderer acknowledgements', () => {
  const { timing, records, advance, timers } = fixture();
  timing.begin('overlay');
  const [timerId, callback] = [...timers][0];
  timers.delete(timerId);
  advance(1250);
  callback();
  assert.equal(records.find(record => record.stage === 'main.loop-lag').lagMs, 1000);
  timing.dispose();
  assert.equal(timers.size, 0);
});

test('native Present logs remain contextual and noisy per-frame/input messages are excluded', () => {
  const { timing, records } = fixture();
  timing.nativeEvent('log', { level: 'info', message: 'Present hook: 300 frames rendered', timestamp: 123 });
  timing.nativeEvent('log', { level: 'info', message: 'Client received message from host: type=window.framebuffer' });
  timing.nativeEvent('game.input', { key: 'a' });
  assert.equal(records.length, 1);
  assert.equal(records[0].native.timestamp, 123);
  assert.equal(records[0].displayedSequence, null);
  timing.dispose();
});

test('timing files are written while the main event loop is blocked, and rotate to one bounded archive', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-overlay-timing-'));
  const filePath = path.join(directory, 'timing.log');
  const writer = createTimingWriter(filePath, { maxBytes: 512 });
  try {
    writer.write({ stage: 'native.send.begin' });
    const deadline = Date.now() + 3000;
    const pause = new Int32Array(new SharedArrayBuffer(4));
    while (!fs.existsSync(filePath) && Date.now() < deadline) Atomics.wait(pause, 0, 0, 10);
    assert.match(fs.readFileSync(filePath, 'utf8'), /native.send.begin/);
    for (let index = 0; index < 40; index++) writer.write({ stage: 'frame', index, details: 'x'.repeat(40) });
    await writer.close();
    assert.ok(fs.statSync(filePath).size <= 512);
    assert.ok(fs.statSync(`${filePath}.old`).size <= 512);
    assert.equal(JSON.parse(fs.readFileSync(filePath, 'utf8').trim().split('\n').at(-1)).index, 39);
    assert.deepEqual(fs.readdirSync(directory).sort(), ['timing.log', 'timing.log.old']);
  } finally {
    await writer.close();
    for (const filename of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, filename));
    fs.rmdirSync(directory);
  }
});

test('renderer stamps each DOM update, reports a superseded animation, and stops monitoring on hide', () => {
  let update;
  let hide;
  let now = 10;
  let nextId = 0;
  const frames = new Map();
  const timers = new Map();
  const reports = [];
  const element = () => ({ style: {}, children: [], classList: { add() {}, remove() {}, toggle() {} }, toggleAttribute() {}, setAttribute() {}, appendChild(child) { this.children.push(child); } });
  const elements = new Map();
  const document = { hidden: true, visibilityState: 'hidden', body: element(), createElement: element,
    getElementById: id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); } };
  const context = { document, performance: { now: () => now, timeOrigin: 100000 },
    window: { overlayFrameMarker: { colors }, actionOverlay: { subscribe(onUpdate, onHide) { update = onUpdate; hide = onHide; }, reportTiming: sample => reports.push(sample) } },
    requestAnimationFrame: callback => { frames.set(++nextId, callback); return nextId; }, cancelAnimationFrame: id => frames.delete(id),
    setTimeout: callback => { timers.set(++nextId, callback); return nextId; }, clearTimeout: id => timers.delete(id) };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/electron/overlay/renderer'), 'utf8'), context);
  update({ type: 'brightness', percent: 55 }, { id: 'a', sequence: 1, frameMarker: true });
  now = 20;
  update({ type: 'brightness', percent: 60 }, { id: 'b', sequence: 2, frameMarker: true });
  assert.equal(elements.get('value').textContent, '60%');
  assert.equal(document.body.children.length, 1);
  assert.equal(document.body.children[0].children[1].style.backgroundColor, 'rgb(0,0,2)');
  assert.equal(reports.find(sample => sample.stage === 'superseded-before-animation').id, 'a');
  assert.equal(frames.size, 1);
  now = 1020;
  [...frames.values()][0]();
  assert.equal(reports.find(sample => sample.stage === 'animation-callback').durationMs, 1000);
  assert.equal(reports.some(sample => sample.stage === 'paint' || sample.stage === 'displayed'), false);
  hide();
  assert.equal(timers.size, 0);
});
