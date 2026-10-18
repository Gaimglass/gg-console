const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { Worker } = require('node:worker_threads');
const { readAndErase } = require('./frame-marker');

const round = value => Math.round(value * 1000) / 1000;
const RENDERER_STAGES = new Set(['received', 'dom-updated', 'animation-callback', 'superseded-before-animation', 'loop-lag', 'hidden']);

function createTimingWriter(filePath, { logger = console, maxBytes = 8 * 1024 * 1024 } = {}) {
  const worker = new Worker(path.join(__dirname, 'timing-writer.js'), { workerData: { path: filePath, maxBytes } });
  let pending = 0;
  let dropped = 0;
  let closed = false;
  worker.on('message', count => { pending -= count; });
  worker.on('error', error => { closed = true; logger.warn('[OSD] timing writer failed:', error.message); });
  worker.unref();
  return {
    write(record) {
      if (closed) return;
      if (pending >= 2048) { dropped++; return; }
      worker.postMessage({ ...record, ...(dropped ? { droppedRecords: dropped } : {}) });
      pending++;
      dropped = 0;
    },
    close() {
      if (closed) return Promise.resolve();
      closed = true;
      return new Promise(resolve => {
        worker.once('exit', resolve);
        worker.ref();
        worker.postMessage(null);
      });
    },
  };
}

