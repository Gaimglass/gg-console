import React, { useState, useEffect } from 'react';
import logo from './logo.svg';
import './App.css';

const electron = window.require('electron');
const ipcRenderer  = electron.ipcRenderer;
//const fs = electron.remote.require('fs');


function App() {
  
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


  function changeColor() {
    console.log("click");
  }

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.js</code> and save to reload.
        </p>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
        <button onClick={changeColor}>Red</button>
        <button onClick={changeColor}>Green</button>
        <button onClick={changeColor}>Blue</button>
      </header>
    </div>
  );
}


export default App;

