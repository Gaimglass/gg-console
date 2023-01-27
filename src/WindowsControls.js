import React, { useState, useEffect } from 'react';
import styles from './css/WindowsControls.module.css'
import PropTypes from 'prop-types';


const electron = window.require('electron');
const ipcRenderer  = electron.ipcRenderer;


function WindowControls(props) {

  const [maximized, setMaximized] = useState(props.maximized);
  
  function onMin() {
    ipcRenderer.sendSync('window-minimize');
  }
  function onMax() {
    ipcRenderer.sendSync('window-maximize');
    setMaximized(true);
  }
  function onClose() {
    ipcRenderer.sendSync('window-close');
  }
  function onRestore() {
    ipcRenderer.sendSync('window-restore');
    setMaximized(false);
  }
  return (
    <>
      {props.showControls &&
        <div className={styles.controls}>
          <button onClick={onMin}  tabIndex="-1" className={`${styles.button} ${styles.min}`}>
            <img className={styles.icon} srcSet="icons/min-w-10.png 1x, icons/min-w-12.png 1.25x, icons/min-w-15.png 1.5x, icons/min-w-15.png 1.75x, icons/min-w-20.png 2x, icons/min-w-20.png 2.25x, icons/min-w-24.png 2.5x, icons/min-w-30.png 3x, icons/min-w-30.png 3.5x" draggable="false" />
          </button>

          { !maximized &&
            <button onClick={onMax} tabIndex="-1" className={`${styles.button} ${styles.max}`}>
              <img className={styles.icon} srcSet="icons/max-w-10.png 1x, icons/max-w-12.png 1.25x, icons/max-w-15.png 1.5x, icons/max-w-15.png 1.75x, icons/max-w-20.png 2x, icons/max-w-20.png 2.25x, icons/max-w-24.png 2.5x, icons/max-w-30.png 3x, icons/max-w-30.png 3.5x" draggable="false" />
            </button>
          }
          { maximized &&
            <button onClick={onRestore} tabIndex="-1"  className={`${styles.button} ${styles.restore}`}>
              <img className={styles.icon} srcSet="icons/restore-w-10.png 1x, icons/restore-w-12.png 1.25x, icons/restore-w-15.png 1.5x, icons/restore-w-15.png 1.75x, icons/restore-w-20.png 2x, icons/restore-w-20.png 2.25x, icons/restore-w-24.png 2.5x, icons/restore-w-30.png 3x, icons/restore-w-30.png 3.5x" draggable="false" />
            </button>
          }
          <button onClick={onClose} tabIndex="-1"  className={`${styles.button} ${styles.close}`}>
            <img className={styles.icon} srcSet="icons/close-w-10.png 1x, icons/close-w-12.png 1.25x, icons/close-w-15.png 1.5x, icons/close-w-15.png 1.75x, icons/close-w-20.png 2x, icons/close-w-20.png 2.25x, icons/close-w-24.png 2.5x, icons/close-w-30.png 3x, icons/close-w-30.png 3.5x" draggable="false" />
          </button>
        </div>
      }
    </>
  );
}

WindowControls.propTypes = {
  maximized: PropTypes.bool.isRequired,
  showControls: PropTypes.bool.isRequired
}

export default WindowControls;

