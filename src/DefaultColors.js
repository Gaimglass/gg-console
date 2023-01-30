import React, { useState, useEffect, useMemo, useRef } from 'react';
import styles from './css/DefaultColors.module.css'


const electron = window.require('electron');
const ipcRenderer  = electron.ipcRenderer;
//const fs = electron.remote.require('fs');


function DefaultColors(props) {
  
  const [color, setColor] = useState({r:200,g:20,b:255,a:0.123456});
  const [ledOn, setLEDOn] = useState(true);
  const canvasRef = useRef(null);

  const swatchRefs = useRef([]);

  /*for(let i = 0; i < 8;i++) {
    swatchRefs.push(useRef(null));
  }*/


  
  useEffect(() => {
    var c = canvasRef.current;
    var ctx = c.getContext('2d');

    ctx.lineWidth = 1;
    //c.width = c.clientWidth;
    //c.height = c.clientHeight;
    for (let i = 0; i < 8;i++) {
     
      var s = swatchRefs.current[i];
      debugger;
      const yc = s.offsetTop - (s.clientHeight/2);
      console.log(yc);
      const x = s.offsetWidth

      ctx.beginPath()
      ctx.strokeStyle = 'rgba(0,255,0,1)';
      ctx.moveTo(0, 200);
      debugger;
      ctx.bezierCurveTo(100/2, 200, 100/2, yc, 100, yc);
      ctx.stroke();
    }
    
    
    //ctx.bezierCurveTo(100, 50, 25, 0.5, 200, 0);
    
   
    


  }, []);

  const Swatches = []
  for(let i = 0; i < 8; i++) {
    Swatches.push(
      <div key={i} ref={el => swatchRefs.current[i] = el} className={styles.swatch}></div>
    )
  }
   
  return (
    <div className={styles.defaultColors}>
      <div className={styles.curves}>
        <canvas height="400" width="100" ref={canvasRef}></canvas> 
      </div>

      <div className={styles.swatches}> 
        {Swatches}
      </div>
    </div>
  );
}


export default DefaultColors;

