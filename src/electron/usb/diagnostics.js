// TEMPORARY: flight recorder for the October 2026 USB/sleep investigation.
// Remove this module and its call sites after the failure is understood.
// Recording stays in memory; only bounded snapshots are written to the log.
const { performance } = require('node:perf_hooks');

const short = (value, limit = 128) => String(value ?? '').slice(0, limit);
const round = value => Math.round(value * 1000) / 1000;

function createUsbDiagnostics({ now = () => performance.now(), wallNow = Date.now, historyLimit = 48 } = {}) {
  historyLimit = Math.max(1, Math.min(128, historyLimit));
  const recent = [];
  const inFlight = new Map();
  const counts = { queued: 0, writeAttempts: 0, writeCallbacks: 0, replies: 0,
    errors: 0, timeouts: 0, rxBytes: 0, rxChunks: 0, lines: 0, unmatchedLines: 0 };
  let sequence = 0;
  let pending = 0;
  let active = 0;
  let highWaterPending = 0;
  let maxQueueWaitMs = 0;
  let lastByteAt = null;
  let lastLineAt = null;

  function record(stage, details) {
    recent.push({ at: wallNow(), stage, ...details });
    if (recent.length > historyLimit) recent.shift();
  }

  function details(request) {
    return { request: request.id, command: request.command, source: request.source,
      queueWaitMs: round((request.startedAt ?? now()) - request.queuedAt),
      responseWaitMs: request.startedAt === null ? null : round(now() - request.startedAt),
      // The driver callback acknowledges a host write, not a firmware reply.
      driverCallbackMs: request.callbackAt === null ? null : round(request.callbackAt - request.startedAt) };
  }

  return {
    queued(command, source) {
      const request = { id: ++sequence, command: short(command, 16), source: short(source, 64),
        queuedAt: now(), startedAt: null, callbackAt: null, completed: false };
      counts.queued++;
      highWaterPending = Math.max(highWaterPending, ++pending);
      record('command.queued', { request: request.id, command: request.command, source: request.source, pending });
      return request;
    },
    start(request, frame) {
      request.startedAt = now();
      counts.writeAttempts++;
      active++;
      // Bound diagnostic state even if a caller supplies many distinct codes.
      if (inFlight.size < 32) inFlight.set(request.id, request);
      maxQueueWaitMs = Math.max(maxQueueWaitMs, request.startedAt - request.queuedAt);
      record('write.begin', { ...details(request), active,
        ...(frame === undefined ? {} : { bytes: Buffer.byteLength(frame),
          prefixHex: Buffer.from(frame.slice(0, 24)).subarray(0, 24).toString('hex') }) });
    },
    writeCallback(request, error) {
      counts.writeCallbacks++;
      request.callbackAt = now();
      record('write.callback', { ...details(request), afterResult: request.completed,
        ...(error ? { error: short(error.message) } : {}) });
    },
    backpressure(request, writableBytes) {
      record('write.backpressure', { ...details(request), writableBytes: writableBytes ?? null });
    },
    complete(request, error, response) {
      request.completed = true;
      pending--;
      if (request.startedAt !== null) active--;
      inFlight.delete(request.id);
      const timeout = error?.message === 'Serial port timed out';
      if (timeout) counts.timeouts++;
      else if (error) counts.errors++;
      else counts.replies++;
      record('command.result', { ...details(request), result: timeout ? 'timeout' : error ? 'error' : 'reply',
        ...(error ? { error: short(error.message) } : { reply: short(response) }) });
    },
    bytes(chunk) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      counts.rxBytes += buffer.length;
      counts.rxChunks++;
      lastByteAt = wallNow();
      record('rx.bytes', { bytes: buffer.length, prefixHex: buffer.subarray(0, 24).toString('hex') });
    },
    line(line, command, matched) {
      counts.lines++;
      if (!matched) counts.unmatchedLines++;
      lastLineAt = wallNow();
      record('rx.line', { command: short(command, 16), matched, sample: short(line) });
    },
    details,
    snapshot(includeHistory = false) {
      return { counts: { ...counts }, pending, active, waiting: pending - active, highWaterPending,
        maxQueueWaitMs: round(maxQueueWaitMs), lastByteAt, lastLineAt,
        inFlight: [...inFlight.values()].map(details), untrackedActive: active - inFlight.size,
        ...(includeHistory ? { recent: recent.map(entry => ({ ...entry })) } : {}) };
    },
  };
}

module.exports = { createUsbDiagnostics };
