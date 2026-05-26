# Plan Low-Risk Electron Controller Extraction Info

## Planning Result

Recommended Phase 5.1 target: extract the site-session renderer command dispatch family from `electron/main.mts` into a small Electron main-process command controller, tentatively `electron/siteSessionCommands.mts`.

This is a planning-only task. No business code was changed, no controller was created, and Phase 5.1 implementation was not started.

## Evidence Read

- Parent task: `.trellis/tasks/05-25-architecture-boundary-refactor/info.md`
- Architecture audit: `.trellis/tasks/05-25-architecture-boundary-refactor/research/architecture-boundary-audit.md`
- Main process and related modules:
  - `electron/main.mts`
  - `electron/videoDownloadCommands.mts`
  - `electron/extensionRequestBridge.mts`
  - `electron/siteSessionManager.mts`
  - `electron/configStore.mts`
  - `electron/appUpdateController.mts`
  - `electron/supportLogExport.mts`
  - `electron/openPath.mts`
  - `electron/autostart.mts`
- Related tests:
  - `electron/videoDownloadCommands.test.mts`
  - `electron/extensionRequestBridge.test.mts`
  - `electron/siteSessionManager.test.mts`
  - `electron/configStore.test.mts`
  - `electron/appUpdateController.test.mts`
  - `electron/supportLogExport.test.mts`
  - `electron/openPath.test.mts`
  - `electron/autostart.test.mts`

## electron/main.mts Responsibility Map

`electron/main.mts` is still the Electron composition root and should remain so. Current responsibilities:

- Top-level app/runtime composition
  - Owns `app`, `BrowserWindow`, `ipcMain`, `screen`, `session`, `shell`, `Tray`, and `WebSocketServer` integration.
  - Constructs existing controllers and bridges: runtime dependency gate, config store, app update controller, tray menu controller, runtime log controller, startup diagnostics controller, extension request bridge, video download command bridge, UI Lab scenarios, and main-window pointer boundary.
- Window lifecycle and BrowserWindow creation
  - Creates main and secondary BrowserWindows.
  - Owns window map, main-window pointer boundary setup, startup visibility, packaged-window diagnostics, and current-window IPC behavior.
- Startup and shutdown lifecycle
  - Owns single-instance lock, `app.whenReady()`, proxy bootstrap, tray/shortcut startup, runtime log startup, startup diagnostics, WS server registration, and `will-quit` cleanup.
- Renderer command dispatch
  - `handleCommand(...)` first delegates video download/runtime commands to `videoDownloadCommandBridge`.
  - It still directly switches over config, site session, folder/path, autostart, shortcut, window size/position, file/image, clipboard, support-log, UI Lab, and Xiaohongshu drag commands.
- WebSocket action dispatch
  - `handleWsMessage(...)` parses extension messages and returns the stable `{ success, message, data }` envelope.
  - It handles ping, language/theme/debug config reads, download-preference sync, image save, protected-image results, pasted-video results, Xiaohongshu drag results, and `video_selected_v2`.
- WebSocket lifecycle
  - Owns `WebSocketServer`, connected client set, connection cleanup, initial preference request, port logs, and server close/error handling.
- Request correlation state
  - Owns protected-image pending request map and Xiaohongshu drag pending request map.
  - Pasted-video correlation is already isolated in `extensionRequestBridge`.
- Site-session composition
  - Owns `siteSessionManagers` map and `createSiteSessionManager(...)` wiring.
  - Capture-window creation still uses `new BrowserWindow(...)` in main and must stay there for the next cut.
- Config and cross-surface side effects
  - `configStore` owns config IO and some language/debug broadcasts.
  - `handleCommand("save_config")` still applies desktop proxy after save.
- Update, diagnostics, and logging adapters
  - App update controller and support-log builder already exist; main wires runtime/config/app dependencies into them.

## Command / Action Family Risk Matrix

### Low Risk

#### Site session renderer commands

Commands:
- `get_site_session_state`
- `start_site_session_capture`
- `complete_site_session_capture`
- `cancel_site_session_capture`
- `clear_site_session`
- legacy aliases:
  - `get_douyin_session_state`
  - `start_douyin_session_capture`
  - `complete_douyin_session_capture`
  - `cancel_douyin_session_capture`
  - `clear_douyin_session`

