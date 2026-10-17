let api;

function getApi() {
  if (api) return api;
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const rect = koffi.struct({ left: 'int32_t', top: 'int32_t', right: 'int32_t', bottom: 'int32_t' });
  const point = koffi.struct({ x: 'int32_t', y: 'int32_t' });
  const monitorInfo = koffi.struct({ cbSize: 'uint32_t', rcMonitor: rect, rcWork: rect, dwFlags: 'uint32_t' });
  api = {
    getForeground: user32.func('__stdcall', 'GetForegroundWindow', 'uintptr_t', []),
    getClientRect: user32.func('__stdcall', 'GetClientRect', 'int', ['uintptr_t', koffi.out(koffi.pointer(rect))]),
    clientToScreen: user32.func('__stdcall', 'ClientToScreen', 'int', ['uintptr_t', koffi.inout(koffi.pointer(point))]),
    monitorFromWindow: user32.func('__stdcall', 'MonitorFromWindow', 'uintptr_t', ['uintptr_t', 'uint32_t']),
    getMonitorInfo: user32.func('__stdcall', 'GetMonitorInfoW', 'int', ['uintptr_t', koffi.inout(koffi.pointer(monitorInfo))]),
    monitorInfoSize: koffi.sizeof(monitorInfo),
  };
  return api;
}

function foregroundWindow() {
  return Number(getApi().getForeground());
}

function windowLayout(hwnd) {
  if (!hwnd) return null;
  const native = getApi();
  const client = {};
  const origin = { x: 0, y: 0 };
  const monitor = { cbSize: native.monitorInfoSize };
  if (!native.getClientRect(hwnd, client) || !native.clientToScreen(hwnd, origin)
    || !native.getMonitorInfo(native.monitorFromWindow(hwnd, 2), monitor)) return null;
  const rect = monitor.rcMonitor;
  return {
    bounds: { x: origin.x, y: origin.y, width: client.right - client.left, height: client.bottom - client.top },
    monitorBounds: { x: rect.left, y: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top },
  };
}

module.exports = { foregroundWindow, windowLayout };
