import React, { useState, useEffect, useRef } from 'react';
import classNames from 'classnames';
import { PropTypes } from "prop-types";

import styles from './css/UpdatesTabWrapper.module.css'
import RotateLeft from './assets/rotate-left-solid.svg?react';


const ipcRenderer  = window.ipcRenderer;

export default function UpdatesTabWrapper({ children }) {
  const [updateRequired, setUpdateRequired] = useState(false);
  const [releaseName, setReleaseName] = useState('');
  const hasChecked = useRef(false);
  
  useEffect(()=>{
    // Prevent double-call in React Strict Mode (dev only)
    if (hasChecked.current) return;
    hasChecked.current = true;
    
    checkForUpdatesTabWrapper();
    const interval = setInterval(() => {
      checkForUpdatesTabWrapper();
    }, 1000 * 60 * 60); // continue checking once an hour
    return () => clearInterval(interval);
  }, [])

  function restart() {
    ipcRenderer.invoke('restart-and-update-app');
  }

  async function checkForUpdatesTabWrapper() {
    const result = await ipcRenderer.invoke('check-for-updates');
    if (result.error) {
      // Keep errors silent, mostly these are network connection issues that can be ignored
      setUpdateRequired(false);
    } else if (result.updateAvailable) {
      setReleaseName(result.releaseName);
      setUpdateRequired(true);
    } else {
      setUpdateRequired(false);
    }
  }

  const show = updateRequired ? 'visible' : 'hidden';
  return (
    <div className={classNames({
      [styles.container]: true,
      [styles.restartRequired]: updateRequired,
    })}>
      {children}
      <div className={styles.buttonContainer} style={{ visibility: show }}>
        <span>New update ready: {releaseName}</span>
        <button onClick={restart} className={styles.update}>
          <RotateLeft className={styles.restart} />
          Restart required
        </button>
      </div>
    </div>
  );
}
  

UpdatesTabWrapper.propTypes = {
  children: PropTypes.node.isRequired,
};
