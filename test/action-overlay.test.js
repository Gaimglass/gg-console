const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { normalizeNotification } = require('../src/electron/overlay/notification');
const { createActionOverlay, DURATION_MS, FADE_MS } = require('../src/electron/overlay');
const { createGameOverlay } = require('../src/electron/overlay/game');
const { isFullscreenLayout, selectGameWindow } = require('../src/electron/overlay/target');
const { attachToWindow } = require('../src/electron/overlay/attachment');
const fullscreenLayout = { bounds: { x: -1920, y: 0, width: 1920, height: 1080 }, monitorBounds: { x: -1920, y: 0, width: 1920, height: 1080 } };

function fakeElectron() {
  const windows = [];
  class BrowserWindow extends EventEmitter {
    constructor(options) {
      super();
      this.id = windows.length + 1;
      this.options = options;
      this.sent = [];
      this.webContents = Object.assign(new EventEmitter(), {
        send: (...args) => this.sent.push(args),
        setFrameRate() {},
        startPainting: () => { this.painting = true; },
        stopPainting: () => { this.painting = false; },
        invalidate() {},
      });
      windows.push(this);
    }
    loadFile() { return Promise.resolve(); }
    setIgnoreMouseEvents(value) { this.ignoresMouse = value; }
    setAlwaysOnTop(...args) { this.onTop = args; }
    setVisibleOnAllWorkspaces() {}
    setPosition(...args) { this.position = args; }
    showInactive() { this.visible = true; this.showCount = (this.showCount || 0) + 1; }
    hide() { this.visible = false; }
    isDestroyed() { return !!this.destroyed; }
    destroy() { this.destroyed = true; this.emit('closed'); }
    getNativeWindowHandle() { return Buffer.alloc(8); }
  }
  return {
    BrowserWindow, windows, app: {},
    screen: {
      getCursorScreenPoint: () => ({ x: -200, y: 100 }),
      getDisplayNearestPoint: () => ({ bounds: { x: -1920, y: 0 }, scaleFactor: 1.5 }),
    },
  };
}

function fakeClock() {
  let now = 0;
  let id = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimer(callback, delay) { timers.set(++id, { callback, at: now + delay }); return id; },
    clearTimer(timer) { timers.delete(timer); },
    tick(ms) {
      const end = now + ms;
      while (true) {
        const entry = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry) break;
        now = entry[1].at;
        timers.delete(entry[0]);
        entry[1].callback();
      }
      now = end;
    },
    get size() { return timers.size; },
  };
}

function gameFixture(options = {}) {
  const electron = fakeElectron();
  const clock = fakeClock();
  const targets = [
    { title: 'First game', hwnd: 123, threadId: 456, processId: process.pid + 1, is64bit: true, graphics: { d3D11: true } },
    { title: 'Another game', hwnd: 789, threadId: 987, processId: process.pid + 2, is64bit: false, graphics: { d3D9: true } },
  ];
  let foreground = 123;
  let layout = fullscreenLayout;
  let callback;
  const calls = [];
  let fallbacks = 0;
  class Overlay {
    setEventCallback(value) { callback = value; }
    start() {}
    stop() {}
    sendCommand() {}
    setScaleFactor() {}
    addWindow(id) { calls.push(['add', id]); }
    closeWindow(id) { calls.push(['close', id]); }
    sendWindowBounds() {}
    sendFrameBuffer() {}
  }
  const native = createGameOverlay({
    ...electron, ...clock,
    loadAddon: () => ({ Overlay, getTopWindows: () => targets }),
    getForegroundWindow: () => foreground,
    getWindowLayout: () => layout,
    onUnavailable: () => { fallbacks++; },
    attach: async () => ({ success: true }),
    ...options,
  });
  return {
    native, electron, clock, targets, calls,
    focus: value => { foreground = value; },
    resize: value => { layout = value; },
    event: (...args) => callback(...args),
    get fallbacks() { return fallbacks; },
  };
}

test('normalizes only supported feedback with bounded display values', () => {
  assert.deepEqual(normalizeNotification({ type: 'brightness', value: 0.655 }), { type: 'brightness', percent: 66 });
  assert.equal(normalizeNotification({ type: 'brightness', value: 5 }).percent, 100);
  assert.equal(normalizeNotification({ type: 'brightness', value: -1 }).percent, 0);
  assert.deepEqual(normalizeNotification({ type: 'power', on: false }), { type: 'power', on: false });
  assert.deepEqual(normalizeNotification({ type: 'color-slot', slot: 3, color: { r: -1, g: 300, b: 24.8 } }), {
    type: 'color-slot', slot: 3, color: { r: 0, g: 255, b: 25 },
  });
  for (const value of [null, {}, { type: 'brightness', value: NaN }, { type: 'power', on: 'yes' }, { type: 'color-slot', slot: 0 }, { type: 'color-slot', slot: 9 }]) {
    assert.equal(normalizeNotification(value), null);
  }
});

