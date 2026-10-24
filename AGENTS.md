# Agent memory

## Documentation preference

Keep agent memory, investigation findings, debugging procedures, and implementation
notes in this file or a linked document under `docs/`. Do not add more information
to `README.md` unless the user explicitly requests a README change. Preserve
unrelated existing README edits.

## Current working state: October 24, 2026

- At the user's request, all pending code/test changes other than `docs/` and
  this file were stashed before adding temporary logging. Stash commit:
  `1efc4922a9bf936b663a23e076fcdac5321352aa`, named
  `WIP USB recovery and async device writes before temporary diagnostics`.
  It contains the automatic timeout recovery, asynchronous renderer writes,
  related helper/tests, and test-script changes. Earlier references below to
  that patch and its 96 passing tests describe the stashed work.
- The active working tree adds diagnostics to committed behavior. It does not
  include automatic timeout recovery or the async renderer-write changes.
  The updater-error UI change was committed separately as `9bc5ed7`.
- Temporary logging is marked `TEMPORARY` in the recorder, transport, source
  labels, sleep hooks, and tests. Remove it once the cause is understood.
- Updated source must actually be launched for these logs to appear; the
  installed app does not load this workspace's code. Confirm a
  `[USB][Diagnostics]` record with `revision: "usb-sleep-v1"` in `main.log`.
- Last validation of this logging-only working tree: 91 tests pass; targeted
  ESLint has zero errors. No installed app or firmware was modified.

## Temporary USB logging

- `src/electron/usb/diagnostics.js` keeps the last 48 transport events in memory.
  It records caller source, command/request ID, exact outbound byte count and a
  24-byte hex prefix, queue delay, driver callback timing, host backpressure,
  raw incoming byte counts/prefixes, parsed lines, replies, and timeouts.
- A driver write callback confirms host-side write completion, not firmware
  receipt. Raw bytes without parsed lines can identify partial/malformed input;
  missing callbacks can identify a stalled host write. The firmware protocol
  has no per-request IDs, so a late same-code reply cannot be proven to belong
  to a particular request from these IDs alone.
- No per-command disk logging or extra device polling is added. A failure dumps
  bounded recent history at most once per 30 seconds across all connections;
  intentional cleanup does not consume that failure-history allowance.
- Startup, suspend/resume, and once-per-minute health snapshots include connection
  and stream buffers, outstanding/waiting requests, time since resume, main-process
  memory, and maximum delay of the existing 800 ms retry-loop callback. This is
  not a renderer responsiveness profile or total app memory measurement. Power
  events reset the loop-lag baseline so sleep time is not called a CPU stall.
- The original serial payloads, per-command queues, 150 ms response timeout, and
  reconnect policy are retained. Tests explicitly check that logging does not
  reconnect a silently failing open port or send USB probes.

## USB and shortcut incident: October 23, 2026

Detailed evidence and commit review:
[Shortcut failure and UI slowdown](docs/shortcut-slowdown-2026-10-23.md).

- The installed app was 1.6.5. It remained running and clickable, but interaction
  became very slow and device shortcuts stopped having an effect.
- Logs show shortcut callbacks still reached the main process. COM11 stopped
  replying while Windows continued reporting `isOpen=true`; there was no normal
  port-close event. Do not assume a registered shortcut failed just because the
  device did not react, or assume an open serial handle means a healthy device.
- The UI's connected state stayed true, and the reconnect loop skipped the open
  port. Both gaps existed before the September 25 USB refactor (`64e06d9`). A
  recent change may have triggered this condition, but no culprit commit or
  initial hardware/driver/firmware cause has been established.
- Synchronous renderer IPC awaited USB replies. Repeated ambient timeouts could
  block UI interaction for 150 ms per request, plus queue time. This explains a
  mechanism for slowness; no renderer performance profile established the full
  cost, and no memory leak was proven.
- The local patch reconnects after sustained response timeouts, invalidates the
  old connection and cached state, and emits `usb-disconnected`. Successful state
  reads restore the UI after reconnection. Valid device responses clear the
  timeout streak; an isolated timeout or simultaneous timeout wave must not
  trigger a reset.
- UI LED, ambient, palette and slot writes now use asynchronous IPC. Continuous
  LED/ambient streams keep one request in flight and one latest pending value
  each. Preserve this bound; simply replacing synchronous calls with unrestricted
  asynchronous writes can create a backlog. Disconnect cleanup discards unsent
  stream values and stops ADS transition timers.
- Last verified locally: 96 tests pass; production build succeeds; targeted lint
  has zero errors and an existing refresh-effect ref warning. The original
  unresponsive-port regression failed before the patch and passed afterward.
- At the time of this investigation the patch had not been installed or published.
  A packaged-app sleep/resume and long-running hardware check remains outstanding.

