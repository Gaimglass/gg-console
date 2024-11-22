/* let mouseEvents = {
  on: ()=>{} // stub
}

try {
  const globalMouseEvents = require("global-mouse-events");
  mouseEvents = globalMouseEvents;
} catch (e) {
  // Mac is not supported ATM
}

// These events can be used for mouse2 effects such as dimming when pressing ADS.
// Note: We currently don't have a way to do this for controllers.
function registerMouseEvents(mainWindow) {
  mouseEvents.on("mouseup", event => {
    if (event.button === 2) {
      if (mouseState.down) {
        mainWindow.webContents.send('update-mouse-up', event);
        mouseState.down = false;
      }
    }
  });

  mouseEvents.on("mousedown", event => {
    // { x: 2962, y: 483, button: 1 }
    if (event.button === 2) {
      if (!mouseState.down) {
        mainWindow.webContents.send('update-mouse-down', event);
        mouseState.down = true;
      }
    }
  });
}

module.exports = {
  registerMouseEvents
} */