Why low:
- Uniform dispatch shape: resolve site id, require manager, call one manager method.
- Domain behavior is already in `electron/siteSessionManager.mts` and covered by tests.
- Does not need to move `createSiteSessionManager`, capture-window creation, BrowserWindow options, session hardening, or manager map ownership.
- No command payload or result shape change is needed.
- No new lifecycle timing is needed; managers stay lazily resolved from main-owned callbacks.

Risk: Low.

#### Support-log export command

Command:
- `export_support_log`

Why low:
- Domain formatting and file output already live in `electron/supportLogExport.mts` with tests.
- Main only wires environment/runtime/config/log dependencies.

Why not first:
- Too small and not a coherent controller family by itself unless combined with unrelated diagnostics commands.

Risk: Low, but low value as Phase 5.1.

#### App update IPC adapter

IPC:
- `ameow:updater:check`
- `ameow:updater:download-and-install`

Why low:
- App update logic already lives in `electron/appUpdateController.mts` with tests.

Why not first:
- These are already outside `handleCommand`.
- Extracting the two IPC registrations would not meaningfully reduce `main.mts` command/controller density.

Risk: Low, but low value.

### Medium Risk

#### Config commands

Commands:
- `get_config`
- `save_config`
- `broadcast_theme`
- `get_current_shortcut`

Why medium:
- `get_config` is simple, but `save_config` has important side effects: raw string persistence, language/debug broadcasts through `configStore`, and desktop proxy application from `main.mts`.
- Must preserve the raw `get_config` / `save_config` string contract.

Risk: Medium.

#### File/path/image/clipboard commands

Commands:
- `open_current_output_folder`
- `begin_open_output_folder_from_context_menu`
- `begin_pick_output_folder_from_context_menu`
- `open_folder`
- `process_files`
- `download_image`
- `save_data_url`
- `get_clipboard_files`

Why medium:
- Some commands are simple wrappers around tested helpers.
- Context-menu folder commands close windows, emit `context-menu-closed`, focus the main window, temporarily change always-on-top, and open dialogs.
- Image/file commands depend on rename state, output path, fetch/session behavior, and filesystem helpers.

Risk: Medium.

#### Autostart and shortcut commands

Commands:
- `get_autostart`
- `set_autostart`
- `get_current_shortcut`
- `register_shortcut`

Why medium:
- Autostart helper is tested, but main still owns platform-specific app calls.
- Shortcut command mutates `registeredShortcut`, uses `globalShortcut`, and interacts with main-window show behavior.

Risk: Medium.

#### Diagnostics/UI Lab commands

Commands:
- `dev_ui_lab_apply_scenario`
- `export_support_log`
- possibly startup diagnostics ready signals

Why medium:
- UI Lab command mutates preview runtime overrides and may show main window.
- Startup diagnostics are tied to window readiness and packaged startup investigation.

Risk: Medium.

### High Risk

#### Window and current-window IPC

IPC:
- `ameow:window:*`
- `ameow:current-window:*`
- `ameow:system:current-monitor`
- secondary window open/focus/close

Why high:
- Touches BrowserWindow lifecycle, startup diagnostics, compact/full animation, pointer boundary, focus/blur events, and platform-specific transparent window behavior.

Risk: High.

#### WebSocket server lifecycle

Responsibilities:
- `new WebSocketServer(...)`
- `wsClients` set
- connection, close, error handling
- initial `request_download_preferences`

Why high:
- Crosses browser extension transport lifecycle, shutdown cleanup, endpoint stability, and request broadcast behavior.

Risk: High.

#### Extension WebSocket action router

Actions:
- `video_selected_v2`
- `pasted_video_selection_result`
- `protected_image_resolution_result`
- `xiaohongshu_drag_resolution_result`
- image save actions and preference sync

Why high:
- Stable WS response envelope is user-visible to the extension.
- Some actions touch pending request maps, extension/Desktop fallback, queueing, preference sync, image save, and candidate normalization.
- Valuable later, but should not be first Phase 5.1 cut.

Risk: High for first cut; can be split later by action family.

#### Download commands

Commands:
- queue/cancel/retry/remove/runtime gate/downloader info commands

Why high/avoid for Phase 5.1:
- Already extracted into `electron/videoDownloadCommands.mts`.
- Further splitting risks touching runtime queue, dependency gate, or payload preservation.

