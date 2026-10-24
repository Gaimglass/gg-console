const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');
const usbModulePath = path.join(projectRoot, 'src', 'electron', 'usb', 'usb.js');

function waitFor(predicate, timeoutMs = 1000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) {
        resolve();
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('Timed out waiting for condition'));
        return;
      }

      setTimeout(check, 5);
    };

    check();
  });
}

function loadUsbModule({ windows = [] } = {}) {
  const instances = [];
  const feedback = [];

  class FakeReadlineParser extends EventEmitter {}

  class FakeSerialPort extends EventEmitter {
    static async list() {
      return [{ path: 'COM11', productId: '5400', vendorId: '2341' }];
    }

    constructor(options) {
      super();
      assert.equal(options.autoOpen, false);
      this.path = options.path;
      this.opening = false;
      this.closing = false;
      this.destroyed = false;
      this.nativeOpen = false;
      this.closeCalls = 0;
      this.openCallback = null;
      this.parser = null;
      this.silentCommands = new Set();
      this.writes = [];
      this.responses = new Map([
        ['130', 'name=ggpro&version=test'],
        ['128', 'color=10,20,30&brightness=0.50&ledOn=1'],
        ['129', 'color=10,20,30,1'],
      ]);
      instances.push(this);
    }

    get isOpen() {
      return this.nativeOpen && !this.closing;
    }

    open(callback) {
      this.opening = true;
      this.openCallback = callback;
    }

    completeOpen(error = null) {
      this.opening = false;
      if (!error) {
        this.nativeOpen = true;
        this.emit('open');
      }
      this.openCallback(error);
    }

    close(callback) {
      this.closeCalls++;
      this.closing = true;
      queueMicrotask(() => {
        this.nativeOpen = false;
        this.closing = false;
        this.emit('close');
        callback(null);
      });
    }

    destroy() {
      this.destroyed = true;
    }

    pipe(parser) {
      this.parser = parser;
      return parser;
    }

    write(data, callback) {
      this.writes.push(data);
      queueMicrotask(() => {
        callback?.(null);
        const command = data.slice(0, 3);
        if (this.responses.has(command) && !this.silentCommands.has(command)) {
          this.emit('data', `${command}:${this.responses.get(command)}\r\n`);
          this.parser.emit('data', `${command}:${this.responses.get(command)}`);
        }
      });
      return true;
    }
  }

  const replacements = [
    [require.resolve('serialport'), { SerialPort: FakeSerialPort }],
    [require.resolve('@serialport/parser-readline'), { ReadlineParser: FakeReadlineParser }],
    [require.resolve('electron'), { BrowserWindow: { getAllWindows: () => windows } }],
    [require.resolve('../src/electron/overlay'), { showActionOverlay: notification => { feedback.push(notification); return true; } }],
  ];
  const previousCacheEntries = replacements.map(([modulePath]) => require.cache[modulePath]);

  replacements.forEach(([modulePath, exports]) => {
    require.cache[modulePath] = {
      id: modulePath,
      filename: modulePath,
      loaded: true,
      exports,
    };
  });

  delete require.cache[usbModulePath];
  const usb = require(usbModulePath);

  const restore = () => {
    delete require.cache[usbModulePath];
    replacements.forEach(([modulePath], index) => {
      const previousEntry = previousCacheEntries[index];
      if (previousEntry) {
        require.cache[modulePath] = previousEntry;
      } else {
        delete require.cache[modulePath];
      }
    });
  };

  return { instances, restore, usb, feedback };
}

function createWindow(sentEvents) {
  return {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send: channel => sentEvents.push(channel),
    },
  };
}

test('a connection that finishes opening after reset is closed as stale', async t => {
  const { instances, restore, usb } = loadUsbModule();
  const app = { isQuitting: false };
  const sentEvents = [];
  t.after(restore);

  await usb.initializeUsb(createWindow(sentEvents), app, false);
  await waitFor(() => instances.length === 1 && instances[0].opening);

  const stalePort = instances[0];
  const resetPromise = usb.disconnectUsb(app, { reconnect: false, reason: 'test-reset' });
  stalePort.completeOpen();
  await resetPromise;

  assert.equal(stalePort.closeCalls, 1);
  assert.equal(stalePort.nativeOpen, false);
  assert.deepEqual(sentEvents, []);
});

