const { getAdsControls } = require('../ads-controls');

// The native hook runs on its own thread; ADS never waits for renderer IPC.
function registerMouseEvents() {
  let mouseEvents;
  try {
    mouseEvents = require('global-mouse-events');
  } catch {
    // This capture backend is Windows-only.
    return;
  }
  const controls = getAdsControls();
  mouseEvents.on('mousedown', event => controls.mouse(event.button, true));
  mouseEvents.on('mouseup', event => controls.mouse(event.button, false));
}

module.exports = { registerMouseEvents };
