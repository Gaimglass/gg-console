import React from 'react';
import ReactDOM from "react-dom/client";
import './index.css';
import AppMain from './AppMain';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));


window.webFrame.setZoomLevel(0)
window.visualViewport.addEventListener("resize", ()=>{
  // do not level users resize text in this app.
  window.webFrame.setZoomLevel(0)
});


root.render(
  <React.StrictMode>
    <AppMain />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();