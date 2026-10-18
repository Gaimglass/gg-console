const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { createUpdateManager, CHECK_INTERVAL_MS, CHECK_TIMEOUT_MS, DOWNLOAD_TIMEOUT_MS } = require('../src/electron/updates');

function clock() {
  let now = 1000;
  let id = 0;
  const timers = new Map();
  const add = (callback, delay, repeat = false) => { timers.set(++id, { callback, delay, at: now + delay, repeat }); return id; };
  return {
    now: () => now,
    setTimer: (callback, delay) => add(callback, delay),
    clearTimer: timer => timers.delete(timer),
    setRecurring: (callback, delay) => add(callback, delay, true),
    clearRecurring: timer => timers.delete(timer),
    tick(ms) {
      const end = now + ms;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [key, timer] = next;
        now = timer.at;
        if (timer.repeat) timer.at += timer.delay;
        else timers.delete(key);
        timer.callback();
      }
      now = end;
    },
    get size() { return timers.size; },
  };
}

function fixture(t, overrides = {}) {
  const app = Object.assign(new EventEmitter(), { isPackaged: true, isQuitting: false, getVersion: () => '1.6.2' });
  const autoUpdater = new EventEmitter();
  const calls = [];
  autoUpdater.setFeedURL = value => calls.push(['feed', value]);
  autoUpdater.checkForUpdates = () => { calls.push(['check']); };
  autoUpdater.quitAndInstall = () => calls.push(['install']);
  const time = clock();
  const statuses = [];
  const warnings = [];
  const manager = createUpdateManager({ app, autoUpdater, platform: 'win32', argv: [], ...time,
    onStatus: status => statuses.push(status), logger: { log() {}, warn: (...args) => warnings.push(args) }, ...overrides });
  t.after(() => manager.dispose());
  return { app, autoUpdater, manager, calls, statuses, warnings, time, checks: () => calls.filter(([name]) => name === 'check').length };
}

test('overlapping callers share one check and download, then reuse the ready result', async t => {
  const f = fixture(t);
  const first = f.manager.check();
  assert.equal(f.manager.check(), first);
  assert.equal(f.checks(), 1);
  assert.deepEqual(f.calls[0], ['feed', { url: `https://update.electronjs.org/Gaimglass/gg-console/win32-${process.arch}/1.6.2` }]);
  assert.equal(f.manager.getStatus().phase, 'checking');
  f.autoUpdater.emit('update-available');
  assert.equal(f.manager.getStatus().phase, 'downloading');
  assert.equal(f.manager.check(), first);
  f.autoUpdater.emit('update-downloaded', {}, 'Release notes', '1.6.3');
  assert.equal((await first).releaseName, '1.6.3');
  assert.equal((await f.manager.check()).updateAvailable, true);
  assert.equal(f.checks(), 1);
  assert.equal(f.time.size, 0);
  f.autoUpdater.emit('update-not-available');
  assert.equal(f.manager.getStatus().phase, 'ready');
});

test('up-to-date checks record their completion time and can run again', async t => {
  const f = fixture(t);
  const first = f.manager.check();
  f.time.tick(20);
  f.autoUpdater.emit('update-not-available');
  assert.equal((await first).checkedAt, f.time.now());
  const snapshot = f.manager.getStatus();
  snapshot.phase = 'ready';
  assert.equal(f.manager.getStatus().phase, 'up-to-date');
  const second = f.manager.check();
  assert.equal(f.checks(), 2);
  f.autoUpdater.emit('update-not-available');
  await second;
  assert.equal(f.time.size, 0);
});

test('errors with either event signature are visible, logged, and allow retry', async t => {
  const f = fixture(t);
  for (const args of [[new Error('DNS failed')], [{}, 'Legacy failure'], ['String failure'], [{}]]) {
    const failed = assert.rejects(f.manager.check());
    f.autoUpdater.emit('error', ...args);
    await failed;
    assert.equal(f.manager.getStatus().phase, 'error');
    assert.ok(f.manager.getStatus().errorDetails);
    assert.ok(f.warnings.length);
    assert.equal(f.time.size, 0);
  }
  const retry = f.manager.check();
  f.autoUpdater.emit('update-not-available');
  assert.equal((await retry).error, '');
  assert.equal(f.autoUpdater.listenerCount('error'), 1);
});

test('synchronous setup and check failures release callers without leaving a lock', async t => {
  for (const method of ['setFeedURL', 'checkForUpdates']) {
    const f = fixture(t);
    const original = f.autoUpdater[method];
    f.autoUpdater[method] = () => { throw new Error('Startup failed'); };
    await assert.rejects(f.manager.check(), /Startup failed/);
    f.autoUpdater[method] = original;
    const retry = f.manager.check();
    f.autoUpdater.emit('update-not-available');
    assert.equal((await retry).phase, 'up-to-date');
    assert.equal(f.time.size, 0);
  }
});