test('reuses a click-through, non-focusing window and extends dismissal after the latest change', () => {
  const electron = fakeElectron();
  const clock = fakeClock();
  const overlay = createActionOverlay(electron, { ...clock, platform: 'linux' });
  overlay.show({ type: 'brightness', value: 0.4 });
  const window = electron.windows[0];
  assert.equal(window.visible, undefined);
  window.webContents.emit('did-finish-load');
  assert.equal(window.visible, true);
  assert.equal(window.ignoresMouse, true);
  assert.equal(window.options.focusable, false);
  assert.equal(window.options.webPreferences.sandbox, true);
  assert.deepEqual(window.position, [-1896, 24, false]);
  clock.tick(2000);
  overlay.show({ type: 'brightness', value: 0.65 });
  assert.equal(electron.windows.length, 1);
  assert.deepEqual(window.sent.at(-1), ['action-overlay:show', { type: 'brightness', percent: 65 }]);
  clock.tick(DURATION_MS - 1);
  assert.equal(window.visible, true);
  clock.tick(1);
  assert.deepEqual(window.sent.at(-1), ['action-overlay:hide']);
  clock.tick(FADE_MS);
  assert.equal(window.visible, false);
  overlay.dispose();
  assert.equal(window.destroyed, true);
  assert.equal(clock.size, 0);
});

test('desktop reloads restore only the latest active notification', () => {
  const electron = fakeElectron();
  const overlay = createActionOverlay(electron, { ...fakeClock(), platform: 'linux' });
  overlay.show({ type: 'brightness', value: 0.6 });
  const window = electron.windows[0];
  window.webContents.emit('did-finish-load');
  window.webContents.emit('did-start-loading');
  const sentBeforeReload = window.sent.length;
  overlay.show({ type: 'power', on: false });
  assert.equal(window.sent.length, sentBeforeReload);
  window.webContents.emit('did-finish-load');
  assert.deepEqual(window.sent.at(-1), ['action-overlay:show', { type: 'power', on: false }]);
  overlay.configure({ enabled: false });
  const sentWhenDisabled = window.sent.length;
  window.webContents.emit('did-start-loading');
  window.webContents.emit('did-finish-load');
  assert.equal(window.sent.length, sentWhenDisabled);
  assert.equal(window.visible, false);
  overlay.dispose();
});

test('expired, disabled and quitting feedback cannot appear after a slow load', () => {
  const electron = fakeElectron();
  const clock = fakeClock();
  const overlay = createActionOverlay(electron, { ...clock, platform: 'linux' });
  overlay.show({ type: 'power', on: true });
  clock.tick(DURATION_MS + FADE_MS);
  electron.windows[0].webContents.emit('did-finish-load');
  assert.equal(electron.windows[0].showCount, undefined);
  overlay.show({ type: 'power', on: false });
  overlay.configure({ enabled: false });
  assert.equal(electron.windows[0].visible, false);
  assert.equal(overlay.show({ type: 'power', on: true }), false);
  overlay.configure({ enabled: true });
  electron.app.isQuitting = true;
  assert.equal(overlay.show({ type: 'power', on: true }), false);
  overlay.dispose();
});

test('native game feedback takes priority and disabled native feedback uses the desktop', () => {
  const electron = fakeElectron();
  const clock = fakeClock();
  const calls = [];
  const native = {
    show: value => { calls.push(value); return true; },
    hide: () => calls.push('hide'), fade: () => calls.push('fade'), dispose: () => calls.push('dispose'),
  };
  const overlay = createActionOverlay(electron, { ...clock, platform: 'win32', nativeFactory: () => native });
  overlay.show({ type: 'power', on: false });
  assert.equal(electron.windows.length, 0);
  clock.tick(DURATION_MS + FADE_MS);
  assert.deepEqual(calls.slice(-2), ['fade', 'hide']);
  overlay.configure({ fullscreenGames: false });
  overlay.show({ type: 'power', on: true });
  assert.equal(overlay.status().diagnostic.reason, 'native-disabled');
  assert.equal(electron.windows.length, 1);
  overlay.dispose();
  assert.equal(calls.at(-1), 'dispose');
});

