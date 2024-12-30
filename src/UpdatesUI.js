import React, { useState, useEffect } from 'react';
import classNames from 'classnames';
import { PropTypes } from "prop-types";

import styles from './css/UpdatesUI.module.css'
import { getMessageResult } from './Utils'

import {ReactComponent as RotateLeft} from './assets/rotate-left-solid.svg';


const electron = window.require('electron');
const ipcRenderer  = electron.ipcRenderer;

export default function UpdatesIU() {

  const [updateRequired, setUpdateRequired] = useState(false);


  const [releaseName, setReleaseName] = useState('');
  // eslint-disable-next-line no-unused-vars
  const [releaseNotes, setReleaseNotes] = useState('');
  
  useEffect(()=>{
    checkForUpdatesUI();
    const interval = setInterval(() => {
      checkForUpdatesUI();
    }, 1000 * 60 * 60); // continue checking once an hour
    return () => clearInterval(interval);
  }, [])

  function restart() {
    getMessageResult(ipcRenderer.sendSync('restart-and-update-app'), (result)=>{
      // no-op, the app should just restart
    })
  }

  async function checkForUpdatesUI() {
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
  return <div style={{visibility: show}} className={classNames({
    [styles.container]: true,
    //[styles.error]: error
  })}> 
    {updateRequired && 
      <div>
        <span>New update installed: {releaseName}</span>
        <button onClick={restart} className={styles.update}>
          <RotateLeft className={styles.restart}></RotateLeft>Restart required</button>
      </div>
    }
    
  </div>
}
  

UpdatesIU.propTypes = {
  releaseName: PropTypes.string,
  releaseNotes: PropTypes.string,
  errorMessage: PropTypes.string,
}
