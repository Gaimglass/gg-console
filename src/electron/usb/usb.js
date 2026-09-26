const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { SERIAL_COMMANDS } = require('./serial-codes');
const { BrowserWindow } = require('electron');

const RECONNECT_INTERVAL_MS = 800;
const OPEN_TIMEOUT_MS = 5000;
const CLOSE_TIMEOUT_MS = 5000;
const SERIAL_RESPONSE_TIMEOUT_MS = 150;
const REPEATED_ERROR_LOG_INTERVAL_MS = 30000;

let activeConnection = null;
let pendingConnection = null;
let connectPromise = null;
let deviceInfo = {};
let isDev = false;
let intervalId = null;
let mainWindowRef = null;
let electronAppRef = null;
let connectionGeneration = 0;
let connectionAttempt = 0;
let shouldReconnect = false;
let repeatedOpenError = null;

function getPortState(serialPort) {
  if (!serialPort) {
    return 'port=none';
  }

  return `port=${serialPort.path} isOpen=${serialPort.isOpen} opening=${serialPort.opening} closing=${serialPort.closing} destroyed=${serialPort.destroyed}`;
}

function sendToMainWindow(channel) {
  const windowDestroyed = mainWindowRef?.isDestroyed?.() ?? false;
  const webContentsDestroyed = mainWindowRef?.webContents?.isDestroyed?.() ?? false;

  if (!mainWindowRef || windowDestroyed || webContentsDestroyed) {
    return;
  }

  mainWindowRef.webContents.send(channel);
}

function logOpenFailure(connection, error) {
  const now = Date.now();
  const key = `${connection.port.path}:${error.message}`;

  if (!repeatedOpenError || repeatedOpenError.key !== key) {
    repeatedOpenError = { key, count: 1, lastLoggedAt: now };
    console.log(`[USB] attempt=${connection.id} open failed: ${error.message}`);
    return;
  }

  repeatedOpenError.count++;
  if (now - repeatedOpenError.lastLoggedAt >= REPEATED_ERROR_LOG_INTERVAL_MS) {
    console.log(`[USB] attempt=${connection.id} open still failing after ${repeatedOpenError.count} attempts: ${error.message}`);
    repeatedOpenError.count = 0;
    repeatedOpenError.lastLoggedAt = now;
  }
}

function clearOpenFailure() {
  if (repeatedOpenError?.count > 1) {
    console.log(`[USB] Port opened after ${repeatedOpenError.count} suppressed failures`);
  }
  repeatedOpenError = null;
}

function rejectPendingResponses(connection, error) {
  for (const pendingResponse of connection.pendingResponses.values()) {
    pendingResponse.reject(error);
  }
  connection.pendingResponses.clear();
}

function writeCommandToConnection(connection, command, commandStr = '') {
  const serialPort = connection?.port;
  if (!serialPort || !serialPort.isOpen || serialPort.destroyed || connection.cancelled) {
    return Promise.reject(new Error('Port not available'));
  }

  const previousResponse = connection.pendingResponses.get(command);
  if (previousResponse) {
    previousResponse.reject(new Error(`Serial command ${command} was superseded`));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId = null;

    const finish = (error, value) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (connection.pendingResponses.get(command) === pendingResponse) {
        connection.pendingResponses.delete(command);
      }

      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    };

    const pendingResponse = {
      resolve: value => finish(null, value),
      reject: error => finish(error),
    };

    connection.pendingResponses.set(command, pendingResponse);
    timeoutId = setTimeout(() => {
      finish(new Error('Serial port timed out'));
    }, SERIAL_RESPONSE_TIMEOUT_MS);

    if (isDev) {
      console.log('Write Command:', command, commandStr, serialPort.path);
    }

    try {
      serialPort.write(`${command}${commandStr}\n`, error => {
        if (error) {
          finish(error);
        }
      });
    } catch (error) {
      finish(error);
    }
  });
}

function getDeviceInfo(connection) {
  return writeCommandToConnection(connection, SERIAL_COMMANDS.GET_DEVICE_INFO);
}

function handleParserData(connection, data) {
  const parts = data.split(':');
  const messageId = parts[0].padStart(3, 0);
  const ggResponse = parts[1];

  if (isDev) {
    console.log('Gaimglass response:', { data });
  }

  const pendingResponse = connection.pendingResponses.get(messageId);
  if (pendingResponse) {
    pendingResponse.resolve(ggResponse);
    return;
  }

  if (connection === activeConnection) {
    handleUnprovokedMessages(messageId, ggResponse);
  }
}

