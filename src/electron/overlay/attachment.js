const path = require('node:path');
const { execFile } = require('node:child_process');

function binaryPath(filename) {
  const directory = path.dirname(require.resolve('@hamstu/electron-game-overlay'));
  return path.join(directory, 'bin', filename).replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
}

function attachToWindow(target, { run = execFile, resolveBinary = binaryPath } = {}) {
  // The addon's injectProcess ignores target.threadId and chooses the oldest
  // process thread, which need not be the game's message-pumping window thread.
  return new Promise(resolve => {
    const architecture = target.is64bit ? 'x64' : 'x86';
    run(resolveBinary(`injector-helper.${architecture}.exe`), [String(target.processId), String(target.threadId), resolveBinary(`overlay.${architecture}.dll`)], {
      windowsHide: true, timeout: 10000, maxBuffer: 64 * 1024,
    }, (error, stdout, stderr) => {
      resolve({ success: !error, error: error ? (stderr?.trim() || stdout?.trim() || error.message) : undefined });
    });
  });
}

module.exports = { attachToWindow, binaryPath };
