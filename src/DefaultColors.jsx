import React, { useState, useEffect, useRef } from 'react';
import { PropTypes } from "prop-types";
import styles from './css/DefaultColors.module.css'
import Edit from './assets/pen-to-square-solid.svg?react';
import Cancel from './assets/xmark-solid.svg?react';
import Check from './assets/check-solid.svg?react';
import Plus from './assets/plus-solid.svg?react';
import classNames from 'classnames';

import DefaultRevertConfirm from './DefaultRevertConfirm'


function DefaultColors(props) {
  const { readOnly = false, selectedColor } = props;
  const Swatch = readOnly ? 'button' : 'div';
  const activeSwatch = readOnly
    ? props.colors.findIndex(swatch => swatch.enabled !== false && selectedColor &&
      ['r', 'g', 'b'].every(channel => swatch.color[channel] === selectedColor[channel]))
    : props.editSwatch;
  
  const canvasRef = useRef(null);
  const swatchRefs = useRef([]);
  const [previousColor, setPreviousColor] = useState(null);

  useEffect(() => {
    return ()=>{
      // cancel out of editing swatches if unmounting
      props.onSetEditSwatch?.(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  
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
      if(activeSwatch===i) {
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
  }, [activeSwatch, props.colors]);

  function changeColor(swatch) {
    if (readOnly || props.editSwatch === null) {
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
    if (activeSwatch === i) {
      editingSwatch = true;
    }
    if (!readOnly && props.editSwatch !== null && props.editSwatch !== i) {
        disabledSwatch = true;
    }

    if (props.colors[i]?.enabled === false) {
      // we stil end deleted colors to device but hide them in UI
      continue;
    }

    Swatches.push(
      <div className={styles.swatchWrapper} key={i}>
      <Swatch
        type={readOnly ? 'button' : undefined}
        aria-label={readOnly ? `Default color ${i + 1}` : undefined}
        aria-pressed={readOnly ? editingSwatch : undefined}
        title={readOnly ? `Default color ${i + 1}: RGB(${props.colors[i].color.r}, ${props.colors[i].color.g}, ${props.colors[i].color.b})` : undefined}
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
      </Swatch>
        { !readOnly && (props.editSwatch !== i) &&
          <button onClick={()=>{
            edit(i);
          }} className={styles.button + ' ' + styles.editButton}><Edit className={styles.editIcon}></Edit></button>
        }
        { !readOnly && (props.editSwatch === i) &&
          <>
          <button onClick={()=>{save(i)}} className={styles.button  + ' ' +  styles.checkButton}><Check className={styles.editIcon}></Check></button>
          <button onClick={()=>{cancel()}} className={styles.button  + ' ' +  styles.cancelButton}><Cancel className={styles.editIcon}></Cancel></button>
          </>
        }
      </div>
    )
  }
   
  return (
    
    <div
      className={classNames(styles.defaultColors, { [styles.readOnly]: readOnly })}
      role={readOnly ? 'group' : undefined}
      aria-label={readOnly ? 'Default colors' : undefined}
    >
      <div className={styles.curves}>
        {/* This much match .defaultColors class height value */}
        <canvas height="320" width="100" ref={canvasRef} aria-hidden="true"></canvas>
      </div>

      <div className={styles.swatches}> 
        {Swatches}
        
          {!readOnly && <button onClick={props.onAddDefaultColor} style={{
            visibility: showPlus ? 'visible' : 'hidden' 
          }}className={styles.button  + ' ' +  styles.addButton}><Plus className={styles.plusIcon}></Plus></button>}
        
      </div>
      { !readOnly && (props.editSwatch !== null) &&
        <DefaultRevertConfirm onDelete={props.editSwatch !== 0 ? ()=>{
          props.onDeleteDefaultColor()
          props.onSetEditSwatch(null);
          } : null
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
  readOnly: PropTypes.bool,
  selectedColor: PropTypes.shape({ r: PropTypes.number, g: PropTypes.number, b: PropTypes.number }),
  onSetEditSwatch: PropTypes.func,
  colors: PropTypes.array.isRequired,
  editSwatch: PropTypes.number,
  onSaveDefaultColor: PropTypes.func,
  onDeleteDefaultColor: PropTypes.func,
  onAddDefaultColor: PropTypes.func,
  onResetDefaultColor: PropTypes.func
}


export default DefaultColors;

