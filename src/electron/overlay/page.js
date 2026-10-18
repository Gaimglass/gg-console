const fs = require('node:fs');
const path = require('node:path');

// These file:// pages live outside Vite. Reload the real overlay windows during development.
function loadOverlayPage(window, { watch = false, logger = console } = {}) {
  if (watch) {
    let watcher;
    let timer;
    try {
      watcher = fs.watch(__dirname, { persistent: false }, (_event, filename) => {
        if (filename && !['index.html', 'overlay.css', 'renderer.js', 'preload.js', 'frame-marker.js'].includes(String(filename))) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (window.isDestroyed()) return;
          logger.log('[OSD] reloading changed overlay files');
          window.webContents.reloadIgnoringCache();
        }, 100);
      });
      watcher.on('error', error => {
        logger.warn('[OSD] overlay file watcher failed:', error.message);
        watcher.close();
      });
      window.once('closed', () => {
        clearTimeout(timer);
        watcher.close();
      });
    } catch (error) {
      logger.warn('[OSD] could not watch overlay files:', error.message);
    }
  }
  return window.loadFile(path.join(__dirname, 'index.html'));
}

module.exports = { loadOverlayPage };
