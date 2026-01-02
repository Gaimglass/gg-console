const { contextBridge, ipcRenderer } = require("electron");
const electron = window.require('electron');


contextBridge.exposeInMainWorld("ipcRenderer", {
  send: (channel, data) => ipcRenderer.send(channel, data),
  sendSync: (channel, ...args) => ipcRenderer.sendSync(channel, ...args),
  on: (channel, func) => ipcRenderer.on(channel, (...args) => func(...args)),
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  removeListener: (channel, func) => ipcRenderer.removeListener(channel, func)
});

contextBridge.exposeInMainWorld("webFrame", {
  setZoomLevel: (level) => electron.webFrame.setZoomLevel(level)
});

contextBridge.exposeInMainWorld('argv', process.argv);

