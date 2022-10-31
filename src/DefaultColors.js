import React, { useState, useEffect, useMemo, useRef } from 'react';
import styles from './css/DefaultColors.module.css'


const electron = window.require('electron');
const ipcRenderer  = electron.ipcRenderer;
//const fs = electron.remote.require('fs');


function DefaultColors(props) {
  
  const [color, setColor] = useState({r:200,g:20,b:255,a:0.123456});
  const [ledOn, setLEDOn] = useState(true);

  
  // useEffect(() => {

  // }, []);

  return (
    <div className={styles.defaultColors}>
      <div className={styles.swatch}></div>
      <div className={styles.swatch}></div>
      <div className={styles.swatch}></div>
    </div>
  );
}


export default DefaultColors;

