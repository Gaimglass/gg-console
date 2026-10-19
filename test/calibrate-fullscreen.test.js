const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { createCalibrationFullscreenController, initializeCalibrationFullscreen } = require('../src/electron/calibrateFullscreen');

function fixture() {
  const window = new EventEmitter();
  const originalBounds = { x: 120, y: 80, width: 720, height: 585 };
  let bounds = { ...originalBounds };
  let fullscreen = false;
  let resizable = false;
  let insideNativeTransition = false;
  const requests = [];
  const notifications = [];
  Object.assign(window, {
    webContents: { isDestroyed: () => false, send: (...args) => notifications.push(args) },
    isDestroyed: () => !!window.destroyed,
    isFullScreen: () => fullscreen,
    isResizable: () => resizable,
    setResizable: value => {
      assert.equal(insideNativeTransition, false, 'resize constraints must wait for the native transition to finish');
      resizable = value;
    },
    isMinimized: () => !!window.minimized,
    restore: () => { window.minimized = false; },
    getNormalBounds: () => ({ ...bounds }),
    setBounds: value => {
      assert.equal(insideNativeTransition, false, 'bounds must not be restored inside the native fullscreen event');
      bounds = { ...value };
    },
    setFullScreen: value => requests.push(value),
    setSkipTaskbar: value => { window.skipTaskbar = value; },
    show: () => { window.visible = true; },
    focus: () => { window.focused = true; },
  });
  function complete(value) {
    // Windows notifies Electron before Chromium applies the fullscreen resize.
    insideNativeTransition = true;
    window.emit(value ? 'enter-full-screen' : 'leave-full-screen');
    fullscreen = value;
    bounds = value
      ? { x: 0, y: 0, width: resizable ? 1920 : originalBounds.width, height: resizable ? 1080 : originalBounds.height }
      : { ...originalBounds };
    insideNativeTransition = false;
  }
  return { window, originalBounds, requests, notifications, complete, get bounds() { return bounds; } };
}

const nativeTransitionFinished = () => new Promise(resolve => setImmediate(resolve));

test('fullscreen changes the existing window and restores its exact normal bounds on exit', async () => {
  const f = fixture();
  const controller = createCalibrationFullscreenController(f.window);
  controller.toggle();
  assert.deepEqual(f.requests, [true]);
  assert.deepEqual(f.notifications, []);
  f.complete(true);
  assert.deepEqual(f.notifications, []);
  await nativeTransitionFinished();
  assert.deepEqual(f.notifications, [['calibrate-fullscreen-changed', true]]);
  controller.exit();
  assert.deepEqual(f.requests, [true, false]);
  f.complete(false);
  await nativeTransitionFinished();
  assert.deepEqual(f.bounds, f.originalBounds);
  assert.equal(f.window.isResizable(), false);
  assert.deepEqual(f.notifications.at(-1), ['calibrate-fullscreen-changed', false]);
});

test('a shortcut restores, shows, and focuses the same window when it was hidden or minimized', () => {
  const f = fixture();
  f.window.minimized = true;
  f.window.skipTaskbar = true;
  createCalibrationFullscreenController(f.window).toggle();
  assert.equal(f.window.minimized, false);
  assert.equal(f.window.skipTaskbar, false);
  assert.equal(f.window.visible, true);
  assert.equal(f.window.focused, true);
});

test('native events may fire before isFullScreen() changes without repeating the transition', async () => {
  const f = fixture();
  const controller = createCalibrationFullscreenController(f.window);
  controller.toggle();
  f.window.emit('enter-full-screen');
  assert.deepEqual(f.requests, [true]);
  controller.exit();
  assert.deepEqual(f.requests, [true]);
  await nativeTransitionFinished();
  assert.deepEqual(f.requests, [true, false]);
  f.complete(false);
  await nativeTransitionFinished();
});

test('rapid toggles wait for native transitions and preserve the final requested mode', async () => {
  const f = fixture();
  const controller = createCalibrationFullscreenController(f.window);
  controller.toggle();
  controller.toggle();
  assert.deepEqual(f.requests, [true]);
  f.complete(true);
  await nativeTransitionFinished();
  assert.deepEqual(f.requests, [true, false]);
  controller.toggle();
  f.complete(false);
  await nativeTransitionFinished();
  assert.deepEqual(f.bounds, f.originalBounds);
  assert.deepEqual(f.requests, [true, false, true]);
  f.complete(true);
  await nativeTransitionFinished();
  controller.exit();
  f.complete(false);
  await nativeTransitionFinished();
  assert.deepEqual(f.bounds, f.originalBounds);
});

test('native exit updates React and leaves the next calibration toggle ready to enter', async () => {
  const f = fixture();
  const controller = createCalibrationFullscreenController(f.window);
  controller.toggle();
  f.complete(true);
  await nativeTransitionFinished();
  f.complete(false);
  await nativeTransitionFinished();
  assert.deepEqual(f.bounds, f.originalBounds);
  controller.toggle();
  assert.deepEqual(f.requests, [true, true]);
});

test('every reopening fills the monitor while windowed resizing stays locked after each exit', async () => {
  const f = fixture();
  const controller = createCalibrationFullscreenController(f.window);
  for (let i = 0; i < 10; i++) {
    assert.equal(f.window.isResizable(), false);
    controller.toggle();
    f.complete(true);
    await nativeTransitionFinished();
    assert.deepEqual(f.bounds, { x: 0, y: 0, width: 1920, height: 1080 });
    controller.exit();
    f.complete(false);
    await nativeTransitionFinished();
    assert.deepEqual(f.bounds, f.originalBounds);
    assert.equal(f.window.isResizable(), false);
  }
});

test('a window destroyed during transition does not receive a deferred notification', async () => {
  const f = fixture();
  const controller = createCalibrationFullscreenController(f.window);
  controller.toggle();
  f.complete(true);
  f.window.destroyed = true;
  await nativeTransitionFinished();
  assert.deepEqual(f.notifications, []);
});

test('controller initialization binds native fullscreen events once and destroyed windows stay quiet', () => {
  const f = fixture();
  const controller = initializeCalibrationFullscreen(f.window);
  assert.equal(initializeCalibrationFullscreen(f.window), controller);
  assert.equal(f.window.listenerCount('enter-full-screen'), 1);
  assert.equal(f.window.listenerCount('leave-full-screen'), 1);
  f.window.destroyed = true;
  controller.toggle();
  controller.exit();
  assert.deepEqual(f.requests, []);
});