## Diagnostics locations

- Windows runtime logs: `%APPDATA%/Gaimglass/logs/main.log` and
  `overlay-timing.log` (plus rotated files when present).
- Preserved incident logs: `out/shortcut-investigation-2026-10-23/` (ignored by Git;
  available only in this workspace).
- Overlay timing is enabled by default; `GG_OVERLAY_TIMING=0` disables it. An
  animation callback or transferred native frame does not prove on-screen display.

## Shortcut migration follow-up: October 24, 2026

- The user specifically suspects the React-to-Electron shortcut migration
  (`db2ff30`). Investigate it as a regression candidate; the older recovery gap
  does not exclude a new trigger in this commit.
- The migration introduced independent Electron shortcut writes alongside React
  writes, with queues per command code rather than one queue across all codes.
  It also replaced optimistic React shortcut state with confirmed device state.
  A failed power-on leaves the Electron cache off, causing later brightness/slot
  shortcuts to be skipped, as observed in the incident.
- Local sibling firmware repository `../gaimglass-sketch` has a serial newline
  fix in `5245210`: old firmware could consume multiple buffered commands as one
  and drop later replies. Both revisions report firmware version `1`; do not
  infer which revision is flashed from that string.
- Focused host checks reproduced the legacy parser's lost-command behavior.
  A console/serial software model reproduced an ambient timeout when a shortcut
  write overlapped it; sequential writes or the fixed parser completed. This
  demonstrates a compatibility risk, not the exact physical incident or the
  cause of persistent silence. No firmware was modified or flashed.
- The user subsequently confirmed that the October 16 firmware fixes were
  flashed and physical device buttons did not change the light during failure.
  They do not remember whether shortcuts worked after the last wake. Treat the
  legacy parser reproduction as a compatibility finding, not the leading
  explanation for this incident. Physical button failure suggests firmware/USB
  handling may have stalled; it does not by itself prove a firmware crash.
- The user offered to test sleep/resume. First compare physical power button,
  keyboard power shortcut, and UI power control on the same installed build,
  immediately after waking and again after about 15 minutes idle. Test physical
  controls before host commands. Capture failure time and logs before restarting;
  check whether restarting only the app restores physical controls too. Compare
  the patched build afterward. Do not flash or reset the device as part of this
  first comparison.

## Frame timing diagnostics

Frame timing diagnostics are enabled by default while investigating delayed feedback. Restart the updated app, reproduce the delay in-game, and keep `overlay-timing.log` and `overlay-timing.log.old` beside `main.log` in that directory. The exact timing-log path is also printed in `main.log`. Logs are JSON lines, written by a worker, with an 8 MiB current file and one rotated file; the producer queue is bounded and reports any dropped records. Set `GG_OVERLAY_TIMING=0` before launch to disable the diagnostics.

Each request has an `id`/`sequence`. Shortcut traces include receipt, batching, device writes, broadcast, and the overlay request. Overlay traces include target scanning, attachment, renderer loading, IPC, DOM update, animation callback, paint arrival, `getBitmap()` duration (`bitmapMs`), and the synchronous native-send duration. Main and renderer event-loop stalls of at least 75 ms are recorded. Clock pings bound the offset between the processes: `rendererElapsedMinMs`/`rendererElapsedMaxMs` locate renderer work on the action timeline, and `ackDelayMinMs`/`ackDelayMaxMs` separate late IPC receipt from late renderer work. `clockUncertaintyMs` includes the calibration round trip plus a 1 ms margin on each side for clock precision. If calibration is unavailable, these fields are omitted and only renderer-local durations and main receipt times are reported. Epoch timestamps are context, not a substitute for calibration.

For the game path, a diagnostic pixel stamp in the transparent corner identifies the request actually present in the captured bitmap, including stale frames after newer requests. It is erased before native delivery. `capturedSequence` identifies those pixels; `latestSequence` only describes the latest dispatched request. An undecodable stamp is `unidentified`, never attributed to the newest request; a decoded stamp whose trace has left the bounded 512-request cache is `pixel-stamp-untracked`. `panelAlpha` samples the card background to distinguish an initial transparent frame from visible card pixels. Superseded requests and expiration without a captured frame remain visible in the logs.

An animation callback runs before painting, and `frame.transferred` means the native call returned. Neither proves the card was displayed. The current native DLL exposes first-frame reads and periodic Present messages but no acknowledgement for each frame; selected native messages retain their original payload under `native`. `displayed: "unknown"` and `displayAcknowledgements: false` make this boundary explicit. If all measured stages are fast during visible lag, the remaining unmeasured region is native frame consumption/rendering and presentation; separating those requires an instrumented DLL.
