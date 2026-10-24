const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { SERIAL_COMMANDS } = require('./serial-codes');
const { BrowserWindow } = require('electron');
const { showActionOverlay } = require('../overlay');
const { createDeviceFeedback } = require('./device-feedback');
// TEMPORARY USB investigation: observation only; remove with diagnostics.js.
const { createUsbDiagnostics } = require('./diagnostics');
const { performance } = require('node:perf_hooks');

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
const commandFailures = new Map();
const commandNames = new Map(Object.entries(SERIAL_COMMANDS).map(([name, code]) => [code, name]));

// TEMPORARY: one health summary per minute and at most one failure history per
// 30 seconds across all connections. No probes or additional USB writes.
let diagnosticLastTick = null;
let diagnosticMaxLoopLagMs = 0;
let diagnosticNextSummary = 0;
let diagnosticLastFailure = -Infinity;
let diagnosticPowerEvent = null;
let diagnosticLastResume = null;

function logUsbDiagnostics(reason, { connection = activeConnection || pendingConnection, history = false } = {}) {
  try {
    const now = performance.now();
    if (history) {
      if (now - diagnosticLastFailure < REPEATED_ERROR_LOG_INTERVAL_MS) return;
      diagnosticLastFailure = now;
    }
    if (reason === 'os-resume' || reason === 'os-suspend') {
      diagnosticPowerEvent = { event: reason, at: Date.now() };
      if (reason === 'os-resume') diagnosticLastResume = Date.now();
      // Sleep time is not a main-process scheduling stall.
      diagnosticLastTick = now;
      diagnosticMaxLoopLagMs = 0;
    }
    const memory = process.memoryUsage();
    const snapshot = { revision: 'usb-sleep-v1', reason, at: Date.now(), pid: process.pid,
      appVersion: electronAppRef?.getVersion?.() ?? null, uptimeSeconds: Math.round(process.uptime()),
      attempt: connection?.id ?? null, port: getPortState(connection?.port),
      writableBytes: connection?.port.writableLength ?? null, readableBytes: connection?.port.readableLength ?? null,
      mainLoopMaxLagMs: Math.round(diagnosticMaxLoopLagMs), rssMiB: Math.round(memory.rss / 1048576),
      heapUsedMiB: Math.round(memory.heapUsed / 1048576), power: diagnosticPowerEvent,
      sinceResumeMs: diagnosticLastResume === null ? null : Date.now() - diagnosticLastResume,
      windowVisible: mainWindowRef?.isDestroyed?.() ? null : mainWindowRef?.isVisible?.() ?? null,
      webContentsDestroyed: mainWindowRef?.webContents?.isDestroyed?.() ?? null,
      transport: connection?.diagnostics.snapshot(history) ?? null };
    console.log(`[USB][Diagnostics] ${JSON.stringify(snapshot)}`);
    return snapshot;
  } catch { /* Temporary diagnostics must not interrupt USB or shutdown. */ }
}

function sampleUsbDiagnostics() {
  const now = performance.now();
  if (diagnosticLastTick !== null) {
    diagnosticMaxLoopLagMs = Math.max(diagnosticMaxLoopLagMs, now - diagnosticLastTick - RECONNECT_INTERVAL_MS);
  }
  diagnosticLastTick = now;
  if (now >= diagnosticNextSummary) {
    logUsbDiagnostics('periodic');
    diagnosticNextSummary = now + 60000;
    diagnosticMaxLoopLagMs = 0;
  }
}

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