test('an unavailable native backend falls back to desktop feedback', t => {
  t.mock.method(console, 'warn', () => {});
  const electron = fakeElectron();
  const overlay = createActionOverlay(electron, {
    ...fakeClock(), platform: 'win32', nativeFactory: () => { throw new Error('Native module unavailable'); },
  });
  assert.equal(overlay.show({ type: 'brightness', value: 0.5 }), true);
  assert.equal(electron.windows.length, 1);
  overlay.dispose();
});

test('overlay diagnostics identify the loaded backend and preserve the native fallback reason', () => {
  const logs = [];
  const overlay = createActionOverlay(fakeElectron(), {
    ...fakeClock(), platform: 'win32', logger: { log: (...args) => logs.push(args), warn() {} },
    nativeFactory: options => ({
      show() { options.onDiagnostic({ reason: 'not-fullscreen', foreground: 123 }); return false; },
      hide() {}, dispose() {},
    }),
  });
  overlay.show({ type: 'power', on: true });
  const status = overlay.status();
  assert.equal(status.revision, 'fullscreen-v2');
  assert.deepEqual(status.diagnostic, { reason: 'not-fullscreen', foreground: 123 });
  assert.ok(logs.some(args => args[0].includes('route=desktop')));
  overlay.dispose();
});

test('game selection is independent of titles and supports both architectures and implemented graphics APIs', () => {
  const window = { title: 'Any game', hwnd: 123, threadId: 456, processId: process.pid + 1, is64bit: true, graphics: { d3D11: true } };
  for (const title of ['Titanfall 2', 'DOOM', '\u30b2\u30fc\u30e0', '', null]) {
    for (const graphics of [{ d3D9: true }, { d3D11: true }, { opengl: true }]) {
      for (const is64bit of [false, true]) {
        const candidate = { ...window, title, graphics, is64bit };
        assert.equal(selectGameWindow([candidate], 123), candidate);
      }
    }
  }
  for (const change of [{ hwnd: 999 }, { processId: process.pid }, { graphics: { d3D12: true } }, { graphics: { vulkan: true } }, { threadId: 0 }]) {
    assert.equal(selectGameWindow([{ ...window, ...change }], 123), null);
  }
  assert.equal(selectGameWindow([window], 123, [window.processId]), null, 'own app subprocesses stay excluded');
});

test('fullscreen detection uses the complete client area on its monitor rather than maximized work area', () => {
  assert.equal(isFullscreenLayout(fullscreenLayout), true);
  assert.equal(isFullscreenLayout({ ...fullscreenLayout, bounds: { x: -1919, y: 1, width: 1918, height: 1078 } }), true);
  assert.equal(isFullscreenLayout({ ...fullscreenLayout, bounds: { x: -1920, y: 0, width: 1920, height: 1040 } }), false);
  assert.equal(isFullscreenLayout({ ...fullscreenLayout, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }), false);
  assert.equal(isFullscreenLayout({ ...fullscreenLayout, bounds: { x: -1920, y: 0, width: NaN, height: 1080 } }), false);
  assert.equal(isFullscreenLayout(null), false);
});

test('native overlay sends frames, preserves game input, reuses an attachment and closes expired surfaces', async t => {
  t.mock.method(console, 'log', () => {});
  const electron = fakeElectron();
  const target = { title: 'Any game', hwnd: 123, threadId: 456, processId: process.pid + 1, is64bit: true, graphics: { d3D11: true } };
  const calls = [];
  let callback;
  class Overlay {
    setEventCallback(value) { callback = value; }
    start() { calls.push('start'); }
    stop() { calls.push('stop'); }
    sendCommand(command) { calls.push(command); }
    setScaleFactor() {}
    addWindow(id, details) { calls.push(['add', id, details.rect]); }
    closeWindow(id) { calls.push(['close', id]); }
    sendWindowBounds() {}
    sendFrameBuffer(id, buffer, width, height) { calls.push(['frame', id, buffer.length, width, height]); }
  }
  let attempts = 0;
  let foreground = 123;
  const native = createGameOverlay({
    ...electron, ...fakeClock(), getForegroundWindow: () => foreground, getWindowLayout: () => fullscreenLayout,
    loadAddon: () => ({ Overlay, getTopWindows: () => [target] }),
    attach: async window => {
      assert.equal(window, target);
      attempts++;
      return { success: true };
    },
  });
  assert.equal(native.show({ type: 'power', on: true }), true);
  await Promise.resolve();
  const window = electron.windows[0];
  window.webContents.emit('did-finish-load');
  callback('game.process', { processId: target.processId });
  assert.ok(calls.filter(call => call?.command === 'input.intercept').every(call => call.intercept === false));
  window.webContents.emit('paint', {}, {}, { getSize: () => ({ width: 316, height: 112 }), getBitmap: () => Buffer.alloc(4) });
  assert.deepEqual(calls.at(-1), ['frame', 1, 4, 316, 112]);
  assert.equal(native.show({ type: 'power', on: false }), true);
  assert.equal(attempts, 1);
  foreground = 456;
  assert.equal(native.show({ type: 'power', on: false }), false, 'background games use desktop feedback');
  foreground = 123;
  native.hide();
  assert.equal(window.painting, false);
  assert.deepEqual(calls.at(-1), ['close', 1]);
  native.show({ type: 'power', on: true });
  assert.equal(calls.filter(call => call[0] === 'add').length, 2);
  native.dispose();
  assert.equal(window.destroyed, true);
  assert.equal(calls.at(-1), 'stop');
});

