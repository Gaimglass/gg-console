import React, { useState, useEffect, useRef, useCallback } from 'react';
import classNames from 'classnames';
import CalibratePanel from './CalibratePanel';
import CalibrationCanvas from './CalibrationCanvas';
import GaimglassPanel from './GaimglassPanel';
import WindowControls from './WindowsControls';
import { useAppUpdates } from './useAppUpdates';
import BrightnessMonitor from './BrightnessMonitor.rsx';
import ControllerMonitor from './ControllerMonitor';
import { useSettings } from './SettingsProvider';

import styles from './css/GaimglassApp.module.css';

import Close from './assets/xmark-solid.svg?react';
import logo from './assets/logo.png';
import { useThrottle } from './Utils';
import './css/globalStyles.css';


const ipcRenderer = window.ipcRenderer;

function GaimglassApp() {
  const updates = useAppUpdates();
  const [selectedTab, setSelectedTab] = useState(0);
  const [calibrationTab, setCalibrationTab] = useState(0);
  const [color, setColor] = useState({ r: 255, g: 255, b: 255, a: 0 });
  const [defaultColors, setDefaultColors] = useState([]);
  const [ledOn, setLEDOn] = useState(false);
  const [isMaximized, setMaximized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [version, setVersion] = useState('');
  const [isMac, setMac] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [editSwatch, setEditSwatch] = useState(null);
  const refreshInFlightRef = useRef(false);
  const refreshGenerationRef = useRef(0);
  const queuedRefreshRef = useRef(null);
  const defaultColorsReadInFlightRef = useRef(false);

  const prevAmbientValueRef = useRef(null);

  const { ambientSettings } = useSettings();

  const sendMainLEDStatus = useCallback((color, ledOn, feedback) => {
    if (isConnected) {
      ipcRenderer.sendSync('set-led-state', {
        color,
        brightness: color.a,
        ledOn,
        feedback,
      });
    }
  }, [isConnected])

  // React updates immediately; only the device writes are throttled during a drag.
  const sendPickerColorThrottled = useThrottle(sendMainLEDStatus, 50);

  const parseMainLedFromGG = useCallback((message) => {
    if (!message || typeof message !== 'string') {
      console.warn('parseMainLedFromGG: ', message?.message);
      return;
    }
    sendPickerColorThrottled.cancel();
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
  }, [sendPickerColorThrottled]);


  const sendAlphaValue = useCallback((value) => {
    if (isConnected) {
      ipcRenderer.sendSync('set-ambient', value, ambientSettings.exponent);
    }
  }, [isConnected, ambientSettings.exponent])

  const sendDefaultIndex = useCallback((index, color) => {
    if (isConnected) ipcRenderer.sendSync('set-default-index', index, color);
  }, [isConnected]);

  // Default RGB swatches inherit the current brightness.
  const handleCurrentColorChange = useCallback((newColor, showFeedback = true) => {
    sendPickerColorThrottled.cancel();
    // defaults don't have an alpha so use the current value
    let alpha = newColor?.a ?? color.a;

    const finalColor = {
      ...newColor,
      a: alpha
    };
    setColor(finalColor);
    setLEDOn(true);
    const feedback = showFeedback ? (alpha !== color.a ? 'brightness' : (!ledOn ? 'power' : undefined)) : undefined;
    sendMainLEDStatus(finalColor, true, feedback);
    return finalColor;
  }, [color.a, ledOn, sendMainLEDStatus, sendPickerColorThrottled]);

  const handleDefaultColorChange = useCallback((newColor, defaultIndex = -1) => {
    const finalColor = handleCurrentColorChange(newColor, defaultIndex < 0);
    if (defaultIndex > -1) {
      // update the index position on the device so that the left and right color 
      // button on the device start from where this default color is.
      sendDefaultIndex(defaultIndex, finalColor);
    }

    if (editSwatch !== null) {
      // when editing a default color, update that color in real time
      const c = {
        color: { r: finalColor.r, g: finalColor.g, b: finalColor.b },
        enabled: true
      };
      const dc = [...defaultColors];
      dc[editSwatch] = c;
      setDefaultColors(dc);
    }
  }, [handleCurrentColorChange, sendDefaultIndex, editSwatch, defaultColors]);

  const handlePickerColorChange = useCallback((newColor) => {
    const finalColor = { ...newColor, a: newColor.a ?? color.a };
    setColor(finalColor);
    setLEDOn(true);
    if (editSwatch !== null) {
      setDefaultColors(previous => previous.map((swatch, index) => index === editSwatch
        ? { color: { r: finalColor.r, g: finalColor.g, b: finalColor.b }, enabled: true }
        : swatch));
    }
    const feedback = finalColor.a !== color.a ? 'brightness' : (!ledOn ? 'power' : undefined);
    sendPickerColorThrottled(finalColor, true, feedback);
  }, [color.a, ledOn, editSwatch, sendPickerColorThrottled]);


  const handleUpdateGGThrottled = useThrottle(parseMainLedFromGG, 50);

  const exitCalibration = useCallback(() => {
    void ipcRenderer.invoke('exit-calibrate-fullscreen');
  }, []);

  useEffect(() => {
    ipcRenderer.on('calibrate-fullscreen-changed', setIsFullscreen);
    return () => ipcRenderer.removeListener('calibrate-fullscreen-changed', setIsFullscreen);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = event => {
      if (event.key === 'Escape') exitCalibration();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen, exitCalibration]);

  useEffect(() => {
    return () => sendPickerColorThrottled.cancel();
  }, [sendPickerColorThrottled]);

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

  const toggleLEDOn = useCallback(() => {
    sendPickerColorThrottled.cancel();
    setLEDOn(!ledOn);
    sendMainLEDStatus(color, !ledOn, 'power');
  }, [color, ledOn, sendMainLEDStatus, sendPickerColorThrottled]);


  const getStateFromGG = useCallback(async (reason = 'requested') => {
    if (refreshInFlightRef.current) {
      // A connection event can arrive while an earlier read is still failing.
      if (reason === 'usb-connected' || reason === 'mount') {
        queuedRefreshRef.current = reason;
      }
      return;
    }

    refreshInFlightRef.current = true;
    const generation = refreshGenerationRef.current;
    setIsRefreshing(true);
    setRefreshError('');
    try {
      const response = await ipcRenderer.invoke('get-device-state', reason);
      if (generation !== refreshGenerationRef.current) {
        return;
      }
      if (!response?.ok) {
        setRefreshError('Could not read Gaimglass settings. Try refreshing again.');
        return;
      }
      parseMainLedFromGG(response.mainLed);
      parseDefaultColors(response.defaultColors);
      setIsConnected(true);
    } catch (error) {
      if (generation === refreshGenerationRef.current) {
        console.warn('Device state refresh failed:', error);
        setRefreshError('Could not read Gaimglass settings. Try refreshing again.');
      }
    } finally {
      refreshInFlightRef.current = false;
      setIsRefreshing(false);
      const queuedReason = queuedRefreshRef.current;
      queuedRefreshRef.current = null;
      if (queuedReason) {
        void getStateFromGG(queuedReason);
      }
    }
  }, [parseMainLedFromGG]);

  // Setup once on mount
  useEffect(() => {
    getAppState();
    initialDefaults();

    // Receive uninitiated messages from the gg device
    // these messages are prefixed with "update-" for organization
    ipcRenderer.on('update-default-colors-from-gg', parseDefaultColors);
    const handleConnected = () => { void getStateFromGG('usb-connected'); };
    const handleDisconnected = () => {
      sendPickerColorThrottled.cancel();
      refreshGenerationRef.current++;
      setIsConnected(false);
      setRefreshError('');
    };
    ipcRenderer.on('usb-connected', handleConnected);
    ipcRenderer.on('usb-disconnected', handleDisconnected);

    // Also covers a USB connection event that happened before this UI mounted.
    void getStateFromGG('mount');

    return () => {
      ipcRenderer.removeListener('update-default-colors-from-gg', parseDefaultColors);
      ipcRenderer.removeListener('usb-connected', handleConnected);
      ipcRenderer.removeListener('usb-disconnected', handleDisconnected);
      refreshGenerationRef.current++;
      queuedRefreshRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const retryDisconnectedState = () => {
      if (!isConnected) {
        void getStateFromGG('window-activated');
      }
    };
    ipcRenderer.on('window-activated', retryDisconnectedState);
    return () => ipcRenderer.removeListener('window-activated', retryDisconnectedState);
  }, [isConnected, getStateFromGG]);

  // Separate effect for throttled LED state updates
  useEffect(() => {
    ipcRenderer.on('update-main-led-state-from-gg', handleUpdateGGThrottled);
    return () => {
      ipcRenderer.removeListener('update-main-led-state-from-gg', handleUpdateGGThrottled);
    };
  }, [handleUpdateGGThrottled]);

  useEffect(() => {
    const handleSuspend = () => {
      sendPickerColorThrottled.cancel();
      setLEDOn(false);
    };
    ipcRenderer.on('os-suspend', handleSuspend);
    return () => ipcRenderer.removeListener('os-suspend', handleSuspend);
  }, [sendPickerColorThrottled]);

  useEffect(() => {
    if (!ambientSettings.enabled) {
      sendAlphaValue(1); // turns off ambient mode
    }
  }, [ambientSettings.enabled, sendAlphaValue]);


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
    setIsFullscreen(Boolean(result.isFullscreen));
    setMac(result.isMac);
    setVersion(result.version);
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
      handleDefaultColorChange(c, dc.length - 1);
      setEditSwatch(dc.length - 1);
    }
  }

  function handleResetDefaultColor() {
    sendPickerColorThrottled.cancel();
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
    if (ledOn) sendMainLEDStatus(newColor, true);
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

  async function loadDefaultColorsFromGG() {
    if (defaultColorsReadInFlightRef.current) {
      return;
    }

    defaultColorsReadInFlightRef.current = true;
    const generation = refreshGenerationRef.current;
    try {
      const response = await ipcRenderer.invoke('get-default-colors');
      if (generation !== refreshGenerationRef.current) {
        return;
      }
      if (!response?.ok) {
        console.warn('get-default-colors failed:', response?.error);
        return;
      }
      parseDefaultColors(response.data);
    } catch (error) {
      console.warn('get-default-colors failed:', error);
    } finally {
      defaultColorsReadInFlightRef.current = false;
    }
  }

  function changeRgb(e, colorComponent) {
    sendPickerColorThrottled.cancel();
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
    sendMainLEDStatus(c, true, !ledOn ? 'power' : undefined);

    if (updateKey) {
      e.target.value = newColorComponent;
    }

    if (editSwatch !== null) {
      // When editing a default color, update that color in real time
      const dc = [...defaultColors];
      dc[editSwatch] = {
        color: { r: c.r, g: c.g, b: c.b },
        enabled: true,
      };
      setDefaultColors(dc);
    }
  }

  function handleChangeToCalibrateTab() {
    // fixes a bug where if the user was editing a swatch color but didn't save to GG, the color
    // would be set in the UI, but not in GG, this reset the UI to match GG.
    void loadDefaultColorsFromGG();
  }

  function handleCalibrate() {
    ipcRenderer.invoke('calibrate-gaimglass'); // dont bother with waiting for a result
  }

  function changeAlpha(e) {
    sendPickerColorThrottled.cancel();
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
    sendMainLEDStatus(c, true, 'brightness');

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
    <div className={classNames(styles.app, { [styles.fullscreen]: isFullscreen })}>
      {isFullscreen && <>
        <CalibrationCanvas color={color} />
        <img src={logo} alt="Gaimglass" className={styles.fullscreenLogo} draggable={false} />
      </>}
      {!isFullscreen && <header className={styles.header}>
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
      </header>}
      <GaimglassPanel
        fullscreen={isFullscreen}
        connected={isConnected}
        selectedTab={isFullscreen ? calibrationTab : selectedTab}
        onSelectTab={isFullscreen ? setCalibrationTab : setSelectedTab}
        onCalibrateSelect={handleChangeToCalibrateTab}
        updates={updates}
        calibratePanel={isConnected || isFullscreen ? <CalibratePanel
          fullscreen={isFullscreen}
          color={color}
          ledOn={ledOn}
          onTogglePower={toggleLEDOn}
          onOpenFullscreen={handleCalibrate}
          onPickerColorChange={handlePickerColorChange}
          onRgbChange={changeRgb}
          onAlphaChange={changeAlpha}
          defaultColors={defaultColors}
          onDefaultColorChange={handleDefaultColorChange}
          editSwatch={editSwatch}
          onSetEditSwatch={handleEditSwatch}
          onSaveDefaultColor={handleSaveDefaultColor}
          onDeleteDefaultColor={handleDeleteDefaultColor}
          onAddDefaultColor={handleAddDefaultColor}
          onResetDefaultColor={handleResetDefaultColor}
        /> : <div className={styles.disconnected}>
          <span>Gaimglass not connected</span>
          <button type="button" className={styles.refreshButton} disabled={isRefreshing} onClick={() => { void getStateFromGG('refresh-button'); }}>
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <span className={styles.refreshStatus} role="status">{refreshError}</span>
        </div>}
      />
      {isFullscreen && <button onClick={exitCalibration} className={styles.close} aria-label="Exit fullscreen calibration">
        <Close />
      </button>}
      {/* Brightness monitor runs independently when connected */}
      {isConnected && (
        <>
          <ControllerMonitor />
          <BrightnessMonitor
            onBrightnessChange={handleAmbientBrightness}
            enabled={ambientSettings.enabled}
            captureRegion={ambientSettings.captureRegion}
            ledOn={ledOn}
          />
        </>
      )}
    </div>
  );
}


export default GaimglassApp;

