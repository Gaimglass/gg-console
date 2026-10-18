const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const CHECK_TIMEOUT_MS = 60 * 1000;
const DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000;

function errorMessage(error, legacyMessage) {
  return error?.message || legacyMessage || (typeof error === 'string' && error) || 'Unknown updater error';
}

function createUpdateManager({ app, autoUpdater, platform = process.platform, argv = process.argv, logger = console,
  onStatus = () => {}, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout,
  setRecurring = setInterval, clearRecurring = clearInterval }) {
  const supported = app.isPackaged && ['win32', 'darwin'].includes(platform);
  let status = {
    phase: supported ? 'idle' : 'unavailable', currentVersion: app.getVersion(),
    updateAvailable: false, releaseName: '', checkedAt: null, error: '', errorDetails: '', revision: 0,
    message: supported ? '' : 'Automatic updates are available in the installed Windows or macOS app.',
  };
  let pending;
  let timer;
  let interval;
  let startupTimer;
  let nativeRunning = false;
  let nativePhase = 'checking';
  let generation = 0;
  let started = false;
  let disposed = false;
  let installing = false;

  const snapshot = () => ({ ...status });
  function publish(update) {
    status = { ...status, ...update, revision: status.revision + 1 };
    try { onStatus(snapshot()); }
    catch (error) { logger.warn('[Updates] Could not publish status:', errorMessage(error)); }
  }
  function settle(error) {
    clearTimer(timer);
    timer = undefined;
    const request = pending;
    pending = undefined;
    if (error) request?.reject(error);
    else request?.resolve(snapshot());
  }
  function fail(error, legacyMessage) {
    const details = errorMessage(error, legacyMessage);
    nativeRunning = false;
    if (installing) app.isQuitting = installing = false;
    logger.warn('[Updates] Failed:', details);
    publish({ phase: status.updateAvailable ? 'ready' : 'error', error: 'The update request failed. Try again.', errorDetails: details });
    settle(new Error(details));
  }
  function armTimeout() {
    clearTimer(timer);
    const downloading = nativePhase === 'downloading';
    timer = setTimer(() => {
      const message = `The update ${downloading ? 'download' : 'check'} timed out. Try again, or fully exit Gaimglass from the tray menu and reopen it.`;
      logger.warn('[Updates]', message);
      publish({ phase: 'error', error: message, errorDetails: '' });
      // Electron cannot cancel an active native request. Release waiting callers,
      // but let retries join it instead of starting a second download.
      settle(new Error(message));
    }, downloading ? DOWNLOAD_TIMEOUT_MS : CHECK_TIMEOUT_MS);
    timer?.unref?.();
  }
  const listeners = {
    'update-available': () => {
      if (!nativeRunning) return;
      nativePhase = 'downloading';
      logger.log('[Updates] Downloading update');
      publish({ phase: 'downloading', error: '', errorDetails: '' });
      if (pending) armTimeout();
    },
    'update-not-available': () => {
      if (!nativeRunning || status.updateAvailable) return;
      nativeRunning = false;
      logger.log('[Updates] Up to date');
      publish({ phase: 'up-to-date', checkedAt: now(), error: '', errorDetails: '' });
      settle();
    },
    'update-downloaded': (_event, releaseNotes, releaseName) => {
      nativeRunning = false;
      logger.log('[Updates] Ready to install:', releaseName);
      publish({ phase: 'ready', updateAvailable: true, releaseName, releaseNotes, checkedAt: now(), error: '', errorDetails: '' });
      settle();
    },
    error: fail,
  };
  if (supported) for (const [event, listener] of Object.entries(listeners)) autoUpdater.on(event, listener);

  function check() {
    if (disposed) return Promise.reject(new Error('The updater has stopped. Restart Gaimglass to check for updates.'));
    if (!supported || status.updateAvailable) return Promise.resolve(snapshot());
    if (pending) return pending.promise;
    const promise = new Promise((resolve, reject) => { pending = { resolve, reject }; });
    pending.promise = promise;
    if (!nativeRunning) nativePhase = 'checking';
    publish({ phase: nativeRunning ? nativePhase : 'checking', error: '', errorDetails: '' });
    armTimeout();
    if (nativeRunning) return promise;
    nativeRunning = true;
    const run = ++generation;
    const feed = `https://update.electronjs.org/Gaimglass/gg-console/${platform}-${process.arch}/${status.currentVersion}`;
    logger.log('[Updates] Checking:', feed);
    try {
      autoUpdater.setFeedURL({ url: feed });
      const operation = autoUpdater.checkForUpdates();
      // Windows returns a promise; other implementations can return void.
      if (operation?.then) Promise.resolve(operation).then(() => {
        if (!disposed && run === generation && nativeRunning) fail(new Error('The updater finished without reporting a result.'));
      }, error => {
        if (!disposed && run === generation && nativeRunning) fail(error);
      });
    } catch (error) { fail(error); }
    return promise;
  }

  function restart() {
    if (!status.updateAvailable) throw new Error('Download an update before restarting to install it.');
    try {
      installing = app.isQuitting = true;
      autoUpdater.quitAndInstall();
      if (!installing) throw new Error(status.errorDetails);
    } catch (error) {
      if (installing) fail(error);
      throw error;
    }
  }

  function start() {
    if (started || disposed || !supported) return;
    started = true;
    const backgroundCheck = () => { void check().catch(() => {}); };
    // Squirrel holds an installation lock briefly on the first launch.
    if (argv.includes('--squirrel-firstrun')) startupTimer = setTimer(backgroundCheck, 10000);
    else backgroundCheck();
    interval = setRecurring(backgroundCheck, CHECK_INTERVAL_MS);
    interval?.unref?.();
    app.once('before-quit', dispose);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTimer(startupTimer);
    clearRecurring(interval);
    settle(new Error('Gaimglass is shutting down.'));
    if (supported) for (const [event, listener] of Object.entries(listeners)) autoUpdater.removeListener(event, listener);
    app.removeListener('before-quit', dispose);
  }
  return { check, restart, start, dispose, getStatus: snapshot };
}

let manager;
function getManager() {
  if (!manager) {
    const { app, autoUpdater, BrowserWindow } = require('electron');
    manager = createUpdateManager({ app, autoUpdater, logger: require('electron-log/main'), onStatus: status => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('update-status', status);
      }
    } });
  }
  return manager;
}

module.exports = {
  createUpdateManager, CHECK_INTERVAL_MS, CHECK_TIMEOUT_MS, DOWNLOAD_TIMEOUT_MS,
  checkForUpdates: () => getManager().check(),
  getUpdateStatus: () => getManager().getStatus(),
  startUpdateChecks: () => getManager().start(),
  updateAndRestart: () => getManager().restart(),
};
