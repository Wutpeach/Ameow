## Scenario: Electron Proxy Resolution Contract

_Part 2 of 4._

#### Window Ownership Contract

- `main` remains the canonical primary window label.
- `settings` and `context-menu` remain the stable user-facing secondary window labels.
- `ui-lab` is a development-only secondary window label:
  - available only when `!app.isPackaged`
  - not exposed through production UI entry points or packaged runtime flows
- `main` keeps the current compact shell behavior:
  - transparent where the platform compositor can render it reliably
  - always-on-top
  - non-resizable
  - close request hides instead of quitting
- On Windows, the first startup reveal for `main` must use full native bounds (`200x200`) instead of a cold-start compact native shell.
- The first transition into compact mode after launch must come from the normal idle compact path, not from an immediate startup-only full-to-compact handoff that runs before the window has settled.
- On packaged Windows builds, compact Ameow windows should preserve transparent parity with development builds by default, including `main` and `settings`. An opaque fallback background is reserved only for explicit diagnostics / escape-hatch runs enabled through the global fallback switch.
- `main`, `settings`, `context-menu`, and other compact utility windows should default to `show: false` and reveal only after `ready-to-show` or `did-finish-load`, with a bounded timeout fallback for machines that never emit the ideal paint signal.
- Startup reveal gating may differ by environment:
  - packaged `main` should keep the full reveal handshake, including the renderer-ready wait used to avoid showing a half-booted desktop shell
  - development `main` may reveal on the first stable paint / initial reveal signal and must not hold first show behind the full renderer-ready handshake
- If a window closes before those reveal signals or timeout complete, the wait path must resolve quietly and skip listener cleanup against destroyed `BrowserWindow` or destroyed `webContents` handles.
- On Windows, Ameow desktop windows are tray-first utility surfaces:
  - `main` must set `skipTaskbar: true`
  - secondary utility windows should default to `skipTaskbar: true` unless a product requirement explicitly opts one into taskbar visibility
- Interaction-mode switches for `main` must preserve the Windows tray-first invariant; if a handler toggles focusability or mouse passthrough, it must keep `skipTaskbar: true` on the main BrowserWindow.
- On Windows, `main` must reassert `setSkipTaskbar(true)` after `show()`, after `focus()`, and after any `setFocusable(true)` transition because those shell-affecting calls can cause the OS to reevaluate taskbar ownership.
- Single-instance behavior stays:
  - if a second instance launches, Electron must focus/show `main`
- Tray behavior stays:
  - tray left-click shows `main`

#### Download Output Naming Contract

- Runtime-owned video downloads in `src/electron-runtime/service.ts` must reserve one output stem per task before engine execution starts.
- The shared stem builder is `buildOutputStem(...)` in `src/electron-runtime/runtimeUtils.ts`; engines must consume the pre-reserved `context.outputStem` instead of inventing per-engine names.
- Title-first contract:
  - when a request provides a usable title, that cleaned title is the primary video output stem for all providers, including Pinterest
  - provider-specific fallback stems such as `pinterest_<shortId>` are used only when title metadata is absent
  - `gallery-dl` routes must not add a blocking pre-download metadata probe just to improve naming; they should start the real download immediately and, if needed, rename after completion from emitted sidecar metadata
  - post-download `gallery-dl` naming may read sidecars named `<stem>.info.json`, `<stem>.json`, `<final-media-name>.info.json`, `<final-media-name>.json`, or bare `info.json`
  - when `gallery-dl` metadata exposes both a username/account handle and a stable short post identifier (for example Instagram `post_shortcode`), runtime should prefer a short `author - shortId` stem over a long description/caption
- Collision handling contract:
  - if the preferred stem already exists on disk, runtime must allocate the next available suffixed variant before the downloader starts
  - active in-memory tasks must also reserve stems, so concurrent same-title or same-pattern tasks cannot pick the same filename
  - sidecar artifacts such as `.txt`, `.json`, `.part`, and `.ytdl` do not count as occupied final outputs
  - once a `gallery-dl` task has used sidecar metadata for naming, runtime should remove those transient metadata sidecars from the output directory on success so the user only sees the final media file
- Config compatibility:
  - when `renameMediaOnDownload === true` or legacy `videoKeepOriginalName === false`, all resource saves must route through the shared rename-rule allocator instead of provider-specific stems
  - `download_image(...)`, `save_data_url(...)`, and `process_files(...)` in `electron/main.mts` share the same rename-rule entrypoint so screenshots, copied files, and moved local files follow the same global rename toggle
  - `process_files(...)` keeps the command name stable but returns structured `ProcessFilesResult` data for renderer control flow; callers must use `processedCount` / item statuses instead of parsing localized or English status text
  - native local file-system drops may call `process_files` with `operation: "move"`; clipboard files, browser/chat payloads, and `file://` fallback paths remain copy/save semantics
  - tray menu contains `show`, `settings`, `quit`
  - tray labels continue to resolve from native locale resources
  - Windows tray and BrowserWindow icons should resolve from packaged app assets, preferring `desktop-assets/icons/icon.ico` so dev and packaged runs do not fall back to the default Electron icon

