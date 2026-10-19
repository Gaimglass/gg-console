import React, { useState, useEffect, useRef } from 'react';
import { PropTypes } from "prop-types";
import styles from './css/DefaultColors.module.css'
import Edit from './assets/pen-to-square-solid.svg?react';
import Cancel from './assets/xmark-solid.svg?react';
import Check from './assets/check-solid.svg?react';
import Plus from './assets/plus-solid.svg?react';
import classNames from 'classnames';



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
    const c = canvasRef.current;
    const ctx = c.getContext('2d');
    const drawCurves = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      for (let i = 0; i < props.colors.length; i++) {
        if (props.colors[i]?.enabled === false) continue;
        const swatch = swatchRefs.current[i];
        const yc = swatch.offsetTop + swatch.clientHeight / 2;

        ctx.beginPath();
        ctx.lineWidth = activeSwatch === i ? 2 : 1;
        ctx.strokeStyle = activeSwatch === i ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.2)';
        ctx.moveTo(0, 200);
        ctx.bezierCurveTo(50, 200, 50, yc, 100, yc);
        ctx.stroke();
      }
    };
    drawCurves();
    // Shared tabs stay mounted while hidden; measure again when this tab appears.
    const observer = new ResizeObserver(drawCurves);
    observer.observe(c);
    return () => observer.disconnect();
  }, [activeSwatch, props.colors, readOnly]);

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
          <button aria-label={`Edit default color ${i + 1}`} onClick={()=>{
            edit(i);
          }} className={styles.button + ' ' + styles.editButton}><Edit className={styles.editIcon}></Edit></button>
        }
        { !readOnly && (props.editSwatch === i) &&
          <>
          <button aria-label={`Save default color ${i + 1}`} onClick={()=>{save(i)}} className={styles.button  + ' ' +  styles.checkButton}><Check className={styles.editIcon}></Check></button>
          <button aria-label={`Cancel editing default color ${i + 1}`} onClick={()=>{cancel()}} className={styles.button  + ' ' +  styles.cancelButton}><Cancel className={styles.editIcon}></Cancel></button>
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
        
          {!readOnly && <button aria-label="Add default color" onClick={props.onAddDefaultColor} style={{
            visibility: showPlus ? 'visible' : 'hidden' 
          }}className={styles.button  + ' ' +  styles.addButton}><Plus className={styles.plusIcon}></Plus></button>}
        
      </div>
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
  onAddDefaultColor: PropTypes.func,
}


export default DefaultColors;

