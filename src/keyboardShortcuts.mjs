const keyAliases = {
  ' ': 'Space', '+': 'Plus',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  AudioVolumeUp: 'VolumeUp', AudioVolumeDown: 'VolumeDown', AudioVolumeMute: 'VolumeMute',
};
const numpadKeys = {
  NumpadAdd: 'numadd', NumpadSubtract: 'numsub', NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv', NumpadDecimal: 'numdec', NumpadEnter: 'Enter',
};
const namedKeys = new Set(['Space', 'Plus', 'Enter', 'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown', 'Insert', 'CapsLock', 'NumLock', 'ScrollLock', 'PrintScreen', 'VolumeUp', 'VolumeDown', 'VolumeMute', 'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop', 'MediaPlayPause']);

export function bindingFromEvent(event) {
  let key = numpadKeys[event.code] || keyAliases[event.key] || event.key;
  if (/^Numpad[0-9]$/.test(event.code)) key = `num${event.code.slice(-1)}`;
  if (key?.length === 1 && /^[a-z]$/i.test(key)) key = key.toUpperCase();
  const supported = key && ((key.length === 1 && /^[\x21-\x7e]$/.test(key)) || namedKeys.has(key) || /^F([1-9]|1[0-9]|2[0-4])$/.test(key) || /^num[0-9]$/.test(key) || Object.values(numpadKeys).includes(key));
  if (!supported) return null;
  const modifiers = [];
  if (event.ctrlKey) modifiers.push('Control');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  if (event.metaKey) modifiers.push('Super');
  return [...modifiers, key].join('+');
}

export function findDuplicateBinding(bindings, command, binding) {
  if (!binding) return null;
  return Object.keys(bindings).find(other => other !== command && bindings[other].toLowerCase() === binding.toLowerCase()) || null;
}

const displayNames = {
  Control: 'Ctrl', CommandOrControl: 'Ctrl/Cmd', Super: 'Win/Cmd',
  numadd: 'Numpad +', numsub: 'Numpad -', nummult: 'Numpad *', numdiv: 'Numpad /', numdec: 'Numpad .', Plus: '+',
};
export function displayBinding(binding = '') {
  return binding.split('+').map(part => displayNames[part] || (/^num[0-9]$/.test(part) ? `Numpad ${part.slice(-1)}` : part)).join(' + ');
}

export function shortcutSaveError(error) {
  const message = String(error?.message || error);
  if (/No handler registered for ['"](?:validate-shortcut|set-disable-shortcuts|set-resume-shortcuts)['"]/i.test(message)) {
    return 'Fully quit and reopen Gaimglass to use the updated shortcut controls.';
  }
  return 'Could not save this shortcut. Try again.';
}
