const { webFrame, contextBridge, ipcRenderer } = require("electron");

/**
 * IMPORTANT ARCHITECTURAL NOTES
 * ------------------------------
 *
 * This preload intentionally does NOT expose ipcRenderer.on/removeListener
 * directly. Instead, we proxy them through a controlled layer.
 *
 * WHY:
 * 1. contextIsolation = true means renderer callbacks cross a JS realm boundary.
 *    Function identity is NOT preserved across that boundary.
 *
 * 2. React 18 StrictMode (DEV) intentionally mounts, unmounts, and re-mounts
 *    components multiple times during startup. This causes effects to register
 *    and deregister listeners several times in rapid succession.
 *
 * 3. If we naively forward ipcRenderer.on/removeListener, Electron will accumulate
 *    native listeners across React reconnect cycles and renderer reloads, causing
 *    IPC events to fire N times per emit.
 *
 * THE SOLUTION:
 * - Preload owns the native ipcRenderer listeners.
 * - Exactly ONE native listener is bound per channel.
 * - The renderer provides a callback that is treated as the *current* handler
 *   for that channel and is overwritten on re-registration.
 *
 * This makes the system:
 * - reload-safe
 * - StrictMode-safe
 * - compatible with React stateful callbacks
 * - predictable (1 emit == 1 handler call)
 */

/**
 * Map of active renderer callbacks.
 *
 * We intentionally allow only ONE active callback per channel.
 * This matches our app’s semantics and prevents fan-out during
 * React DEV reconnect cycles.
 *
 * Map<channel, callback>
 */
const subscribers = new Map();

/**
 * Tracks which IPC channels already have a native listener bound.
 * Ensures we never register more than one native listener per channel.
 */
const nativeBound = new Set();

/**
 * Ensures exactly one native ipcRenderer listener exists per channel.
 *
 * Native listeners live for the lifetime of the preload, which persists
 * across renderer reloads when contextIsolation is enabled.
 */
function bindNative(channel) {
  if (nativeBound.has(channel)) return;

  ipcRenderer.on(channel, (_event, ...args) => {
    const cb = subscribers.get(channel);
    if (cb) cb(...args);
  });

  nativeBound.add(channel);
}

/**
 * Expose a controlled ipcRenderer API to the renderer.
 *
 * NOTE:
 * - `on()` overwrites the existing handler for the channel.
 * - `removeListener()` only clears the handler if it matches the
 *   currently registered callback.
 *
 * This avoids leaking handlers during React StrictMode mounts/unmounts
 * while still allowing normal cleanup semantics.
 */
contextBridge.exposeInMainWorld("ipcRenderer", {
  on(channel, callback) {
    bindNative(channel);
    subscribers.set(channel, callback); // overwrite existing handler
  },

  removeListener(channel, callback) {
    const current = subscribers.get(channel);
    if (current === callback) {
      subscribers.delete(channel);
    }
  },

  // Safe pass-throughs (no identity issues)
  send: ipcRenderer.send.bind(ipcRenderer),
  sendSync: ipcRenderer.sendSync.bind(ipcRenderer),
  invoke: ipcRenderer.invoke.bind(ipcRenderer),
});

/**
 * Expose limited webFrame API.
 */
contextBridge.exposeInMainWorld("webFrame", {
  setZoomLevel: webFrame.setZoomLevel.bind(webFrame),
});

/**
 * Expose process argv for renderer access.
 */
contextBridge.exposeInMainWorld("argv", process.argv);
