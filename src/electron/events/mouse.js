// This works only on WINDOWS

let mouseEvents = {
  on: ()=>{} // stub
}

let adsSettings = {
  enabled: false,
  color: {},
  speed: 0,
  adsMouseButton: '',
  adsControllerButton: '',
}

try {
  const globalMouseEvents = require("global-mouse-events");
  mouseEvents = globalMouseEvents;
} catch (e) {
  // Mac is not supported ATM
}

// These events can be used for mouse2 effects such as dimming when pressing ADS.
function registerMouseEvents(mainWindow, mouseState) {
  mouseEvents.on("mouseup", event => {
  if (mouseState.down && adsSettings.adsMouseButton === event.button) {
    mainWindow.webContents.send('update-ads-inactive', adsSettings);
    mouseState.down = false;
  }
  });

  mouseEvents.on("mousedown", event => {
    if (!mouseState.down) {
      if(adsSettings.adsMouseButton === event.button && adsSettings.enabled) {
        mainWindow.webContents.send('update-ads-active', adsSettings);
        mouseState.down = true;
      }
    }
  });
}

function setADS(mainWindow, ads) {
  adsSettings = {...ads};
}


module.exports = {
  registerMouseEvents,
  setADS, 
}