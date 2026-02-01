import React, { useState, useEffect } from 'react';
import ReactSlider from 'react-slider';
import Switch from "react-switch";

import styles from './css/Ambient.module.css';
import { useSettings } from './SettingsProvider';
import { useDebounce } from './Utils';
import ChartScreenSize  from './ChartScreenSize';
import ChartBrightness  from './ChartBrightness';


export default function Ambient() {
  const { ambientSettings, updateAmbientSettings } = useSettings();
  const [localRegion, setLocalRegion] = useState(ambientSettings?.captureRegion || 100);
  const [localEnabled, setLocalEnabled] = useState(ambientSettings?.enabled || false);
  const exponent = ambientSettings?.exponent ?? 1.65;

  const debouncedUpdateEnabled = useDebounce((enabled) => {
    updateAmbientSettings({
      ...ambientSettings,
      enabled
    });
  }, 250);

  // Sync local state when settings change externally
  useEffect(() => {
    /*eslint-disable-next-line react-hooks/exhaustive-deps */
    setLocalRegion(ambientSettings?.captureRegion || 100);
    setLocalEnabled(ambientSettings?.enabled || false);
  }, [ambientSettings?.captureRegion, ambientSettings?.enabled]);

  function handleEnabledChange(enabled) {
    // Update local state immediately for responsive UI
    setLocalEnabled(enabled);
    // Debounced settings update to avoid rapid setup/cleanup cycles
    debouncedUpdateEnabled(enabled);
  }

  function handleRegionChange(value) {
    // Update local state immediately for responsive UI (this might be ahead of the actual setting)
    setLocalRegion(value);
    // Debounced settings update to avoid rapid setup/cleanup cycles
    //debouncedUpdateRegion(value);
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
          onChange={handleEnabledChange}
          checked={localEnabled}
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
        <label className={styles.label}>Enable Ambient Dimming</label>
      </div>
      <p><em>Automatically dims the LED brightness based on screen content. Gaimglass will dim in dark areas of the game and brighten in lighter ones.</em></p>
      
      <div className={styles.regionControl}>
        <div className={styles.chartRow}>
          <div>
            <label className={styles.label}>
              Capture Region: {localRegion}%
            </label>
            <ReactSlider
              onChange={handleRegionChange}
              value={localRegion}
              min={20}
              max={100}
              step={5}
              className={styles.slider}
              thumbClassName={styles.thumb}
              renderTrack={(props) => {
                const {key, style} = props;
                const region = localRegion;
                // Color changes from blue (10%) to green (100%)
                const hue = 200 + ((region - 10) / 90) * 120; // 200 to 320 degrees
                const mergedStyle = {
                  ...style,
                  backgroundColor: `hsl(${hue}deg 50% 50%)`
                }
                return <div style={mergedStyle} key={key} className={styles.trackInner} />
              }}
              renderThumb={(props) => {
                const {key, ...rest} = props;
                return <div key={key} {...rest}></div>
              }}
            />
            <p><em>Center {localRegion}% of screen (100% = full screen, 10% = small center area)</em></p>
          </div>
          <div>
            <ChartScreenSize percentSize={localRegion} />
          </div>
        </div>

        <div className={styles.chartRow}>
          <div>
            <label className={styles.label}>
              Brightness Curve Exponent: {exponent.toFixed(2)}
            </label>
            <ReactSlider
              onChange={(value) => updateAmbientSettings({
                ...ambientSettings,
                exponent: value
              })}
              value={exponent}
              min={0.5}
              max={2.5}
              step={0.1}
              className={styles.slider}
              thumbClassName={styles.thumb}
              renderTrack={(props) => {
                const {key, style} = props;
                // Color changes from blue (10%) to green (100%)
                const hue = 200 + (exponent / 5) * 120; // 200 to 320 degrees
                const mergedStyle = {
                  ...style,
                  backgroundColor: `hsl(${hue}deg 50% 50%)`
                }
                return <div style={mergedStyle} key={key} className={styles.trackInner} />
              }}
              renderThumb={(props) => {
                const {key, ...rest} = props;
                return <div key={key} {...rest}></div>
              }}
            />
            <p><em>Adjusts how brightness responds to screen content (lower = more sensitive in dark areas, higher = more sensitive in bright areas)</em></p>
          </div>
          <div>
            <ChartBrightness exponent={exponent} />
          </div>
        </div>
      </div>
    </div>
  );
}