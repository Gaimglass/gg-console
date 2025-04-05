import React, { useMemo, useState } from 'react';
import ReactSlider from 'react-slider'

import styles from './css/ADS.module.css'
import { RgbColorPicker } from 'react-colorful';
import Switch from "react-switch";

import  { throttle, loadAppSettings, saveAppSettings } from './Utils'


const electron = window.require('electron');
const ipcRenderer  = electron.ipcRenderer;

export default function ADS() {
  const [settings, setSettings] = useState(loadAppSettings())
  
  const hue = useMemo(()=>{
    const h = (settings.ads.speed/100)*100;
    return Number.parseInt(h)
  }, [settings.ads.speed])
  

  function handleChange(v) {
    const newSettings = {...settings}
    newSettings.ads.enabled = v;
    setSettings(newSettings);
    saveAppSettings(newSettings)
    ipcRenderer.invoke('set-enable-ads', newSettings.ads);
  }
  function handleOnChangeMouse(e) {
    const mouseButton = Number.parseInt(e.target.value)
    const newSettings = {...settings}
    newSettings.ads.adsMouseButton = mouseButton;
    setSettings(newSettings);
    saveAppSettings(newSettings)
    ipcRenderer.invoke('set-enable-ads', newSettings.ads);
  }

  function handleOnChangeSpeed(value) {
    const newSettings = {
      ...settings,
      ads: {
        ...settings.ads,
        speed: value
      }
    }
    setSettings(newSettings);
    saveAppSettings(newSettings)
    ipcRenderer.invoke('set-enable-ads', newSettings.ads);

  }

  function handleColorChange(_newColor) {
    const newSettings = {
      ...settings,
      ads: {
        ...settings.ads,
        color: {..._newColor}
      }
    }
    setSettings(newSettings);
    saveAppSettings(newSettings)
    ipcRenderer.invoke('set-enable-ads', newSettings.ads);
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
        checked={settings.ads.enabled} />
      <label>Enable ADS Toggle Color</label>
    </div>

    <div className={styles.adsControls}>
      <div>
        <RgbColorPicker
            color={settings.ads.color}
            onChange={ throttle(handleColorChange, 100) }
          />
      </div>
      <div className={styles.rightControls}>
        <div>
          <h3 className={styles.noMarginTop}>ADS Toggle Bindings</h3>
          <p><em>Note: These button binding must match your games'</em></p>
          <table className={styles.mouseBindingsTable}>
            <tbody>
              <tr>
                <td>Mouse Button</td>
                <td>
                  <select defaultValue={settings.ads.adsMouseButton} onChange={handleOnChangeMouse} type="text">
                    <option value="1">Mouse 1</option>
                    <option value="2">Mouse 2</option>
                    <option value="3">Mouse 3</option>
                    <option value="4">Mouse 4</option>
                    <option value="5">Mouse 5</option>
                  </select>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <h3>Color Transition Speed</h3>
        <div className={styles.speedLabelContainer}> 
        </div>
        <ReactSlider
          onChange={handleOnChangeSpeed}
          value={settings.ads.speed}
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