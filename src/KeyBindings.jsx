import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './css/KeyBindings.module.css';
import Keyboard from './assets/keyboard-solid.svg?react';
import { defaultAppSettings, getPrettyTextFromCommand } from './Utils';
import { useSettings } from './SettingsProvider';
import { bindingFromEvent, displayBinding, findDuplicateBinding, shortcutSaveError } from './keyboardShortcuts.mjs';
import SettingsDefaultConfirm from './SettingsDefaultConfirm';

const ipcRenderer = window.ipcRenderer;
const commands = ['brightness+', 'brightness-', 'calibrate', 'led', ...Array.from({ length: 8 }, (_, index) => `s${index + 1}`)];
const modifierKeys = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph']);

export default function KeyBindings() {
  const { keyBindings, updateKeyBindings, shortcutErrors, updateShortcutErrors } = useSettings();
  const [errors, setErrors] = useState({});
  const [activeCommand, setActiveCommand] = useState(null);
  const [savingCommand, setSavingCommand] = useState(null);
  const [savedCommand, setSavedCommand] = useState(null);
  const editorRef = useRef(null);
  const pausedRef = useRef(false);
  const pausePromiseRef = useRef(Promise.resolve());
  const requestRef = useRef(0);
  const savingRef = useRef(false);
  const mountedRef = useRef(true);

  const resumeShortcuts = useCallback(() => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    void ipcRenderer.invoke('set-resume-shortcuts').then(result => {
      updateShortcutErrors(result || {});
      if (mountedRef.current) setErrors({});
    }).catch(error => console.warn('Could not resume shortcuts:', error));
  }, [updateShortcutErrors]);

  const pauseShortcuts = useCallback(() => {
    if (pausedRef.current) return;
    pausedRef.current = true;
    pausePromiseRef.current = ipcRenderer.invoke('set-disable-shortcuts');
    void pausePromiseRef.current.catch(error => console.warn('Could not pause shortcuts:', error));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const invalidateRequest = () => { requestRef.current++; };
    const onWindowFocus = () => {
      if (editorRef.current?.contains(document.activeElement)) pauseShortcuts();
    };
    window.addEventListener('blur', resumeShortcuts);
    window.addEventListener('focus', onWindowFocus);
    return () => {
      mountedRef.current = false;
      invalidateRequest();
      window.removeEventListener('blur', resumeShortcuts);
      window.removeEventListener('focus', onWindowFocus);
      resumeShortcuts();
    };
  }, [pauseShortcuts, resumeShortcuts]);

  function clearError(command) {
    setErrors(previous => ({ ...previous, [command]: null }));
    setSavedCommand(null);
  }

  async function assignBinding(command, binding) {
    if (savingRef.current) return;
    clearError(command);
    const duplicate = findDuplicateBinding(keyBindings, command, binding);
    if (duplicate) {
      setErrors(previous => ({ ...previous, [command]: `Already assigned to ${getPrettyTextFromCommand(duplicate)}.` }));
      return;
    }

    savingRef.current = true;
    const request = ++requestRef.current;
    setSavingCommand(command);
    try {
      await pausePromiseRef.current;
      const error = await ipcRenderer.invoke('validate-shortcut', command, binding);
      if (!mountedRef.current || request !== requestRef.current) return;
      if (error) {
        setErrors(previous => ({ ...previous, [command]: error }));
        return;
      }
      updateKeyBindings({ ...keyBindings, [command]: binding });
      setSavedCommand(command);
    } catch (error) {
      if (mountedRef.current && request === requestRef.current) {
        setErrors(previous => ({ ...previous, [command]: shortcutSaveError(error) }));
        console.warn('Could not save shortcut:', { command, binding, message: error.message });
      }
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSavingCommand(null);
    }
  }

  function handleKeyAssign(event, command) {
    // Keep navigation out of validation so Tab cannot briefly render an error.
    if (event.key === 'Tab') return;
    if (event.key === 'Escape') {
      event.preventDefault();
      requestRef.current++;
      clearError(command);
      event.currentTarget.blur();
      return;
    }
    if (modifierKeys.has(event.key) || event.isComposing || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat || savingRef.current) return;
    if (event.key === 'Backspace' || event.key === 'Delete') {
      void assignBinding(command, '');
      return;
    }
    const binding = bindingFromEvent(event);
    if (!binding) {
      setErrors(previous => ({ ...previous, [command]: 'This key is not supported. Choose another key.' }));
      return;
    }
    void assignBinding(command, binding);
  }

  function handleReset() {
    requestRef.current++;
    updateKeyBindings(defaultAppSettings().keyBindings);
    setErrors({});
    setSavedCommand(null);
  }

  return (
    <div className={styles.container}>
      <div className={styles.bindings}>
        <h3><Keyboard className={styles.keyboard} />Keyboard Shortcuts</h3>
        <p className={styles.help} id="shortcut-help">
          Select a binding and press a key, with or without Ctrl, Alt, Shift or Win/Cmd.
          <br />Tab moves between controls. Esc stops recording. Backspace or Delete clears.
        </p>
        <div
          className={styles.keybindingsTableWrapper}
          ref={editorRef}
          onFocusCapture={pauseShortcuts}
          onBlurCapture={event => {
            if (event.currentTarget.contains(event.relatedTarget)) return;
            setActiveCommand(null);
            resumeShortcuts();
          }}
        >
          <table className={styles.keybindingsTable} aria-label="Keyboard shortcut bindings">
            <tbody>
              {commands.map(command => {
                const label = getPrettyTextFromCommand(command);
                const error = errors[command] ?? shortcutErrors[command];
                const status = savingCommand === command ? 'Checking...' : savedCommand === command ? 'Saved' : activeCommand === command ? 'Press a key...' : '';
                const statusId = `shortcut-status-${command}`;
                return (
                  <tr key={command}>
                    <th scope="row"><label htmlFor={`shortcut-${command}`}>{label}</label></th>
                    <td className={styles.bindingCell}>
                      <input
                        id={`shortcut-${command}`}
                        name={command}
                        type="text"
                        readOnly
                        spellCheck={false}
                        value={displayBinding(keyBindings[command])}
                        placeholder="Not assigned"
                        aria-describedby={`shortcut-help ${statusId}`}
                        aria-invalid={Boolean(error)}
                        aria-busy={savingCommand === command}
                        onFocus={() => { setActiveCommand(command); setSavedCommand(null); }}
                        onBlur={() => setActiveCommand(null)}
                        onKeyDown={event => handleKeyAssign(event, command)}
                      />
                      <button
                        type="button"
                        className={styles.clear}
                        aria-label={`Clear ${label} shortcut`}
                        disabled={!keyBindings[command] || Boolean(savingCommand)}
                        onClick={() => { void assignBinding(command, ''); }}
                      >Clear</button>
                    </td>
                    <td className={styles.feedback}>
                      <span id={statusId} role="status" className={error ? styles.error : styles.status}>{error || status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <SettingsDefaultConfirm onReset={handleReset} />
    </div>
  );
}
