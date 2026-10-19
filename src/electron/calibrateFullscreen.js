const controllers = new WeakMap();

function createCalibrationFullscreenController(window) {
  let actualFullscreen = window.isFullScreen();
  let desiredFullscreen = actualFullscreen;
  let transitioning = false;
  let windowedBounds = null;
  let windowedResizable = window.isResizable();
  let transitionId = 0;

  function apply() {
    if (window.isDestroyed() || transitioning || actualFullscreen === desiredFullscreen) return;
    if (desiredFullscreen && !windowedBounds) {
      windowedBounds = window.getNormalBounds();
      windowedResizable = window.isResizable();
    }
    // Windows otherwise clamps the fullscreen resize to the fixed windowed size.
    window.setResizable(true);
    transitioning = true;
    window.setFullScreen(desiredFullscreen);
  }

  function changed(fullscreen) {
    // Electron can emit this event before isFullScreen() reflects the new state.
    actualFullscreen = fullscreen;
    // Native fullscreen changes (including OS shortcuts) also update React.
    if (!transitioning) desiredFullscreen = fullscreen;
    transitioning = true;
    const id = ++transitionId;
    // On Windows the event precedes Chromium's actual resize. Updating bounds
    // or locking resizing inside that event can corrupt the next fullscreen entry.
    setImmediate(() => {
      if (window.isDestroyed() || id !== transitionId) return;
      if (!fullscreen) {
        if (windowedBounds) window.setBounds(windowedBounds);
        windowedBounds = null;
        window.setResizable(windowedResizable);
      }
      transitioning = false;
      if (!window.webContents.isDestroyed()) {
        window.webContents.send('calibrate-fullscreen-changed', fullscreen);
      }
      apply();
    });
  }

  window.on('enter-full-screen', () => changed(true));
  window.on('leave-full-screen', () => changed(false));

  function request(fullscreen) {
    if (window.isDestroyed()) return;
    desiredFullscreen = fullscreen;
    if (window.isMinimized()) window.restore();
    window.setSkipTaskbar(false);
    window.show();
    window.focus();
    apply();
  }

  return {
    toggle: () => request(!desiredFullscreen),
    exit: () => request(false),
  };
}

function initializeCalibrationFullscreen(window) {
  if (!controllers.has(window)) controllers.set(window, createCalibrationFullscreenController(window));
  return controllers.get(window);
}

function toggleCalibrationFullscreen(window) {
  initializeCalibrationFullscreen(window).toggle();
}

function exitCalibrationFullscreen(window) {
  initializeCalibrationFullscreen(window).exit();
}

module.exports = {
  createCalibrationFullscreenController,
  initializeCalibrationFullscreen,
  toggleCalibrationFullscreen,
  exitCalibrationFullscreen,
};
