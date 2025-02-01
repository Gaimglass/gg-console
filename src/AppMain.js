import React from 'react';
import App from "./App";
import AppCalibrate from "./AppCalibrate";


export default function AppMain() {
  const params = new URLSearchParams(window.location.search);
  const isCalibrate = params.get('app') === 'calibrate'
  return (
    <>
    {
      isCalibrate && <AppCalibrate></AppCalibrate>

    }
    {
      !isCalibrate && <App></App>
    }
    </>
    
  )
}