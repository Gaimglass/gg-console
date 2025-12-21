import React from 'react';
import ReactSlider from 'react-slider';
import Switch from "react-switch";
import styles from './css/Ambient.module.css';
import { useSettings } from './SettingsProvider';

export default function Ambient() {
  const { ambientSettings, updateAmbientSettings } = useSettings();

  function handleChange(enabled) {
    updateAmbientSettings({
      ...ambientSettings,
      enabled: enabled
    });
  }

  function handleRegionChange(value) {
    updateAmbientSettings({
      ...ambientSettings,
      captureRegion: value
    });
  }

  return (
    <div className={styles.container}>
      <div className={styles.row}>
        <Switch
          className={styles.switch}
          onChange={handleChange}
          checked={ambientSettings?.enabled || false}
          onColor="#86d3ff"
          onHandleColor="#2693e6"
          handleDiameter={30}
          uncheckedIcon={false}
          checkedIcon={false}
          boxShadow="0px 1px 5px rgba(0, 0, 0, 0.6)"
          activeBoxShadow="0px 0px 1px 10px rgba(0, 0, 0, 0.2)"
          height={20}
          width={48}
        />
        <label className={styles.label}>Enable Ambient Brightness</label>
      </div>
      <p><em>Automatically adjusts LED brightness based on screen content.</em></p>
      
      <div className={styles.regionControl}>
        <label className={styles.label}>
          Capture Region: {ambientSettings?.captureRegion || 100}%
        </label>
        <ReactSlider
          onChange={handleRegionChange}
          value={ambientSettings?.captureRegion || 100}
          min={10}
          max={100}
          step={5}
          className={styles.slider}
          thumbClassName={styles.thumb}
          renderTrack={(props, state) => {
            const {key, style} = props;
            const region = ambientSettings?.captureRegion || 100;
            // Color changes from blue (10%) to green (100%)
            const hue = 200 + ((region - 10) / 90) * 80; // 200 to 280 degrees
            const mergedStyle = {
              ...style,
              backgroundColor: `hsl(${hue}deg 50% 50%)`
            }
            return <div style={mergedStyle} key={key} className={styles.trackInner} />
          }}
          renderThumb={(props, state) => {
            const {key, ...rest} = props;
            return <div key={key} {...rest}></div>
          }}
        />
        <p><em>Center {ambientSettings?.captureRegion || 100}% of screen (100% = full screen, 10% = small center area)</em></p>
      </div>
    </div>
  );
}
