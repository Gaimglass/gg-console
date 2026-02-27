const HID = require("node-hid");
const XInput = require("xinput-ffi");

//let subscribers = [];
let mainWindow = null;
const ENABLE_HID_BACKEND = false;


// -----------------------
// XINPUT BACKEND (XBOX)
// -----------------------

let lastPacket = null;
function startXInput() {
  setInterval(async () => {
    let state;
    
    
    try {
      state = await XInput.getState(0); // controller 0
    } catch {
      // Controller disconnected
      if(lastPacket) {
        // let the client know
        mainWindow.webContents.send("update-controller-event", {
          type: null,
          state: {}
        });
        lastPacket = null;
      }
      return;
    }

    // If we got here, controller IS connected
    if (!state || !state.gamepad) return;
    

    
    if (state.dwPacketNumber === lastPacket) return;
    lastPacket = state.dwPacketNumber;


    // Send to renderer if needed
    mainWindow.webContents.send("update-controller-event", {
      type: "xinput",
      state: state?.gamepad 
  });

  }, 16); // ~60Hz
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


