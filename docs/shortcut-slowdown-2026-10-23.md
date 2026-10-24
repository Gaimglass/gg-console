# Shortcut failure and UI slowdown — October 23, 2026

## Finding

The shortcut callbacks were still running. The active COM11 connection stopped
returning device replies while Windows continued reporting `isOpen=true`. Each
attempted LED write timed out, and the connection was never reset until the app
quit. Synchronous device IPC also blocked the renderer on repeated timeouts,
providing a concrete mechanism for the reported UI slowdown.

The logs establish the failed connection and missing recovery. They do not
identify why device replies stopped, prove a memory leak, or isolate a particular
commit as the initial trigger. The UI slowdown mechanism follows from the code;
the incident did not capture a renderer performance profile.

## Evidence

All times below are October 23 in America/Los_Angeles (PDT). Raw logs were copied
before further investigation to the ignored local directory
`out/shortcut-investigation-2026-10-23/`.

| Time | Observation |
| --- | --- |
| 9:15:50 PM | App 1.6.5 starts; process 20008 opens COM11 and successfully reads device state. |
| 9:45:34 PM | OS suspend is logged. |
| 11:03:10 PM | OS resume resets USB. Connection attempt 2 opens COM11 and reads state successfully in 31 ms. |
| 11:17:33 PM | First recorded failing power shortcut. `SET_MAIN_LED` times out after 151 ms; the last device response was 863,139 ms earlier. The port remains open without an error or close event. |
| 11:17:53–11:18:24 PM | Background ambient writes also time out. The final ambient warning reports 88 failures; the LED warning reports 16 failures. No recovery reset occurs. |
| 11:18:26 PM | App quits. This is the first reset after the failing commands. |
| 11:18:29 PM | Restarted process 29508 opens COM11 and reads state in 25 ms. Subsequent shortcut writes succeed. |

Useful source lines in the saved `main.log`: 1395–1397 (last state read and first
failure), 1411–1415 (repeated failures and exit), and 1438 (successful restart).

The saved `overlay-timing.log` contains:

- Session `20008-mvlvyy7h`: 120 shortcut actions reached the main process: 12
  power toggles, 103 brightness adjustments and 5 slot selections. All 12 power
  writes failed at about 150 ms. The other actions were skipped because confirmed
  device state still said the LED was off. No shortcut device write succeeded.
- Session `29508-mvm0co21`: 50 successful shortcut LED writes, no shortcut errors;
  observed write durations were 2.953–8.451 ms, with a 4.226 ms median.
- The failing session recorded four main-loop lag samples, the largest 319.790 ms.
  This instrumentation watches the main loop around actions, not the main UI's
  renderer, so it cannot exclude longer renderer stalls or diagnose memory use.

An updater DNS failure occurred on resume, followed by a successful update check
during the incident. An unhandled `setLEDOn` rejection occurred during shutdown,
after USB had been disconnected. Neither is evidence of the original failure.

## Code and commit review

`connectUsb()` previously accepted an open OS handle as sufficient proof of a
healthy connection. Command timeouts rejected the caller but never invalidated
that handle or triggered a reconnect. Cached device state therefore remained
available even when every command was failing.

History comparison confirms that this recovery gap predates the September 25
USB refactor (`64e06d9`): its parent also skipped reconnection while `port.isOpen`
was true, and command timeouts only rejected the request. The September renderer
also cleared its connected status on `usb-disconnected`, rather than on command
failure. A silent, open-but-unresponsive connection therefore takes a different
path from a normal port close. The newly observed trigger may still relate to
recent changes, but the missing recovery and stale connection indication are
older gaps; neither can be attributed to the latest commits from this incident.

`GaimglassApp.jsx` used `sendSync()` for LED, ambient, slot and palette writes.
`events/ui.js` returned those synchronous IPC replies only after awaiting USB.
Ambient sampling runs every 50 ms. On an unresponsive device, those background
writes can repeatedly stop all UI interaction for the 150 ms response timeout
and any queue wait. ADS transitions use the same blocking path.

Reviewed recent changes include:

- `db2ff30` (October 16): moved device shortcuts to the main process and serialized
  requests sharing a response code. The failing shortcut traces confirm this
  main-process path was being entered. Serialization can increase wait time when
  competing requests accumulate, but the logs do not establish that it caused
  the connection to stop replying.
- `68c3568` / `bd50e25` (October 18): added the timing diagnostics used above.
  Trace storage and the writer queue are bounded; the incident provides no
  evidence of runaway timing-log growth.
- `e6b30b5` (October 18): unified the calibration and main window. The synchronous
  device-call pattern existed before this refactor. The recorded failure does
  not isolate this commit as its cause.

## Changes

- Reconnect an active connection after at least three response timeouts spanning
  at least 300 ms without a recognized device response. A valid device response
  clears the streak; an isolated timeout or one simultaneous timeout wave does
  not reset the port. Initialization and shutdown retain their existing policies.
- Cancel commands bound to the old connection and discard its cached state.
  Existing reconnect and state-read events restore the UI from the new device
  connection; old commands are not transferred to it.
- Use asynchronous IPC for the four UI device-write channels. Continuous LED and
  ambient streams allow one request in flight and one latest pending value each,
  preventing a slow device from filling the IPC and serial queues. Explicit
  palette saves and slot selections are delivered individually.
- Clear pending stream values and stop ADS transition timers on disconnect or
  unmount. Recovery logs include the timeout streak, response age and pending
  command information.