function logCommandFailure(connection, command, error, elapsedMs, request) {
  const now = Date.now();
  const previousFailure = commandFailures.get(command);
  const sameFailure = previousFailure?.attemptId === connection?.id && previousFailure?.message === error.message;
  const failure = sameFailure ? previousFailure : {
    attemptId: connection?.id,
    message: error.message,
    count: 0,
    lastLoggedAt: 0,
  };
  failure.count++;
  commandFailures.set(command, failure);

  if (sameFailure && now - failure.lastLoggedAt < REPEATED_ERROR_LOG_INTERVAL_MS) {
    return;
  }

  failure.lastLoggedAt = now;
  const lastResponseAge = connection?.lastResponseAt ? now - connection.lastResponseAt : 'none';
  const diagnostic = request && connection.diagnostics.details(request);
  const requestInfo = diagnostic ? `; request=${diagnostic.request}; source=${diagnostic.source}; queueWaitMs=${diagnostic.queueWaitMs}; driverCallbackMs=${diagnostic.driverCallbackMs ?? 'pending'}` : '';
  console.warn(`[USB] attempt=${connection?.id ?? 'none'} command=${commandNames.get(command) || command}(${command}) failed: ${error.message}; elapsedMs=${elapsedMs}; failures=${failure.count}; lastResponseAgeMs=${lastResponseAge}; cancelled=${connection?.cancelled ?? false}; ${getPortState(connection?.port)}${requestInfo}`);
  // TEMPORARY: preserve the successful traffic and driver callbacks that led up
  // to the failure, rather than logging every ambient/ADS write to disk.
  if (connection && !connection.cancelled) logUsbDiagnostics('command-failure', { connection, history: true });
}

function writeCommandToConnection(connection, command, commandStr = '', source = 'unspecified') {
  if (!connection) return performCommandToConnection(connection, command, commandStr);
  const diagnosticRequest = connection.diagnostics.queued(command, source);
  // Replies carry only a command code. Keep one request per code in flight.
  const previous = connection.commandQueues.get(command);
  const run = () => performCommandToConnection(connection, command, commandStr, diagnosticRequest);
  const request = previous ? previous.then(run) : run();
  const tail = request.then(() => {}, () => {});
  connection.commandQueues.set(command, tail);
  void tail.then(() => {
    if (connection.commandQueues.get(command) === tail) connection.commandQueues.delete(command);
  });
  return request;
}