Risk: Medium to High, and not needed now.

#### Runtime bootstrap and app startup

Responsibilities:
- `bootstrap()`
- `will-quit`
- runtime dependency bootstrap options
- managed runtime install/check path

Why high:
- Platform/package-sensitive startup behavior.
- Parent task explicitly marks runtime bootstrap ordering and BrowserWindow startup as out of scope for the first controller split.

Risk: High.

## Recommended Minimal Phase 5.1 Goal

Create `electron/siteSessionCommands.mts` and move only site-session command-name dispatch out of `electron/main.mts`.

Proposed controller shape:

```ts
type SiteSessionCommandController = {
  supports(command: AmeowRendererCommand): boolean;
  invoke<TResult>(
    command: AmeowRendererCommand,
    payload?: Record<string, unknown>,
  ): Promise<TResult>;
};
```

Dependencies should be injected by `electron/main.mts`:

```ts
createSiteSessionCommandController({
  resolveSiteSessionIdFromPayload,
  requireSiteSessionManager,
});
```

The controller should only own:

- command membership
- generic site-session command to manager-method mapping
- legacy Douyin alias to `"douyin"` manager-method mapping
- exact unsupported command error text

## Why This Is Lowest Risk

- It is a natural atomic family: five generic commands and five Douyin aliases all map to the same five manager methods.
- It avoids BrowserWindow creation because `createSiteSessionManager(...)` and `createCaptureWindow(...)` stay in main.
- It avoids startup changes because manager construction remains lazy and main-owned.
- It avoids WebSocket lifecycle and extension envelope changes.
- It has strong existing domain test coverage in `electron/siteSessionManager.test.mts`.
- New characterization tests can be small and deterministic with fake managers.
- It follows the existing `supports()` / `invoke()` precedent from `electron/videoDownloadCommands.mts`.

## Files For Phase 5.1

Expected implementation files:

- Add: `electron/siteSessionCommands.mts`
- Add: `electron/siteSessionCommands.test.mts`
- Modify narrowly: `electron/main.mts`

Possible shared helper file if needed:

- Add or modify: a small module for `resolveSiteSessionIdFromPayload` if exporting from `main.mts` is undesirable.

Important Claude note: do not duplicate `resolveSiteSessionIdFromPayload`; move/export it from a shared non-main module or otherwise reuse a single implementation so generic site-id fallback and unsupported-site error behavior cannot drift.

## Areas Not To Touch In Phase 5.1

- Do not move `createSiteSessionManager(...)` wiring.
- Do not move or change capture-window creation.
- Do not change `configureSiteSessionCaptureSession(...)` or permission/session hardening.
- Do not touch BrowserWindow creation or secondary-window lifecycle.
- Do not touch `registerIpcHandlers(...)` channel names except replacing inline `handleCommand` cases with controller delegation.
- Do not touch `registerWsServer(...)` or `handleWsMessage(...)`.
- Do not touch download commands or `videoDownloadCommandBridge`.
- Do not touch config save/proxy behavior.
- Do not touch app startup, `bootstrap()`, or `will-quit` cleanup.
- Do not change renderer command names or legacy Douyin aliases.

## Required Tests For Phase 5.1

New `electron/siteSessionCommands.test.mts` should cover:

- `supports()` returns true for all 10 site-session commands.
- `supports()` returns false for neighboring commands such as `get_config`, `save_config`, `queue_video_download`, and `video_selected_v2`.
- Each generic command calls the expected manager method:
  - `getState`
  - `startCapture`
  - `confirmCapture`
  - `cancelCapture`
  - `clearSession`
- Each legacy Douyin alias calls the same expected method on the `"douyin"` manager.
- Douyin aliases ignore `payload.siteId` and still resolve `"douyin"`.
- Generic command with no `siteId` falls back to `"douyin"`, matching current `resolveSiteSessionIdFromPayload(payload, fallback = "douyin")`.
- Unsupported site errors preserve exact text: `Unsupported site session: <siteId>`.
- Unknown supported-controller command errors preserve exact text: `Unsupported Electron command: <command>`.
- Rejected manager promises pass through unchanged; the controller must not catch or wrap them.

Implementation validation should run:

- `npm test -- electron/siteSessionCommands.test.mts electron/siteSessionManager.test.mts`
- `npm run type-check`
- `npm run lint`
- `npm test`
- `git diff --check`

