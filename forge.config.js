module.exports = {
  packagerConfig: {
    // The native addon needs its DLLs and injector helpers on disk, outside the archive.
    asar: { unpack: '**/node_modules/@hamstu/electron-game-overlay/**' },
    icon: './src/assets/gg_icon'
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        setupIcon: './src/assets/gg_icon.ico',
        loadingGif: './src/assets/splash.gif',

      },
    },
    /*https://github.com/electron/fiddle/blob/main/forge.config.ts*/
    /*{
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {}
    },*/
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'Gaimglass',
          name: 'gg-console'
        },
        prerelease: false,
        draft: false,
      }
    }
  ]
};
