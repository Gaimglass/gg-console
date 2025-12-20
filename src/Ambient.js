import React from 'react';
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
    </div>
  );
}
