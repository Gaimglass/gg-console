import React, { useCallback, useEffect, useMemo } from 'react';
import ReactSlider from 'react-slider'

import styles from './css/ADS.module.css'
import { RgbColorPicker } from 'react-colorful';
import Switch from "react-switch";

import { useThrottle } from './Utils'
import { useSettings } from './SettingsProvider';
import { useController } from './ControllerProvider';

const XBOX_MAPPING = {
  0:  "A",
  1:  "B",
  2:  "X",
  3:  "Y",

  4:  "LB",
  5:  "RB",
  6:  "LT",        // Analog (0–1)
  7:  "RT",        // Analog (0–1)

  8:  "Back",
  9:  "Start",

  10: "L3",        // Left stick click
  11: "R3",        // Right stick click

  12: "DPadUp",
  13: "DPadDown",
  14: "DPadLeft",
  15: "DPadRight",

  16: "Home"       // Xbox logo (may not always be exposed)
};
/* eslint-disable no-unused-vars */
const PS5_MAPPING = {
  0:  "Cross",        // Bottom button (X)
  1:  "Circle",       // Right
  2:  "Square",       // Left
  3:  "Triangle",     // Top
  
  4:  "L1",
  5:  "R1",
  6:  "L2",           // Analog (value 0–1)
  7:  "R2",           // Analog (value 0–1)

  8:  "Create",       // Formerly Share
  9:  "Options",

  10: "L3",           // Left stick click
  11: "R3",           // Right stick click

  12: "DPadUp",
  13: "DPadDown",
  14: "DPadLeft",
  15: "DPadRight",

  16: "Touchpad",     // Touchpad click
  17: "PS",           // PlayStation logo (may not always be exposed)
  // 18 may appear on some firmware: "MicMute"
};

export default function ADS() {
  const { adsSettings, updateADSSettings } = useSettings();
  const {type} = useController();
  const [controllerConnected, setControllerConnected] = React.useState(true);

  const handleColorChange = useCallback((_newColor) => {
    updateADSSettings({
      ...adsSettings,
      color: { ..._newColor }
    });
  }, [adsSettings, updateADSSettings]);

  
  const controllerButtons = useMemo(() => {
    if (type === 'xinput') {
      return Object.entries(XBOX_MAPPING)
    }
    // todo add hid type check for ps5
  }, [type]);

  useEffect(() => {
    setControllerConnected(type !== null)
  }, [type]);

  const handleColorChangeThrottled = useThrottle(handleColorChange, 50);

  const hue = useMemo(()=>{
    const h = (adsSettings.speed/100)*100;
    return Number.parseInt(h)
  }, [adsSettings.speed])
  

  function handleChange(v) {
    const newSettings = {
      ...adsSettings,
      enabled: v
    };
    updateADSSettings(newSettings);
  }
  
  function handleOnChangeMouse(e) {
    const mouseButton = Number.parseInt(e.target.value)
    updateADSSettings({
      ...adsSettings,
      adsMouseButton: mouseButton
    });
  }

  function handleOnChangeController(e) {
    const controllerButton = Number.parseInt(e.target.value)
    updateADSSettings({
      ...adsSettings,
      adsControllerButton: controllerButton
    });
  }
  

  function handleOnChangeSpeed(value) {
    updateADSSettings({
      ...adsSettings,
      speed: value
    });
  }


  function changeRgb(e, colorComponent) {
    const rawString = e.target.value.trim();
    let updateKey = false; // force an update on the input field too
    let newColorComponent = parseInt(rawString);
    if (isNaN(newColorComponent)) {
      return;
    } else if(newColorComponent > 255) {
      newColorComponent = 255;
      updateKey = true;
    } else if(newColorComponent < 0) {
      newColorComponent = 0;
      updateKey = true;
    }

    const newColor = {
      ...adsSettings.color,
      [colorComponent]: newColorComponent
    }
    
    if(updateKey) {
      e.target.value = newColorComponent
    }

    updateADSSettings({
      ...adsSettings,
      color: newColor
    });
  }
  
  return <div className={styles.container}>
    <div className={styles.switchContainer}>
      <Switch
        className={styles.switch}
        onColor="#86d3ff"
        onHandleColor="#2693e6"
        handleDiameter={30}
        uncheckedIcon={false}
        checkedIcon={false}
        boxShadow="0px 1px 5px rgba(0, 0, 0, 0.6)"
        activeBoxShadow="0px 0px 1px 10px rgba(0, 0, 0, 0.2)"
        height={20}
        width={48}
        
        id="material-switch"
        onChange={handleChange} 
        checked={adsSettings.enabled} />
      <label>Enable ADS Hold Color</label>
    </div>

    <div className={styles.adsControls}>
      <div>
        <RgbColorPicker
            color={adsSettings.color}
            onChange={ handleColorChangeThrottled }
          />
          <div className={styles.rgbInputs}>
            <label>R</label><input  onChange={(e) => changeRgb(e, 'r')} value={adsSettings.color.r} type="text"></input>
            <label>G</label><input  onChange={(e) => changeRgb(e, 'g')} value={adsSettings.color.g} type="text"></input>
            <label>B</label><input  onChange={(e) => changeRgb(e, 'b')} value={adsSettings.color.b} type="text"></input>
          </div>
      </div>
      <div className={styles.rightControls}>
        <div>
          <h3 className={styles.noMarginTop}>ADS Hold Bindings</h3>
          <p><em>Note: These button binding must match your games&apos;</em></p>
          <table className={styles.mouseBindingsTable}>
            <tbody>
              <tr>
                <td>Mouse Button</td>
                <td>
                  <select defaultValue={adsSettings.adsMouseButton} onChange={handleOnChangeMouse} type="text">
                    <option value="1">Mouse 1</option>
                    <option value="2">Mouse 2</option>
                    <option value="3">Mouse 3</option>
                    <option value="4">Mouse 4</option>
                    <option value="5">Mouse 5</option>
                  </select>
                </td>
              </tr>
                {controllerConnected && <tr>
                  <td>Controller Button</td>
                  <td>
                    <select defaultValue={adsSettings.adsControllerButton} onChange={handleOnChangeController} type="text">
                      {
                        controllerButtons?.map(([key, name])=>(
                          <option defaultValue={adsSettings.adsControllerButton === key} key={key} value={key}>{name}</option>
                        ))
                      }
                    </select>
                  </td>
                </tr>
              }
              {!controllerConnected && <tr><td>Controller not connected</td></tr>}
            </tbody>
          </table>
        </div>
        <h3>Color Transition Speed</h3>
        <div className={styles.speedLabelContainer}> 
        </div>
        <ReactSlider
          onChange={handleOnChangeSpeed}
          value={adsSettings.speed}
          min={5}
          max={100}
          className={styles.slider}
          thumbClassName={styles.thumb}
          renderTrack={(props, state) => {
            const {key, style} = props;
            const mergedStyle = {
              ...style,
              backgroundColor: `hsl(${hue}deg 50% 50%)`
              
            }
            return <div style={mergedStyle}  key={key} className={styles.trackInner} />
          }}
          renderThumb={(props, state) => {
            const {key, ...rest} = props;
            return <div key={key} {...rest}></div>
          }}
        />
      </div>
    </div>
  </div>

}