test('shutdown closes an active port and does not start another attempt', async t => {
  const { instances, restore, usb } = loadUsbModule();
  const app = { isQuitting: false };
  const sentEvents = [];
  t.after(restore);

  await usb.initializeUsb(createWindow(sentEvents), app, false);
  await waitFor(() => instances.length === 1 && instances[0].opening);
  instances[0].completeOpen();
  await waitFor(() => sentEvents.includes('usb-connected'));

  await usb.disconnectUsb(app, { reconnect: false, reason: 'test-shutdown' });
  await new Promise(resolve => setTimeout(resolve, 850));

  assert.equal(instances.length, 1);
  assert.equal(instances[0].closeCalls, 1);
  assert.deepEqual(sentEvents, ['usb-connected', 'usb-disconnected']);
});

test('a failed state read can be refreshed using the same open COM port', async t => {
  const { instances, restore, usb } = loadUsbModule();
  const app = { isQuitting: false };
  const sentEvents = [];
  const warnings = [];
  t.mock.method(console, 'warn', message => warnings.push(message));
  t.after(async () => {
    await usb.disconnectUsb(app, { reconnect: false, reason: 'test-cleanup' });
    restore();
  });

  await usb.initializeUsb(createWindow(sentEvents), app, false);
  await waitFor(() => instances[0]?.opening);
  const port = instances[0];
  port.completeOpen();
  await waitFor(() => sentEvents.includes('usb-connected'));

  port.silentCommands.add('129');
  assert.deepEqual(await usb.readDeviceState('usb-connected'), {
    ok: false,
    error: 'Serial port timed out',
  });
  assert.equal(port.isOpen, true);
  assert.equal(port.closeCalls, 0);
  assert.ok(warnings.some(message => message.includes('command=GET_DEFAULT_LEDS(129) failed: Serial port timed out') && message.includes('isOpen=true')));

  port.silentCommands.delete('129');
  assert.deepEqual(await usb.readDeviceState('refresh-button'), {
    ok: true,
    mainLed: 'color=10,20,30&brightness=0.50&ledOn=1',
    defaultColors: 'color=10,20,30,1',
  });
  assert.equal(instances.length, 1);
  assert.equal(port.closeCalls, 0);
});

test('state reads without a connection fail cleanly and log unavailable commands once', async t => {
  const { restore, usb } = loadUsbModule();
  const warnings = [];
  t.mock.method(console, 'warn', message => warnings.push(message));
  t.after(restore);

  assert.deepEqual(await usb.readDeviceState('refresh-button'), { ok: false, error: 'Port not available' });
  assert.deepEqual(await usb.readDeviceState('window-activated'), { ok: false, error: 'Port not available' });
  assert.equal(warnings.filter(message => message.includes('command=GET_MAIN_LED(128) failed')).length, 1);
  assert.ok(warnings.some(message => message.includes('state read failed; reason=window-activated') && message.includes('port=none')));
});

