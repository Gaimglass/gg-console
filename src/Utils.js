
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

function getPrettyTextFromCommand(command) {
  switch(command) {
    case 'brightness+':
      return "Increase Brightness";
    case 'brightness1':
      return 'Decrease Brightness';
    case 'calibrate':
      return 'Quick Calibrate';
    case 'led':
      return 'LED on/off';
    case 's1':
      return 'Color slot 1';
    case 's2':
      return 'Color slot 2';
    case 's3':
      return 'Color slot 3';
    case 's4':
      return 'Color slot 4';
    case 's5':
      return 'Color slot 5';
    case 's6':
      return 'Color slot 6';
    case 's7':
      return 'Color slot 7';
    case 's8':
      return 'Color slot 8';
    default:
      return '';
  }
  
}
function defaultAppSettings() {
  return {
    'keyBindings': {
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
    'ads': {
      'enabled': false,
      'color': {r: 0, g: 255, b:100},
      'speed': 100,
      'adsMouseButton': 2,
      'adsControllerButton': 'button1',
    }
    
  }
}

function saveAppSettings(settings) {
  /** note, in dev mode, if you exit from the terminal, this won't always persist across instances */
  localStorage.setItem("settings", JSON.stringify(settings));
}

function loadAppSettings() {
  const userSettings = localStorage.getItem("settings");
  const settings = {
    ...defaultAppSettings(),
    ...JSON.parse(userSettings)
  }
  return settings;
}

function getKeyBindings() {
  const bindings = loadAppSettings().keyBindings;
  return bindings;
}

function getADSSettings() {
  const ads = loadAppSettings().ads;
  return ads;
}

function throttle(func, timeout = 50){
  let timer;
  let latestFunc;
  return (...args) => {
    if (!timer) {
      func.apply(this, args);
      timer = setTimeout(() => {
        timer = undefined;
        if(latestFunc) {
          // ensures the last one always proceeds
          latestFunc.apply(this, args);
          latestFunc = undefined;
        }
      }, timeout);
    } else {
      latestFunc = () => {
        func.apply(this, args);
      }
    }
  };
}

export {
  throttle,
  getMessageResult,
  defaultAppSettings,
  saveAppSettings,
  loadAppSettings,
  getKeyBindings,
  getADSSettings,
  getPrettyTextFromCommand

}