test('rejected native promises and completion without a terminal event both recover', async t => {
  const f = fixture(t);
  for (const operation of [() => Promise.reject(new Error('Native rejection')), () => Promise.resolve()]) {
    f.autoUpdater.checkForUpdates = operation;
    await assert.rejects(f.manager.check());
    assert.equal(f.manager.getStatus().phase, 'error');
    assert.equal(f.time.size, 0);
  }
  f.autoUpdater.checkForUpdates = () => {};
  const retry = f.manager.check();
  f.autoUpdater.emit('update-not-available');
  await retry;
});

test('timeouts release callers; retries join a still-running native operation without duplicating it', async t => {
  const f = fixture(t);
  const first = f.manager.check();
  const failed = assert.rejects(first, /check timed out/);
  f.time.tick(CHECK_TIMEOUT_MS);
  await failed;
  assert.equal(f.manager.getStatus().phase, 'error');
  assert.equal(f.time.size, 0);
  const retry = f.manager.check();
  assert.notEqual(retry, first);
  assert.equal(f.manager.check(), retry);
  assert.equal(f.checks(), 1);
  f.autoUpdater.emit('update-available');
  f.autoUpdater.emit('update-downloaded', {}, '', '1.6.3');
  assert.equal((await retry).phase, 'ready');
});

test('downloads have a longer timeout and late successful downloads remain available', async t => {
  const f = fixture(t);
  const failed = assert.rejects(f.manager.check(), /download timed out/);
  f.autoUpdater.emit('update-available');
  f.time.tick(DOWNLOAD_TIMEOUT_MS - 1);
  assert.equal(f.manager.getStatus().phase, 'downloading');
  f.time.tick(1);
  await failed;
  f.autoUpdater.emit('update-downloaded', {}, '', '1.6.3');
  assert.equal((await f.manager.check()).releaseName, '1.6.3');
  assert.equal(f.checks(), 1);
});

test('an earlier native promise cannot fail a later check', async t => {
  const f = fixture(t);
  let rejectEarlier;
  f.autoUpdater.checkForUpdates = () => new Promise((_resolve, reject) => { rejectEarlier = reject; });
  const earlier = f.manager.check();
  f.autoUpdater.emit('update-not-available');
  await earlier;
  f.autoUpdater.checkForUpdates = () => {};
  const later = f.manager.check();
  rejectEarlier(new Error('Late rejection'));
  await Promise.resolve();
  assert.equal(f.manager.getStatus().phase, 'checking');
  f.autoUpdater.emit('update-not-available');
  await later;
});

test('background scheduling runs independently of a renderer and stops on shutdown', async t => {
  const f = fixture(t);
  f.manager.start();
  f.manager.start();
  assert.equal(f.checks(), 1);
  f.autoUpdater.emit('update-not-available');
  f.time.tick(CHECK_INTERVAL_MS);
  assert.equal(f.checks(), 2);
  f.autoUpdater.emit('update-not-available');
  f.app.emit('before-quit');
  assert.equal(f.time.size, 0);
  assert.equal(f.autoUpdater.listenerCount('error'), 0);
  await assert.rejects(f.manager.check(), /stopped/);
});

test('the first Squirrel launch delays its automatic check until the installation lock can clear', t => {
  const f = fixture(t, { argv: ['--squirrel-firstrun'] });
  f.manager.start();
  f.time.tick(9999);
  assert.equal(f.checks(), 0);
  f.time.tick(1);
  assert.equal(f.checks(), 1);
  f.autoUpdater.emit('update-not-available');
});

test('development and unsupported platforms explain why native updates are unavailable', async t => {
  for (const overrides of [{ app: Object.assign(new EventEmitter(), { isPackaged: false, getVersion: () => '1.6.2' }) }, { platform: 'linux', autoUpdater: undefined }]) {
    const f = fixture(t, overrides);
    f.manager.start();
    const result = await f.manager.check();
    assert.equal(result.phase, 'unavailable');
    assert.match(result.message, /installed/);
    assert.equal(f.checks(), 0);
    assert.equal(f.time.size, 0);
  }
});

test('installation requires a downloaded update and an installation error preserves it for retry', async t => {
  const f = fixture(t);
  assert.throws(() => f.manager.restart(), /Download an update/);
  assert.equal(f.app.isQuitting, false);
  const check = f.manager.check();
  f.autoUpdater.emit('update-downloaded', {}, '', '1.6.3');
  await check;
  f.autoUpdater.quitAndInstall = () => { throw new Error('Install failed'); };
  assert.throws(() => f.manager.restart(), /Install failed/);
  assert.equal(f.app.isQuitting, false);
  assert.equal(f.manager.getStatus().updateAvailable, true);
  f.autoUpdater.quitAndInstall = () => f.autoUpdater.emit('error', new Error('Restart failed'));
  assert.throws(() => f.manager.restart(), /Restart failed/);
  assert.equal(f.app.isQuitting, false);
  f.autoUpdater.quitAndInstall = () => {};
  f.manager.restart();
  assert.equal(f.app.isQuitting, true);
});