test('device buttons show brightness, color-slot and power feedback directly while preserving renderer updates', async t => {
  const sentEvents = [];
  const window = createWindow(sentEvents);
  const deviceMessages = [];
  window.webContents.send = (channel, payload) => {
    sentEvents.push(channel);
    if (payload !== undefined) deviceMessages.push([channel, payload]);
  };
  const { instances, restore, usb, feedback } = loadUsbModule({ windows: [window] });
  const app = { isQuitting: false };
  t.after(async () => {
    await usb.disconnectUsb(app, { reconnect: false, reason: 'test-cleanup' });
    restore();
  });
  await usb.initializeUsb(window, app, false);
  await waitFor(() => instances[0]?.opening);
  const port = instances[0];
  port.responses.set('128', 'color=10,20,30,&brightness=0.50&ledOn=1&index=0');
  port.completeOpen();
  await waitFor(() => sentEvents.includes('usb-connected'));
  await usb.readDeviceState('test-baseline');
  assert.deepEqual(feedback, [], 'initial reads stay quiet');
  const writesBeforeButtons = port.writes.length;

  const updates = [
    'color=10,20,30,&brightness=0.50&ledOn=1&index=0',
    'color=10,20,30,&brightness=0.55&ledOn=1&index=0',
    'color=10,20,30,&brightness=0.50&ledOn=1&index=0',
    'color=20,110,255,&brightness=0.50&ledOn=1&index=1',
    'color=10,20,30,&brightness=0.50&ledOn=1&index=0',
    'color=10,20,30,&brightness=0.50&ledOn=0&index=0',
    'color=10,20,30,&brightness=0.50&ledOn=0&index=0',
    'color=10,20,30,&brightness=0.50&ledOn=1&index=0',
  ];
  for (const payload of updates) port.parser.emit('data', `200:${payload}`);

  assert.deepEqual(feedback, [
    { type: 'brightness', value: 0.55 },
    { type: 'brightness', value: 0.50 },
    { type: 'color-slot', slot: 2, color: { r: 20, g: 110, b: 255 } },
    { type: 'color-slot', slot: 1, color: { r: 10, g: 20, b: 30 } },
    { type: 'power', on: false },
    { type: 'power', on: true },
  ]);
  assert.deepEqual(deviceMessages, updates.map(payload => ['update-main-led-state-from-gg', payload]));
  assert.equal(port.writes.length, writesBeforeButtons, 'feedback does not write back to USB');
});

test('acknowledged app writes update the device baseline without duplicating feedback', async t => {
  const { instances, restore, usb, feedback } = loadUsbModule();
  const app = { isQuitting: false };
  const sentEvents = [];
  t.after(async () => {
    await usb.disconnectUsb(app, { reconnect: false, reason: 'test-cleanup' });
    restore();
  });
  await usb.initializeUsb(createWindow(sentEvents), app, false);
  await waitFor(() => instances[0]?.opening);
  const port = instances[0];
  port.responses.set('128', 'color=10,20,30&brightness=0.50&ledOn=1&index=0');
  for (const command of ['000', '003', '004', '005']) port.responses.set(command, 'okay');
  port.completeOpen();
  await waitFor(() => sentEvents.includes('usb-connected'));
  await usb.readDeviceState('test-baseline');
  await usb.writeCommand('000', '0100200300.800');
  await usb.writeCommand('003', ' 7');
  await usb.writeCommand('005', '0.251.5');
  assert.deepEqual(feedback, []);

  // This is a power button press after the app changed brightness, power and index.
  port.parser.emit('data', '200:color=10,20,30,&brightness=0.80&ledOn=1&index=7');
  port.parser.emit('data', '200:color=10,20,30,&brightness=0.75&ledOn=1&index=7');
  port.parser.emit('data', '200:color=20,110,255,&brightness=0.75&ledOn=1&index=0');
  await usb.writeCommand('004', ' 0');
  port.parser.emit('data', '200:color=20,110,255,&brightness=0.75&ledOn=1&index=0');
  assert.deepEqual(feedback, [
    { type: 'power', on: true },
    { type: 'brightness', value: 0.75 },
    { type: 'color-slot', slot: 1, color: { r: 20, g: 110, b: 255 } },
    { type: 'power', on: true },
  ]);

  port.responses.set('000', 'error');
  await usb.writeCommand('000', '0201102550.200');
  port.parser.emit('data', '200:color=20,110,255,&brightness=0.75&ledOn=1&index=0');
  assert.equal(feedback.length, 4, 'rejected writes cannot alter the confirmed baseline');
});

