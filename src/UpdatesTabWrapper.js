import React, { useState, useEffect } from 'react';
import classNames from 'classnames';
import { PropTypes } from "prop-types";

import styles from './css/UpdatesTabWrapper.module.css'
import { getMessageResult } from './Utils'
import {ReactComponent as RotateLeft} from './assets/rotate-left-solid.svg';


const electron = window.require('electron');
const ipcRenderer  = electron.ipcRenderer;

export default function UpdatesTabWrapper({children}) {

  const [updateRequired, setUpdateRequired] = useState(false);
  const [releaseName, setReleaseName] = useState('');
  // eslint-disable-next-line no-unused-vars
  const [releaseNotes, setReleaseNotes] = useState('');
  
  useEffect(()=>{
    checkForUpdatesTabWrapper();
    const interval = setInterval(() => {
      checkForUpdatesTabWrapper();
    }, 1000 * 60 * 60); // continue checking once an hour
    return () => clearInterval(interval);
  }, [])

  function restart() {
    getMessageResult(ipcRenderer.sendSync('restart-and-update-app'), (result)=>{
      // no-op, the app should just restart
    })
  }

  async function checkForUpdatesTabWrapper() {
    const result = await ipcRenderer.invoke('check-for-updates');
    if (result.error) {
      // keep errors silent, mostly these are network connection issues that can be ignored
      setUpdateRequired(false);
      //setErrorMessage(result.error);
    } else if (result.updateAvailable) {
      setReleaseName(result.releaseName)
      setReleaseNotes(result.releaseNotes)
      setUpdateRequired(true);
    }
    else {
      setUpdateRequired(false);
    }
  }

  const show = updateRequired ? 'visible' : 'hidden';
  return <div className={classNames({
    [styles.container]: true,
    [styles.restartRequired]: updateRequired,
    //[styles.error]: error
  })}> 
      {children}
      <div className={styles.buttonContainer} style={{visibility: show}} >
        <span>New update ready: {releaseName}</span>
        <button onClick={restart} className={styles.update}>
          <RotateLeft className={styles.restart}></RotateLeft>Restart required</button>
      </div>
  </div>
}
  

UpdatesTabWrapper.propTypes = {
  releaseName: PropTypes.string,
  releaseNotes: PropTypes.string,
  errorMessage: PropTypes.string,
}
