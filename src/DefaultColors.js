import React, { useState, useEffect, useRef } from 'react';
import { PropTypes } from "prop-types";
import styles from './css/DefaultColors.module.css'
import {ReactComponent as Edit} from './assets/pen-to-square-solid.svg';
import {ReactComponent as Cancel} from './assets/xmark-solid.svg';
import {ReactComponent as Check} from './assets/check-solid.svg';
import {ReactComponent as Plus} from './assets/plus-solid.svg';
import classNames from 'classnames';

import DefaultRevertConfirm from './DefaultRevertConfirm'


function DefaultColors(props) {
  
  const canvasRef = useRef(null);
  const swatchRefs = useRef([]);
  const [previousColor, setPreviousColor] = useState(null);

  useEffect(() => {
    var c = canvasRef.current;
    var ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);

    for (let i = 0; i < props.colors.length; i++) {
      if (props.colors[i]?.enabled === false) {
        continue
      }
      var s = swatchRefs.current[i];
      const yc = s.offsetTop + (s.clientHeight/2);

      ctx.beginPath()
      if(props.editSwatch===i) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,1)';  
      } else {
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      }
      ctx.moveTo(0, 200);
      
      ctx.bezierCurveTo(100/2, 200, 100/2, yc, 100, yc);
      ctx.stroke();
    }
  }, [props.editSwatch, props.colors]);

  function changeColor(swatch) {
    if (props.editSwatch === null) {
      props.onChangeColor(props.colors[swatch].color, swatch);
    }
    
  }

  function colorToCss(color) {
    if(color) {
      return `rgb(${color.r},${color.g},${color.b})`;
    }
    return '';
  }

  function edit(swatch) {
    setPreviousColor(props.colors[swatch].color);
    props.onSetEditSwatch(swatch);
    props.onChangeColor(props.colors[swatch].color, swatch);
  }

  function save(swatch) {
    props.onSetEditSwatch(null);
    props.onSaveDefaultColor(props.colors[swatch].color, swatch);
  }

  function cancel() {
    props.onChangeColor(previousColor);
    setPreviousColor(null);
    props.onSetEditSwatch(null);
  }

  const showPlus = props.editSwatch === null && props.colors.length < 8
  const Swatches = []

  for(let i = 0; i < props.colors.length; i++) {
    let disabledSwatch = false;
    let editingSwatch = false;
    if (props.editSwatch === i) {
      editingSwatch = true;
    }
    if (props.editSwatch !== null && props.editSwatch !== i) {
        disabledSwatch = true;
    }

    if (props.colors[i]?.enabled === false) {
      // we stil end deleted colors to device but hide them in UI
      continue;
    }

    Swatches.push(
      <div className={styles.swatchWrapper} key={i}>
      <div
        style={{
          backgroundColor: colorToCss(props.colors[i]?.color),
          opacity: disabledSwatch ? 0.2 : 1
        }} 
        onClick={()=>{
          changeColor(i);
        }} key={i} ref={el => swatchRefs.current[i] = el} 
        className={classNames({
          [styles.swatch]: true,
          [styles.swatchEdit]: editingSwatch
        })}>
      </div>
        { (props.editSwatch !== i) &&
          <button onClick={()=>{
            edit(i);
          }} className={styles.button + ' ' + styles.editButton}><Edit className={styles.editIcon}></Edit></button>
        }
        { (props.editSwatch === i) &&
          <>
          <button onClick={()=>{save(i)}} className={styles.button  + ' ' +  styles.checkButton}><Check className={styles.editIcon}></Check></button>
          <button onClick={()=>{cancel()}} className={styles.button  + ' ' +  styles.cancelButton}><Cancel className={styles.editIcon}></Cancel></button>
          </>
        }
      </div>
    )
  }
   
  return (
    
    <div className={styles.defaultColors}>
      <div className={styles.curves}>
        {/* This much match .defaultColors class height value */}
        <canvas height="320" width="100" ref={canvasRef}></canvas> 
      </div>

      <div className={styles.swatches}> 
        {Swatches}
        
          <button onClick={props.onAddDefaultColor} style={{
            visibility: showPlus ? 'visible' : 'hidden' 
          }}className={styles.button  + ' ' +  styles.addButton}><Plus className={styles.plusIcon}></Plus></button>
        
      </div>
      { (props.editSwatch !== null) &&
        <DefaultRevertConfirm onDelete={()=>{
          props.onDeleteDefaultColor()
          props.onSetEditSwatch(null);
          }
        } onReset={()=>{
          props.onResetDefaultColor()
          props.onSetEditSwatch(null);
        }}></DefaultRevertConfirm>
      }
    </div>
  );
}

DefaultColors.propTypes = {
  onChangeColor: PropTypes.func.isRequired,
  onSetEditSwatch: PropTypes.func.isRequired,
  colors: PropTypes.array.isRequired,
  editSwatch: PropTypes.number,
  onSaveDefaultColor: PropTypes.func.isRequired,
  onDeleteDefaultColor: PropTypes.func.isRequired,
  onAddDefaultColor: PropTypes.func.isRequired,
  onResetDefaultColor: PropTypes.func.isRequired
}


export default DefaultColors;