test('default palette updates select the correct slot, while invalid and repeated device state stays quiet', () => {
  const { createDeviceFeedback } = require('../src/electron/usb/device-feedback');
  const feedback = createDeviceFeedback();
  feedback.recordResponse('128', '', 'color=10,20,30,&brightness=0.50&ledOn=1&index=0');
  const palette = 'color=10,20,30,1&color=20,110,255,1&index=1';
  assert.deepEqual(feedback.fromDevice('201', palette), { type: 'color-slot', slot: 2, color: { r: 20, g: 110, b: 255 } });
  assert.equal(feedback.fromDevice('201', palette), null);
  assert.equal(feedback.fromDevice('201', 'color=99,99,99,1&color=20,110,255,1&index=1'), null, 'an unselected palette change is quiet');
  for (const payload of [undefined, '', 'okay', 'brightness=NaN&ledOn=2&index=8&color=256,0,0', 'brightness=&ledOn=&index=&color=,,']) {
    assert.equal(feedback.fromDevice('200', payload), null);
  }
  assert.equal(feedback.fromDevice('128', 'brightness=0.10'), null, 'reads are not button events');
  assert.deepEqual(feedback.fromDevice('200', 'brightness=0.55'), { type: 'brightness', value: 0.55 });

  const reconnected = createDeviceFeedback();
  assert.equal(reconnected.fromDevice('200', 'color=20,110,255&brightness=0.55&ledOn=1&index=1'), null, 'a new connection never compares against stale state');
  assert.deepEqual(reconnected.fromDevice('200', 'ledOn=0'), { type: 'power', on: false });
});

test('concurrent writes sharing a response code are serialized and update the right confirmed state', async t => {
  const { instances, restore, usb, feedback } = loadUsbModule();
  const app = { isQuitting: false };
  const sentEvents = [];
  t.after(async () => {
    await usb.disconnectUsb(app, { reconnect: false, reason: 'test-cleanup' });
    restore();
  });
  await usb.initializeUsb(createWindow(sentEvents), app, false);
  await waitFor(() => instances[0]?.opening);
  const port = instances[0];
  port.responses.set('128', 'color=10,20,30&brightness=0.50&ledOn=1&index=0');
  port.responses.set('129', 'color=10,20,30,1&color=20,110,255,1&index=0');
  port.completeOpen();
  await waitFor(() => sentEvents.includes('usb-connected'));
  await usb.readDeviceState('test-baseline');
  port.silentCommands.add('000');
  const first = usb.writeCommand('000', '0100200300.801');
  const second = usb.writeCommand('000', '0201102550.401');
  assert.equal(port.writes.filter(value => value.startsWith('000')).length, 1);
  port.parser.emit('data', '000:okay');
  assert.equal(await first, 'okay');
  await waitFor(() => port.writes.filter(value => value.startsWith('000')).length === 2);
  assert.equal(usb.getDeviceControlState().brightness, 0.8);
  port.parser.emit('data', '000:okay');
  assert.equal(await second, 'okay');
  const snapshot = usb.getDeviceControlState();
  assert.equal(snapshot.brightness, 0.4);
  assert.deepEqual(snapshot.color, { r: 20, g: 110, b: 255 });
  assert.deepEqual(snapshot.defaultColors[1], { color: { r: 20, g: 110, b: 255 }, enabled: true });
  snapshot.defaultColors[1].color.r = 0;
  assert.equal(usb.getDeviceControlState().defaultColors[1].color.r, 20, 'cached state is not mutable by callers');
  assert.equal(feedback.length, 0, 'acknowledged writes do not produce duplicate feedback');
  port.responses.set('003', 'okay 1');
  assert.equal(await usb.writeCommand('003', ' 1'), 'okay 1');
  assert.equal(usb.getDeviceControlState().index, 1, 'firmware index acknowledgements update the confirmed slot');
  port.parser.emit('data', '200:color=20,110,255,&brightness=0.40&ledOn=1&index=1');
  assert.equal(feedback.length, 0, 'the next snapshot must not announce an already confirmed slot again');
  for (const response of ['error', 'okay 1', 'okay 8', 'okay 1 extra']) {
    port.responses.set('003', response);
    await usb.writeCommand('003', ' 0');
    assert.equal(usb.getDeviceControlState().index, 1, 'rejected or mismatched replies cannot alter the confirmed slot');
  }
  await usb.disconnectUsb(app, { reconnect: false, reason: 'test-disconnect' });
  assert.equal(usb.getDeviceControlState(), null);
});