function attachConnectionListeners(connection) {
  const serialPort = connection.port;

  connection.errorHandler = error => {
    console.log(`[USB] attempt=${connection.id} port error: ${error.message}; ${getPortState(serialPort)}`);

    if (connection === activeConnection && !connection.intentionalClose) {
      setImmediate(() => {
        void disconnectUsb(connection.app, { reason: 'port-error' });
      });
    }
  };

  connection.closeHandler = error => {
    const wasActive = connection === activeConnection;
    if (wasActive) {
      activeConnection = null;
    }

    rejectPendingResponses(connection, error || new Error('Serial port closed'));
    const suffix = error ? ` with error: ${error.message}` : ' successfully';
    console.log(`[USB] attempt=${connection.id} serial port closed${suffix}`);

    if (wasActive) {
      sendToMainWindow('usb-disconnected');
    }
  };

  serialPort.on('error', connection.errorHandler);
  serialPort.on('close', connection.closeHandler);

  connection.parser = serialPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));
  connection.dataHandler = data => handleParserData(connection, data);
  connection.parser.on('data', connection.dataHandler);
}

function openConnection(connection) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      settled = true;
      connection.cancelled = true;
      reject(new Error(`Opening ${connection.port.path} timed out`));
    }, OPEN_TIMEOUT_MS);

    connection.port.open(error => {
      if (settled) {
        if (!error && connection.port.isOpen) {
          console.warn(`[USB] attempt=${connection.id} completed after cancellation; closing stale port`);
          void disposeConnection(connection, 'late-open');
        }
        return;
      }

      settled = true;
      clearTimeout(timeoutId);

      if (error) {
        reject(error);
      } else {
        connection.opened = true;
        resolve();
      }
    });
  });
}

function closeConnectionPort(connection, reason) {
  const serialPort = connection.port;

  if (serialPort.opening) {
    connection.cancelled = true;
    console.log(`[USB] attempt=${connection.id} close deferred while port is opening; reason=${reason}`);
    return Promise.resolve(false);
  }

  if (!serialPort.isOpen) {
    if (!serialPort.destroyed) {
      serialPort.destroy();
    }
    return Promise.resolve(true);
  }

  return new Promise(resolve => {
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      console.error(`[USB] attempt=${connection.id} close timed out; reason=${reason}; ${getPortState(serialPort)}`);
      resolve(false);
    }, CLOSE_TIMEOUT_MS);

    serialPort.close(error => {
      clearTimeout(timeoutId);

      if (timedOut) {
        const suffix = error ? `error=${error.message}` : 'success';
        console.log(`[USB] attempt=${connection.id} late close completed; reason=${reason}; ${suffix}`);
        return;
      }

      if (error) {
        console.error(`[USB] attempt=${connection.id} close failed; reason=${reason}: ${error.message}`);
        resolve(false);
      } else {
        console.log(`[USB] attempt=${connection.id} close completed; reason=${reason}`);
        resolve(true);
      }
    });
  });
}

async function disposeConnection(connection, reason) {
  if (!connection || connection.disposed) {
    return;
  }

  connection.cancelled = true;
  connection.intentionalClose = true;
  rejectPendingResponses(connection, new Error(`Serial connection closed: ${reason}`));

  if (connection.parser && connection.dataHandler) {
    connection.parser.removeListener('data', connection.dataHandler);
  }

  const closed = await closeConnectionPort(connection, reason);
  if (!closed && connection.port.opening) {
    return;
  }

  connection.disposed = true;
  if (connection.errorHandler) {
    connection.port.removeListener('error', connection.errorHandler);
  }
  if (connection.closeHandler) {
    connection.port.removeListener('close', connection.closeHandler);
  }
  connection.parser?.removeAllListeners();
}

async function performConnect(mainWindow, app, generation, attemptId) {
  const ports = await SerialPort.list();
  if (generation !== connectionGeneration || !shouldReconnect) {
    return false;
  }

  const devicePort = ports.find(candidate => candidate.productId === '5400' && candidate.vendorId === '2341');
  if (!devicePort?.path) {
    if (isDev) {
      console.log('[USB] No device found');
    }
    return false;
  }

  const serialPort = new SerialPort({
    path: devicePort.path,
    baudRate: 115200,
    autoOpen: false,
  });

  const connection = {
    id: attemptId,
    generation,
    port: serialPort,
    parser: null,
    pendingResponses: new Map(),
    app,
    mainWindow,
    cancelled: false,
    intentionalClose: false,
    opened: false,
    disposed: false,
  };

  pendingConnection = connection;
  if (isDev) {
    console.log(`[USB] attempt=${attemptId} opening ${devicePort.path}; generation=${generation}`);
  }

  try {
    await openConnection(connection);

    if (generation !== connectionGeneration || !shouldReconnect) {
      console.log(`[USB] attempt=${attemptId} became stale after open; generation=${generation}->${connectionGeneration}`);
      await disposeConnection(connection, 'stale-open');
      return false;
    }

    attachConnectionListeners(connection);
    const result = await getDeviceInfo(connection);

    if (generation !== connectionGeneration || !shouldReconnect) {
      console.log(`[USB] attempt=${attemptId} became stale during initialization; generation=${generation}->${connectionGeneration}`);
      await disposeConnection(connection, 'stale-initialization');
      return false;
    }

    const [name, version] = result.split('&');
    deviceInfo = {
      name: name?.split('=')[1],
      version: version?.split('=')[1],
    };

    if (deviceInfo.name !== 'ggpro') {
      throw new Error(`Invalid device name, expected "ggpro" and found ${deviceInfo.name}`);
    }

    activeConnection = connection;
    clearOpenFailure();
    console.log(`[USB] attempt=${attemptId} connected to ${devicePort.path}; firmware=${deviceInfo.version || 'unknown'}`);
    sendToMainWindow('usb-connected');
    return true;
  } catch (error) {
    if (!connection.opened) {
      logOpenFailure(connection, error);
    } else if (generation === connectionGeneration) {
      console.log(`[USB] attempt=${attemptId} initialization failed: ${error.message}`);
    }

    await disposeConnection(connection, connection.opened ? 'initialization-failed' : 'open-failed');
    return false;
  } finally {
    if (pendingConnection === connection) {
      pendingConnection = null;
    }
  }
}

