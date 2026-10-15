# Gaimglass console app

## On-screen feedback

Brightness, default color slot, and LED power changes from the app, its shortcuts, or the Gaimglass device's buttons show a small, click-through card in the upper left. Device button feedback is handled directly in Electron, including while the main window is hidden. It updates in place and fades after 2.5 seconds without another action. Ambient changes, ADS transitions, device reads, and failed USB commands do not produce notifications.

The **Overlay** tab enables feedback, enables the experimental fullscreen game integration, and previews each card without writing to the device. Fully quit Gaimglass from its tray menu and reopen it after changing main-process code. Existing Titanfall-only preferences migrate to the fullscreen setting, including a saved opt-out.

The UI checks the loaded main-process backend and shows a restart instruction if only the renderer has refreshed. `[OSD]` diagnostics are written through `electron-log` even in development, including the backend revision and the reason for choosing desktop feedback (window geometry, incompatible graphics, disabled native overlay, attachment error, or connection timeout). The initialization message prints the log path.

Desktop feedback works with windowed/borderless applications. Fullscreen detection uses the foreground window's client area and its monitor bounds, independently of game name or language. A fullscreen rendering application with DX9, DX11, or OpenGL can use [electron-game-overlay](https://github.com/hamstu/electron-game-overlay), pinned to 0.0.8. Attachment chooses the x86 or x64 DLL/helper to match the target process, keeps input interception disabled, and paints a sandboxed offscreen window on the game's display. Maximized windows that leave room for the taskbar and Gaimglass's own processes use the desktop display. Leaving the game hides its card; attachment failures and cooldowns are tracked per process.

This generalizes detection, not every graphics backend. The upstream library has DX9, DX11, and OpenGL renderers; native DX12 rendering remains unfinished and Vulkan is not implemented. Loading a graphics DLL is only a compatibility hint, not proof of which API the game is rendering with. Protected games can also reject the overlay. DX12/Vulkan exclusive fullscreen and blocked games require additional backend support; a desktop fallback does not guarantee visibility there. Since fullscreen graphics applications cannot always be distinguished from games, fullscreen non-game rendering applications can also qualify.

In local testing on 2026-10-15, Titanfall 2's log confirmed DX11 rendering and the user confirmed the cards appeared during the exclusive fullscreen test. Other titles and APIs remain unverified in real games.

To verify: start a game in exclusive fullscreen, use the brightness, color-slot, and power shortcuts, then confirm the card updates, fades, and leaves game input/focus intact. Repeat after Alt-Tab, a resolution change, and restarting the game. `[OSD]` logs distinguish attachment requests, process ID, title, architecture, detected graphics APIs, game connection, graphics setup, and errors. If attachment is unavailable, feedback falls back to the desktop overlay, which cannot guarantee visibility over exclusive fullscreen.

Use one Gaimglass overlay host at a time during testing. The library's IPC host name is shared; a second test process can report no connection because the game attached to the running app instead. Restart hooked games after restarting Gaimglass so their DLLs can connect to the new host.

The optional native addon is bundled outside `app.asar`, along with its DLLs. Attachment uses the bundled helper asynchronously, with the target window's actual thread ID; the package's direct `injectProcess` call instead chooses the oldest process thread. Its MIT notice is in `THIRD_PARTY_NOTICES.md`. No native rebuild is needed for this N-API package.

<img src="https://github.com/user-attachments/assets/748354a0-eb1a-43d7-bd22-c1629d4105cd" width="600px">

### Initial step

The current nvm node version is set to  v22.14

```
nvm use v22
yarn install
```

## Build for development and local testing (Vite)
```
yarn dev
```

In a separate tab after starting Vite dev server, run
```
yarn electron-dev
```

## Build for production (locally)

### 1. To build the frontend for production (Vite)
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
