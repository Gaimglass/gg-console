import {useRef, useCallback } from 'react'


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
    },
    'ambient': {
      'enabled': false,
    }
  }
}

function saveAppSettings(settings) {
  /** note, in dev mode, if you exit from the terminal, this won't always persist across instances */
  localStorage.setItem("settings", JSON.stringify(settings));
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function loadAppSettings() {
  const userSettings = localStorage.getItem("settings");
  if (!userSettings) {
    return defaultAppSettings();
  }
  return deepMerge(defaultAppSettings(), JSON.parse(userSettings));
}

function getKeyBindings() {
  const bindings = loadAppSettings().keyBindings;
  return bindings;
}

function getADSSettings() {
  const ads = loadAppSettings().ads;
  return ads;
}

/**
 * Leading and trailing edge throttle function. Always fire right away,
 * then fire again after a delay. Always fire one last time after the last delay to ensure the last 
 * value was set. This is used for color changes and its important to record the last one but not all the 
 * middle ones.
 * @param {*} func 
 * @param {*} timeout 
 * @returns 
 */
function useThrottle (func, timeout = 50) {
  const timer = useRef(undefined);
  const latestArgs = useRef(undefined);
  const funcRef = useRef(func);
  
  // Always keep the latest function reference
  funcRef.current = func;
  
  const throttledFunction = useCallback((...args) => {
    if (!timer.current) {
      funcRef.current(...args);
      timer.current = setTimeout(() => {
        timer.current = undefined;
        if (latestArgs.current) {
          // ensures the last one always proceeds
          funcRef.current(...latestArgs.current);
          latestArgs.current = undefined;
        }
      }, timeout);
    } else {
      latestArgs.current = args;
    }
  }, [timeout]);
  
  throttledFunction.cancel = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = undefined;
      latestArgs.current = undefined;
    }
  };
  
  return throttledFunction;
}

function getAmbientSettings() {
  const settings = loadAppSettings();
  return settings.ambient || { enabled: false };
}

export {
  useThrottle,
  deepMerge,
  getMessageResult,
  defaultAppSettings,
  saveAppSettings,
  loadAppSettings,
  getKeyBindings,
  getADSSettings,
  getAmbientSettings,
  getPrettyTextFromCommand

}