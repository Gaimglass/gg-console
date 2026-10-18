// Development-only comparison: reuse the real overlay without starting the app or USB.
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, WebContentsView, screen } = require('electron');

const overlayDirectory = path.resolve(__dirname, '../src/electron/overlay');
const notifications = [
  { type: 'brightness', percent: 50 },
  { type: 'color-slot', slot: 3, color: { r: 20, g: 110, b: 255 } },
  { type: 'power', on: false },
];
const views = [];
let comparison;
let watcher;
let reloadTimer;

app.setName('Gaimglass overlay comparison');
app.setPath('userData', path.resolve(__dirname, '../out/overlay-comparison-user-data'));
app.on('window-all-closed', () => app.quit());

app.whenReady().then(async () => {
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  comparison = new BrowserWindow({
    title: 'Gaimglass overlay comparison — close when finished',
    x: workArea.x + 24,
    y: workArea.y + 24,
    width: 316 * notifications.length,
    height: 112,
    useContentSize: true,
    show: false,
    resizable: false,
    maximizable: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    backgroundColor: '#24282e',
  });

  comparison.on('closed', () => {
    clearTimeout(reloadTimer);
    watcher?.close();
    for (const view of views) {
      if (!view.webContents.isDestroyed()) view.webContents.close();
    }
    comparison = null;
  });

  await Promise.all(notifications.map(async (notification, index) => {
    const view = new WebContentsView({
      webPreferences: {
        preload: path.join(overlayDirectory, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    views.push(view);
    comparison.contentView.addChildView(view);
    view.setBounds({ x: index * 316, y: 0, width: 316, height: 112 });
    view.webContents.on('did-finish-load', () => {
      view.webContents.send('action-overlay:show', notification);
    });
    await view.webContents.loadFile(path.join(overlayDirectory, 'index.html'));
  }));

  // Keep the cards visible and refresh this comparison when the overlay files change.
  watcher = fs.watch(overlayDirectory, (_event, filename) => {
    if (!['index.html', 'overlay.css', 'renderer.js', 'preload.js', 'frame-marker.js'].includes(String(filename))) return;
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      for (const view of views) {
        if (!view.webContents.isDestroyed()) view.webContents.reload();
      }
    }, 100);
  });
  comparison.show();
  console.log('Overlay comparison ready: brightness, color slot, LED off. Close the window to exit.');
}).catch(error => {
  console.error(error);
  app.exit(1);
});
