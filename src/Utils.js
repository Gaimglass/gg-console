
async function getMessageResult(promise, cb) {
  const result = await promise;
  if (result instanceof Error) {
    console.warn(result?.message);
  } else {
    // todo, update state with new values 
    if (cb) {
      cb(result);
    };
  }
}

function defaultAppSettings() {
  return {
    keyBindings: {
      'brightness+': 'Control+numadd',
      'brightness-': 'Control+numsub',
      'calibrate': 'Control+numdec',
      'led': 'Control+num0',
      's1': 'Control+num1',
      's2': 'Control+num2',
      's3': 'Control+num3',
      's4': 'Control+num4',
      's5': 'Control+num5',
      's6': 'Control+num6',
      's7': 'Control+num7',
      's8': 'Control+num8',
    },
    'adsMouse': {
      'enabled': false,
      'button': 'mouse2'
    },
    'adsController': {
      'enabled': false,
      'button': ''
    }
  }
}
function saveAppSettings(settings) {
  localStorage.setItem("settings", JSON.stringify(settings));
}

function loadAppSettings() {
  let settings = localStorage.getItem("settings");
  if(!settings) {
    console.log("settings not found")
    return defaultAppSettings();
  } else {
    //
  }
  return JSON.parse(settings);
}

function getKeyBindings() {
  const bindings = loadAppSettings().keyBindings;
  return bindings;
}


export {
  getMessageResult,
  defaultAppSettings,
  saveAppSettings,
  loadAppSettings,
  getKeyBindings,

}