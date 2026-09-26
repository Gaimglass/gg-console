const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');
const usbModulePath = path.join(projectRoot, 'src', 'electron', 'usb', 'usb.js');

function waitFor(predicate, timeoutMs = 1000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) {
        resolve();
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('Timed out waiting for condition'));
        return;
      }

      setTimeout(check, 5);
    };

    check();
  });
}

function loadUsbModule() {
  const instances = [];

  class FakeReadlineParser extends EventEmitter {}

  class FakeSerialPort extends EventEmitter {
    static async list() {
      return [{ path: 'COM11', productId: '5400', vendorId: '2341' }];
    }

    constructor(options) {
      super();
      assert.equal(options.autoOpen, false);
      this.path = options.path;
      this.opening = false;
      this.closing = false;
      this.destroyed = false;
      this.nativeOpen = false;
      this.closeCalls = 0;
      this.openCallback = null;
      this.parser = null;
      instances.push(this);
    }

    get isOpen() {
      return this.nativeOpen && !this.closing;
    }

    open(callback) {
      this.opening = true;
      this.openCallback = callback;
    }

    completeOpen(error = null) {
      this.opening = false;
      if (!error) {
        this.nativeOpen = true;
        this.emit('open');
      }
      this.openCallback(error);
    }

    close(callback) {
      this.closeCalls++;
      this.closing = true;
      queueMicrotask(() => {
        this.nativeOpen = false;
        this.closing = false;
        this.emit('close');
        callback(null);
      });
    }

    destroy() {
      this.destroyed = true;
    }

    pipe(parser) {
      this.parser = parser;
      return parser;
    }

    write(data, callback) {
      queueMicrotask(() => {
        callback?.(null);
        if (data.startsWith('130')) {
          this.parser.emit('data', '130:name=ggpro&version=test');
        }
      });
      return true;
    }
  }

  const replacements = [
    [require.resolve('serialport'), { SerialPort: FakeSerialPort }],
    [require.resolve('@serialport/parser-readline'), { ReadlineParser: FakeReadlineParser }],
    [require.resolve('electron'), { BrowserWindow: { getAllWindows: () => [] } }],
  ];
  const previousCacheEntries = replacements.map(([modulePath]) => require.cache[modulePath]);

  replacements.forEach(([modulePath, exports]) => {
    require.cache[modulePath] = {
      id: modulePath,
      filename: modulePath,
      loaded: true,
      exports,
    };
  });

  delete require.cache[usbModulePath];
  const usb = require(usbModulePath);

  const restore = () => {
    delete require.cache[usbModulePath];
    replacements.forEach(([modulePath], index) => {
      const previousEntry = previousCacheEntries[index];
      if (previousEntry) {
        require.cache[modulePath] = previousEntry;
      } else {
        delete require.cache[modulePath];
      }
    });
  };

  return { instances, restore, usb };
}

function createWindow(sentEvents) {
  return {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send: channel => sentEvents.push(channel),
    },
  };
}

test('a connection that finishes opening after reset is closed as stale', async t => {
  const { instances, restore, usb } = loadUsbModule();
  const app = { isQuitting: false };
  const sentEvents = [];
  t.after(restore);

  await usb.initializeUsb(createWindow(sentEvents), app, false);
  await waitFor(() => instances.length === 1 && instances[0].opening);

  const stalePort = instances[0];
  const resetPromise = usb.disconnectUsb(app, { reconnect: false, reason: 'test-reset' });
  stalePort.completeOpen();
  await resetPromise;

  assert.equal(stalePort.closeCalls, 1);
  assert.equal(stalePort.nativeOpen, false);
  assert.deepEqual(sentEvents, []);
});

test('shutdown closes an active port and does not start another attempt', async t => {
  const { instances, restore, usb } = loadUsbModule();
  const app = { isQuitting: false };
  const sentEvents = [];
  t.after(restore);

  await usb.initializeUsb(createWindow(sentEvents), app, false);
  await waitFor(() => instances.length === 1 && instances[0].opening);
  instances[0].completeOpen();
  await waitFor(() => sentEvents.includes('usb-connected'));

  await usb.disconnectUsb(app, { reconnect: false, reason: 'test-shutdown' });
  await new Promise(resolve => setTimeout(resolve, 850));

  assert.equal(instances.length, 1);
  assert.equal(instances[0].closeCalls, 1);
  assert.deepEqual(sentEvents, ['usb-connected', 'usb-disconnected']);
});
