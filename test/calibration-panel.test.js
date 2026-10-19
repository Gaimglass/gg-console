const assert = require('node:assert/strict');
const test = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadJsx } = require('./helpers/load-jsx.cjs');

const UpdatesTabWrapper = loadJsx('src/UpdatesTabWrapper.rsx');
const DefaultRevertConfirm = loadJsx('src/DefaultRevertConfirm.jsx');

test('the shared frame exposes three fullscreen tabs and all six windowed tabs', () => {
  const mocks = { './UpdatesTabWrapper.rsx': { default: UpdatesTabWrapper, __esModule: true } };
  for (const name of ['Updates', 'ADS', 'Ambient', 'KeyBindings', 'OverlaySettings']) mocks[`./${name}`] = () => null;
  const Panel = loadJsx('src/GaimglassPanel.jsx', mocks);
  const props = { connected: true, selectedTab: 0, onSelectTab() {}, updates: { status: {} }, calibratePanel: 'Shared calibration controls' };
  const fullscreen = renderToStaticMarkup(React.createElement(Panel, { ...props, fullscreen: true }));
  const windowed = renderToStaticMarkup(React.createElement(Panel, props));
  assert.equal((fullscreen.match(/role="tab"/g) || []).length, 3);
  assert.equal((windowed.match(/role="tab"/g) || []).length, 6);
  for (const name of ['Calibrate', 'ADS', 'Ambient']) assert.match(fullscreen, new RegExp(`<button>${name}</button>`));
  assert.doesNotMatch(fullscreen, /Shortcuts|Overlay|Updates|header/);
  assert.match(fullscreen, /Shared calibration controls/);
});

test('both calibration modes share editable swatches and saved slot selection', () => {
  let swatches;
  let picker;
  const changes = [];
  const Panel = loadJsx('src/CalibratePanel.jsx', {
    './DefaultColors': props => { swatches = props; return null; },
    './DefaultRevertConfirm': DefaultRevertConfirm,
    'react-colorful': { RgbaColorPicker: props => { picker = props; return null; } },
    './assets/power-off-solid.svg?react': () => null,
    './assets/crosshair.svg?react': () => null,
  });
  const props = {
    color: { r: 1, g: 2, b: 3, a: 0.35 }, ledOn: true, defaultColors: [], editSwatch: 2,
    onDefaultColorChange: (...args) => changes.push(JSON.parse(JSON.stringify(args))),
    onPickerColorChange: color => changes.push([color]),
  };
  const fullscreen = renderToStaticMarkup(React.createElement(Panel, { ...props, fullscreen: true }));
  assert.equal(swatches.readOnly, undefined);
  assert.equal(swatches.editSwatch, 2);
  swatches.onChangeColor({ r: 10, g: 20, b: 30 }, 5);
  assert.deepEqual(changes.pop(), [{ r: 10, g: 20, b: 30 }, 5]);
  picker.onChange({ r: 100, g: 50, b: 0, a: 0.1 });
  assert.equal(changes.length, 0, 'controlled prop callbacks must not count as user edits');
  picker.onKeyDownCapture();
  picker.onChange({ r: 100, g: 50, b: 0, a: 0.1 });
  assert.deepEqual(changes.pop(), [{ r: 100, g: 50, b: 0, a: 0.1 }]);
  assert.doesNotMatch(fullscreen, /Open fullscreen calibration/);
  assert.match(fullscreen, /Current color A/);
  assert.match(fullscreen, /Reset to Default/);
  assert.match(fullscreen, /Delete Slot/);
  const windowed = renderToStaticMarkup(React.createElement(Panel, props));
  assert.equal(swatches.readOnly, undefined);
  assert.equal(swatches.editSwatch, 2);
  swatches.onChangeColor({ r: 10, g: 20, b: 30 }, 5);
  assert.deepEqual(changes.pop(), [{ r: 10, g: 20, b: 30 }, 5]);
  assert.match(windowed, /Open fullscreen calibration/);
});

test('the calibration footer appears only during editing and protects the first slot in both modes', () => {
  let confirmation;
  const actions = [];
  const Panel = loadJsx('src/CalibratePanel.jsx', {
    './DefaultColors': () => null,
    './DefaultRevertConfirm': props => {
      confirmation = props;
      return React.createElement(DefaultRevertConfirm, props);
    },
    'react-colorful': { RgbaColorPicker: () => null },
    './assets/power-off-solid.svg?react': () => null,
    './assets/crosshair.svg?react': () => null,
  });
  for (const fullscreen of [true, false]) {
    const props = {
      fullscreen, color: { r: 1, g: 2, b: 3, a: 0.35 }, defaultColors: [],
      onResetDefaultColor: () => actions.push('reset'),
      onDeleteDefaultColor: () => actions.push('delete'),
      onSetEditSwatch: index => actions.push(index),
    };
    const show = editSwatch => renderToStaticMarkup(React.createElement(Panel, { ...props, editSwatch }));
    assert.doesNotMatch(show(null), /Reset to Default|Delete Slot/);
    const firstSlot = show(0);
    assert.match(firstSlot, /Reset to Default/);
    assert.doesNotMatch(firstSlot, /Delete Slot/);
    confirmation.onReset();
    assert.deepEqual(actions.splice(0), ['reset', null]);
    assert.match(show(1), /Delete Slot/);
    confirmation.onDelete();
    assert.deepEqual(actions.splice(0), ['delete', null]);
  }
});