#### Foreground Task Window Restore Contract

- When a foreground task or direct-processing feedback flow such as download, transcode, image save, or file copy restores `main` from compact icon mode, renderer state must not switch to full-mode visuals before the native BrowserWindow bounds have returned to the full shell size.
- If `main` is still in compact native bounds (`windowResized === true` or equivalent), restore the native bounds first through `currentWindow.animateBounds(...)` or a shared helper that owns that contract, then clear minimized/full-mode renderer state.
- If multiple async compact/full requests can overlap, renderer must attach a monotonic transition token to `currentWindow.animateBounds(...)` and must ignore any completion whose echoed token is no longer current before committing `setIsMinimized(false)`, `setWindowResized(false)`, or compact-shrink follow-up.
- Download, transcode, and direct-processing feedback paths must share the same restore helper so renderer/native ordering cannot drift between task types.
- If a foreground task forced `main` out of compact mode, completion/cancel settlement should return the shell to compact behavior once the transient success/error indicator finishes and no other foreground-task lock remains.
- Once `main` is already in full native bounds, repeated progress events must not trigger redundant resize work or re-arm focus/idle side effects unnecessarily.
- User-triggered native repositions such as the global `shortcut-show` path may move the BrowserWindow before renderer expansion logic runs:
  - Electron main may set the new `main` bounds directly before emitting `shortcut-show`
  - renderer must treat `shortcut-show` as a synchronization signal and refresh its cached `currentWindow.outerPosition()` before the next compact/full `animateBounds(...)` request
  - otherwise the next idle compact can shrink back to stale pre-shortcut coordinates instead of the new shortcut anchor point

#### Dev-only UI Lab Contract

- Electron main may expose a dev-only `ui-lab` window through `window.ameow.windows.openUiLab(...)`.
- Electron preload/main may expose the dev-only renderer command:
  - `dev_ui_lab_apply_scenario`
- Packaged builds must reject UI Lab entry points:
  - `ameow:window:open-ui-lab`
  - `dev_ui_lab_apply_scenario`
- UI Lab must drive the real main window instead of rendering duplicate status widgets:
  - scenario application may emit the existing queue/transcode/runtime app events
  - scenario application may temporarily override `get_runtime_dependency_status`, `get_runtime_dependency_gate_state`, `refresh_runtime_dependency_gate_state`, and `start_runtime_dependency_bootstrap`
- While any UI Lab runtime override is active, emitted `runtime-dependency-gate-state` events must keep reflecting the override payload instead of leaking live bootstrap updates back into the preview.
- Non-runtime UI Lab scenarios (`download-*`, `transcode-*`, `mixed-*`) must apply a ready runtime override before emitting task progress so missing live runtimes do not pollute those previews with an unrelated runtime indicator.
- Before each scenario, Electron main must emit `ui-lab-reset` so the main window clears mock progress, queue, and retry/success indicator state before applying new preview data.
- UI Lab scenario application must not reuse the normal `shortcut-show` renderer event path after `showMainWindow()`:
  - preview activation is its own contract, not a user shortcut replay
  - renderer-side shortcut show logic may arm idle/minimize flows that race with preview state application
- While UI Lab preview mode is active, renderer visual state must be forced to full main-window mode until `ui-lab-reset` restores live state:
  - minimized shell clip-path, minimized icon branch, and shrink-on-animation-complete paths must stay suppressed even if internal minimize state is still settling
  - preview tooling must never show task/status content inside the compact circular shell
- `ui-lab-reset` is a main-to-renderer app event only; renderer must not emit it back over `window.ameow.events.emit(...)`.

#### Autostart Contract

- Renderer-facing command names stay:
  - `get_autostart`
  - `set_autostart`
- Autostart remains runtime-owned OS state and must not be mirrored into `settings.json`.
- On Windows, Electron main must read and write login-item settings against the current executable path with an explicit empty `args` array so the query path matches the write path.
- On Windows, Electron main must use a stable registry entry name `Ameow` when writing startup registration so toggling the feature reuses one predictable startup item across installs and updates.
- On Windows, `executableWillLaunchAtLogin` is the source of truth for whether the current executable will actually launch at login. `openAtLogin` alone is not sufficient because it can stay truthy while Startup Approved state or argument matching drifts.
- When Windows returns matching `launchItems` for the current executable or the stable `Ameow` entry name, Ameow should surface autostart as enabled only if at least one matching item is still `enabled`.
- On macOS, keep the existing `openAtLogin` read/write behavior; do not widen this contract with Windows-only fields.

#### BrowserWindow + Preload Availability Contract

- `main`, `settings`, and `context-menu` must all load the same Electron preload bridge when they render Ameow UI.
- Desktop startup state needed before first React render, including whether the main window intentionally launched in compact icon mode, must come from the Electron-owned bridge contract rather than renderer-side first-frame size heuristics.
- Packaged startup work that still belongs on the critical path before first reveal should reuse one parsed startup-config snapshot for all native consumers that need the same config fields during that boot, including:
  - BrowserWindow theme selection
  - tray label/bootstrap language
  - shortcut registration
