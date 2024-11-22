const electron = require('electron');

async function checkForUpdates(currentVersion, isDev) {
  return new Promise((resolve, reject)=>{
    if (isDev) {
      // test only
      resolve({
        updateAvailable: true,
        releaseNotes:'test', 
        releaseName: '1.2.3'});
        /*reject({
          message: "Some error happened"
        })*/
      return
    }
    // Election auto updates
    const server = 'https://update.electronjs.org'
    const feed = `${server}/Gaimglass/gg-console/${process.platform}-${process.arch}/${currentVersion}`
    console.log(`Gaimglass update feed URL: ${feed}`)
    electron.autoUpdater.setFeedURL(feed)
    electron.autoUpdater.checkForUpdates();

    /*electron.autoUpdater.on('checking-for-update', (event, releaseNotes, releaseName) => {
      // do we want a loader icon in the UI? this is minor.
    })

    electron.autoUpdater.on('update-available', (event, releaseNotes, releaseName) => {
      // do we want a loader icon in the UI? this is minor.
    })*/
    

    electron.autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
      resolve({
        updateAvailable: true,
        releaseNotes,
        releaseName,
      })
    })

    electron.autoUpdater.on('error', (message) => {
      reject({
        message
      })
    }) 
  })
}

function updateAndRestart(app) {
  console.log("updateAndRestart")
  app.isQuitting = true;
  electron.autoUpdater.quitAndInstall();
}

module.exports = {
  checkForUpdates,
  updateAndRestart
}
