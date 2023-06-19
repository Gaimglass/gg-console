import React, { useState, useEffect, useMemo, useRef } from 'react';
import { RgbaColorPicker, HslColorPicker } from 'react-colorful';
import { useSelector, useDispatch } from 'react-redux'
import { status, setBrightness } from './store/status'
import classNames from 'classnames';

import DefaultColors from './DefaultColors'
import WindowControls from './WindowsControls'

import styles from './css/App.module.css'

import {ReactComponent as PowerSwitch} from './assets/power-off-solid.svg';
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
  const [defaultColorIndex, setDefaultColorIndex] = useState(0); // -1 for a custom color
  const [ledOn, setLEDOn] = useState(true);
  const [isMaximized, setMaximized] = useState(false);
  const [isMac, setMac] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [editSwatch, setEditSwatch] = useState(null);

  const [inputColorKey, setInputColorKey] = useState({});


  useEffect(()=>{
    ipcRenderer.sendSync('get-app-state'); // non-blocking
    initialDefaults();
    // TODO do we really need these here too?
    loadMainLedFromGG();
    loadDefaultColorsFromGG();
    // 
    
    ipcRenderer.on('update-main-led-state-from-gg', function (evt, message) {
      (throttle(()=>{
        parseMainLedFromGG(message) 
      }, 100))();
    });

    ipcRenderer.on('update-default-colors-from-gg', function (evt, message) {
      parseDefaultColors(message);
    });

    ipcRenderer.on('usb-connected', function (evt, message) {
      // initialize values
      loadMainLedFromGG();
      loadDefaultColorsFromGG();
    });

    ipcRenderer.on('usb-disconnected', function (evt, message) {
      // todo, show a better disconnected UI
      setIsConnected(false);
    });

    

  }, [])
  
  function initialDefaults() {
    const defaults = [];
    const initialDefaultColors = [
      {r:0,g:255, b:0},
      {r:255, g:240, b:0}, 
      {r:255, g:110, b:0}, 
      {r:255, g:0, b:0}, 
      {r:255, g:0, b:160}, 
      {r:0, g:40, b:255}, 
      {r:100, g:180, b:255}, 
      {r:0, g:255, b:100}, 
    ];
    for (let i = 0; i < 8;i++) {
      defaults.push({
        color: initialDefaultColors[i],
        enabled: true
      });
    }
    // these are the colors that will be rendered if no GG is connected
    setDefaultColors(defaults);
  }
  
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


  function sendDefaultIndex(index) {
    getMessageResult(ipcRenderer.sendSync('set-default-index', index));
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


  async function getMessageResult(promise, cb) {
    const result = await promise;
     if (result instanceof Error) {
      console.warn(result?.message);
    } else {
      // todo, update state with new values 
      console.log("result:", result);
      if (cb) {
        cb(result);
      };
    }
  }

  function handleEditSwatch(swatch) {
    setEditSwatch(swatch);
  }

  function handleSaveDefaultColor(color, index) {
    // send to device
    //writeDefault();
  }

  function handelRestoreDefaults() {
    initialDefaults();
    //writeDefault();
  }
  


  function handleColorChange(_newColor, defaultIndex = -1,) {
  
    // defaults don't have an alpha so use the current value
    let alpha = _newColor.a ?? color.a;

    const newColor = {
      ..._newColor,
      a: alpha
    }
    setColor(newColor);
    setLEDOn(true);
    sendMainLEDStatus(newColor, true);
    if (defaultIndex > -1)  {
      // update the index position on the device so that the left and right color 
      // button on the device start from where this default color is.
      sendDefaultIndex(defaultIndex); 
    }
    console.log({editSwatch})
    setInputColorKey(newColor);
     
    if (editSwatch !== null) {
      // when editing a default color, update that color in real time
      const c = {
        color: {r: newColor.r, g: newColor.g, b: newColor.b},
        enabled: true
      }
      const dc = [...defaultColors];
      dc[editSwatch] = c;
      console.log(dc)
      setDefaultColors(dc);
    }
    
  };

  function toggleLEDOn() {
    const on = !ledOn;
    setLEDOn(on);
    sendMainLEDStatus(color, on);
  }

  function writeDefault() {
    ipcRenderer.sendSync('set-default-color', {red: color.rgb.r, green: color.rgb.g, blue: color.rgb.b}) 
  }

  function parseDefaultColors(message) {
    let vars = message.split('&');
    const defaults = []; 
    let index;
    for (let v of vars) {
      let [key, value] = v.split('=')
      if (key == 'color') {
        let [r,g,b,enabled] = value.split(',');
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
      setIsConnected(true);
    });
  }

  function changeRgb(e, colorComponent) {
    const rawString = e.target.value.trim();
    let updateKey = false; // force an update on the input field too
    let newColorComponent = parseInt(rawString);
    if (isNaN(newColorComponent)) {
      return;
    } else if(newColorComponent > 255) {
      newColorComponent = 255;
      updateKey = true;
    } else if(newColorComponent < 0) {
      newColorComponent = 0;
      updateKey = true;
    }
    const c = {
      ...color,
      [colorComponent]: newColorComponent
    }
    setColor(c);
    if(updateKey) {
      e.target.value = newColorComponent
    }
  }
  function changeAlpha(e) {
    const rawString = e.target.value.trim();
    let updateKey = false; // force an update on the input field too
    
    
    let newColorComponent = parseFloat(rawString).toFixed(2);
    
    
    if (isNaN(newColorComponent)) {
      return;
    } else if(newColorComponent > 1) {
      newColorComponent = 1;
      updateKey = true;
    } else if(newColorComponent < 0) {
      newColorComponent = 0;
      updateKey = true;
    }
    const c = {
      ...color,
      a: newColorComponent
    }
    setColor(c);
    if(updateKey) {
      e.target.value = newColorComponent;
    }
    
    var arr = [...e.target.value];
    if (arr[0] === '.') {
      e.target.value = ['0', ...e.target.value].splice(0).join('');      
    }
    if (e.target.value.length > 4) {
      debugger
      e.target.value = [...e.target.value].splice(0,4).join('');  
    }
      /* if (e.target.value.length > 3) {
        e.target.value = ['0', ...e.target.value].splice(0,4).join('');      
      }
    } else {
      e.target.value = [...e.target.value].splice(0,4).join('');  
    } */
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
      { isConnected &&
        <div className={styles.mainContainer}>
          <div className={styles.main}>
            <div className={styles.mainControls}>
              {/* <button onClick={readDefault}>Get Default Color</button> */}
              
                <button className={classNames({
                    [styles.power]: true,
                    [styles.enabled]: ledOn
                })} onClick={toggleLEDOn}>
                  <PowerSwitch className={styles.powerIcon}></PowerSwitch>
                  <span className={styles.ledText}>LED: {ledOn ? " ON " : "OFF"}</span>
                </button>
              
              
            </div>
            
            <RgbaColorPicker
              color={color}
              onChange={ throttle(handleColorChange, 50) }
            ></RgbaColorPicker>
            <div className={styles.rgbInputs}>
                <label>R</label><input key={'red_' + inputColorKey.r} onChange={(e)=>(changeRgb(e, 'r'))} defaultValue={color.r} type="text"></input>
                <label>G</label><input key={'green_' + inputColorKey.g} onChange={(e)=>(changeRgb(e, 'g'))} defaultValue={color.g} type="text"></input>
                <label>B</label><input key={'blue_' + inputColorKey.b} onChange={(e)=>(changeRgb(e, 'b'))} defaultValue={color.b} type="text"></input>
                <label>A</label><input key={'alpha_' + inputColorKey.a} onChange={changeAlpha} defaultValue={color.a} type="text"></input>
              </div>
          </div>
          <div className={styles.colors}>
            <DefaultColors
              //activeIndex={defaultColorIndex}
              colors={defaultColors}
              onChangeColor={handleColorChange}
              onSetEditSwatch={handleEditSwatch}
              editSwatch={editSwatch}
              onSaveDefaultColor={handleSaveDefaultColor}
              onRestoreDefaults={handelRestoreDefaults}
            ></DefaultColors>
          </div>
          <div className={styles.restoreDefaults}> 
            <button onClick={handelRestoreDefaults}>Restore Defaults</button>
            <a href="">Get Support</a>
          </div>

        </div>
      }
      { !isConnected &&
        <div className={styles.disconnected}><span>Gaimglass not connected.</span></div>
      }
    </div>
  );
}


export default App;