test('palette cache tracks acknowledged edits and unsolicited palette updates', () => {
  const { createDeviceFeedback } = require('../src/electron/usb/device-feedback');
  const feedback = createDeviceFeedback();
  feedback.recordResponse('129', '', 'color=10,20,30,1&color=20,110,255,0&index=0');
  assert.equal(feedback.snapshot().defaultColors[1].enabled, false);
  feedback.recordResponse('002', '2550000001,0002550001', 'okay');
  assert.deepEqual(feedback.snapshot().defaultColors, [
    { color: { r: 255, g: 0, b: 0 }, enabled: true },
    { color: { r: 0, g: 255, b: 0 }, enabled: true },
  ]);
  feedback.recordResponse('002', '0000002551', 'error');
  assert.equal(feedback.snapshot().defaultColors.length, 2);
  feedback.fromDevice('201', 'color=1,2,3,1&index=0');
  assert.deepEqual(feedback.snapshot().defaultColors, [{ color: { r: 1, g: 2, b: 3 }, enabled: true }]);
});

// TEMPORARY: these checks belong to the USB investigation flight recorder.
test('temporary USB history remains bounded during sustained traffic and truncates payload samples', () => {
  const { createUsbDiagnostics } = require('../src/electron/usb/diagnostics');
  const recorder = createUsbDiagnostics();
  const payload = 'x'.repeat(10000);
  for (let index = 0; index < 300; index++) {
    const request = recorder.queued('000', 'shortcut');
    recorder.start(request);
    recorder.writeCallback(request);
    recorder.bytes(payload);
    recorder.line(payload, '000', true);
    recorder.complete(request, null, payload);
  }
  const snapshot = recorder.snapshot(true);
  assert.equal(snapshot.recent.length, 48);
  assert.equal(snapshot.counts.rxBytes, 3000000);
  assert.equal(snapshot.counts.replies, 300);
  assert.equal(snapshot.pending, 0);
  assert.equal(snapshot.active, 0);
  assert.deepEqual(snapshot.inFlight, []);
  assert.ok(JSON.stringify(snapshot).length < 20000);
  assert.ok(snapshot.recent.filter(event => event.sample).every(event => event.sample.length <= 128));
  assert.ok(snapshot.recent.filter(event => event.prefixHex).every(event => event.prefixHex.length <= 48));
  assert.equal('recent' in recorder.snapshot(), false, 'normal health summaries omit the event history');
});

test('temporary USB timings distinguish queue wait, missing driver completion and partial input', () => {
  const { createUsbDiagnostics } = require('../src/electron/usb/diagnostics');
  let time = 0;
  const recorder = createUsbDiagnostics({ now: () => time, wallNow: () => 1000 + time });
  const first = recorder.queued('000', 'shortcut');
  const second = recorder.queued('000', 'renderer');
  time = 2;
  recorder.start(first);
  time = 10;
  recorder.bytes(Buffer.from('000:ok'));
  let snapshot = recorder.snapshot();
  assert.equal(snapshot.pending, 2);
  assert.equal(snapshot.waiting, 1);
  assert.equal(snapshot.counts.rxChunks, 1);
  assert.equal(snapshot.counts.lines, 0, 'raw partial input must not masquerade as a parsed response');
  assert.equal(snapshot.inFlight[0].driverCallbackMs, null);
  time = 152;
  recorder.complete(first, new Error('Serial port timed out'));
  time = 160;
  recorder.start(second);
  time = 165;
  recorder.writeCallback(second);
  recorder.line('000:okay', '000', true);
  recorder.complete(second, null, 'okay');
  time = 170;
  recorder.writeCallback(first);
  snapshot = recorder.snapshot(true);
  assert.equal(snapshot.maxQueueWaitMs, 160);
  assert.equal(snapshot.counts.timeouts, 1);
  assert.equal(snapshot.counts.replies, 1);
  const timeout = snapshot.recent.find(event => event.result === 'timeout');
  assert.equal(timeout.responseWaitMs, 150);
  assert.equal(timeout.queueWaitMs, 2);
  assert.equal(timeout.driverCallbackMs, null);
  const late = snapshot.recent.find(event => event.stage === 'write.callback' && event.request === first.id);
  assert.equal(late.afterResult, true);
  assert.equal(late.driverCallbackMs, 168);
});

