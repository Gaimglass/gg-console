import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RgbaColorPicker } from 'react-colorful';
import classNames from 'classnames';
import DefaultColors from './DefaultColors';
import WindowControls from './WindowsControls';
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
import UpdatesTabWrapper from './UpdatesTabWrapper';
import KeyBindings from './KeyBindings';
import ADS from './ADS';
import Ambient from './Ambient';
import BrightnessMonitor from './BrightnessMonitor';
import { useSettings } from './SettingsProvider';

import styles from './css/AppColorPicker.module.css';

import { ReactComponent as PowerSwitch } from './assets/power-off-solid.svg';
import { ReactComponent as CrosshairsIcon } from './assets/crosshair.svg';
import { useThrottle } from './Utils';
import './css/globalStyles.css';


const ipcRenderer  = window.ipcRenderer;

function AppColorPicker() {
  const [color, setColor] = useState({ r: 255, g: 255, b: 255, a: 0 });
  const [defaultColors, setDefaultColors] = useState([]);
  const [ledOn, setLEDOn] = useState(false);
  const [isMaximized, setMaximized] = useState(false);
  const [version, setVersion] = useState('');
  const [isMac, setMac] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [editSwatch, setEditSwatch] = useState(null);

  // ADS transition variables - use refs to persist across renders
  const changeIntervalRef = useRef(null);
  const currentTransitionColorRef = useRef({ ...color });
  const finalTransitionColorRef = useRef({});
  const adsFlagsRef = useRef(0);
  const colorRgbRef = useRef({ r: color.r, g: color.g, b: color.b });
  const prevAmbientValueRef = useRef(null);

  const { ambientSettings, adsSettings } = useSettings();
  
  // Transition constants
  const RED = 1;
  const GREEN = 2;
  const BLUE = 4;
  //const ALPHA = 8;
  const TRANS_MULTIPLIER = 35;
  const ALL_COLORS = RED | GREEN | BLUE; // 7

  const sendMainLEDStatus = useCallback((color, ledOn) => {
    if (isConnected) {
      ipcRenderer.sendSync('set-led-state', {
        color,
        brightness: color.a,
        ledOn,
      });
      // Broadcast to other windows (like calibrate window)
      ipcRenderer.send('broadcast-color-sync', color, ledOn);
    }
  }, [isConnected])

  const sendAlphaValue = useCallback((value) => {
    if (isConnected) {
      ipcRenderer.sendSync('set-ambient', value, ambientSettings.exponent);
    }
  }, [isConnected, ambientSettings.exponent])

  // Stable function references for throttling
  const handleColorChangeStable = useCallback((newColor, defaultIndex = -1) => {
    // defaults don't have an alpha so use the current value
    let alpha = newColor?.a ?? color.a;

    const finalColor = {
      ...newColor,
      a: alpha
    };
    setColor(finalColor);
    setLEDOn(true);
    sendMainLEDStatus(finalColor, true);
    if (defaultIndex > -1)  {
      // update the index position on the device so that the left and right color 
      // button on the device start from where this default color is.
      sendDefaultIndex(defaultIndex); 
    }
     
    if (editSwatch !== null) {
      // when editing a default color, update that color in real time
      const c = {
        color: {r: finalColor.r, g: finalColor.g, b: finalColor.b},
        enabled: true
      };
      const dc = [...defaultColors];
      dc[editSwatch] = c;
      setDefaultColors(dc);
    }
  }, [color.a, sendMainLEDStatus, editSwatch, defaultColors]);


  const handleUpdateGGStable = useCallback((message) => {
    parseMainLedFromGG(message);
  }, []);

  const handleColorChangeThrottled = useThrottle(handleColorChangeStable, 50);
  const handleUpdateGGThrottled = useThrottle(handleUpdateGGStable, 50);

  // Event handler callbacks - defined before useEffects that reference them
  const handleAmbientBrightness = useCallback((brightness) => {
    if (!ledOn || !isConnected) {
      return;
    }

    // Map screen brightness (0.0-1.0) to LED brightness (0.075-2.0)
    // Using minimum of 0.075 to match device minimum
    const minBrightness = 0.075;
    const maxBrightness = 1.0;
    const mappedBrightness = minBrightness + (brightness * (maxBrightness - minBrightness));
    
    // Clamp to valid range
    const ambientValue = Math.max(minBrightness, Math.min(maxBrightness, mappedBrightness));

    // Only send if value changed to reduce USB traffic
    if (prevAmbientValueRef.current !== ambientValue) {
      sendAlphaValue(ambientValue);
      prevAmbientValueRef.current = ambientValue;
    }

  }, [ledOn, isConnected, sendAlphaValue]);

  const deactivateLED = useCallback(() => {
    setLEDOn(() => {
      sendMainLEDStatus(color, false);
      return false;
    });
  }, [color, sendMainLEDStatus]);

  const toggleLEDOn = useCallback(() => {
    setLEDOn((on) => {
      sendMainLEDStatus(color, !on);
      return !on;
    });
  }, [color, sendMainLEDStatus]);

  const switchColorShortcut = useCallback((index) => {
    if (ledOn) {
      const colorIndex = Number(index - 1);
      if (colorIndex < 0) {
        return;
      }
      const newColor = {
        ...defaultColors[colorIndex].color,
        a: color.a,
      };
      setColor(newColor);
      sendMainLEDStatus(newColor, true);
      sendDefaultIndex(colorIndex);
    }
  }, [ledOn, defaultColors, color.a, sendMainLEDStatus]);

  const decreaseBrightnessShortcut = useCallback(() => {
    if (ledOn) {
      setColor((c) => {
        let newAlpha = c.a - 0.05;
        if (newAlpha < 0.075) {
          newAlpha = 0.075;
        }
        const newColor = {
          ...c,
          a: newAlpha,
        };
        sendMainLEDStatus(newColor, true);
        return newColor;
      });
    }
  }, [ledOn, sendMainLEDStatus]);

  const increaseBrightnessShortcut = useCallback(() => {
    if (ledOn) {

      setColor((c) => {
        let newAlpha = c.a + 0.05;
        if (newAlpha > 1) {
          newAlpha = 1;
        }
        const newColor = {
          ...c,
          a: newAlpha,
        };
        sendMainLEDStatus(newColor, true);
        return newColor;
      });
    }
  }, [ledOn, sendMainLEDStatus]);

  
  const onADSDown = useCallback((ads) => {
    adsFlagsRef.current = 0;
    finalTransitionColorRef.current = { 
      ...ads.color,
      a: color.a // ads does not control brightness, just match the current value
    };
    if (ledOn) {
      changeColorTo(ads.speed);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color.a, ledOn]);

  const onADSUp = useCallback((ads) => {
    adsFlagsRef.current = 0;
    finalTransitionColorRef.current = { ...color };
    if (ledOn) {
      changeColorTo(ads.speed);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, ledOn]);

  const getStateFromGG = () => { 
    loadMainLedFromGG();
    loadDefaultColorsFromGG();
  }

  // Setup once on mount
  useEffect(() => {
    getAppState();
    initialDefaults();

    // this will error on first load bc port is most likely not ready, but we can ignore that
    // because we also listen for 'usb-connected'
    getStateFromGG(); 
    
    // Receive uninitiated messages from the gg device
    // these messages are prefixed with "update-" for organization
    ipcRenderer.on('update-default-colors-from-gg', parseDefaultColors);
    ipcRenderer.on('usb-connected', getStateFromGG);

    ipcRenderer.on('usb-disconnected', () => {
      setIsConnected(false);
    });

    return () => {
      ipcRenderer.removeListener('update-default-colors-from-gg', parseDefaultColors);
      ipcRenderer.removeListener('usb-connected', getStateFromGG);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Separate effect for throttled LED state updates
  useEffect(() => {
    ipcRenderer.on('update-main-led-state-from-gg', (evt, message) => {
      handleUpdateGGThrottled(message);
    });
    return () => {
      ipcRenderer.removeListener('update-main-led-state-from-gg', handleUpdateGGThrottled);
    };
  }, [handleUpdateGGThrottled]);
  
  // Update currentTransitionColorRef when color changes
  useEffect(() => {
    currentTransitionColorRef.current = { ...color };
    colorRgbRef.current = { r: color.r, g: color.g, b: color.b };
  }, [color]);

  // Send LED status when ledOn or color changes (while connected)
  useEffect(() => {
    if (ledOn && isConnected) {
      sendMainLEDStatus(color, true);
    }
  }, [ledOn, isConnected, color, sendMainLEDStatus]);

  // Register all IPC listeners once - they use stable useCallback references
  useEffect(() => {
    ipcRenderer.on('shortcut-toggle-led', toggleLEDOn);
    ipcRenderer.on('os-suspend', deactivateLED);
    ipcRenderer.on('shortcut-increase-brightness', increaseBrightnessShortcut);
    ipcRenderer.on('shortcut-decrease-brightness', decreaseBrightnessShortcut);
    ipcRenderer.on('shortcut-switch-color', switchColorShortcut);
    ipcRenderer.on('update-ads-active', onADSDown);
    ipcRenderer.on('update-ads-inactive', onADSUp);
    
    return () => {
      ipcRenderer.removeListener('shortcut-toggle-led', toggleLEDOn);
      ipcRenderer.removeListener('os-suspend', deactivateLED);
      ipcRenderer.removeListener('shortcut-increase-brightness', increaseBrightnessShortcut);
      ipcRenderer.removeListener('shortcut-decrease-brightness', decreaseBrightnessShortcut);
      ipcRenderer.removeListener('shortcut-switch-color', switchColorShortcut);
      ipcRenderer.removeListener('update-ads-active', onADSDown);
      ipcRenderer.removeListener('update-ads-inactive', onADSUp);
    };
  }, [
    toggleLEDOn,
    deactivateLED,
    increaseBrightnessShortcut,
    decreaseBrightnessShortcut,
    switchColorShortcut,
    onADSDown,
    onADSUp
  ]);

  useEffect(() => {
    if(!ambientSettings.enabled) {
      sendAlphaValue(1); // turns off ambient mode
    }
  }, [ambientSettings.enabled, sendAlphaValue]) ;
  
  
  function createDefaultColors() {
    return [
      { r: 15, g: 255, b: 15 },
      { r: 32, g: 255, b: 180 },
      { r: 20, g: 110, b: 255 },
      { r: 134, g: 100, b: 255 },
      { r: 255, g: 60, b: 180 },
      { r: 255, g: 15, b: 15 },
      { r: 255, g: 140, b: 15 },
      { r: 200, g: 255, b: 40 },
    ];
  }

  function initialDefaults() {
    const defaults = [];
    const initialDefaultColors = createDefaultColors();
    for (let i = 0; i < 8; i++) {
      defaults.push({
        color: initialDefaultColors[i],
        enabled: true,
      });
    }
    // These are the colors that will be rendered if no GG is connected
    setDefaultColors(defaults);
  }



  async function getAppState() {
    const result = ipcRenderer.sendSync('get-app-state');
    setMaximized(result.isMaximized);
    setMac(result.isMac);
    setVersion(result.version);
  }

  function sendDefaultIndex(index) {
    ipcRenderer.sendSync('set-default-index', index);
  } 


  function sendDefaultColors(dc) {
    // This condition is preferred over useEffect so we have more control over writing to EPROM
    // because the defaultColors should not map 1:1 with EPROM
    ipcRenderer.sendSync('set-default-colors', dc || defaultColors);
  }



  function handleEditSwatch(swatch) {
    setEditSwatch(swatch);
  }

  function handleSaveDefaultColor() {
    // Send to device
    sendDefaultColors();
  }
  
  function handleDeleteDefaultColor() {
    const dc = [...defaultColors];
    dc.splice(editSwatch, 1);
    setDefaultColors(dc);
    sendDefaultColors(dc);
  }

  function handleAddDefaultColor() {
    if (defaultColors.length < 8) {
      const c = { r: 0, g: 0, b: 0 };
      const dc = [
        ...defaultColors,
        {
          color: c,
          enabled: true,
        },
      ];
      setDefaultColors(dc);
      sendDefaultColors(dc);
      handleColorChange(c, dc.length - 1);
      setEditSwatch(dc.length - 1);
    }
  }

  function handleResetDefaultColor() {
    const initialDefaultColors = createDefaultColors();
    const resetColor = initialDefaultColors[editSwatch];
    const c = {
      color: { r: resetColor.r, g: resetColor.g, b: resetColor.b },
      enabled: true,
    };
    const dc = [...defaultColors];
    dc[editSwatch] = c;
    setDefaultColors(dc);
    sendDefaultColors(dc);
    const newColor = { r: c.color.r, g: c.color.g, b: c.color.b, a: color.a };
    setColor(newColor);
  }

  // Non-throttled version for direct calls
  function handleColorChange(_newColor, defaultIndex = -1) {
    handleColorChangeStable(_newColor, defaultIndex);
  }


  /**
   * Smooth color/brightness transition
   * @param {number} speed - Transition speed
   */
  function changeColorTo(speed) {
    if (changeIntervalRef.current) {
      clearInterval(changeIntervalRef.current);
    }

    let prevTime = Date.now();
    changeIntervalRef.current = setInterval(step, 1);

    function step() {
      const timestamp = Date.now();
      const dt = (timestamp - prevTime) / 1000;
      prevTime = timestamp;

      const current = currentTransitionColorRef.current;
      const final = finalTransitionColorRef.current;

      const rs = final.r > current.r ? 1 : -1;
      const gs = final.g > current.g ? 1 : -1;
      const bs = final.b > current.b ? 1 : -1;
      //const as = final.a > current.a ? 1 : -1;

      current.r += speed * dt * rs * TRANS_MULTIPLIER;
      current.g += speed * dt * gs * TRANS_MULTIPLIER;
      current.b += speed * dt * bs * TRANS_MULTIPLIER;
      //current.a += speed * dt * as * TRANS_MULTIPLIER;

      if ((rs === -1 && current.r <= final.r) || (rs === 1 && current.r >= final.r)) {
        adsFlagsRef.current |= RED;
        current.r = final.r;
      }
      if ((gs === -1 && current.g <= final.g) || (gs === 1 && current.g >= final.g)) {
        adsFlagsRef.current |= GREEN;
        current.g = final.g;
      }
      if ((bs === -1 && current.b <= final.b) || (bs === 1 && current.b >= final.b)) {
        adsFlagsRef.current |= BLUE;
        current.b = final.b;
      }
      /*if ((as === -1 && current.a <= final.a) || (as === 1 && current.a >= final.a)) {
        adsFlagsRef.current |= ALPHA;
        current.a = final.a;
      }*/
      
      sendMainLEDStatus(
        {
          r: Math.round(current.r),
          g: Math.round(current.g),
          b: Math.round(current.b),
          a: current.a,
        },
        ledOn
      );
      
      if (adsFlagsRef.current === ALL_COLORS) {
        clearInterval(changeIntervalRef.current);
        changeIntervalRef.current = null;
      }
    }
  }

  function parseDefaultColors(message) {
    if (!message || typeof message !== 'string') {
      console.warn('parseDefaultColors: ', message?.message);
      return;
    }
    const vars = message.split('&');
    const defaults = [];
    for (const v of vars) {
      const [key, value] = v.split('=');
      if (key === 'color') {
        const [r, g, b, enabled] = value.split(',');
        const isEnabled = Boolean(parseInt(enabled, 10));
        // Only add enabled colors
        if (isEnabled) {
          defaults.push({
            color: {
              r: Number(r),
              g: Number(g),
              b: Number(b),
            },
            enabled: true,
          });
        }
      }
    }
    setDefaultColors(defaults);
  }

  function parseMainLedFromGG(message) {
    if (!message || typeof message !== 'string') {
      console.warn('parseMainLedFromGG: ', message?.message);
      return;
    }
    const params = message.split('&');
    const c = {};
    let led;
    params.forEach((param) => {
      const [key, value] = param.split('=');
      switch (key) {
        case 'color': {
          const [r, g, b] = value.split(',');
          c.r = Number(r);
          c.g = Number(g);
          c.b = Number(b);
          break;
        }
        case 'ledOn':
          led = Boolean(Number(value));
          break;
        case 'brightness':
          c.a = Number(value);
          break;
        default:
          break;
      }
    });
    setColor(c);
    setLEDOn(led);
  }
  

  async function loadMainLedFromGG() {
    const result = ipcRenderer.sendSync('get-led-state');
    if (result) {
      parseMainLedFromGG(result);
    }
  }

  async function loadDefaultColorsFromGG() {
    const result = ipcRenderer.sendSync('get-default-colors');
    if (result) {
      parseDefaultColors(result);
      setIsConnected(true); // we just need to set this once on a successful response
    }
  }

  function changeRgb(e, colorComponent) {
    const rawString = e.target.value.trim();
    let updateKey = false; // Force an update on the input field if clamped
    let newColorComponent = parseInt(rawString, 10);
    
    if (isNaN(newColorComponent)) {
      return;
    }
    
    if (newColorComponent > 255) {
      newColorComponent = 255;
      updateKey = true;
    } else if (newColorComponent < 0) {
      newColorComponent = 0;
      updateKey = true;
    }
    
    const c = {
      ...color,
      [colorComponent]: newColorComponent,
    };
    setColor(c);
    setLEDOn(true);
    sendMainLEDStatus(c, true);
    
    if (updateKey) {
      e.target.value = newColorComponent;
    }
    
    if (editSwatch !== null) {
      // When editing a default color, update that color in real time
      const dc = [...defaultColors];
      dc[editSwatch] = {
        color: { ...c },
        enabled: true,
      };
      setDefaultColors(dc);
    }
  }

  function handleChangeToCalibrateTab() {
    // fixes a bug where if the user was editing a swatch color but didn't save to GG, the color
    // would be set in the UI, but not in GG, this reset the UI to match GG.
    loadDefaultColorsFromGG();
  }

  function handleCalibrate() {
    ipcRenderer.invoke('calibrate-gaimglass'); // dont bother with waiting for a result
  }

  function changeAlpha(e) {
    const rawString = e.target.value.trim();
    let updateKey = false;
    let newColorComponent = parseFloat(rawString);

    if (isNaN(newColorComponent)) {
      return;
    }
    
    if (newColorComponent > 1) {
      newColorComponent = 1;
      updateKey = true;
    } else if (newColorComponent < 0) {
      newColorComponent = 0;
      updateKey = true;
    }
    
    const c = {
      ...color,
      a: newColorComponent,
    };
    setColor(c);
    setLEDOn(true);
    sendMainLEDStatus(c, true);
    
    if (updateKey) {
      e.target.value = newColorComponent;
    }

    // Format input: add leading 0 if starts with '.', limit to 4 chars
    const arr = [...e.target.value];
    if (arr[0] === '.') {
      e.target.value = '0' + e.target.value;
    }
    if (e.target.value.length > 4) {
      e.target.value = e.target.value.slice(0, 4);
    }
  }


  return (
    <div className={styles.App}>
      <header className={styles.header}>
        <div className={styles.drag}>
          <div
            className={classNames({
              [styles.title]: true,
              [styles.alignRight]: isMac,
            })}
          >
            g<span className={styles.green}>aim</span>glass
            <span className={styles.version}>{version}</span>
          </div>
          <WindowControls maximized={isMaximized} showControls={!isMac} />
        </div>
      </header>

      {isConnected && (
        <div className={styles.mainContainer}>
              <Tabs className={styles.tabContainer}>
                <UpdatesTabWrapper>
                  <TabList className={styles.tabControls}>
                    <Tab tabIndex="-1"><button onClick={handleChangeToCalibrateTab}>Calibrate</button></Tab>
                    <Tab tabIndex="-1"><button>ADS</button></Tab>
                    <Tab tabIndex="-1"><button>Ambient</button></Tab>
                    <Tab tabIndex="-1"><button>Shortcuts</button></Tab>
                  </TabList>
                </UpdatesTabWrapper>
                <TabPanel className={styles.tabCalibrate}>
                  <div className={styles.mainContent}>
                    <div className={styles.main}>
                      <div className={styles.mainControls}>
                        {/* <button onClick={readDefault}>Get Default Color</button> */}
                        
                          {/* <button onClick={(()=>handleAmbientBrightness(1))}>TEST ALPPHA</button> */}
                          <button className={classNames({
                              [styles.power]: true,
                              [styles.enabled]: ledOn
                          })} onClick={toggleLEDOn}>
                            <PowerSwitch className={styles.powerIcon}></PowerSwitch>
                            <span className={styles.powerText}>LED: {ledOn ? " ON " : "OFF"}</span>
                          </button>
                          <button className={classNames({
                              [styles.calibrate]: true,
                          })} onClick={()=>{
                            handleCalibrate();
                          }}>
                            <CrosshairsIcon className={styles.crosshairIcon}></CrosshairsIcon>
                          </button>
                        
                        
                  </div>

                  <RgbaColorPicker color={color} onChange={handleColorChangeThrottled} />
                  <div className={styles.rgbInputs}>
                    <label>R</label>
                    <input onChange={(e) => changeRgb(e, 'r')} value={color.r} type="text" />
                    <label>G</label>
                    <input onChange={(e) => changeRgb(e, 'g')} value={color.g} type="text" />
                    <label>B</label>
                    <input onChange={(e) => changeRgb(e, 'b')} value={color.b} type="text" />
                    <label>A</label>
                    <input onChange={changeAlpha} value={color.a} type="text" />
                  </div>
                </div>
                <div className={styles.colors}>
                  <DefaultColors
                    colors={defaultColors}
                    onChangeColor={handleColorChange}
                    onSetEditSwatch={handleEditSwatch}
                    editSwatch={editSwatch}
                    onSaveDefaultColor={handleSaveDefaultColor}
                    onDeleteDefaultColor={handleDeleteDefaultColor}
                    onAddDefaultColor={handleAddDefaultColor}
                    onResetDefaultColor={handleResetDefaultColor}
                  />
                </div>
              </div>
            </TabPanel>
            <TabPanel>
              <ADS />
            </TabPanel>
            <TabPanel>
              <Ambient />
            </TabPanel>
            <TabPanel>
              <KeyBindings />
            </TabPanel>
          </Tabs>
        </div>
      )}
      {!isConnected && (
        <div className={styles.disconnected}>
          <span>Gaimglass not connected</span>
        </div>
      )}
      {/* Brightness monitor runs independently when connected */}
      {isConnected && (
        <BrightnessMonitor
          onBrightnessChange={handleAmbientBrightness}
        />
      )}
    </div>
  );
}


export default AppColorPicker;

