const HID = require("node-hid");
const XInput = require("xinput-ffi");
const { getAdsControls } = require('../ads-controls');

//let subscribers = [];
let mainWindow = null;
const ENABLE_HID_BACKEND = false;


// -----------------------
// XINPUT BACKEND (XBOX)
// -----------------------

let lastPacket = null;
function startXInput() {
  const controls = getAdsControls();
  let polling = false;
  setInterval(async () => {
    if (polling) return;
    polling = true;
    try {
      let state;
      try {
        state = await XInput.getState(0);
      } catch {
        state = null;
      }
      const packet = state?.gamepad ? { type: 'xinput', state: state.gamepad } : { type: null, state: {} };
      // Process on main even when the renderer cannot handle controller updates.
      controls.controller(packet);
      const number = state?.gamepad ? state.dwPacketNumber : null;
      if (number === lastPacket) return;
      lastPacket = number;
      mainWindow.webContents.send('update-controller-event', packet);
    } finally {
      polling = false;
    }
  }, 16);
}

// -----------------------
// HID BACKEND (PS5/Generic)
// -----------------------
function startHID() {
  HID.devices().forEach(deviceInfo => {
    // crude filter for gamepads — can refine later
    if (deviceInfo.usage === 5 || /controller/i.test(deviceInfo.product)) {

      try {
        const device = new HID.HID(deviceInfo.path);

        device.on("data", raw => {
          mainWindow.webContents.send("update-controller-event", { type:"hid", raw, deviceInfo });
        });

        device.on("error", e => console.log("HID error:", e));
      } catch (err) {
        console.log("HID open failed", err);
      }
    }
  });
}

function setupController(main) {
  mainWindow = main;
  startXInput();
  if (ENABLE_HID_BACKEND) {
    startHID();
  }
}

module.exports = {
  setupController
}


