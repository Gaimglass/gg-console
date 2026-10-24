const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadJsx } = require('./helpers/load-jsx.cjs');

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

test('failures stay silent with a neutral status and an enabled retry button', () => {
  const html = render({ phase: 'error', errorDetails: 'DNS failure <server>' }, { error: 'Could not check for updates.' });
  assert.match(html, /Ready to check for updates/);
  assert.doesNotMatch(html, /role="alert"|<details|Could not check for updates|DNS failure|Error details|did not complete/);
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

test('the tab banner ignores background failures and still shows ready updates', () => {
  const show = updates => renderToStaticMarkup(React.createElement(UpdatesTabWrapper, { updates }, 'Tabs'));
  const failed = show({ status: { phase: 'error' }, error: 'Failed' });
  assert.match(failed, /Tabs/);
  assert.doesNotMatch(failed, /role="status"|<button|failed|error/i);
  assert.match(show({ status: { updateAvailable: true, releaseName: '1.6.3' } }), /Update ready: 1\.6\.3/);
  assert.match(show({ status: { updateAvailable: true }, installing: true }), /<button[^>]*disabled=""[^>]*>Restarting/);
  const ready = show({ status: { updateAvailable: true, releaseName: '1.6.3' }, error: 'Install failed' });
  assert.match(ready, /Update ready: 1\.6\.3/);
  assert.doesNotMatch(ready, /failed|error/i);
});

test('the Updates tab stays accessible when no Gaimglass device is connected', () => {
  const emptyComponent = () => null;
  const mocks = {
    './useAppUpdates': { useAppUpdates: () => ({ status: { phase: 'idle' } }) },
    './Utils': { useThrottle: callback => callback },
    './SettingsProvider': { useSettings: () => ({ ambientSettings: {}, adsSettings: {} }) },
    './UpdatesTabWrapper.rsx': { default: UpdatesTabWrapper, __esModule: true },
  };
  for (const name of ['CalibrationCanvas', 'CalibratePanel', 'WindowsControls', 'KeyBindings', 'OverlaySettings', 'ADS', 'Ambient', 'ControllerMonitor']) mocks[`./${name}`] = emptyComponent;
  mocks['./Updates'] = Updates;
  mocks['./BrightnessMonitor.rsx'] = emptyComponent;
  mocks['./assets/xmark-solid.svg?react'] = emptyComponent;
  mocks['./assets/logo.png'] = 'logo.png';
  mocks['./GaimglassPanel'] = loadJsx('src/GaimglassPanel.jsx', mocks);
  const App = loadJsx('src/GaimglassApp.jsx', mocks);
  const html = renderToStaticMarkup(React.createElement(App));
  assert.match(html, /Gaimglass not connected/);
  assert.match(html, /<button>Updates<\/button>/);
  assert.match(html, /<button disabled="">ADS<\/button>/);
});

test('manual updater IPC retains diagnostics without displaying a failure', async () => {
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
  const html = render(result);
  assert.match(html, /Ready to check for updates/);
  assert.doesNotMatch(html, /role="alert"|request failed|Network failure/);
});
