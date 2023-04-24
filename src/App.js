import React, { useState, useEffect, useMemo, useRef } from 'react';
import { RgbaColorPicker, HslColorPicker } from 'react-colorful';
import { useSelector, useDispatch } from 'react-redux'
import { status, setBrightness } from './store/status'
import classNames from 'classnames';

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

  const [color, setColor] = useState({});
  const [defaultColors, setDefaultColors] = useState([]);
  const [ledOn, setLEDOn] = useState(true);
  const [isMaximized, setMaximized] = useState(false);
  const [isMac, setMac] = useState(false);

  // store
  //const ledOn = useSelector(state => state.status.ledOn);

  useEffect(() => {
    //
  }, [color, ledOn]);


  useEffect(()=>{
    console.log(1)
    const appState = ipcRenderer.sendSync('get-app-state');
    console.log(2)
    setMaximized(appState.isMaximized);
    setMac(appState.isMac);
    getGGState();
    console.log(3)
  }, [])
  
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

  
  function handleColorChange(newColor) {
    // todo setColor only after a debounce time, we should not update state as frequently as adjusting color.
    // OR perhaps the current color's source of truth can simply be the component?
    /*const newColor = newColor;
    console.log(newColor);
    if (!newColor.a) {
      newColor.a = color.a
    }*/
    //console.log(color.a, newColor.a);
    setColor({
      ...newColor,
      a: newColor.a ?? color.a
    });
    sendMainLEDStatus(newColor, ledOn);
  };

  function toggleLEDOn() {
    const on = !ledOn;
    setLEDOn(on);
    sendMainLEDStatus(color, on);
  }

  function writeDefault() {
    ipcRenderer.sendSync('set-default-color', {red: color.rgb.r, green: color.rgb.g, blue: color.rgb.b})
  }


  // async function getDefaultLEDColors() {
  //   await getMessageResult(ipcRenderer.sendSync('get-default-colors'), (result)=>{
  //     // rrr,ggg,bbb,a.aa;...
  //     setDefaultColors([
  //       {r:40,g:255, b:0, a:1.0}, // GG green
  //       {r:0, g:255, b:255, a:1.0}, // teal
  //       {r:0, g:0, b:255, a:1.0}, // blue
  //       {r:255, g:0, b:255, a:1.0}, // purple
  //       {r:255, g:0, b:0, a:1.0}, // red
  //       {r:255, g:150, b:0, a:1.0}, // orange
  //       {r:255, g:200, b:0, a:1.0}, // gold
  //       {r:255, g:200, b:200, a:1.0}, // pink
  //     ])
  //     //const params = result.split('&');
  //   });
  // }

  async function getGGState() {
    //syncGG = false;
    await getMessageResult(ipcRenderer.sendSync('get-gg-state'), (result)=>{
      const params = result.split('&');
      let r,g,b,a,ledOn;
      // defaults, TODO move to another place
      r=200;
      g=20;
      b=255;
      a=0.123456;
      ledOn = true;

      // temp
      const defaultColors = [
         {r:40, g:255, b:0}, // GG green
         {r:0, g:255, b:255}, // teal
         {r:0, g:0, b:255}, // blue
         {r:200, g:0, b:255}, // purple
         {r:255, g:0, b:0}, // red
         {r:255, g:100, b:0}, // orange
         {r:255, g:200, b:0}, // gold
         {r:255, g:200, b:200}, // pink
       ];
       console.log(4.5);
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
          case 'defaultColors':
            // todo read from buffer and assign to state
            break;

        }
      });
      setDefaultColors(defaultColors);
      console.log({defaultColors});
      setColor({r,g,b,a});
      console.log("LEDON:", ledOn);
      setLEDOn(ledOn);
    });
  }

  return (
    <div className={styles.App}>
      <header className={styles.header}>
        <div className={styles.drag}>
          <div className={
              classNames({
                [styles.title]: true,
                [styles.alignRight]: isMac,
              })
            }>
            g<span className={styles.green}>aim</span>glass
            {/* <img src={logo} className="App-logo" alt="gaimglass" /> */}
          </div>
          <WindowControls maximized={isMaximized} showControls={!isMac}></WindowControls>
        </div>
      </header>
      <div className={styles.mainContainer}>
        <div className={styles.main}>
    
          <button onClick={writeDefault}>Set Default Color</button>
          {/* <button onClick={readDefault}>Get Default Color</button> */}

          <button className={styles.foo} onClick={toggleLEDOn}>{ledOn ? "Turn Off" : "Turn On"}</button>
          

          <div>{ledOn.toString()}</div>
          <div>{color.r},{color.g},{color.b},{color.a}</div>
          
          <RgbaColorPicker
            color={color}
            onChange={ throttle(handleColorChange, 50) }
          ></RgbaColorPicker>
        </div>
        <div className={styles.colors}>
          <DefaultColors
            colors={defaultColors}
            onChangeColor={handleColorChange}
          ></DefaultColors>
        </div>
      </div>
    </div>
  );
}


export default App;

