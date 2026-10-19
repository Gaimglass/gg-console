const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { transformSync } = require('esbuild');

function createCanvasScene() {
  const viewport = { innerWidth: 2560, innerHeight: 1440 };
  const module = { exports: {} };
  const { code } = transformSync(fs.readFileSync(path.join(__dirname, '../src/Crosshairs.js'), 'utf8'), { format: 'cjs' });
  vm.runInNewContext(code, { module, exports: module.exports, window: viewport });
  const writes = [];
  const clears = [];
  let width = 0;
  let height = 0;
  let newPaths = 0;
  const ctx = {
    canvas: {
      get width() { return width; },
      set width(value) { writes.push(['width', value]); width = value; },
      get height() { return height; },
      set height(value) { writes.push(['height', value]); height = value; },
    },
    clearRect: (...args) => clears.push(args),
    beginPath() { newPaths++; },
    moveTo() {}, lineTo() {}, stroke() {},
  };
  const scene = new module.exports.Crosshairs(ctx, { r: 10, g: 20, b: 30, a: 0.5 });
  writes.length = 0;
  return { scene, viewport, writes, clears, paths: () => newPaths };
}

test('steady fullscreen animation reuses its canvas buffer and clears old geometry every frame', () => {
  const { scene, writes, clears, paths } = createCanvasScene();
  for (let i = 0; i < 120; i++) scene.draw(16, 0);
  assert.deepEqual(writes, [], 'drawing must not reset the full canvas buffer at every frame');
  assert.equal(clears.length, 120);
  assert.ok(clears.every(rect => rect.join() === '0,0,2560,1440'));
  assert.equal(paths(), 120, 'clearing pixels must also discard paths from earlier frames');
});

test('fullscreen animation resizes only the changed dimension and then clears the new bounds', () => {
  const { scene, viewport, writes, clears } = createCanvasScene();
  viewport.innerWidth = 1920;
  scene.draw(16, 0);
  assert.deepEqual(writes, [['width', 1920]]);
  assert.deepEqual(clears.at(-1), [0, 0, 1920, 1440]);
  viewport.innerHeight = 1080;
  scene.draw(16, 0);
  scene.draw(16, 0);
  assert.deepEqual(writes, [['width', 1920], ['height', 1080]]);
  assert.deepEqual(clears.at(-1), [0, 0, 1920, 1080]);
});
