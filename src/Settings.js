import React, { useState } from 'react';
import styles from './css/Settings.module.css'

import {ReactComponent as Keyboard} from './assets/keyboard-solid.svg';
import  { loadAppSettings, defaultAppSettings, saveAppSettings } from './Utils'
import DefaultRevertConfirm from './DefaultRevertConfirm'

const electron = window.require('electron');
const ipcRenderer  = electron.ipcRenderer;

export default function Settings() {

  const [settings, setSettings] = useState(loadAppSettings())
  
  function translateKey(key, code) {
    if (code.startsWith('Numpad')) {
      switch(code) {
        case 'Numpad0':
          return 'num0';
        case 'Numpad1':
          return 'num1';
        case 'Numpad2':
          return 'num2';
        case 'Numpad3':
          return 'num3';
        case 'Numpad4':
          return 'num4';
        case 'Numpad5':
          return 'num5';
        case 'Numpad6':
          return 'num6';
        case 'Numpad7':
          return 'num7';
        case 'Numpad8':
          return 'num8';
        case 'Numpad9':
          return 'num9';
        case 'NumpadAdd':
          return 'numadd'
        case 'NumpadSubtract':
          return 'numsub'
        case 'NumpadMultiply':
          return 'nummult'
        case 'NumpadDivide':
          return 'numdiv'
        case 'NumpadDecimal':
          return 'numdec'
        default:
          return '';
      }
      
    }
    return key
  }

  function handleFocus(e) {
    ipcRenderer.invoke('set-disable-shortcuts');
  }

  function handleBlur(e) {
    ipcRenderer.invoke('set-enable-shortcuts', settings.keyBindings);
  }

  function handleReset() {
    saveAppSettings(defaultAppSettings());
    setSettings(loadAppSettings());
  } 

  function handleKeyAssign(e) {
    // todo avoid duplicate
    const buttonName = e.target.name;
    const newSettings = {...settings}
    if (e.key === 'Backspace' || e.code === 'Delete') {
      settings[buttonName] = ''; // unset
    }
    else if (e.key === 'Escape') {
      return;
    }
    else if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt') {
      return;
    }
    
    else {
      const key = translateKey(e.key, e.code);
      if (key) {
        const modifiers = getModifiers(e);
        newSettings.keyBindings[buttonName] = `${modifiers}${key}`
      
        saveAppSettings(newSettings);
        setSettings(loadAppSettings());
        e.target.blur()
      }
      
    }
  }

  function getModifiers(e) {
    let modifiers = []
    if(e.ctrlKey) {
      modifiers.push("Control")
    }
    if(e.altKey) {
      modifiers.push("Alt")
    }
    if(e.shiftKey) {
      modifiers.push("Shift")
    }
    return modifiers.length ? modifiers.join('+')+'+' : ''
  }

  const slotName = 'Color slot'

  return <div className={styles.container}>
    <div className={styles.bindings}>
      <h3><Keyboard className={styles.keyboard}></Keyboard>Keyboard Shortcuts</h3>
      <div className={styles.keybindingsTableWrapper}>
        <table className={styles.keybindingsTable}>
          <tbody>
            <tr>
              <td>Increase Brightness</td>
              <td><input onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleKeyAssign} value={settings.keyBindings['brightness+']} type="text" readOnly="readOnly" name="brightness+" /></td>
            </tr>
            <tr>
              <td>Decrease Brightness</td>
              <td><input onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleKeyAssign} value={settings.keyBindings['brightness-']} type="text" readOnly="readOnly" name="brightness-" /></td>
            </tr>
            <tr>
              <td>Quick Calibrate</td>
              <td><input onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleKeyAssign} value={settings.keyBindings['calibrate']} type="text" readOnly="readOnly" name="calibrate" /></td>
            </tr>
            <tr>
              <td>LED on/off</td>
              <td><input onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleKeyAssign} value={settings.keyBindings['led']} type="text" readOnly="readOnly" name="led" /></td>
            </tr>
            <tr>
              <td>{`${slotName} 1`}</td>
              <td><input onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleKeyAssign} value={settings.keyBindings['s1']} type="text" readOnly="readOnly" name="s1" /></td>
            </tr>
            <tr>
              <td>{`${slotName} 2`}</td>
              <td><input onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleKeyAssign} value={settings.keyBindings['s2']} type="text" readOnly="readOnly" name="s2" /></td>
            </tr>
            <tr>
              <td>{`${slotName} 3`}</td>
              <td><input onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleKeyAssign} value={settings.keyBindings['s3']} type="text" readOnly="readOnly" name="s3" /></td>
            </tr>
            <tr>
              <td>{`${slotName} 4`}</td>
              <td><input onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleKeyAssign} value={settings.keyBindings['s4']} type="text" readOnly="readOnly" name="s4" /></td>
            </tr>
            <tr>
              <td>{`${slotName} 5`}</td>
              <td><input onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleKeyAssign} value={settings.keyBindings['s5']} type="text" readOnly="readOnly" name="s5" /></td>
            </tr>
            <tr>
              <td>{`${slotName} 6`}</td>
              <td><input onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleKeyAssign} value={settings.keyBindings['s6']} type="text" readOnly="readOnly" name="s6" /></td>
            </tr>
            <tr>
              <td>{`${slotName} 7`}</td>
              <td><input onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleKeyAssign} value={settings.keyBindings['s7']} type="text" readOnly="readOnly" name="s7" /></td>
            </tr>
            <tr>
              <td>{`${slotName} 8`}</td>
              <td><input onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleKeyAssign} value={settings.keyBindings['s8']} type="text" readOnly="readOnly" name="s8" /></td>
            </tr>
          </tbody>
        </table>
      </div>
      </div>
      <DefaultRevertConfirm 
        resetName="Reset Defaults"
        onReset={handleReset}/>
    </div>
}

Settings.propTypes = {
}

