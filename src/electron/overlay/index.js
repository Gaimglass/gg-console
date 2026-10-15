const path = require('node:path');
const { normalizeNotification } = require('./notification');
const { createGameOverlay } = require('./game');
const { loadOverlayPage } = require('./page');
const DURATION_MS = 2500;
const FADE_MS = 160;

function createActionOverlay(electron, { setTimer = setTimeout, clearTimer = clearTimeout, nativeFactory = createGameOverlay, platform = process.platform, logger = console } = {}) {
  const { BrowserWindow, screen, app } = electron;
  let settings = { enabled: true, fullscreenGames: true };
  let window;
  let ready = false;
  let latest = null;
  let usingGame = false;
  let native;
  let hideTimer;
  let fadeTimer;
  let diagnostic = { reason: 'not-requested' };
  let lastRoute;

  function reportRoute(route) {
    const key = `${route}:${diagnostic.reason}`;
    if (key === lastRoute) return;
    lastRoute = key;
    logger.log(`[OSD] display route=${route}; reason=${diagnostic.reason}; backend=fullscreen-v2; pid=${process.pid}`);
  }

  function clearTimers() {
    if (hideTimer) clearTimer(hideTimer);
    if (fadeTimer) clearTimer(fadeTimer);
    hideTimer = fadeTimer = null;
  }

  function displayDesktop() {
    if (!ready || !latest || usingGame || !window || window.isDestroyed() || app.isQuitting) return;
    const { bounds } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    window.setPosition(bounds.x + 24, bounds.y + 24, false);
    window.webContents.send('action-overlay:show', latest);
    window.showInactive();
  }

  function createDesktop() {
    window = new BrowserWindow({
      width: 316, height: 112, show: false, frame: false, transparent: true,
      alwaysOnTop: true, focusable: false, skipTaskbar: true, hasShadow: false,
      resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
      webPreferences: { preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false },
    });
    window.setIgnoreMouseEvents(true);
    window.setAlwaysOnTop(true, 'screen-saver');
    if (platform === 'darwin') window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    const createdWindow = window;
    window.webContents.on('did-start-loading', () => { ready = false; });
    window.webContents.on('did-finish-load', () => {
      if (window !== createdWindow || createdWindow.isDestroyed()) return;
      ready = true;
      displayDesktop();
    });
    window.on('closed', () => { window = null; ready = false; });
    void loadOverlayPage(window, { watch: app.isPackaged === false, logger }).catch(error => logger.warn('[OSD] could not load feedback:', error.message));
  }

  function hide() {
    latest = null;
    usingGame = false;
    native?.fade();
    if (ready && window && !window.isDestroyed()) window.webContents.send('action-overlay:hide');
    fadeTimer = setTimer(() => {
      if (window && !window.isDestroyed()) window.hide();
      native?.hide();
    }, FADE_MS);
  }

  function dismiss() {
    clearTimers();
    latest = null;
    usingGame = false;
    native?.hide();
    if (window && !window.isDestroyed()) window.hide();
  }

  function fallbackToDesktop() {
    if (!latest || !usingGame || !settings.enabled || app.isQuitting) return;
    usingGame = false;
    reportRoute('desktop-fallback');
    native?.hide();
    if (!window || window.isDestroyed()) createDesktop();
    displayDesktop();
  }

  function dispose() {
    dismiss();
    try { native?.dispose(); }
    finally {
      native = null;
      if (window && !window.isDestroyed()) window.destroy();
      window = null;
      ready = false;
    }
  }

  return {
    configure(value = {}) {
      settings = { enabled: value.enabled !== false, fullscreenGames: (value.fullscreenGames ?? value.titanfall2) !== false };
      if (!settings.enabled) dismiss();
      else if (!settings.fullscreenGames) {
        native?.hide();
        fallbackToDesktop();
      }
    },
    show(value) {
      const notification = normalizeNotification(value);
      if (!notification || !settings.enabled || app.isQuitting) return false;
      clearTimers();
      latest = notification;
      usingGame = false;
      let inGame = false;
      if (settings.fullscreenGames && platform === 'win32') {
        try {
          native ||= nativeFactory({ ...electron, logger, onDiagnostic: value => { diagnostic = value; }, onUnavailable: fallbackToDesktop });
          inGame = native.show(notification);
        } catch (error) {
          diagnostic = { reason: 'native-error', error: error.message };
          logger.warn('[OSD] game feedback failed; using desktop:', error.message);
        }
      } else diagnostic = { reason: platform === 'win32' ? 'native-disabled' : 'unsupported-platform' };
      if (inGame) {
        reportRoute('native-game');
        usingGame = true;
        if (window && !window.isDestroyed()) window.hide();
      } else {
        reportRoute('desktop');
        native?.hide();
        if (!window || window.isDestroyed()) createDesktop();
        displayDesktop();
      }
      hideTimer = setTimer(hide, DURATION_MS);
      return true;
    },
    status: () => ({ revision: 'fullscreen-v2', processId: process.pid, settings: { ...settings }, diagnostic }),
    dispose,
  };
}

let instance;
function getOverlay() {
  if (!instance) {
    const logger = require('electron-log/main');
    instance = createActionOverlay(require('electron'), { logger });
    logger.log(`[OSD] backend initialized; revision=fullscreen-v2; pid=${process.pid}; log=${logger.transports.file.getFile().path}`);
  }
  return instance;
}
function showActionOverlay(notification) {
  try { return getOverlay().show(notification); }
  catch (error) { console.warn('[OSD] display failed:', error.message); return false; }
}
function configureActionOverlay(settings) { getOverlay().configure(settings); }
function closeActionOverlay() { instance?.dispose(); instance = null; }
function getActionOverlayStatus() { return getOverlay().status(); }

module.exports = { createActionOverlay, showActionOverlay, configureActionOverlay, closeActionOverlay, getActionOverlayStatus, DURATION_MS, FADE_MS };
