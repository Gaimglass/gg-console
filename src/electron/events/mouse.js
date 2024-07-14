let mouseEvents = {
  on: ()=>{} // stub
}

try {
  const globalMouseEvents = require("global-mouse-events");
  mouseEvents = globalMouseEvents;
} catch (e) {
  // Mac
}

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
}