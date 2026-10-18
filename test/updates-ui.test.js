const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { transformSync } = require('esbuild');
const { transformSync: transformRsx } = require('@babel/core');

function loadJsx(filename, mocks = {}) {
  const module = { exports: {} };
  let source = fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
  if (filename.endsWith('.rsx')) source = transformRsx(source, { filename,
    plugins: [require('@lms5400/babel-plugin-rsx')], parserOpts: { plugins: ['jsx'] }, configFile: false, babelrc: false }).code;
  const { code } = transformSync(source, { loader: 'jsx', format: 'cjs', jsx: 'automatic' });
  vm.runInNewContext(code, { module, exports: module.exports, window: { ipcRenderer: {} }, console,
    require: name => name in mocks ? mocks[name] : name.endsWith('.css') ? {} : require(name) });
  return module.exports.default;
}

const Updates = loadJsx('src/Updates.jsx');
const UpdatesTabWrapper = loadJsx('src/UpdatesTabWrapper.rsx');
function render(status, extra = {}) {
  return renderToStaticMarkup(React.createElement(Updates, { updates: {
    status: { currentVersion: '1.6.2', ...status }, error: '', busy: false, check() {}, restart() {}, ...extra,
  } }));
}

test('the Updates panel distinguishes a download from a ready update and prevents duplicate clicks', () => {
  const downloading = render({ phase: 'downloading' }, { busy: true });
  assert.match(downloading, /Downloading an update/);
  assert.match(downloading, /<button[^>]*disabled=""/);
  assert.doesNotMatch(downloading, /Restart and install/);
  const ready = render({ phase: 'ready', updateAvailable: true, releaseName: '1.6.3' });
  assert.match(ready, /Version 1\.6\.3 is ready/);
  assert.match(ready, /Restart and install/);
  assert.match(ready, /<button[^>]*disabled=""[^>]*>Check for updates/);
});

test('failures remain visible with escaped details and an enabled retry button', () => {
  const html = render({ phase: 'error', errorDetails: 'DNS failure <server>' }, { error: 'Could not check for updates.' });
  assert.match(html, /role="alert"/);
  assert.match(html, /Could not check for updates/);
  assert.match(html, /DNS failure &lt;server&gt;/);
  assert.match(html, /<button type="button">Check for updates/);
  assert.doesNotMatch(html, /You’re up to date/);
});

test('development explains unavailable updates and successful checks display their time', () => {
  const disabled = render({ phase: 'unavailable', message: 'Use the installed app.' });
  assert.match(disabled, /Use the installed app/);
  assert.match(disabled, /<button[^>]*disabled=""/);
  const checked = render({ phase: 'up-to-date', checkedAt: 1700000000000 });
  assert.match(checked, /You’re up to date/);
  assert.match(checked, /Last successful check/);
});

test('the existing tab banner exposes background failures and ready updates', () => {
  const show = updates => renderToStaticMarkup(React.createElement(UpdatesTabWrapper, { updates, onOpenUpdates() {} }, 'Tabs'));
  assert.match(show({ status: { phase: 'error' }, error: 'Failed' }), /Update check failed — view details/);
  assert.match(show({ status: { updateAvailable: true, releaseName: '1.6.3' } }), /Update ready: 1\.6\.3/);
  assert.match(show({ status: { updateAvailable: true }, installing: true }), /<button[^>]*disabled=""[^>]*>Restarting/);
});

test('the Updates tab stays accessible when no Gaimglass device is connected', () => {
  const emptyComponent = () => null;
  const mocks = {
    './useAppUpdates': { useAppUpdates: () => ({ status: { phase: 'idle' } }) },
    './Utils': { useThrottle: callback => callback },
    './SettingsProvider': { useSettings: () => ({ ambientSettings: {}, adsSettings: {} }) },
    './UpdatesTabWrapper.rsx': { default: UpdatesTabWrapper, __esModule: true },
  };
  for (const name of ['DefaultColors', 'WindowsControls', 'KeyBindings', 'OverlaySettings', 'ADS', 'Ambient', 'ControllerMonitor']) mocks[`./${name}`] = emptyComponent;
  mocks['./Updates'] = Updates;
  mocks['./BrightnessMonitor.rsx'] = emptyComponent;
  for (const name of ['./assets/power-off-solid.svg?react', './assets/crosshair.svg?react']) mocks[name] = emptyComponent;
  const App = loadJsx('src/AppColorPicker.jsx', mocks);
  const html = renderToStaticMarkup(React.createElement(App));
  assert.match(html, /Gaimglass not connected/);
  assert.match(html, /<button>Updates<\/button>/);
  assert.match(html, /<button disabled="">ADS<\/button>/);
});

test('manual updater IPC returns a visible error and exposes the latest status snapshot', async () => {
  const handlers = new Map();
  const status = { phase: 'error', revision: 4, error: 'The update request failed.', errorDetails: 'Network failure' };
  const module = { exports: {} };
  const electron = { ipcMain: { handle: (name, handler) => handlers.set(name, handler), on() {} } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/electron/events/ui.js'), 'utf8'), { module, console,
    require: name => name === 'electron' ? electron : name === '../updates' ? {
      getUpdateStatus: () => status,
      checkForUpdates: async () => { throw new Error('Network failure'); },
    } : {} });
  module.exports.registerUIEvents({}, {});
  assert.equal(handlers.get('get-update-status')(), status);
  const result = await handlers.get('check-for-updates')();
  assert.equal(result.phase, 'error');
  assert.equal(result.error, 'The update request failed.');
  assert.equal(result.errorDetails, 'Network failure');
});