test('temporary diagnostics capture the failure without changing recovery or flooding logs', async t => {
  const { instances, restore, usb } = loadUsbModule();
  const app = { isQuitting: false };
  const sentEvents = [];
  const logs = [];
  const warnings = [];
  t.mock.method(console, 'log', message => logs.push(message));
  t.mock.method(console, 'warn', message => warnings.push(message));
  t.after(async () => {
    await usb.disconnectUsb(app, { reconnect: false, reason: 'test-cleanup' });
    restore();
  });
  await usb.initializeUsb(createWindow(sentEvents), app, false);
  await waitFor(() => instances[0]?.opening);
  const port = instances[0];
  port.completeOpen();
  await waitFor(() => sentEvents.includes('usb-connected'));
  await usb.readDeviceState('test-baseline');
  assert.equal(port.listenerCount('data'), 1);

  const writesBeforePowerLog = port.writes.length;
  const power = usb.logUsbDiagnostics('os-resume');
  assert.equal(power.attempt, 1);
  assert.equal(power.power.event, 'os-resume');
  assert.ok(power.sinceResumeMs >= 0);
  assert.equal(port.writes.length, writesBeforePowerLog, 'logging power events must not probe USB');

  const write = port.write.bind(port);
  port.write = (data, callback) => {
    if (data.startsWith('000')) {
      port.writes.push(data); // Simulate a driver that never completes the write.
      return false;
    }
    return write(data, callback);
  };
  port.emit('data', Buffer.from('partial reply without CRLF'));
  const results = await Promise.allSettled([
    usb.writeCommand('000', '0100200300.501', 'shortcut'),
    usb.writeCommand('005', '0.501.6', 'renderer'),
    usb.writeCommand('003', ' 1', 'renderer'),
  ]);
  assert.ok(results.every(result => result.status === 'rejected'));
  const snapshots = logs.filter(message => message.startsWith('[USB][Diagnostics] '))
    .map(message => JSON.parse(message.slice('[USB][Diagnostics] '.length)));
  const failures = snapshots.filter(snapshot => snapshot.reason === 'command-failure');
  assert.equal(failures.length, 1, 'multiple failing command codes share a failure-history rate limit');
  const recent = failures[0].transport.recent;
  const outgoing = recent.find(event => event.stage === 'write.begin' && event.command === '000');
  assert.equal(outgoing.bytes, Buffer.byteLength('0000100200300.501\n'));
  assert.equal(outgoing.prefixHex, Buffer.from('0000100200300.501\n').toString('hex'));
  assert.ok(recent.some(event => event.stage === 'write.backpressure' && event.source === 'shortcut'));
  assert.ok(recent.some(event => event.stage === 'rx.bytes' && event.bytes === 26));
  assert.ok(recent.some(event => event.result === 'timeout' && event.command === '000' && event.driverCallbackMs === null));
  assert.ok(warnings.some(message => message.includes('source=shortcut') && message.includes('driverCallbackMs=pending')));
  assert.equal(port.closeCalls, 0, 'this patch must observe the original failure without adding recovery');
  assert.equal(instances.length, 1);
  await usb.disconnectUsb(app, { reconnect: false, reason: 'test-cleanup' });
  assert.equal(port.listenerCount('data'), 0, 'raw-byte listeners must be cleaned up with the connection');
});