test('native renderer reloads restore active feedback without restoring dismissed feedback', async t => {
  t.mock.method(console, 'log', () => {});
  const { native, electron, clock } = gameFixture();
  native.show({ type: 'brightness', percent: 60 });
  await Promise.resolve();
  const window = electron.windows[0];
  window.webContents.emit('did-finish-load');
  window.webContents.emit('did-start-loading');
  const sentBeforeReload = window.sent.length;
  native.show({ type: 'power', on: false });
  assert.equal(window.sent.length, sentBeforeReload);
  window.webContents.emit('did-finish-load');
  assert.deepEqual(window.sent.at(-1), ['action-overlay:show', { type: 'power', on: false }]);
  native.hide();
  const sentWhenHidden = window.sent.length;
  window.webContents.emit('did-start-loading');
  window.webContents.emit('did-finish-load');
  assert.equal(window.sent.length, sentWhenHidden);
  assert.equal(window.painting, false);
  native.dispose();
  assert.equal(clock.size, 0);
});

test('asynchronous game attachment failure falls back without extending expired feedback', () => {
  const electron = fakeElectron();
  const clock = fakeClock();
  let fail;
  const native = { show: () => true, hide() {}, fade() {}, dispose() {} };
  const overlay = createActionOverlay(electron, { ...clock, platform: 'win32', nativeFactory: options => { fail = options.onUnavailable; return native; } });
  overlay.show({ type: 'power', on: true });
  fail();
  assert.equal(electron.windows.length, 1);
  electron.windows[0].webContents.emit('did-finish-load');
  assert.equal(electron.windows[0].visible, true);
  clock.tick(DURATION_MS + FADE_MS);
  fail();
  assert.equal(electron.windows[0].visible, false);
  overlay.dispose();
});

test('an earlier game attachment failure does not dismiss the active game and focus changes hide its surface', async t => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  const pending = new Map();
  const fixture = gameFixture({ attach: value => new Promise(resolve => pending.set(value.processId, resolve)) });
  const { native, targets, clock, electron } = fixture;
  native.show({ type: 'power', on: true });
  electron.windows[0].webContents.emit('did-finish-load');
  fixture.focus(targets[1].hwnd);
  native.show({ type: 'brightness', percent: 65 });
  pending.get(targets[0].processId)({ success: false, error: 'blocked' });
  await Promise.resolve();
  assert.equal(fixture.fallbacks, 0);
  assert.equal(electron.windows[0].painting, true);
  pending.get(targets[1].processId)({ success: true });
  await Promise.resolve();
  fixture.event('client.connect', { pid: targets[1].processId });
  clock.tick(8000);
  assert.equal(fixture.fallbacks, 0, 'a confirmed connection cancels its timeout');
  fixture.focus(999);
  clock.tick(250);
  assert.equal(fixture.fallbacks, 1);
  assert.equal(electron.windows[0].painting, false);
  native.dispose();
  assert.equal(clock.size, 0);
});

