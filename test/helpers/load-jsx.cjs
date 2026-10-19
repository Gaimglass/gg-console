const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const { transformSync: transformRsx } = require('@babel/core');

function loadJsx(filename, mocks = {}) {
  const module = { exports: {} };
  let source = fs.readFileSync(path.join(__dirname, '../..', filename), 'utf8');
  if (filename.endsWith('.rsx')) source = transformRsx(source, { filename,
    plugins: [require('@lms5400/babel-plugin-rsx')], parserOpts: { plugins: ['jsx'] }, configFile: false, babelrc: false }).code;
  const { code } = transformSync(source, { loader: 'jsx', format: 'cjs', jsx: 'automatic' });
  vm.runInNewContext(code, { module, exports: module.exports, window: { ipcRenderer: {} }, console,
    require: name => name in mocks ? mocks[name] : name.endsWith('.css') ? {} : require(name) });
  return module.exports.default;
}

module.exports = { loadJsx };