- Development startup should keep first reveal focused on showing `main`; non-critical native bootstrap tasks such as config-dir creation, tray refresh, and shortcut registration may run immediately after reveal as deferred best-effort work instead of blocking first paint.
- Renderer-side non-critical startup work such as runtime status/gate refresh, automatic managed-runtime bootstrap, and update checks must wait until the initial full-window reveal has settled or a bounded fallback delay has elapsed.
- If a user initiates a foreground action before deferred startup work runs, the renderer may fetch the required runtime state on demand for that action instead of waiting for the deferred startup queue.
- Under the current architecture, each BrowserWindow must set:
  - `preload: <electron preload path>`
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - `sandbox: false`
- Route construction must preserve hash routing for Electron renderer windows in both dev and packaged mode so secondary routes resolve consistently.
- Packaged Electron renderer builds that load via `file:///.../dist/index.html#...` must emit relative asset URLs (`./assets/...`) in `dist/index.html`.
- Do not ship root-relative `/assets/...` URLs in packaged renderer HTML; that causes BrowserWindows to show only the native host background while JS/CSS fail to load from the app bundle.
- Renderer bootstrap must treat Electron detection (`file:` URL or Electron user agent) as a hard contract:
  - if `window.ameow` exists, continue with desktop bootstrap
  - if `window.ameow` is missing, render an explicit bridge-failure state and stop booting the normal app shell

#### Extension Injection Debug Config Contract

- Canonical persisted config key: `extensionInjectionDebugEnabled`.
- The desktop Settings window is the source of truth for that flag; browser-extension local storage is a mirrored cache only.
- Renderer keeps the existing raw-JSON config flow:
  - `get_config` returns the raw string
  - renderer toggles `config.extensionInjectionDebugEnabled`
  - `save_config` persists the raw string
- Electron main must compare previous and next effective values when `save_config` writes settings:
  - when the effective value changes, broadcast `extension_debug_config_changed`
  - when the value does not change, do not broadcast redundant WS churn
- Browser extension background must request the current value on WS connect with `get_extension_debug_config` so already-open tabs resynchronize after extension reloads or desktop reconnects.
- Content scripts must observe the mirrored extension storage key instead of polling the desktop app directly.
- Dev-only page tooling such as injection-debug overlays or draggable diagnostics panels must remain hidden until this flag is `true`.

#### Renderer Event Delivery Contract

- Electron main must emit app events on `ameow:event:<eventName>`.
- Electron preload `events.on(event, listener)` must subscribe only to the event-specific channel for that event name.
- The renderer-facing callback payload stays `{ payload }`; do not add a second `event` discriminator field that forces renderer-side filtering.
- Every `events.on(...)` implementation must return an unsubscribe cleanup that removes the exact same listener from the exact same channel.
- Do not route unrelated events through one shared `"ameow:event"` channel. That pattern scales listener count badly and can trigger `MaxListenersExceededWarning` during normal UI usage.

#### Frameless Window Movement Contract

- Renderer drag activation may wait for a movement threshold, but once dragging starts it must derive movement from screen-space pointer deltas plus the window's initial outer position.
- Read `currentWindow.outerPosition()` once when drag becomes active; do not re-query window coordinates on every move.
- High-frequency movement updates must go through `currentWindow.setPosition({ x, y })`, implemented as fire-and-forget IPC (`ipcRenderer.send(...)` / `ipcMain.on(...)`).
- Shell paths that are confirmed to change the main window's native size must use `currentWindow.animateBounds({ x, y, width, height }, { durationMs })` against the existing main BrowserWindow. Do not infer that every compact/full visual morph changes native size; first classify the current path as startup normalization, compact visibility clamping, restore synchronization, visual-only renderer morph, or a true native size transition.
- Do not reintroduce a dedicated `window-transition-overlay` BrowserWindow for icon-mode expand; Windows DWM cross-window handoff is not the supported contract for Ameow.
- Renderer may batch window-position writes with `requestAnimationFrame`, but it must not await request/response IPC inside `pointermove`.
- `currentWindow.startDragging()` is not the hot-path mechanism for Ameow's custom frameless drag contract on Electron.
- `pointerup`, `pointercancel`, blur-adjacent cleanup, and other drag-end paths must always clear pending drag state so the window cannot get stuck mid-drag.
- Frameless secondary windows that do not use the main window's manual drag system (for example `ui-lab`) must expose an explicit Chromium drag region on their shell/header and mark interactive controls such as close buttons as `no-drag`.

#### Managed Runtime Bootstrap Network Contract

- Small metadata lookups in the managed runtime bootstrap path, such as the Pinterest runtime manifest request, must fail explicitly after a bounded timeout instead of waiting forever on network stalls.
- Managed runtime asset downloads must use a stall timeout that resets on successful byte progress; if no progress arrives within the timeout window, bootstrap must transition the gate to `failed` with a concrete error message.
- Runtime bootstrap timeout handling must preserve the existing gate contract:
  - active work reports `checking` or `downloading`
  - timeout/fetch failure reports `failed`
  - successful completion still refreshes the live runtime snapshot and gate state
