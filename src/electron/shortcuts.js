const {app, globalShortcut} = require('electron')

// https://www.electronjs.org/docs/latest/api/accelerator

function registerKeyboardShortcuts(mainWindow) {
  globalShortcut.register('CommandOrControl+numsub', () => {
    mainWindow.webContents.send('shortcut-decrease-brightness');
  })

  globalShortcut.register('CommandOrControl+numadd', () => {
    mainWindow.webContents.send('shortcut-increase-brightness');
  })

  globalShortcut.register('CommandOrControl+num1', () => {
    mainWindow.webContents.send('shortcut-switch-color', 1);
  })

  globalShortcut.register('CommandOrControl+num0', () => {
    mainWindow.webContents.send('shortcut-toggle-led');
  })

  for(let i = 0; i < 9; i++) {
    globalShortcut.register(`CommandOrControl+num${i}`, () => {
      mainWindow.webContents.send('shortcut-switch-color', i);
    })
  }
}

module.exports = {
  registerKeyboardShortcuts
}