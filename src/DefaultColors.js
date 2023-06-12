import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PropTypes } from "prop-types";
import styles from './css/DefaultColors.module.css'
import {ReactComponent as Edit} from './assets/pen-to-square-solid.svg';
import classNames from 'classnames';


const electron = window.require('electron');
const ipcRenderer  = electron.ipcRenderer;
//const fs = electron.remote.require('fs');


function DefaultColors(props) {
  
  const canvasRef = useRef(null);
  const swatchRefs = useRef([]);

  const [editSwatch, setEditSwatch] = useState(null);

  /*for(let i = 0; i < 8;i++) {
    swatchRefs.push(useRef(null));
  }*/

  
  useEffect(() => {
    var c = canvasRef.current;
    var ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);


    
    //c.width = c.clientWidth;
    //c.height = c.clientHeight;
    for (let i = 0; i < 8;i++) {
      var s = swatchRefs.current[i];
      //debugger;
      const yc = s.offsetTop + (s.clientHeight/2);
      const x = s.offsetWidth

      ctx.beginPath()
      if(editSwatch===i) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,1)';  
      } else {
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      }
      ctx.moveTo(0, 200);
      
      ctx.bezierCurveTo(100/2, 200, 100/2, yc, 100, yc);
      ctx.stroke();
    }
  }, [editSwatch]);

  function changeColor(i) {
    props.onChangeColor(props.colors[i].color, i);
  }

  function colorToCss(color) {
    if(color) {
      return `rgb(${color.r},${color.g},${color.b})`;
    }
    return '';
  }

  function edit(swatch) {
    setEditSwatch(swatch)
  }

  const Swatches = []

  for(let i = 0; i < 8; i++) {
    Swatches.push(
      <div className={styles.swatchWrapper} key={i}>
      <div
        style={{
          backgroundColor: colorToCss(props.colors[i]?.color)
        }} 
        onClick={()=>{changeColor(i);}} key={i} ref={el => swatchRefs.current[i] = el} className={styles.swatch}></div>
        <button onClick={()=>{
          edit(i);
        }} className={styles.editButton}><Edit className={styles.editIcon}></Edit></button>
      </div>
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

DefaultColors.propTypes = {
  onChangeColor: PropTypes.func.isRequired,
  colors: PropTypes.array.isRequired,
}


export default DefaultColors;

