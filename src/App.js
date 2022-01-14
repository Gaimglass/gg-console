import React, { useState, useEffect } from 'react';

import { SketchPicker } from 'react-color';

import logo from './logo.svg';
import './App.css';

const electron = window.require('electron');
const ipcRenderer  = electron.ipcRenderer;
//const fs = electron.remote.require('fs');


function App() {
  
  const [color, setColor] = useState({});

  function handleChangeComplete(c) {
    ipcRenderer.sendSync('set-color', {red: c.rgb.r, green: c.rgb.g, blue: c.rgb.b})
    setColor({
      ...c
    });
  };

  /*useEffect(()=>{
    if(color) {
      ipcRenderer.sendSync('set-color', {red: color.rgb.r, green: color.rgb.g, blue: color.rgb.b})
    }
  }, [color]);*/

  useEffect(()=>{
    (async () => {
      console.log("synchronous-reply: ", ipcRenderer.sendSync('synchronous-message', "foo sync"));
      ipcRenderer.send('asynchronous-message', "foo async");
    })();
    return () => {
      
    }
  },[]);

  ipcRenderer.on('asynchronous-reply', (event, arg) => {
    console.log("asynchronous-reply: ", arg) // prints "pong"
  })

  return (
    <div className="App">
      {/* <img src={logo} className="App-logo" alt="logo" /> */}
      <div>{color?.hex}</div>
      <div>{color?.rgb?.r} {color?.rgb?.g} {color?.rgb?.b}</div>
      <SketchPicker
        width={550}
        color={color.hex}
        onChange={ handleChangeComplete }
        //onChangeComplete={ handleChangeComplete }
      />
    </div>
  );
}


export default App;

