import React, { useState } from 'react';
import styles from './css/KeyBindings.module.css'

import {ReactComponent as Keyboard} from './assets/keyboard-solid.svg';
import  { loadAppSettings, defaultAppSettings, saveAppSettings, getPrettyTextFromCommand } from './Utils'
import SettingsDefaultConfirm from './SettingsDefaultConfirm'

const electron = window.require('electron');
const ipcRenderer  = electron.ipcRenderer;

export default function Settings() {

  const [settings, setSettings] = useState(loadAppSettings())
  const [errors, setErrors] = useState({})

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
        case 'NumpadEnter':
          return 'Enter'
        default:
          return '';
      }
      
    }
    return key
  }

  function handleFocus(e) {
    ipcRenderer.invoke('set-disable-shortcuts');
  }

  async function handleBlur(e) {
    const errors = await ipcRenderer.invoke('set-enable-shortcuts', settings.keyBindings);
    setErrors({...errors});
  }

  function handleReset() {
    const newSettings = defaultAppSettings();
    saveAppSettings(newSettings);
    setSettings(newSettings);
    ipcRenderer.invoke('set-enable-shortcuts', newSettings.keyBindings);
  }

  function validateAccelerator(accelerator, buttonName) {
    for (const [k,v] of Object.entries(settings.keyBindings)) {
      if (k === buttonName) {
        continue;
      }      
      if (v.toLowerCase() === accelerator.toLowerCase()) {
        return `"${getPrettyTextFromCommand(k)}" is using this binding`
      }
    }
    return null;
  }

  async function handleKeyAssign(e) {
    // todo avoid duplicate
    const buttonName = e.target.name;
    const newSettings = {...settings}
  
    if (e.key === 'Backspace' || e.code === 'Delete') {
      newSettings.keyBindings[buttonName] = ''; // unset
      
      saveAppSettings(newSettings);
      setSettings(loadAppSettings());
      e.target.blur()
      
    }
    else if (e.key === 'Escape') {
      return;
    }
    else if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt') {
      return;
    }

    else {
      try {
        const key = translateKey(e.key, e.code);
        if (!key) {
          throw Error('Invalid key binding')
        }
        const modifiers = getModifiers(e);
        const accelerator = `${modifiers}${key}`;
        if (modifiers === '') {
          throw Error('No modifier found, try "Shift", "Control" or "Alt"')
        }
        let acceleratorError = validateAccelerator(accelerator, buttonName)
        if (acceleratorError) {
          throw Error(acceleratorError)
        }

        const newShortcutError = await ipcRenderer.invoke('set-enable-shortcut', buttonName, accelerator);
        if (newShortcutError) {
          throw Error(newShortcutError)
        }
        setErrors({})
        newSettings.keyBindings[buttonName] = accelerator
        saveAppSettings(newSettings);
        setSettings(loadAppSettings());
        e.target.blur()
      }
       catch(e) {
        setErrors({
          ...errors,
          [buttonName]: e.message
        });
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
              <td>{errors['brightness+']}</td>
            </tr>
            <tr>
              <td>Decrease Brightness</td>
              <td><input onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleKeyAssign} value={settings.keyBindings['brightness-']} type="text" readOnly="readOnly" name="brightness-" /></td>
              <td>{errors['brightness-']}</td>
            </tr>
            <tr>
              <td>Quick Calibrate</td>
              <td><input onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleKeyAssign} value={settings.keyBindings['calibrate']} type="text" readOnly="readOnly" name="calibrate" /></td>
              <td>{errors['calibrate']}</td>
            </tr>
            <tr>
              <td>LED on/off</td>
              <td><input onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleKeyAssign} value={settings.keyBindings['led']} type="text" readOnly="readOnly" name="led" /></td>
              <td>{errors['led']}</td>
            </tr>
            <tr>
              <td>{`${slotName} 1`}</td>
              <td><input onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleKeyAssign} value={settings.keyBindings['s1']} type="text" readOnly="readOnly" name="s1" /></td>
              <td>{errors['s1']}</td>
            </tr>
            <tr>
              <td>{`${slotName} 2`}</td>
              <td><input onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleKeyAssign} value={settings.keyBindings['s2']} type="text" readOnly="readOnly" name="s2" /></td>
              <td>{errors['s2']}</td>
            </tr>
            <tr>
              <td>{`${slotName} 3`}</td>
              <td><input onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleKeyAssign} value={settings.keyBindings['s3']} type="text" readOnly="readOnly" name="s3" /></td>
              <td>{errors['s3']}</td>
            </tr>
            <tr>
              <td>{`${slotName} 4`}</td>
              <td><input onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleKeyAssign} value={settings.keyBindings['s4']} type="text" readOnly="readOnly" name="s4" /></td>
              <td>{errors['s4']}</td>
            </tr>
            <tr>
              <td>{`${slotName} 5`}</td>
              <td><input onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleKeyAssign} value={settings.keyBindings['s5']} type="text" readOnly="readOnly" name="s5" /></td>
              <td>{errors['s5']}</td>
            </tr>
            <tr>
              <td>{`${slotName} 6`}</td>
              <td><input onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleKeyAssign} value={settings.keyBindings['s6']} type="text" readOnly="readOnly" name="s6" /></td>
              <td>{errors['s6']}</td>
            </tr>
            <tr>
              <td>{`${slotName} 7`}</td>
              <td><input onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleKeyAssign} value={settings.keyBindings['s7']} type="text" readOnly="readOnly" name="s7" /></td>
              <td>{errors['s7']}</td>
            </tr>
            <tr>
              <td>{`${slotName} 8`}</td>
              <td><input onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleKeyAssign} value={settings.keyBindings['s8']} type="text" readOnly="readOnly" name="s8" /></td>
              <td>{errors['s8']}</td>
            </tr>
          </tbody>
        </table>
      </div>
      </div>
      <SettingsDefaultConfirm 
        onReset={handleReset}/>
    </div>
}

Settings.propTypes = {
}

