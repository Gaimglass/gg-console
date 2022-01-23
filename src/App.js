import React, { useState, useEffect, useMemo } from 'react';

import { SketchPicker } from 'react-color';

import logo from './logo.svg';
import './App.css';

const electron = window.require('electron');
const ipcRenderer  = electron.ipcRenderer;
//const fs = electron.remote.require('fs');


function App() {
  
  const [color, setColor] = useState({rgb:{r:200,g:200,b:255}});
  const [mute, setMute] = useState(false);

  function handleChangeComplete(c) {
    ipcRenderer.sendSync('set-color', c)
    setColor({
      ...c
    });
  };

  function writeDefault() {
    ipcRenderer.sendSync('set-default-color', {red: color.rgb.r, green: color.rgb.g, blue: color.rgb.b}) 
  }

  function getColor() {
    const c = ipcRenderer.sendSync('get-color');
    console.log(c);
  }

  function toggleMute() {
    if(mute) {
      setMute(false);
      ipcRenderer.sendSync('set-mute', false);
    } else {
      setMute(true);
      ipcRenderer.sendSync('set-mute', true);
    }
  }

  useEffect(()=>{
    console.log("getting color..");
    const c = ipcRenderer.sendSync('get-color');    
    if (c) {
      setColor({
        ...c
      });
      // pass color to gaimglass
      ipcRenderer.sendSync('set-color', c);
    } else {
      // set up default color perhaps?
    }
  }, []);



  ipcRenderer.on('asynchronous-reply', (event, arg) => {
    console.log("asynchronous-reply: ", arg) // prints "pong"
  })

  return (
    <div className="App">
      {/* <img src={logo} className="App-logo" alt="logo" /> */}
      <button onClick={writeDefault}>Set Default Color</button>
      {/* <button onClick={readDefault}>Get Default Color</button> */}

      <button onClick={getColor}>Get Color</button>
      <button onClick={toggleMute}>{mute ? "Turn Off" : "Turn On"}</button>

      <div>{color?.hex}</div>
      <div>{color?.rgb?.r} {color?.rgb?.g} {color?.rgb?.b}</div>
      
      <SketchPicker
        width={400}
        color={color.hex}
        onChange={ handleChangeComplete }
        //onChangeComplete={ handleChangeComplete }
      />
    </div>
  );
}


export default App;

