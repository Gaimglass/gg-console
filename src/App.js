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

  const [color, setColor] = useState({r:255,g:255,b:255,a:0});
  const [defaultColors, setDefaultColors] = useState([]);
  const [defaultColorIndex, setDefaultColorIndex] = useState(0);
  const [ledOn, setLEDOn] = useState(true);
  const [isMaximized, setMaximized] = useState(false);
  const [isMac, setMac] = useState(false);

  // store
  //const ledOn = useSelector(state => state.status.ledOn);

  useEffect(() => {
    //
  }, [color, ledOn]);


  useEffect(()=>{
    
    const appState = ipcRenderer.sendSync('get-app-state');
    
    setMaximized(appState.isMaximized);
    setMac(appState.isMac);
    // TODO remove timeout
    // TODO call a function that blocks until port is open, then do the loading, these dont work the first load
    //setTimeout(()=>{
      
      loadMainLedFromGG();
      loadDefaultColorsFromGG();  
      
    //},1000)
    
    //getGGState();
    
    ipcRenderer.on('update-main-led-state-from-gg', function (evt, message) {
      (throttle(()=>{
        parseMainLedFromGG(message) 
      }, 100))();
    });

    ipcRenderer.on('update-default-colors-from-gg', function (evt, message) {
      debugger;
      parseDefaultColors(message);
    });
  }, [])
  
  
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
    console.log("sendMainLEDStatus", {
      color,
      brightness: color.a,
      ledOn
    });

    getMessageResult(ipcRenderer.sendSync('set-led-state', {
      color,
      brightness: color.a,
      ledOn
    }));
  }


  async function getMessageResult(promise, cb, onError) {
    const result = await promise;
     if (result instanceof Error) {
      console.error(result);
      onError(result);
    } else {
      // todo, update state with new values 
      console.log("result:", result);
      if (cb) {
        cb(result);
      };
    }
  }

  
  function handleColorChange(_newColor) {
    // todo setColor only after a debounce time, we should not update state as frequently as adjusting color.
    // OR perhaps the current color's source of truth can simply be the component?
    /*const newColor = newColor;
    console.log(newColor);
    if (!newColor.a) {
      newColor.a = color.a
    }*/
    //console.log(color.a, newColor.a);
    const newColor = {
      ..._newColor,
      a: _newColor.a ?? color.a // defaults don't have an alpha so use the current value
    }
    console.log("calling handleColorChange", newColor)
    setColor(newColor);
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
  function parseDefaultColors(message) {
    console.log("parseDefaultColors")
    let vars = message.split('&');
    const defaults = []; 
    let index;
    for (let v of vars) {
      let [key, value] = v.split('=')
      if (key == 'color') {
        let [r,b,g, enabled] = value.split(',');
        defaults.push({
          color: {
            r: Number(r), 
            g: Number(g), 
            b: Number(b)
          },
          enabled
        });
      } else if (key == 'index') {
        index = Number(value);
      }
      
    }
    setDefaultColors(defaults);
    setDefaultColorIndex(index);

    console.log("DEFAULT", message); // Returns: {'SAVED': 'File Saved'}
  }

  function parseMainLedFromGG(message) { 
    console.log("parseMainLedFromGG", message);
    const params = message.split('&');
    let c = {};
    let led;
    let index;
    params.forEach(param => {
      const [key, value] = param.split('=');
      // eslint-disable-next-line default-case
      switch(key) {
        case 'color':
          const [r,g,b] = value.split(',');
          c.r = Number(r);
          c.g = Number(g);
          c.b = Number(b);
          break;
        case 'ledOn':
          led = Boolean(Number(value));
          break;
        case 'brightness':
          c.a = Number(value);
          break;
        case 'index':
          index = value;
          break;
      }
    });
    setColor(c);
    setLEDOn(led);
    setDefaultColorIndex(index);
  }
  

  async function loadMainLedFromGG() { 
    await getMessageResult(ipcRenderer.sendSync('get-led-state'), (result)=>{ 
      parseMainLedFromGG(result);
    });
    /* await getMessageResult(ipcRenderer.sendSync('get-led-state', (result)=>{
      debugger;
    })); */
  }

  
  async function loadDefaultColorsFromGG() { 
    console.log("loadDefaultColorsFromGG")
    await getMessageResult(ipcRenderer.sendSync('get-default-colors'), (result)=>{
      parseDefaultColors(result);
    });
  }

  // @deprecated
  async function _getGGState() {
    //syncGG = false;
    await getMessageResult(ipcRenderer.sendSync('get-gg-state'), (result)=>{
      debugger;
      console.log('getGGState')
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

