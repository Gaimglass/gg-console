import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { bindingFromEvent, displayBinding, findDuplicateBinding, shortcutSaveError } from '../src/keyboardShortcuts.mjs';

test('records plain keys and modifier combinations, including numpad keys with Num Lock off', () => {
  assert.equal(bindingFromEvent({ key: 'g', code: 'KeyG' }), 'G');
  assert.equal(bindingFromEvent({ key: 'F9', code: 'F9' }), 'F9');
  assert.equal(bindingFromEvent({ key: 'F13', code: 'F13' }), 'F13');
  assert.equal(bindingFromEvent({ key: 'F24', code: 'F24', ctrlKey: true }), 'Control+F24');
  assert.equal(bindingFromEvent({ key: 'End', code: 'Numpad1' }), 'num1');
  assert.equal(bindingFromEvent({ key: '+', code: 'NumpadAdd', ctrlKey: true }), 'Control+numadd');
  assert.equal(bindingFromEvent({ key: 'K', code: 'KeyK', ctrlKey: true, altKey: true, shiftKey: true, metaKey: true }), 'Control+Alt+Shift+Super+K');
});

test('translates browser key names into Electron accelerators', () => {
  assert.equal(bindingFromEvent({ key: 'ArrowUp', code: 'ArrowUp' }), 'Up');
  assert.equal(bindingFromEvent({ key: 'AudioVolumeDown', code: 'AudioVolumeDown' }), 'VolumeDown');
  assert.equal(bindingFromEvent({ key: ' ', code: 'Space' }), 'Space');
  assert.equal(bindingFromEvent({ key: '+', code: 'Equal' }), 'Plus');
  assert.equal(bindingFromEvent({ key: 'Dead', code: 'Quote' }), null);
  assert.equal(bindingFromEvent({ key: 'Unidentified', code: '' }), null);
});

test('detects duplicates without treating empty or unchanged bindings as conflicts', () => {
  const bindings = { led: 'Control+K', s1: 'F9', s2: '' };
  assert.equal(findDuplicateBinding(bindings, 's1', 'control+k'), 'led');
  assert.equal(findDuplicateBinding(bindings, 'led', 'Control+K'), null);
  assert.equal(findDuplicateBinding(bindings, 'led', ''), null);
  assert.equal(displayBinding('Control+num1'), 'Ctrl + Numpad 1');
});

test('a stale Electron main process produces a restart message rather than a retry message', () => {
  assert.match(shortcutSaveError(new Error("Error invoking remote method 'validate-shortcut': Error: No handler registered for 'validate-shortcut'")), /Fully quit and reopen/);
  assert.match(shortcutSaveError(new Error("No handler registered for 'set-disable-shortcuts'")), /Fully quit and reopen/);
  assert.equal(shortcutSaveError(new Error('Unexpected failure')), 'Could not save this shortcut. Try again.');
});

const require = createRequire(import.meta.url);
function loadShortcuts(t) {
  const modulePath = require.resolve('../src/electron/events/shortcuts.js');
  const registered = new Map();
  const unavailable = new Set();
  const actions = [];
  const globalShortcut = {
    register(accelerator, callback) {
      if (unavailable.has(accelerator) || registered.has(accelerator.toLowerCase())) return false;
      registered.set(accelerator.toLowerCase(), callback);
      return true;
    },
    isRegistered: accelerator => registered.has(accelerator.toLowerCase()),
    unregister: accelerator => registered.delete(accelerator.toLowerCase()),
    unregisterAll: () => registered.clear(),
  };
  const replacements = [
    [require.resolve('electron'), { globalShortcut }],
    [require.resolve('../src/electron/calibrateFullscreen.js'), { toggleCalibrationFullscreen: () => {} }],
    [require.resolve('../src/electron/events/shortcut-controls.js'), { runDeviceShortcut: command => actions.push(command) }],
  ];
  const originals = replacements.map(([id]) => require.cache[id]);
  for (const [id, exports] of replacements) require.cache[id] = { id, filename: id, loaded: true, exports };
  delete require.cache[modulePath];
  t.after(() => {
    delete require.cache[modulePath];
    replacements.forEach(([id], index) => {
      if (originals[index]) require.cache[id] = originals[index];
      else delete require.cache[id];
    });
  });
  return { shortcuts: require(modulePath), registered, unavailable, actions };
}

test('saving during capture stays paused and resuming registers the latest bindings', t => {
  const { shortcuts, registered, actions } = loadShortcuts(t);
  const sent = [];
  const window = { webContents: { send: channel => sent.push(channel) } };
  assert.deepEqual(shortcuts.enableShortcuts(window, { led: 'F9', s1: 'Control+num1' }), {});
  assert.equal(registered.size, 2);
  shortcuts.disableShortcuts();
  assert.equal(registered.size, 0);
  assert.equal(shortcuts.validateShortcut(window, 'led', 'F13'), null);
  assert.equal(registered.size, 0);
  shortcuts.enableShortcuts(window, { led: 'F13', s1: '' });
  assert.equal(registered.size, 0);
  assert.deepEqual(shortcuts.resumeShortcuts(window), {});
  assert.equal(registered.size, 1);
  registered.get('f13')();
  assert.deepEqual(sent, [], 'device shortcuts must not wait for the renderer');
  assert.deepEqual(actions, ['led']);
});

test('failed or duplicate candidates keep the saved binding and report registration errors', t => {
  const { shortcuts, registered, unavailable } = loadShortcuts(t);
  const window = { webContents: { send: () => {} } };
  shortcuts.enableShortcuts(window, { led: 'F9', s1: 'Control+K' });
  shortcuts.disableShortcuts();
  unavailable.add('F12');
  assert.match(shortcuts.validateShortcut(window, 'led', 'F12'), /Unavailable/);
  assert.match(shortcuts.validateShortcut(window, 'led', 'control+k'), /already assigned/);
  shortcuts.resumeShortcuts(window);
  assert.equal(registered.has('f9'), true);
  assert.equal(registered.has('control+k'), true);
  unavailable.add('F9');
  assert.match(shortcuts.enableShortcuts(window, { led: 'F9' }).led, /Unavailable/);
});