// Connect to the serial port of the Gaimglass device. Only one attempt may run at a time.
async function connectUsb(mainWindow, _isDev, app) {
  isDev = _isDev;
  mainWindowRef = mainWindow;
  electronAppRef = app;

  if (!shouldReconnect || activeConnection?.port.isOpen || connectPromise) {
    return connectPromise;
  }

  const generation = connectionGeneration;
  const attemptId = ++connectionAttempt;
  const attemptPromise = performConnect(mainWindow, app, generation, attemptId);
  connectPromise = attemptPromise;

  try {
    return await attemptPromise;
  } catch (error) {
    console.error(`[USB] attempt=${attemptId} connection attempt failed: ${error.message}`);
    return false;
  } finally {
    if (connectPromise === attemptPromise) {
      connectPromise = null;
    }
  }
}

// Messages directly from GG that are not provoked from the console, such as a device button press.
function handleUnprovokedMessages(messageId, ggResponse) {
  const allWindows = BrowserWindow.getAllWindows();

  if (SERIAL_COMMANDS.UPDATE_MAIN_LED === messageId) {
    allWindows.forEach(window => {
      window.webContents.send('update-main-led-state-from-gg', ggResponse);
    });
  }
  if (SERIAL_COMMANDS.UPDATE_DEFAULT_LEDS === messageId) {
    allWindows.forEach(window => {
      window.webContents.send('update-default-colors-from-gg', ggResponse);
    });
  }
}

function stopConnectThink() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function startConnectThink() {
  if (intervalId || !shouldReconnect || !mainWindowRef || !electronAppRef) {
    return;
  }

  void connectUsb(mainWindowRef, isDev, electronAppRef);
  intervalId = setInterval(() => {
    void connectUsb(mainWindowRef, isDev, electronAppRef);
  }, RECONNECT_INTERVAL_MS);
}

// Attempt to connect to the USB device and keep retrying while the app is running.
async function initializeUsb(mainWindow, app, developmentMode) {
  mainWindowRef = mainWindow;
  electronAppRef = app;
  isDev = developmentMode;
  shouldReconnect = true;
  startConnectThink();
}

async function disconnectUsb(electronApp, options = {}) {
  const reconnect = options.reconnect !== false;
  const reason = options.reason || 'requested';
  const generation = ++connectionGeneration;

  electronAppRef = electronApp || electronAppRef;
  shouldReconnect = reconnect && !electronAppRef?.isQuitting;
  stopConnectThink();

  const connectionToClose = activeConnection;
  activeConnection = null;

  console.log(`[USB] reset requested; reason=${reason}; generation=${generation}; reconnect=${shouldReconnect}; active=${getPortState(connectionToClose?.port)}; pending=${getPortState(pendingConnection?.port)}`);

  if (connectionToClose) {
    sendToMainWindow('usb-disconnected');
    await disposeConnection(connectionToClose, reason);
  }

  const pendingAttempt = connectPromise;
  if (pendingAttempt) {
    try {
      await pendingAttempt;
    } catch (error) {
      console.log(`[USB] Pending connection cleanup failed: ${error.message}`);
    }
  }

  // A newer reset owns the decision about whether to reconnect.
  if (generation !== connectionGeneration) {
    return;
  }

  if (shouldReconnect) {
    startConnectThink();
  }
}

/**
 * Write a command string to Gaimglass and resolve with the device response.
 */
async function writeCommand(command, commandStr = '') {
  return writeCommandToConnection(activeConnection, command, commandStr);
}

module.exports = {
  initializeUsb,
  writeCommand,
  disconnectUsb,
};
