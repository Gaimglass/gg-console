const path = require('node:path');
const { attachToWindow } = require('./attachment');
const { foregroundWindow, windowLayout } = require('./foreground');
const { isFullscreenLayout, selectGameWindow } = require('./target');
const { loadOverlayPage } = require('./page');
const FRAME_RATE = 30;
const FRAME_INTERVAL_MS = Math.ceil(1000 / FRAME_RATE);

function createGameOverlay({ BrowserWindow, screen, app, loadAddon = () => require('@hamstu/electron-game-overlay'), now = Date.now, attach = attachToWindow, getForegroundWindow = foregroundWindow, getWindowLayout = windowLayout, onUnavailable = () => {}, onDiagnostic = () => {}, logger = console, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let addon;
  let host;
  let window;
  let ready = false;
  let registered = false;
  let pending = null;
  let renderTimer;
  let lastRenderAt = -Infinity;
  let painting = false;
  let lastPosition;
  let lastScale;
  let lastBounds;
  let nextScanAt = 0;
  let candidates = [];
  let target = null;
  let layout = null;
  let lastForeground = null;
  let focusTimer;
  let unavailable = false;
  let lastDiagnostic;
  let firstFrameSent = false;
  const attachedProcesses = new Set();
  const attachingProcesses = new Set();
  const connectedProcesses = new Set();
  const failedProcesses = new Set();
  const retryAfter = new Map();
  const connectionTimers = new Map();
  const description = value => `pid=${value.processId}; window=${JSON.stringify(value.title || '')}; graphics=${value.graphics?.summary || 'unknown'}`;

  function report(reason, details = {}) {
    const diagnostic = { reason, ...details };
    const key = JSON.stringify(diagnostic);
    if (key !== lastDiagnostic) {
      logger.log(`[OSD] game decision=${reason}`, details);
      lastDiagnostic = key;
    }
    onDiagnostic(diagnostic);
  }

  function closeSurface() {
    try { if (registered) host.closeWindow(window.id); }
    catch (error) { logger.warn('[OSD] could not close game feedback:', error.message); }
    registered = false;
  }

  function hide() {
    pending = null;
    clearTimer(renderTimer);
    renderTimer = null;
    lastRenderAt = -Infinity;
    clearTimer(focusTimer);
    focusTimer = null;
    closeSurface();
    if (painting && window && !window.isDestroyed()) window.webContents.stopPainting();
    painting = false;
  }

  function fail(error) {
    unavailable = true;
    hide();
    report('native-error', { error: error.message });
    logger.warn('[OSD] game overlay unavailable:', error.message);
    onUnavailable();
  }

  function targetDisplay() {
    if (layout && screen.screenToDipRect && screen.getDisplayMatching) {
      return screen.getDisplayMatching(screen.screenToDipRect(null, layout.monitorBounds));
    }
    return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  }

  function render() {
    if (!ready || !pending || unavailable || window.isDestroyed()) return;
    // Render the latest state at the card's frame rate, without delaying USB actions.
    const wait = FRAME_INTERVAL_MS - (now() - lastRenderAt);
    if (wait > 0) {
      if (!renderTimer) renderTimer = setTimer(() => {
        renderTimer = null;
        try { render(); }
        catch (error) { fail(error); }
      }, wait);
      return;
    }
    clearTimer(renderTimer);
    renderTimer = null;
    lastRenderAt = now();
    const display = targetDisplay();
    const scale = display.scaleFactor || 1;
    const rect = { x: Math.round(24 * scale), y: Math.round(24 * scale), width: Math.round(316 * scale), height: Math.round(112 * scale) };
    const position = { x: display.bounds.x, y: display.bounds.y };
    if (!lastPosition || position.x !== lastPosition.x || position.y !== lastPosition.y) {
      window.setPosition(position.x, position.y, false);
      lastPosition = position;
    }
    if (scale !== lastScale) {
      host.setScaleFactor(scale);
      lastScale = scale;
    }
    if (!registered) {
      host.addWindow(window.id, {
        name: 'GaimglassActions', nativeHandle: window.getNativeWindowHandle().readUInt32LE(0),
        transparent: true, resizable: false, dragBorderWidth: 0,
        minWidth: 0, minHeight: 0, maxWidth: rect.width, maxHeight: rect.height, rect,
      });
      registered = true;
    } else if (!lastBounds || Object.keys(rect).some(key => rect[key] !== lastBounds[key])) {
      host.sendWindowBounds(window.id, rect);
    }
    lastBounds = rect;
    window.webContents.send('action-overlay:show', pending);
    // startPainting restarts Electron's video capturer, even when already active.
    if (!painting) {
      window.webContents.startPainting();
      painting = true;
    }
  }

  function monitorFocus() {
    clearTimer(focusTimer);
    focusTimer = setTimer(() => {
      if (!pending) return;
      try {
        const foreground = getForegroundWindow();
        if (foreground !== target?.hwnd || !isFullscreenLayout(getWindowLayout(foreground))) {
          report('focus-or-fullscreen-lost', { foreground });
          hide();
          onUnavailable();
        } else monitorFocus();
      } catch (error) { fail(error); }
    }, 250);
  }

  function startHost() {
    host = new addon.Overlay();
    host.setEventCallback((event, payload) => {
      if (unavailable) return;
      try {
        if (event === 'client.connect' || event === 'game.process') {
          host.sendCommand({ command: 'input.intercept', intercept: false });
          logger.log(`[OSD] game ${event}`, payload);
          if (event === 'client.connect') {
            connectedProcesses.add(payload.pid);
            clearTimer(connectionTimers.get(payload.pid));
            connectionTimers.delete(payload.pid);
          }
        } else if (event === 'client.disconnect') {
          connectedProcesses.delete(payload.pid);
          attachedProcesses.delete(payload.pid);
          logger.log('[OSD] game disconnected', payload);
        } else if (event.startsWith('graphics.window')) {
          logger.log(`[OSD] game ${event}`, payload);
        } else if (event === 'log' && ['warn', 'error'].includes(payload?.level)) {
          logger.warn('[OSD] native overlay:', payload.message);
        }
      } catch (error) { fail(error); }
    });
    host.start();
    host.sendCommand({ command: 'input.intercept', intercept: false });
    const display = targetDisplay();
    window = new BrowserWindow({
      x: display.bounds.x, y: display.bounds.y, width: 316, height: 112,
      show: false, frame: false, transparent: true, focusable: false, skipTaskbar: true,
      webPreferences: { offscreen: true, preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false },
    });
    window.webContents.setFrameRate(FRAME_RATE);
    window.webContents.stopPainting();
    window.webContents.on('paint', (_event, _dirty, image) => {
      if (!registered) return;
      try {
        const size = image.getSize();
        if (size.width <= 0 || size.height <= 0) return;
        host.sendFrameBuffer(window.id, image.getBitmap(), size.width, size.height);
        if (!firstFrameSent) {
          firstFrameSent = true;
          logger.log(`[OSD] first game frame transferred; width=${size.width}; height=${size.height}`);
        }
      } catch (error) { fail(error); }
    });
    window.webContents.on('did-start-loading', () => {
      ready = false;
      clearTimer(renderTimer);
      renderTimer = null;
      lastRenderAt = -Infinity;
      window.webContents.stopPainting();
      painting = false;
    });
    window.webContents.on('did-finish-load', () => {
      if (!window || window.isDestroyed()) return;
      ready = true;
      try { render(); }
      catch (error) { fail(error); }
    });
    void loadOverlayPage(window, { watch: app?.isPackaged === false, logger }).catch(fail);
  }

  function attachTarget(value) {
    attachingProcesses.add(value.processId);
    void attach(value).then(result => {
      attachingProcesses.delete(value.processId);
      if (unavailable) return;
      if (!result.success) {
        logger.warn(`[OSD] game attachment failed; ${description(value)}; error=${result.error || 'unknown'}`);
        retryAfter.set(value.processId, now() + 10000);
        if (target?.processId === value.processId) { report('attachment-failed', { processId: value.processId, error: result.error }); hide(); onUnavailable(); }
        return;
      }
      attachedProcesses.add(value.processId);
      logger.log(`[OSD] game attachment requested; ${description(value)}; thread=${value.threadId}; architecture=${value.is64bit ? 'x64' : 'x86'}`);
      if (!connectedProcesses.has(value.processId)) {
        connectionTimers.set(value.processId, setTimer(() => {
          connectionTimers.delete(value.processId);
          failedProcesses.add(value.processId);
          logger.warn(`[OSD] game did not connect after attachment; ${description(value)}; restart the game before retrying`);
          if (target?.processId === value.processId) { report('connection-timeout', { processId: value.processId }); hide(); onUnavailable(); }
        }, 8000));
      }
    }).catch(fail);
  }

  return {
    show(notification) {
      if (unavailable) return false;
      try {
        const foreground = getForegroundWindow();
        layout = getWindowLayout(foreground);
        if (!isFullscreenLayout(layout)) {
          report('not-fullscreen', { foreground, layout });
          target = null;
          return false;
        }
        addon ||= loadAddon();
        if (now() >= nextScanAt || foreground !== lastForeground) {
          candidates = addon.getTopWindows(true);
          lastForeground = foreground;
          for (const pid of attachedProcesses) {
            if (!candidates.some(value => value.processId === pid)) {
              attachedProcesses.delete(pid);
              connectedProcesses.delete(pid);
              failedProcesses.delete(pid);
              retryAfter.delete(pid);
              clearTimer(connectionTimers.get(pid));
              connectionTimers.delete(pid);
            }
          }
          nextScanAt = now() + 1500;
        }
        const ownedProcessIds = [process.pid, ...(app?.getAppMetrics?.() || []).map(value => value.pid)];
        target = selectGameWindow(candidates, foreground, ownedProcessIds);
        if (!target) {
          const candidate = candidates.find(value => value.hwnd === foreground);
          report('no-compatible-window', { foreground, window: candidate || null, layout });
          return false;
        }
        if (failedProcesses.has(target.processId) || now() < (retryAfter.get(target.processId) || 0)) {
          report('attachment-cooldown', { processId: target.processId });
          return false;
        }
        report('native-selected', { processId: target.processId, title: target.title, graphics: target.graphics, layout });
        if (!host) startHost();
        pending = notification;
        render();
        monitorFocus();
        if (!attachedProcesses.has(target.processId) && !attachingProcesses.has(target.processId)) attachTarget(target);
        return true;
      } catch (error) { fail(error); return false; }
    },
    fade() { if (ready && window && !window.isDestroyed()) window.webContents.send('action-overlay:hide'); },
    hide,
    dispose() {
      hide();
      if (window && !window.isDestroyed()) window.destroy();
      window = null;
      ready = false;
      unavailable = true;
      for (const timer of connectionTimers.values()) clearTimer(timer);
      connectionTimers.clear();
      try { host?.stop(); }
      catch (error) { logger.warn('[OSD] could not stop game overlay:', error.message); }
    },
  };
}

module.exports = { createGameOverlay };
