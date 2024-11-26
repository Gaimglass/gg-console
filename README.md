# Gaimglass console app


### Initial step

The current nvm node version is set to  v18.8.0

```
nvm use v18
yarn install
```

## Build for development and local testing
```
yarn react
```

In a separate tab after react start, run
```
yarn electron-dev
```

## Build for production

### 1. To build the frontend for production
```
nvm use v18
yarn install
yarn build
```

### 2. To package the server + frontend for production (note: step 1 must be done first)

```
yarn electron-forge make
```

This will create a Windows executable file in the `\out\make\squirrel.windows\x64` folder that can be installed locally.

To publish a release, ensure the version in incremented in `package.json`. Then merge
the `develop` branch to main `main`. The release is then built from the publish workflow as a draft. 
If the app looks good, then the release needs to be manually edited out of draft and tagged in github. 

> note: The publish workflow uses `publish-gg` script from `package.json`