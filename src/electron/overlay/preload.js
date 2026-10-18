const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('actionOverlay', {
  subscribe(onUpdate, onHide) {
    ipcRenderer.on('action-overlay:show', (_event, notification, timing) => onUpdate(notification, timing));
    ipcRenderer.on('action-overlay:hide', () => onHide());
  },
  reportTiming(sample) { ipcRenderer.send('action-overlay:timing', sample); },
});
