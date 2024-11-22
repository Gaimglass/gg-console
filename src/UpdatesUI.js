import React, { useState, useEffect } from 'react';
import { PropTypes } from "prop-types";
import styles from './css/UpdatesUI.module.css'
import { getMessageResult } from './Utils'
import classNames from 'classnames';
import {ReactComponent as Cancel} from './assets/xmark-solid.svg';
import {ReactComponent as RotateLeft} from './assets/rotate-left-solid.svg';


const electron = window.require('electron');
const ipcRenderer  = electron.ipcRenderer;

export default function UpdatesIU(props) {

  const [updateRequired, setUpdateRequired] = useState(false);
  const [error, setError] = useState(false);

  const [releaseName, setReleaseName] = useState('');
  // eslint-disable-next-line no-unused-vars
  const [releaseNotes, setReleaseNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(()=>{
    checkForUpdates();
    const interval = setInterval(() => {
      checkForUpdates();
    }, 1000 * 60 * 60); // continue checking once an hour
    return () => clearInterval(interval);
  }, [])

  function hide() {
    setError(false)
  }

  function restart() {
    getMessageResult(ipcRenderer.sendSync('restart-and-update-app'), (result)=>{
      // no-op, the app should just restart
    })
  }

  function checkForUpdates() {
    getMessageResult(ipcRenderer.sendSync('check-for-updates'), (result)=>{
      if (result.error) {
        setError(true);
        setUpdateRequired(false);
        setErrorMessage(result.error);
      } else if (result.updateAvailable) {
        setReleaseName(result.releaseName)
        setReleaseNotes(result.releaseNotes)
        setError(false);
        setUpdateRequired(true);
      }
      else {
        setUpdateRequired(false);
        setError(false);
      }
    })
  }
  

  const show = updateRequired || error ? 'visible' : 'hidden';
  return <div style={{visibility: show}} className={classNames({
    [styles.container]: true,
    [styles.error]: error
  })}>
    {error && (
      <div className={styles.errorWrapper}>
        <span>Update app error: {errorMessage}</span>
        <button onClick={()=>{hide()}} className={styles.button  + ' ' +  styles.cancelButton}>
          <Cancel className={styles.editIcon}></Cancel>
        </button>
      </div>
    )}
    {updateRequired && 
      <div>
        <span>New update required: {releaseName}</span>
        <button onClick={restart} className={styles.update}>
          <RotateLeft className={styles.restart}></RotateLeft>Restart App</button>
      </div>
    }
    
  </div>
}
  

UpdatesIU.propTypes = {
  releaseName: PropTypes.string,
  releaseNotes: PropTypes.string,
  errorMessage: PropTypes.string,
}
