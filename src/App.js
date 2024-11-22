import React, { useState, useEffect } from 'react';
import { RgbaColorPicker } from 'react-colorful';
import classNames from 'classnames';
import DefaultColors from './DefaultColors'
import WindowControls from './WindowsControls'
import UpdateUI from './UpdatesUI'
import styles from './css/App.module.css'
import {ReactComponent as PowerSwitch} from './assets/power-off-solid.svg';
import  { getMessageResult } from './Utils'
//import logo from './assets/logo.png';
import './css/globalStyles.css';

const electron = window.require('electron');
const ipcRenderer  = electron.ipcRenderer;

let timer;
let latestFunc;

function App() {

  const [color, setColor] = useState({r:255,g:255,b:255,a:0});
  const [defaultColors, setDefaultColors] = useState([]);
  //const [defaultColorIndex, setDefaultColorIndex] = useState(0); // -1 for a custom color
  const [ledOn, setLEDOn] = useState(false); // defaults to false
  const [isMaximized, setMaximized] = useState(false);
  const [version, setVersion] = useState('');
  const [isMac, setMac] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [editSwatch, setEditSwatch] = useState(null);
  const [inputColorKey, setInputColorKey] = useState({});
  const [adsActive] = useState(false);


  useEffect(()=>{
    //const result = ipcRenderer.sendSync('get-app-state'); // non-blocking
    getAppState();
    initialDefaults();
    // TODO do we really need these here too?
    loadMainLedFromGG();
    loadDefaultColorsFromGG();
    // 
    
    // Receive uninitiated messages from the gg device
    // these messages are prefixed with "update-" for organization

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

    return ()=>{
      ipcRenderer.removeAllListeners();
    }
    
  },  /* eslint-disable */ [])
  
  useEffect(()=>{
    ipcRenderer.on('shortcut-toggle-led', toggleLEDOn);
    // special event when suspending PC to turn off GG
    ipcRenderer.on('deactivate-led', deactivateLED);

    return ()=>{
      ipcRenderer.removeListener('shortcut-toggle-led', deactivateLED);
      ipcRenderer.removeListener('shortcut-toggle-led', toggleLEDOn);
    }
    
  }, [color]);

  useEffect(()=>{
    if (ledOn && isConnected) {
      sendMainLEDStatus(color, !adsActive);
    }

    // shortcuts need update state values, so these hooks need to be trigger
    ipcRenderer.on('shortcut-increase-brightness', increaseBrightnessShortcut);
    ipcRenderer.on('shortcut-decrease-brightness', decreaseBrightnessShortcut);
    ipcRenderer.on('shortcut-switch-color', switchColorShortcut);
    

    /* // mouse 2 events
    ipcRenderer.on('update-mouse-down', function (evt, message) {
      setAdsActive(true);
     });

     ipcRenderer.on('update-mouse-up', function (evt, message) {
      setAdsActive(false);
    }); */

    /*
    ipcRenderer.on('update-mouse-up', function (evt, message) {
      if (adsActive && message.button === 2) {
        setAdsActive(false);
        
        sendMainLEDStatus(color, true);
      }
    });*/

    return ()=>{
      ipcRenderer.removeListener('shortcut-increase-brightness', increaseBrightnessShortcut);
      ipcRenderer.removeListener('shortcut-decrease-brightness', decreaseBrightnessShortcut);
      ipcRenderer.removeListener('shortcut-switch-color', switchColorShortcut);
    }
  }, [adsActive, ledOn, color, defaultColors]);
  
  function createDefaultColors() {
    return [
      {r:15,g:255, b:15},
      {r:32,g:255, b:180},
      {r:20,g:110, b:255}, 
      {r:134,g:100, b:255},
      {r:255,g:60, b:180},
      {r:255,g:15, b:15},
      {r:255,g:140, b:15},
      {r:200,g:255, b:40},
    ];
  }

  function initialDefaults() {
    const defaults = [];
    const initialDefaultColors = createDefaultColors();
    for (let i = 0; i < 8; i++) {
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
          }
        }, timeout);
      } else {
        latestFunc = () => {
          func.apply(this, args);
        }
      }
    };
  }


  function getAppState() {
    getMessageResult(ipcRenderer.sendSync('get-app-state'), (result)=>{
      setMaximized(result.isMaximized)
      setMac(result.isMac)
      setVersion(result.version)
    })
  }

  function sendDefaultIndex(index) {
    getMessageResult(ipcRenderer.sendSync('set-default-index', index));
  } 


  function sendMainLEDStatus(color, ledOn) {
    getMessageResult(ipcRenderer.sendSync('set-led-state', {
      color,
      brightness: color.a,
      ledOn
    }));
  }

  function sendDefaultColors(dc) {
    if (dc) {
      // this condition is preferred over useEffect so we have more control over writing to EPROM
      // because the defaultColors should not map 1:1 with EPROM
      ipcRenderer.sendSync('set-default-colors', dc)
    } else {
      ipcRenderer.sendSync('set-default-colors', defaultColors) 
    }
  }



  function handleEditSwatch(swatch) {
    setEditSwatch(swatch);
  }

  function handleSaveDefaultColor(color, index) {
    // send to device
    sendDefaultColors();
  }
  
  function handleDeleteDefaultColor() {
    const dc = [...defaultColors];
    dc.splice(editSwatch, 1);
    setDefaultColors(dc);
    sendDefaultColors(dc);
  }

  function handleAddDefaultColor() {
    if(defaultColors.length < 8) {
      //const initialDefaultColors = createDefaultColors();
      const c = {r:0, b: 0, g: 0};
      const dc = [...defaultColors,
        {
          color: c,/* initialDefaultColors[defaultColors.length], */
          enabled: true
        }];
      setDefaultColors(dc);
      sendDefaultColors(dc);
      handleColorChange(c, dc.length-1)
      setEditSwatch(dc.length-1);
    }
  }

  function handleResetDefaultColor() {
    const initialDefaultColors = createDefaultColors();
    const c = {
      color: {r: initialDefaultColors[editSwatch].r, g: initialDefaultColors[editSwatch].g, b: initialDefaultColors[editSwatch].b},
      enabled: true
    }
    const dc = [...defaultColors];
    dc[editSwatch] = c;
    setDefaultColors(dc);
    sendDefaultColors(dc);
    const newColor = {r: c.color.r, g: c.color.g, b: c.color.b, a: color.a};
    setColor(newColor);
    setInputColorKey(newColor)
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
    setInputColorKey(newColor);
     
    if (editSwatch !== null) {
      // when editing a default color, update that color in real time
      const c = {
        color: {r: newColor.r, g: newColor.g, b: newColor.b},
        enabled: true
      }
      const dc = [...defaultColors];
      dc[editSwatch] = c;
      setDefaultColors(dc);
    }
    
  };

  function deactivateLED() {
    setLEDOn(_on=>{
      sendMainLEDStatus(color, false);
      return false;
    });
  }

  function toggleLEDOn() {
    setLEDOn(on=>{
      sendMainLEDStatus(color, !on);
      return !on;
    });
  }

  function switchColorShortcut(event, index) {
    if (ledOn) {
      index = Number(index-1);
      if (index < 0)  {
        return;
      }
      const alpha = color.a;
      const newColor = {
        ...defaultColors[index].color,
        a: alpha
      }
      setColor(newColor);
      sendMainLEDStatus(newColor, true);
      setInputColorKey(newColor);
      // update the index position on the device so that the left and right color 
      // button on the device start from where this default color is.
      sendDefaultIndex(index);
    }
  }

  function decreaseBrightnessShortcut() {
    if (ledOn) {
      setColor(c=>{
        let newAlpha = c.a - 0.05;
        if (newAlpha < 0.075) {
          // minimum alpha
          newAlpha = 0.075; // this value matches the value on the device
        }
        const newColor = {
          ...c,
          a: newAlpha
        }
        sendMainLEDStatus(newColor, true);
        setInputColorKey(newColor);
        return newColor;
      })
      
    }
  }
  function increaseBrightnessShortcut() {
    if (ledOn) {
      setColor(c=>{
        let newAlpha = c.a + 0.05;
        if (newAlpha > 1) {
          newAlpha = 1;
        }
        const newColor = {
          ...c,
          a: newAlpha
        }
        sendMainLEDStatus(newColor, true);
        setInputColorKey(newColor);
        return newColor;
      })
    }
  }

  function parseDefaultColors(message) {
    const vars = message.split('&');
    const defaults = []; 
    for (let v of vars) {
      const [key, value] = v.split('=')
      if (key === 'color') {
        let [r,g,b,enabled] = value.split(',');
        const isEnabled = Boolean(parseInt(enabled));
        // only add enabled colors
        if (isEnabled) {
          defaults.push({
            color: {
              r: Number(r), 
              g: Number(g), 
              b: Number(b)
            },
            enabled: true
          });
        }
      }
      
    }
    setDefaultColors(defaults);
  }

  function parseMainLedFromGG(message) { 
    const params = message.split('&');
    let c = {};
    let led;
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
      }
    });
    setColor(c);
    setLEDOn(led);
    setInputColorKey({...c});
  }
  

  async function loadMainLedFromGG() { 
    getMessageResult(ipcRenderer.sendSync('get-led-state'), (result) => {
      parseMainLedFromGG(result);
    });
  }

  async function loadDefaultColorsFromGG() { 
    getMessageResult(ipcRenderer.sendSync('get-default-colors'), (result)=>{
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
    setLEDOn(true);
    sendMainLEDStatus(c, true);
    if(updateKey) {
      e.target.value = newColorComponent
    }
    if (editSwatch !== null) {
      // when editing a default color, update that color in real time
      const dc = [...defaultColors];
      dc[editSwatch] = {
        color: {...c},
        enabled: true
      };
      setDefaultColors(dc);
    }
  }

  function changeAlpha(e) {
    const rawString = e.target.value.trim();
    let updateKey = false; // force an update on the input field too
    let newColorComponent = parseFloat(rawString);
    

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
    setLEDOn(true);
    sendMainLEDStatus(c, true);
    if(updateKey) {
      e.target.value = newColorComponent;
    }
    
    var arr = [...e.target.value];
    if (arr[0] === '.') {
      e.target.value = ['0', ...e.target.value].splice(0).join('');      
    }
    if (e.target.value.length > 4) {
      e.target.value = [...e.target.value].splice(0,4).join('');  
    }
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
            <span className={styles.version}>{version}</span>
          </div>
          <WindowControls maximized={isMaximized} showControls={!isMac}></WindowControls>
        </div>
      </header>

      { isConnected &&
        <div className={styles.mainContainer}>
          <UpdateUI></UpdateUI>
          <div className={styles.mainContent}>
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
                onDeleteDefaultColor={handleDeleteDefaultColor}
                onAddDefaultColor={handleAddDefaultColor}
                onResetDefaultColor={handleResetDefaultColor}
              ></DefaultColors>
            </div>
          </div>
        </div>
      }
      { !isConnected &&
        <div className={styles.disconnected}><span>Gaimglass connecting...</span></div>
      }
    </div>
  );
}


export default App;

