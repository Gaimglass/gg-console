
const electron = require('electron');

// Cache for downloaded update info
let updateDownloadedInfo = null;

let updateCheckLock = false;

async function checkForUpdates(currentVersion, isDev) {
  return new Promise((resolve, reject) => {
    // If an update has already been downloaded, resolve immediately
    if (updateDownloadedInfo) {
      resolve({
        updateAvailable: true,
        releaseNotes: updateDownloadedInfo.releaseNotes,
        releaseName: updateDownloadedInfo.releaseName,
      });
      return;
    }

    if (isDev) {
      setTimeout(() => {
        resolve({
          updateAvailable: false,
          releaseNotes: 'test',
          releaseName: '1.2.3',
        });
      }, 1000);
      return;
    }

    if (updateCheckLock) {
      // don't check updates twice in a row
      resolve({ updateAvailable: false });
      return;
    }
    updateCheckLock = true;

    const checkingForUpdate = function (event, releaseNotes, releaseName) {
      // ...existing code...
    };
    const updateAvailable = function (event, releaseNotes, releaseName) {
      // ...existing code...
    };
    const updateNotAvailable = function (event, releaseNotes, releaseName) {
      cleanUpEvents();
      resolve({ updateAvailable: false });
    };
    const updateDownloaded = function (event, releaseNotes, releaseName) {
      // Cache the downloaded update info
      updateDownloadedInfo = { releaseNotes, releaseName };
      cleanUpEvents();
      resolve({
        updateAvailable: true,
        releaseNotes,
        releaseName,
      });
    };
    const updateError = function (message) {
      cleanUpEvents();
      reject({ message });
    };

    const cleanUpEvents = function () {
      electron.autoUpdater.removeListener('checking-for-update', checkingForUpdate);
      electron.autoUpdater.removeListener('update-not-available', updateNotAvailable);
      electron.autoUpdater.removeListener('update-available', updateAvailable);
      electron.autoUpdater.removeListener('update-downloaded', updateDownloaded);
      electron.autoUpdater.removeListener('error', updateError);
      updateCheckLock = false;
    };

    const server = 'https://update.electronjs.org';
    const feed = `${server}/Gaimglass/gg-console/${process.platform}-${process.arch}/${currentVersion}`;
    console.log(`Gaimglass update feed URL: ${feed}`);

    electron.autoUpdater.on('checking-for-update', checkingForUpdate);
    electron.autoUpdater.on('update-not-available', updateNotAvailable);
    electron.autoUpdater.on('update-available', updateAvailable);
    electron.autoUpdater.on('update-downloaded', updateDownloaded);
    electron.autoUpdater.on('error', updateError);

    electron.autoUpdater.setFeedURL(feed);
    electron.autoUpdater.checkForUpdates();
  });
}

function updateAndRestart(app) {
  app.isQuitting = true;
  electron.autoUpdater.quitAndInstall();
}

module.exports = {
  checkForUpdates,
  updateAndRestart
}
