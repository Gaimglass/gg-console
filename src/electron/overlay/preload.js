const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('actionOverlay', {
  subscribe(onUpdate, onHide) {
    ipcRenderer.on('action-overlay:show', (_event, notification) => onUpdate(notification));
    ipcRenderer.on('action-overlay:hide', () => onHide());
  },
});