test('a windowed application never loads the game addon, and resizing out of fullscreen dismisses a card', async t => {
  t.mock.method(console, 'log', () => {});
  const fixture = gameFixture();
  fixture.resize({ ...fullscreenLayout, bounds: { ...fullscreenLayout.bounds, height: 1040 } });
  assert.equal(fixture.native.show({ type: 'power', on: true }), false);
  assert.equal(fixture.electron.windows.length, 0);
  fixture.resize(fullscreenLayout);
  fixture.native.show({ type: 'power', on: true });
  await Promise.resolve();
  fixture.electron.windows[0].webContents.emit('did-finish-load');
  fixture.event('client.connect', { pid: fixture.targets[0].processId });
  fixture.resize({ ...fullscreenLayout, bounds: { ...fullscreenLayout.bounds, height: 1040 } });
  fixture.clock.tick(250);
  assert.equal(fixture.fallbacks, 1);
  assert.equal(fixture.electron.windows[0].painting, false);
  fixture.native.dispose();
});

test('the helper uses the target architecture and window thread without a shell and reports failure', async () => {
  for (const is64bit of [true, false]) {
    const architecture = is64bit ? 'x64' : 'x86';
    const result = await attachToWindow({ processId: 123, threadId: 456, is64bit }, {
      resolveBinary: filename => `unpacked/${filename}`,
      run(file, args, options, done) {
        assert.equal(file, `unpacked/injector-helper.${architecture}.exe`);
        assert.deepEqual(args, ['123', '456', `unpacked/overlay.${architecture}.dll`]);
        assert.equal(options.windowsHide, true);
        assert.equal(options.shell, undefined);
        done(new Error('helper failed'), '', 'Could not attach');
      },
    });
    assert.deepEqual(result, { success: false, error: 'Could not attach' });
  }
});

test('saved Titanfall setting migrates to generalized fullscreen settings without losing an opt-out', async () => {
  const { normalizeOverlaySettings } = await import('../src/normalizeOverlaySettings.mjs');
  assert.deepEqual(normalizeOverlaySettings(), { enabled: true, fullscreenGames: true });
  assert.deepEqual(normalizeOverlaySettings({ enabled: false, titanfall2: false }), { enabled: false, fullscreenGames: false });
  assert.equal(normalizeOverlaySettings({ fullscreenGames: true, titanfall2: false }).fullscreenGames, true);
});

test('failed USB writes produce no feedback, and background writes stay quiet', async t => {
  const uiPath = require.resolve('../src/electron/events/ui');
  const listeners = new Map();
  const feedback = [];
  let rejectWrite = false;
  const write = async () => { if (rejectWrite) throw new Error('USB disconnected'); return 'okay'; };
  const replacements = [
    [require.resolve('electron'), { ipcMain: { on: (key, cb) => listeners.set(key, cb), handle() {} } }],
    [require.resolve('../src/electron/usb/serial-commands'), { setMainLED: write, setDefaultIndex: write }],
    [require.resolve('../src/electron/usb/usb'), {}],
    [require.resolve('../src/electron/updates'), {}],
    [require.resolve('../src/electron/calibrateWindow'), {}],
    [require.resolve('../src/electron/events/shortcuts'), {}],
    [require.resolve('../src/electron/events/mouse'), {}],
    [require.resolve('../src/electron/overlay'), { showActionOverlay: value => feedback.push(value) }],
  ];
  const originals = replacements.map(([id]) => require.cache[id]);
  replacements.forEach(([id, exports]) => { require.cache[id] = { id, filename: id, loaded: true, exports }; });
  delete require.cache[uiPath];
  t.after(() => {
    delete require.cache[uiPath];
    replacements.forEach(([id], index) => {
      if (originals[index]) require.cache[id] = originals[index];
      else delete require.cache[id];
    });
  });
  require(uiPath).registerUIEvents({}, {}, true);
  const state = { color: { r: 20, g: 110, b: 255 }, brightness: 0.65, ledOn: true };
  await listeners.get('set-led-state')({}, state);
  assert.equal(feedback.length, 0);
  await listeners.get('set-led-state')({}, { ...state, feedback: 'brightness' });
  await listeners.get('set-led-state')({}, { ...state, ledOn: false, feedback: 'power' });
  await listeners.get('set-default-index')({}, 2, state.color);
  assert.deepEqual(feedback, [
    { type: 'brightness', value: 0.65 }, { type: 'power', on: false }, { type: 'color-slot', slot: 3, color: state.color },
  ]);
  rejectWrite = true;
  const event = {};
  await listeners.get('set-led-state')(event, { ...state, feedback: 'brightness' });
  await listeners.get('set-default-index')({}, 3, state.color);
  assert.equal(feedback.length, 3);
  assert.match(event.returnValue.message, /disconnected/);
});