function createOverlayTiming({ write, now = () => performance.now(), wallNow = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, session = `${process.pid}-${Date.now().toString(36)}`, maxTraces = 128 } = {}) {
  let sequence = 0;
  let paintSequence = 0;
  let heartbeat;
  let watchUntil = 0;
  let disposed = false;
  const traces = new Map();
  const windows = new Map();

  function event(stage, details = {}, trace, at = now()) {
    if (disposed) return;
    try {
      write({ schema: 1, session, timestamp: wallNow(), monoMs: round(at), stage,
        ...(trace ? { id: trace.id, sequence: trace.sequence, elapsedMs: round(at - trace.startedAt) } : {}), ...details });
    } catch { /* Diagnostics must never interrupt a device or overlay operation. */ }
  }

  function watch() {
    watchUntil = now() + 10000;
    if (heartbeat) return;
    const schedule = () => {
      const due = now() + 250;
      heartbeat = setTimer(() => {
        heartbeat = null;
        const lag = now() - due;
        if (lag >= 75) event('main.loop-lag', { lagMs: round(lag) });
        if (now() < watchUntil && !disposed) schedule();
      }, 250);
      heartbeat?.unref?.();
    };
    schedule();
  }

  function begin(source, details = {}) {
    const trace = { id: `${session}-${++sequence}`, sequence, source, startedAt: now(), firstPaint: false, firstVisiblePaint: false };
    traces.set(sequence, trace);
    if (traces.size > maxTraces) traces.delete(traces.keys().next().value);
    watch();
    event('action.begin', { source, ...details }, trace);
    return trace;
  }

  function mark(trace, stage, details = {}) { event(stage, details, trace); }

  function measure(trace, stage, operation, details = {}) {
    event(`${stage}.begin`, details, trace);
    const start = now();
    let ok = false;
    try { const result = operation(); ok = true; return result; }
    finally { event(`${stage}.end`, { ...details, durationMs: round(now() - start), ok }, trace); }
  }

  function attach(window, backend) {
    const state = { backend, trace: null, lastPaintAt: null };
    const receive = (_event, channel, sample) => {
      if (channel !== 'action-overlay:timing' || !sample || !RENDERER_STAGES.has(sample.stage)) return;
      const trace = traces.get(sample.sequence);
      if (!trace || sample.id !== trace.id || !state.sent?.has(trace.id)) return;
      // Keep renderer-local times separate from main receipt time: a late IPC ACK
      // must not masquerade as a late DOM update or an actual paint.
      const details = { backend, windowId: window.id };
      for (const key of ['rendererMs', 'rendererEpochMs', 'sinceReceivedMs', 'durationMs', 'lagMs']) {
        if (Number.isFinite(sample[key]) && sample[key] >= 0) details[key] = round(sample[key]);
      }
      if (typeof sample.hidden === 'boolean') details.hidden = sample.hidden;
      if (['visible', 'hidden', 'prerender'].includes(sample.visibility)) details.visibility = sample.visibility;
      event(`renderer.${sample.stage}`, details, trace);
    };
    state.receive = receive;
    windows.set(window, state);
    window.webContents.on('ipc-message', receive);
    window.once('closed', () => { windows.delete(window); });
    window.webContents.on('render-process-gone', (_event, details) => event('renderer.gone', { backend, ...details }, state.trace));
    window.webContents.on('unresponsive', () => event('renderer.unresponsive', { backend }, state.trace));
    window.webContents.on('responsive', () => event('renderer.responsive', { backend }, state.trace));
  }

  function send(window, notification, trace, backend) {
    const state = windows.get(window);
    if (state) {
      state.trace = trace;
      state.sent ||= new Set();
      state.sent.add(trace.id);
      if (state.sent.size > maxTraces) state.sent.delete(state.sent.values().next().value);
    }
    measure(trace, 'renderer.send', () => window.webContents.send('action-overlay:show', notification, {
      id: trace.id, sequence: trace.sequence, frameMarker: backend === 'game',
    }), { backend, windowId: window.id });
  }

  function transfer(window, image, deliver, context = {}) {
    const at = now();
    const size = image.getSize();
    if (size.width <= 0 || size.height <= 0) return;
    const state = windows.get(window);
    const paintId = ++paintSequence;
    const details = { ...context, paintId, windowId: window.id, width: size.width, height: size.height,
      latestSequence: state?.trace?.sequence ?? null, paintGapMs: state?.lastPaintAt == null ? null : round(at - state.lastPaintAt) };
    if (state) state.lastPaintAt = at;
    event('paint.begin', details, undefined, at);
    const bitmapStart = now();
    const bitmap = image.getBitmap();
    const bitmapMs = now() - bitmapStart;
    const markerStart = now();
    const capturedSequence = readAndErase(bitmap, size.width, size.height);
    const trace = traces.get(capturedSequence);
    const markerMs = now() - markerStart;
    const sampleX = Math.min(size.width - 1, Math.floor(size.width * 160 / 316));
    const sampleY = Math.min(size.height - 1, Math.floor(size.height * 90 / 112));
    const panelAlpha = bitmap.length === size.width * size.height * 4 ? bitmap[(sampleY * size.width + sampleX) * 4 + 3] : null;
    Object.assign(details, { capturedSequence, panelAlpha, bitmapMs: round(bitmapMs), markerMs: round(markerMs),
      correlation: trace ? 'pixel-stamp' : 'unidentified', firstPaint: !!trace && !trace.firstPaint,
      firstVisiblePaint: !!trace && !trace.firstVisiblePaint && panelAlpha > 0 });
    if (trace) {
      trace.firstPaint = true;
      if (panelAlpha > 0) trace.firstVisiblePaint = true;
    }
    event('paint.bitmap-ready', { ...details, paintElapsedMs: trace ? round(at - trace.startedAt) : null }, trace);
    measure(trace, 'native.send', () => deliver(bitmap, size.width, size.height), details);
    event('frame.transferred', { ...details, durationMs: round(now() - at), displayed: 'unknown' }, trace);
  }

  function nativeEvent(type, payload) {
    if (type === 'log') {
      if (!['warn', 'error'].includes(payload?.level) && !/Present|frame buffer read|Created texture|ResizeBuffers|renderer created|render attempt/i.test(payload?.message || '')) return;
      // These library messages are context only; they do not acknowledge our frame ID.
      event('native.log', { native: payload, displayedSequence: null });
    } else if (['client.connect', 'client.disconnect', 'game.process'].includes(type) || type.startsWith('graphics.')) {
      event('native.event', { type, native: payload });
    }
  }

  return { begin, mark, measure, attach, send, transfer, nativeEvent, event,
    dispose() {
      clearTimer(heartbeat);
      for (const [window, state] of windows) window.webContents.removeListener('ipc-message', state.receive);
      windows.clear();
      traces.clear();
      disposed = true;
    },
  };
}

let instance;
let writer;
function getOverlayTiming() {
  if (process.env.GG_OVERLAY_TIMING === '0') return null;
  if (!instance) {
    const logger = require('electron-log/main');
    const { app } = require('electron');
    const filePath = path.join(path.dirname(logger.transports.file.getFile().path), 'overlay-timing.log');
    writer = createTimingWriter(filePath, { logger });
    instance = createOverlayTiming({ write: writer.write });
    instance.event('session.begin', { appVersion: app.getVersion(), versions: process.versions,
      hardwareAcceleration: app.isHardwareAccelerationEnabled(), gpuFeatures: app.getGPUFeatureStatus(),
      displayAcknowledgements: false });
    app.getGPUInfo('basic').then(info => instance?.event('session.gpu', { info })).catch(() => {});
    logger.log(`[OSD] frame timing enabled; log=${filePath}; per-frame game display acknowledgement unavailable`);
  }
  return instance;
}

function closeOverlayTiming() {
  instance?.event('session.end');
  instance?.dispose();
  instance = null;
  void writer?.close();
  writer = null;
}

module.exports = { createOverlayTiming, createTimingWriter, getOverlayTiming, closeOverlayTiming };