function performCommandToConnection(connection, command, commandStr, diagnosticRequest) {
  const serialPort = connection?.port;
  if (!serialPort || !serialPort.isOpen || serialPort.destroyed || connection.cancelled) {
    const error = new Error('Port not available');
    if (diagnosticRequest) connection.diagnostics.complete(diagnosticRequest, error);
    logCommandFailure(connection, command, error, 0, diagnosticRequest);
    return Promise.reject(error);
  }

  return new Promise((resolve, reject) => {
    const frame = `${command}${commandStr}\n`;
    connection.diagnostics.start(diagnosticRequest, frame);
    const startedAt = Date.now();
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

      connection.diagnostics.complete(diagnosticRequest, error, value);

      if (error) {
        logCommandFailure(connection, command, error, Date.now() - startedAt, diagnosticRequest);
        reject(error);
      } else {
        commandFailures.delete(command);
        connection.feedback.recordResponse(command, commandStr, value);
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

    try {
      const accepted = serialPort.write(frame, error => {
        connection.diagnostics.writeCallback(diagnosticRequest, error);
        if (error) {
          finish(error);
        }
      });
      if (!accepted) connection.diagnostics.backpressure(diagnosticRequest, serialPort.writableLength);
    } catch (error) {
      finish(error);
    }
  });
}

function getDeviceInfo(connection) {
  return writeCommandToConnection(connection, SERIAL_COMMANDS.GET_DEVICE_INFO, '', 'initialize');
}

function handleParserData(connection, data) {
  connection.lastResponseAt = Date.now();
  const parts = data.split(':');
  const messageId = parts[0].padStart(3, 0);
  const ggResponse = parts[1];

  const pendingResponse = connection.pendingResponses.get(messageId);
  connection.diagnostics.line(data, messageId, Boolean(pendingResponse));
  if (pendingResponse) {
    pendingResponse.resolve(ggResponse);
    return;
  }

  if ([SERIAL_COMMANDS.GET_MAIN_LED, SERIAL_COMMANDS.GET_DEFAULT_LEDS, SERIAL_COMMANDS.GET_DEVICE_INFO].includes(messageId)) {
    console.warn(`[USB] attempt=${connection.id} response without pending request; command=${commandNames.get(messageId)}(${messageId}); ${getPortState(connection.port)}`);
  }

  if (connection === activeConnection) {
    handleUnprovokedMessages(connection, messageId, ggResponse);
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
    if (connection.rawDataHandler) serialPort.removeListener('data', connection.rawDataHandler);
    const suffix = error ? ` with error: ${error.message}` : ' successfully';
    console.log(`[USB] attempt=${connection.id} serial port closed${suffix}`);

    if (wasActive) {
      sendToMainWindow('usb-disconnected');
    }
  };

  serialPort.on('error', connection.errorHandler);
  serialPort.on('close', connection.closeHandler);

  // TEMPORARY: count raw bytes separately from complete parser lines so a
  // partial or malformed reply can be distinguished from complete silence.
  connection.rawDataHandler = chunk => connection.diagnostics.bytes(chunk);
  serialPort.on('data', connection.rawDataHandler);
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
  if (connection.rawDataHandler) connection.port.removeListener('data', connection.rawDataHandler);

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
    commandQueues: new Map(),
    diagnostics: createUsbDiagnostics(),
    feedback: createDeviceFeedback(),
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
function handleUnprovokedMessages(connection, messageId, ggResponse) {
  const notification = connection.feedback.fromDevice(messageId, ggResponse);
  if (notification) showActionOverlay(notification);
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

  diagnosticLastTick = performance.now();
  void connectUsb(mainWindowRef, isDev, electronAppRef);
  intervalId = setInterval(() => {
    sampleUsbDiagnostics();
    void connectUsb(mainWindowRef, isDev, electronAppRef);
  }, RECONNECT_INTERVAL_MS);
}

// Attempt to connect to the USB device and keep retrying while the app is running.
async function initializeUsb(mainWindow, app, developmentMode) {
  mainWindowRef = mainWindow;
  electronAppRef = app;
  isDev = developmentMode;
  shouldReconnect = true;
  diagnosticNextSummary = performance.now() + 60000;
  logUsbDiagnostics('session.begin');
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
async function writeCommand(command, commandStr = '', source = 'unspecified') {
  return writeCommandToConnection(activeConnection, command, commandStr, source);
}

// Reload renderer state through the existing connection without resetting USB.
async function readDeviceState(reason = 'requested') {
  const connection = activeConnection;
  const startedAt = Date.now();
  console.log(`[USB] state read requested; reason=${reason}; attempt=${connection?.id ?? 'none'}; active=${getPortState(connection?.port)}; pending=${getPortState(pendingConnection?.port)}; connecting=${Boolean(connectPromise)}`);

  try {
    const mainLed = await writeCommandToConnection(connection, SERIAL_COMMANDS.GET_MAIN_LED, '', `state-read:${reason}`);
    const defaultColors = await writeCommandToConnection(connection, SERIAL_COMMANDS.GET_DEFAULT_LEDS, '', `state-read:${reason}`);
    if (connection !== activeConnection || connection.cancelled) {
      throw new Error('Connection changed while reading device state');
    }
    if (!mainLed || !defaultColors) {
      throw new Error('Incomplete device state response');
    }

    console.log(`[USB] state read succeeded; reason=${reason}; attempt=${connection.id}; elapsedMs=${Date.now() - startedAt}; ${getPortState(connection.port)}`);
    return { ok: true, mainLed, defaultColors };
  } catch (error) {
    console.warn(`[USB] state read failed; reason=${reason}; attempt=${connection?.id ?? 'none'}; elapsedMs=${Date.now() - startedAt}; error=${error.message}; ${getPortState(connection?.port)}`);
    return { ok: false, error: error.message };
  }
}

function getDeviceControlState() {
  if (!activeConnection || activeConnection.cancelled || !activeConnection.port.isOpen) return null;
  return { connectionId: activeConnection.id, ...activeConnection.feedback.snapshot() };
}

module.exports = {
  initializeUsb,
  writeCommand,
  disconnectUsb,
  readDeviceState,
  getDeviceControlState,
  logUsbDiagnostics,
};
