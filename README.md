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

### 2. To package the server + frontend for production 

```
yarn electron-forge make
```


This command will package + build a [distribution](https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging) for the local architecture