## Contract Preservation Strategy

- IPC command names unchanged:
  - keep the same `AmeowRendererCommand` strings and same `ameow:command:invoke` channel.
- WebSocket action names unchanged:
  - Phase 5.1 must not edit `handleWsMessage(...)` or `registerWsServer(...)`.
- Error envelope unchanged:
  - renderer command errors should continue to propagate as rejected promises through `ipcMain.handle`.
  - controller must not catch/wrap manager errors.
  - exact unsupported command/site error strings must be characterized.
- Renderer/preload contract unchanged:
  - no edits to `src/types/electronBridge.ts`, `electron/preload.mts`, or renderer call sites.
- Startup flow unchanged:
  - no edits to `bootstrap()`, `app.whenReady()`, startup diagnostics, tray/shortcut startup, or runtime bootstrap.
- BrowserWindow creation unchanged:
  - site-session capture windows remain created by main-owned `createSiteSessionManager(...)` dependencies.
- Main process composition root preserved:
  - `main.mts` constructs the site-session command controller and injects callbacks.
  - controller imports no Electron `app`, `BrowserWindow`, `ipcMain`, or `session`.

## Claude Consult Summary

Claude agreed that site-session command extraction is the lowest-risk first Phase 5.1 target.

Adopted:

- Extract the full site-session command family as one atomic unit; splitting generic commands from Douyin aliases would leave an unnecessary partial switch.
- Use the existing `supports()` / `invoke()` controller shape already established by `videoDownloadCommands.mts`.
- Keep `createSiteSessionManager`, capture-window creation, BrowserWindow/session hardening, startup, and lifecycle cleanup in `main.mts`.
- Do not duplicate `resolveSiteSessionIdFromPayload`; move/export/reuse one implementation.
- Do not catch or rewrap errors in the controller.
- Add characterization tests for exact command mapping, fallback site id, Douyin alias behavior, unsupported command/site error text, `supports()` truth table, and rejected manager promise pass-through.

Rejected:

- Diagnostics/support-log as Phase 5.1: lower complexity, but too small and uncohesive to meaningfully exercise the controller extraction pattern.
- Config commands as Phase 5.1: useful later, but `save_config` has desktop proxy and cross-surface broadcast side effects.
- Extension WebSocket action router as Phase 5.1: valuable later, but higher risk due to WS envelope and pending request maps.

Follow-up:

- After Phase 5.1, consider a second low-risk command controller for support-log or app-update IPC only if it still reduces `main.mts` without adding lifecycle risk.
- Treat config and file/path commands as later medium-risk cuts after the first controller pattern is proven.
- Treat WS action routing as a later phase with characterization tests for the full extension response envelope.

## Planning Validation

- Initial `git status --short`: clean.
- Current Trellis task before creation: none.
- Parent task `05-25-architecture-boundary-refactor`: exists.
- `python ./.trellis/scripts/task.py validate .trellis/tasks/05-26-plan-low-risk-electron-controller-extraction`: passed.

## Next Executable Goal Draft

```text
/goal 请按照 Trellis 工作流执行 architecture-boundary-refactor 的 Phase 5.1 子任务：Extract Electron site-session command controller。

本轮只实现 Phase 5.1，不触碰 WebSocket router、BrowserWindow 创建、启动流程、下载命令、config save/proxy 行为或 renderer/preload contract。

目标：
从 electron/main.mts 中抽离 site-session renderer command dispatch 到 electron/siteSessionCommands.mts，保留 main.mts 作为 composition root。

范围：
- 新增 electron/siteSessionCommands.mts
- 新增 electron/siteSessionCommands.test.mts
- 小幅修改 electron/main.mts，仅把 site-session command family 委托给新 controller
- 复用/移动现有 resolveSiteSessionIdFromPayload，禁止复制第二份逻辑

必须保持：
- IPC command 名不变
- legacy Douyin alias 不变
- unsupported site / unsupported command error text 不变
- manager method rejection passthrough 不变
- BrowserWindow capture 创建不变
- startup / shutdown 不变

验证：
- npm test -- electron/siteSessionCommands.test.mts electron/siteSessionManager.test.mts
- npm run type-check
- npm run lint
- npm test
- git diff --check
- Claude final diff review
```
