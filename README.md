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

## Build for production (locally)

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


## Release a new production version online

1. bump the version in `package.json`
2. make a commit to `develop`
3. create a PR `develop` -> `main` and then merge

_A new draft release will be built by the action `publish.yaml`_

4. Navigate to [releases](https://github.com/Gaimglass/gg-console/releases) and publish the drafted release if needed

### Alternatively to make a release locally

1. Set your `GITHUB_TOKEN` to an env variable 
2. bump the version in `package.json`

_If you get 401 Bad credentials error within Forge, try directly setting
the `authToken: 'YOUR_VALID_GITHUB_TOKEN_HERE'` value in `forge.config.js`. The octokit lib may be
using the wrong key._


```
yarn build
yarn publish-gg
```

3. Navigate to [releases](https://github.com/Gaimglass/gg-console/releases) and publish the drafted release if needed
