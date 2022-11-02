import React, { useState, useEffect, useMemo, useRef } from 'react';
import { SketchPicker } from 'react-color';
import { RgbaColorPicker, HslColorPicker } from 'react-colorful';
import { useSelector, useDispatch } from 'react-redux'
import { status, setBrightness } from './store/status'

import DefaultColors from './DefaultColors'
import WindowControls from './WindowsControls'

import styles from './css/App.module.css'

import logo from './assets/logo.png';
import './css/globalStyles.css';

const electron = window.require('electron');
const ipcRenderer  = electron.ipcRenderer;

let timer;
let latestFunc;

function App() {
  
  const dispatch = useDispatch();

  let syncGG = true;//useRef(true);

  const [color, setColor] = useState({r:200,g:20,b:255,a:0.123456});
  const [ledOn, setLEDOn] = useState(true);

  // store
  //const ledOn = useSelector(state => state.status.ledOn);

  useEffect(() => {
    //
    
  }, [color, ledOn]);
  
  useEffect(() => {
    //debugger;
    // TODO add some delay here because GG is not normally ready to accept serial input
    //(async () => {
      
      //const c = await ipcRenderer.send('get-status');
      
    //})();
    
    //dispatch(initializeStatus());
    /*
    console.log("getting color..");
    const c = ipcRenderer.sendSync('get-color');
    if (c) {
      setColor({
        ...c
      });
      // pass color to gaimglass
      ipcRenderer.sendSync('set-led-state', c);
    } else {
      // set up default color perhaps?
    }*/
  }, []);

  
  function throttle(func, timeout = 50){
    return (...args) => {
      if (!timer) {
        func.apply(this, args);
        timer = setTimeout(() => {
          timer = undefined;
          if(latestFunc) {
            // ensures the last one always proceeds
            latestFunc.apply(this, args);
            latestFunc = undefined;
            console.log("apply LAST!");
          }
        }, timeout);
      } else {
        latestFunc = () => {
          func.apply(this, args);
        }
      }
    };
  }


  function sendMainLEDStatus(color, ledOn) {
    getMessageResult(ipcRenderer.sendSync('set-led-state', {
      color,
      brightness: color.a,
      ledOn
    }));
  }

  async function getMessageResult(promise, cb) {
    const result = await promise;
     if (result instanceof Error) {
      console.error(result);
    } else {
      // todo, update state with new values
      console.log("result:", result);
      if (cb) {
        cb(result);
      };
    }
  }

  
  function handleColorChange(color) {
    // todo setColor only after a debounce time, we should not update state as frequently as adjusting color.
    // OR perhaps the current color's source of truth can simply be the component?
    setColor(color);
    sendMainLEDStatus(color, ledOn);
  };

  function toggleLEDOn() {
    const on = !ledOn;
    setLEDOn(on);
    sendMainLEDStatus(color, on);
  }

  function writeDefault() {
    ipcRenderer.sendSync('set-default-color', {red: color.rgb.r, green: color.rgb.g, blue: color.rgb.b})
  }


  async function getMainLEDStatus() {
    //syncGG = false;
    await getMessageResult(ipcRenderer.sendSync('get-led-state'), (result)=>{
      const params = result.split('&');
      let r,g,b,a,ledOn;
      params.forEach(param => {
        const [key, value] = param.split('=');
        // eslint-disable-next-line default-case
        switch(key) {
          case 'color':
            [r,g,b] = value.split(',');
            break;
          case 'ledOn':
            ledOn = Boolean(Number(value));
            break;
          case 'brightness':
            a = value;
            break;
        }
      });
      setColor({r,g,b,a});
      console.log("LEDON:", ledOn);
      setLEDOn(ledOn);
    });
  }

  return (
    <div className={styles.App}>
      <header className={styles.header}>
        <div className={styles.drag}>
          <div className={styles.title}>
            g<span className={styles.green}>aim</span>glass
            {/* <img src={logo} className="App-logo" alt="gaimglass" /> */}
          </div>
          <WindowControls></WindowControls>
        </div>
      </header>
      <div className={styles.mainContainer}>
        <div className={styles.main}>
    
          <button onClick={writeDefault}>Set Default Color</button>
          {/* <button onClick={readDefault}>Get Default Color</button> */}

          <button className={styles.foo} onClick={toggleLEDOn}>{ledOn ? "Turn Off" : "Turn On"}</button>
          <button onClick={getMainLEDStatus}>Get Status</button>

          <div>{ledOn.toString()}</div>
          <div>{color.r},{color.g},{color.b},{color.a}</div>
          
          <RgbaColorPicker
            color={color}
            onChange={ throttle(handleColorChange, 50) }
          ></RgbaColorPicker>
        </div>
        <div className={styles.colors}>
          <DefaultColors></DefaultColors>
        </div>
      </div>
    </div>
  );
}


export default App;