## Validation and remaining uncertainty

The new unresponsive-port regression failed against the original implementation:
20 queued writes timed out and no replacement connection was created. With the
fix, the stale port closes, queued commands fail without replay, and reads and
writes succeed on a fresh connection. Other regressions cover healthy responses
clearing the failure streak, simultaneous timeouts, asynchronous IPC errors,
bounded high-frequency streams, disconnect cleanup and feedback after success.

`npm test`: 96/96 pass. `npm run build`: succeeds. ESLint on changed source and
tests: zero errors; the existing refresh-effect ref warning remains. The JSX
test loader now resolves relative modules from the file being tested so the app
test exercises the real device-write helper.

The hardware/driver/firmware condition that first stopped replies has not been
reproduced. A long-running sleep/resume check with the patched packaged app is
still needed to validate recovery against that exact condition. These changes
were tested locally; they have not been installed into the running app or
published.

On October 24 the user asked to stash these code/test changes while preserving
this report and `AGENTS.md`, and add temporary logging to committed behavior
instead. The recovery/async-write patch is saved in stash commit
`1efc4922a9bf936b663a23e076fcdac5321352aa` with the message
`WIP USB recovery and async device writes before temporary diagnostics`.
The active working tree therefore preserves the original failure/reconnect
behavior and adds bounded observation only. It passes 91 tests, including three
temporary recorder/integration checks. Logging coverage and interpretation are
documented in `AGENTS.md`; confirm backend revision `usb-sleep-v1` before testing.

## Follow-up: React-to-Electron shortcut migration (October 24)

The user identified the shortcut migration as a significant recent change and
reported that this behavior was new within roughly the last 10-12 commits.
`db2ff30` is an important regression candidate, even though the missing timeout
recovery predates it. An old recovery gap does not establish that its trigger is
old or unrelated to this migration.

The migration changed two relevant behaviors:

- React previously ran shortcut state changes alongside its other device writes.
  Its synchronous IPC calls blocked that renderer until the device replied.
  Electron shortcuts can now issue writes independently of React's ambient,
  ADS, palette, and direct UI actions. The transport queues commands by response
  code, so different command codes may still be outstanding together.
- React's old shortcut handlers changed local power/color state before device
  confirmation. Electron uses acknowledged device state. After the first failed
  power-on write in this incident, the Electron cache stayed off; later brightness
  and color shortcuts therefore issued no command. This is a confirmed behavior
  difference and matches the 120 received actions versus 12 failed power writes.
  It does not by itself explain the first missing reply.

The local sibling repository `../gaimglass-sketch` contains a firmware serial
parsing fix, `5245210` (October 16). Before that fix, `handleSerialEvent()` drained
all available bytes into one string, even across newlines, and the main loop
interpreted only the first command. The fix stops reading at one newline. The
firmware version string is still `1` on both sides, so the runtime log's
`firmware=1` cannot establish whether this device has the fix installed.

Focused checks, without changing or flashing the physical device:

- Compiled the actual local firmware with its existing host test harness. With
  only the newline fix removed to restore legacy parser behavior, the consecutive
  command test failed because later commands were consumed. With the fix present,
  the same test passed.
- Ran the real console shortcut controller and USB transport with the existing
  fake serial driver and a model of one buffered device read. Sequential power
  and ambient writes with legacy buffering both completed. Overlapping writes
  produced one buffered packet, only the power reply, and an ambient timeout.
  Preserving each newline-delimited command made both overlapping writes complete.
- The diagnostic model is saved as
  `out/shortcut-investigation-2026-10-23/probe-shortcut-overlap.cjs`, with results in
  `shortcut-overlap-results.json`. Firmware test outputs are saved in
  `firmware-parser-legacy.log` and `firmware-parser-fixed.log` in that directory.

These checks demonstrate a compatibility risk introduced by independent command
producers. They do not prove that the installed device has the legacy parser or
reproduce the incident's persistent failure of every attempted command. Existing
two-window and asynchronous-read paths also permitted some earlier concurrency;
the migration did not invent all possible overlapping writes.

The failing process's timing session contains no `overlay.request`, native-frame,
or native-attachment events before the first failed write. Active overlay frame
production is therefore unsupported as the initial trigger in that process.

The user subsequently confirmed that physical device buttons did not change the
light during failure and that the October 16 firmware fixes were flashed. They
do not remember whether any shortcut worked after the last wake. This lowers the
legacy parser issue as an explanation of this particular incident. Lack of a
visible response to physical controls suggests firmware or USB handling may have
stalled, but does not prove a firmware crash or establish its trigger. Do not
claim the recovery patch identifies or fixes the initial regression.

The user offered a sleep/resume test. Use the same installed build as the failing
incident first, then compare the patched build. Confirm normal physical power,
keyboard power, and UI power operation before sleep. Leave the app running in the
tray, sleep and wake, then test those three controls in the same order, beginning
with the physical button before issuing any host command. Repeat after about
15 minutes idle; the recorded incident had a 14-minute interval between the last
successful resume read and the first failed shortcut.

If failure recurs, record the time and which controls failed, and preserve logs
before restarting. Then restart only the app and check whether physical controls
recover too, without unplugging or resetting the device. This comparison helps
distinguish a host connection or USB I/O stall from a condition requiring a
device reset. Reopening a port is not by itself proof of a firmware reset.
