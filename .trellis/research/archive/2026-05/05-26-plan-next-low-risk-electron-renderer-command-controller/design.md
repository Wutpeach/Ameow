# Design

## Planning Boundary

This is a read-only planning task. The only intended repository changes are Trellis task records, archive metadata, and journal entries.

`electron/main.mts` remains the Electron composition root. Phase 5.2 planning must preserve the Phase 5.1 outcome:

- `electron/videoDownloadCommands.mts` owns video download renderer command dispatch.
- `electron/siteSessionCommands.mts` owns site-session renderer command dispatch.
- `electron/main.mts` owns IPC registration, WebSocket routing, BrowserWindow creation, startup/shutdown, config persistence side effects, and dependency wiring.

## Analysis Targets

- `electron/main.mts`
- `electron/siteSessionCommands.mts`
- `electron/videoDownloadCommands.mts`
- `electron/configStore.mts`
- `electron/extensionRequestBridge.mts`
- update-related Electron modules
- renderer/preload bridge command type definitions
- related Electron tests

## Output Shape

The final plan must include:

- Post-Phase-5.1 remaining command/action family map.
- Risk ranking for remaining renderer command families.
- One recommended minimal Phase 5.2 implementation target.
- Rationale for why the target is the lowest-risk useful next cut.
- Explicit areas not to touch.
- Files involved in a later implementation.
- Characterization test plan.
- Contract-preservation strategy.
- Claude consult summary with adopted, rejected, and follow-up notes.

## Compatibility Rules For A Later Implementation

- Keep renderer command names exactly unchanged.
- Keep payload formats exactly unchanged.
- Keep return values exactly unchanged.
- Do not catch or rewrap errors unless the current `main.mts` branch already does so and the behavior is characterized.
- Keep command invocation on the existing `ameow:command:invoke` IPC path.
- Keep `main.mts` responsible for constructing controllers and injecting Electron-specific dependencies.
- Controllers must not import Electron globals or create hidden global mutable state.

## Post-Phase-5.1 Command / Action Family Map

Already extracted before this planning task:

- `electron/videoDownloadCommands.mts`
  - `queue_video_download`
  - `queue_pasted_video_download`
  - `cancel_download`
  - `cancel_transcode`
  - `retry_transcode`
  - `remove_transcode`
  - `get_runtime_dependency_status`
  - `get_runtime_dependency_gate_state`
  - `refresh_runtime_dependency_gate_state`
  - `start_runtime_dependency_bootstrap`
  - `check_ytdlp_version`
  - `get_gallery_dl_info`
- `electron/siteSessionCommands.mts`
  - `get_site_session_state`
  - `start_site_session_capture`
  - `complete_site_session_capture`
  - `cancel_site_session_capture`
  - `clear_site_session`
  - `get_douyin_session_state`
  - `start_douyin_session_capture`
  - `complete_douyin_session_capture`
  - `cancel_douyin_session_capture`
  - `clear_douyin_session`

Remaining `handleCommand(...)` renderer command families in `electron/main.mts`:

- Config/theme commands:
  - `get_config`
  - `save_config`
  - `broadcast_theme`
- Folder/path commands:
  - `open_current_output_folder`
  - `open_folder`
  - `begin_open_output_folder_from_context_menu`
  - `begin_pick_output_folder_from_context_menu`
- Autostart/shortcut commands:
  - `get_autostart`
  - `set_autostart`
  - `get_current_shortcut`
  - `register_shortcut`
- Window geometry commands:
  - `set_window_size`
  - `set_window_position`
- File/image/clipboard/rename commands:
  - `reset_rename_counter`
  - `process_files`
  - `download_image`
  - `save_data_url`
  - `get_clipboard_files`
- Diagnostics/support command:
  - `export_support_log`
- UI Lab command:
  - `dev_ui_lab_apply_scenario`
- Xiaohongshu drag command:
  - `resolve_xiaohongshu_drag_media`

Other Electron IPC/action surfaces that are not `handleCommand(...)` renderer commands:

- App updater IPC:
  - `ameow:updater:check`
  - `ameow:updater:download-and-install`
- Window/current-window/system/clipboard/drop IPC:
  - `ameow:window:*`
  - `ameow:current-window:*`
  - `ameow:system:*`
  - `ameow:clipboard:read-image`
  - dropped-folder validation/consume APIs
- WebSocket action router:
  - extension actions including `video_selected_v2`, image save/protected-image results, pasted-video results, Xiaohongshu drag results, preference sync, language/theme/debug reads, and ping.

## Risk Matrix

### Low Risk

#### Support-log command

Command:

- `export_support_log`

Why low:

- Single command with a clear string return value.
- Domain formatting and file output already live in `electron/supportLogExport.mts`.
- Existing tests cover support-log text generation and file output.
- Current `main.mts` branch only calls an `exportSupportLog()` adapter that assembles environment/runtime/config/log dependencies.
- No BrowserWindow, startup, WebSocket, download queue, config save/proxy, or platform lifecycle behavior is involved.
- A later controller can receive a single injected `exportSupportLog(): Promise<string>` callable, leaving Electron-specific dependency assembly in `main.mts`.

Risk: Low.

#### App updater IPC adapter

IPC:

- `ameow:updater:check`
- `ameow:updater:download-and-install`

Why low:

- Domain behavior already lives in `electron/appUpdateController.mts` with tests.
- `main.mts` only registers two IPC handlers that call existing controller methods.

Why not Phase 5.2:

- It is not a renderer command family under `handleCommand(...)`.
- It would not continue the renderer command controller pattern proven by Phase 5.1.
- Moving updater IPC registration is useful later, but lower value for this specific phase.

Risk: Low, but not the recommended Phase 5.2 target.

### Medium Risk

#### Simple folder/path commands

Commands:

- `open_folder`
- `open_current_output_folder`

Why medium:

- `open_folder` is small, but it calls `shell.openPath` through `openPathOrThrow(...)`.
- `open_current_output_folder` resolves config-backed output path and creates the directory before opening it.
- Existing `openPathOrThrow(...)` tests cover the path helper, but controller tests would need characterization around injected `shellLike`, directory creation, payload string coercion, and error text.

Risk: Medium-low, plausible after support-log.

#### File/image/clipboard/rename commands

Commands:

- `reset_rename_counter`
- `process_files`
- `download_image`
- `save_data_url`
- `get_clipboard_files`

Why medium:

- Domain helpers have tests, but the command family mixes rename state, output path resolution, fetch/session behavior, protected-image fallback requests, and clipboard access.
- `reset_rename_counter` is a global mutable-state command and should not be bundled casually with image/file processing.
- `download_image` can use extension-assisted protected-image resolution through main-owned pending request state.

Risk: Medium.

#### Autostart/shortcut commands

Commands:

- `get_autostart`
- `set_autostart`
- `get_current_shortcut`
- `register_shortcut`

Why medium:

- Autostart helper is tested, but command behavior touches `app.getLoginItemSettings`, `app.setLoginItemSettings`, `process.platform`, and `process.execPath`.
- Shortcut registration mutates `registeredShortcut`, uses `globalShortcut`, and wires callback behavior back into main-window show/focus flow.
- `get_current_shortcut` is config-only, but grouping it with shortcut registration increases blast radius.

Risk: Medium.

#### Config/theme commands

Commands:

- `get_config`
- `save_config`
- `broadcast_theme`

Why medium:

- `get_config` is simple, but `save_config` writes raw config, triggers language/debug broadcasts through `configStore`, and then applies desktop proxy settings in `main.mts`.
- `broadcast_theme` is a cross-surface event broadcast.
- This family should wait until config side effects have explicit characterization tests at the command-controller boundary.

Risk: Medium.

#### UI Lab command

Command:

- `dev_ui_lab_apply_scenario`

Why medium:

- Domain scenario helpers are tested, but the command path calls `assertUiLabEnabled()`, may show the main window, mutates preview override state, and emits queue/runtime events.

Risk: Medium.

### High Risk

#### Window geometry commands

Commands:

- `set_window_size`
- `set_window_position`

Why high for Phase 5.2:

- Directly touches `BrowserWindow` lookup and mutation.
- Error text `Window not found` is simple but tied to window lifecycle.
- Parent task explicitly avoids BrowserWindow extraction in early Phase 5 cuts.

Risk: High.

#### Context-menu folder commands

Commands:

- `begin_open_output_folder_from_context_menu`
- `begin_pick_output_folder_from_context_menu`

Why high for Phase 5.2:

- Close context-menu windows, emit `context-menu-closed`, create/focus main window, use native dialogs, save config, emit output-path events, and restore always-on-top behavior.
- These are window/lifecycle commands, not just path commands.

Risk: High for this phase.

#### Xiaohongshu drag command

Command:

- `resolve_xiaohongshu_drag_media`

Why high:

- Crosses extension request correlation, WebSocket client state, pending maps/timers, cookie propagation, desktop fetch fallback, logging, and result selection.
- Error and fallback behavior is too broad for the next low-risk controller split.

Risk: High.

#### WebSocket action router and lifecycle

Actions/lifecycle:

- `handleWsMessage(...)`
- `registerWsServer(...)`
- `wsClients`
- pending extension request maps

Why high:

- Extension response envelope is externally visible.
- Lifecycle and pending request cleanup are tightly coupled to shutdown and browser-extension transport.

Risk: High; explicitly out of scope.

#### Download queue / video download controller

Commands:

- Existing `electron/videoDownloadCommands.mts` command family.

Why high/avoid:

- Already extracted.
- Further changes risk runtime queue, bootstrap, pasted-video extension assistance, and payload preservation.

Risk: Medium to high; out of scope for Phase 5.2.

## Recommended Minimal Phase 5.2 Goal

Extract only `export_support_log` renderer command dispatch from `electron/main.mts` into a small controller, tentatively:

- `electron/supportLogCommands.mts`
- `electron/supportLogCommands.test.mts`

Proposed controller shape:

```ts
type SupportLogCommandController = {
  supports(command: AmeowRendererCommand): boolean;
  invoke<TResult>(
    command: AmeowRendererCommand,
    payload?: Record<string, unknown>,
  ): Promise<TResult>;
};
```

Proposed dependency:

```ts
createSupportLogCommandController({
  exportSupportLog(): Promise<string>;
});
```

`main.mts` should keep the existing `exportSupportLog()` adapter that assembles:

- `app.getVersion()`
- `process.platform`
- `process.arch`
- `getConfigPath()`
- `getLogsDir()`
- `getRuntimeLogPath()`
- `readConfigObject`
- `getRuntimeDependencyStatus`
- `readRecentRuntimeLogLines`

The new controller should own only:

- command membership for `export_support_log`
- dispatch to the injected callable
- direct unsupported-command defensive error behavior

## Why This Is Safer Than Other Candidates

- It does not touch `BrowserWindow`, `dialog`, `shell.openPath`, `globalShortcut`, `app.setLoginItemSettings`, WebSocket clients, pending request maps, config save/proxy behavior, runtime download queue, or startup/shutdown.
- It continues the `supports()` / `invoke()` renderer command controller pattern from Phase 5.1.
- It has the fewest dependencies of the remaining meaningful `handleCommand(...)` branches.
- It can be fully characterized with deterministic unit tests using one injected mock callable.
- It leaves all Electron-specific environment assembly in `main.mts`, preserving the composition root.

## Do Not Touch In Phase 5.2 Implementation

- Do not move `exportSupportLogFile(...)` or rewrite `electron/supportLogExport.mts`.
- Do not move app-update IPC handlers.
- Do not change `ameow:updater:*`, `ameow:window:*`, `ameow:current-window:*`, `ameow:system:*`, WebSocket actions, or preload APIs.
- Do not move file/path/image/clipboard commands.
- Do not move config/theme commands.
- Do not move UI Lab or Xiaohongshu drag resolution.
- Do not change support-log output text, filename, path format, or environment fields.
- Do not catch or rewrap support-log errors.

## Required Characterization Tests For Phase 5.2

New `electron/supportLogCommands.test.mts` should cover:

- `supports("export_support_log") === true`.
- `supports(...) === false` for neighboring commands such as:
  - `get_config`
  - `save_config`
  - `queue_video_download`
  - `get_site_session_state`
- `invoke("export_support_log")` calls injected `exportSupportLog()` exactly once.
- The returned support-log path string is returned unchanged.
- Payload is ignored; arbitrary payload must not affect dispatch.
- Rejected `exportSupportLog()` errors pass through by object identity.
- Direct unsupported command invocation throws exact text:
  - `Unsupported Electron command: <command>`

Existing support-log domain tests should still run:

- `npm test -- electron/supportLogCommands.test.mts electron/supportLogExport.test.mts`

Full validation for implementation:

- `npm run type-check`
- `npm run lint`
- `npm test`
- `git diff --check`

## Contract Preservation Strategy

- Renderer command name remains `export_support_log`.
- Payload remains ignored.
- Return value remains the generated support-log file path string.
- Error envelope remains the normal `ipcMain.handle("ameow:command:invoke", ...)` rejected promise path.
- `main.mts` remains the composition root by constructing the controller and injecting `exportSupportLog`.
- The controller imports only command types and does not import Electron globals.
- The controller stores no hidden global mutable state.

## Claude Consult Summary

Claude agreed that `export_support_log` is the lowest-risk useful next renderer command extraction.

Adopted:

- Choose `export_support_log` as Phase 5.2.
- A one-command controller is appropriate for this deliberately low-risk incremental phase.
- Inject one callable, `exportSupportLog(): Promise<string>`, rather than moving low-level support-log environment dependencies into the controller.
- Keep the exact unsupported-command defensive text aligned with `siteSessionCommands.mts` and `handleCommand(...)`: `Unsupported Electron command: <command>`.
- Add tests for `supports()`, successful dispatch/return value, payload independence, error identity passthrough, and unknown command text.

Rejected:

- `open_folder` / `open_current_output_folder` as Phase 5.2: still involves OS path opening and, for current output folder, config-backed path and directory creation.
- App updater IPC as Phase 5.2: low risk, but not a renderer command family under `handleCommand(...)` and already outside the switch.
- File/path/image/clipboard grouping as Phase 5.2: too broad because it includes rename state, output path, fetch/session, protected-image requests, and clipboard.

Follow-up:

- Consider simple folder/path commands after support-log if Phase 5.2 lands cleanly.
- Note that `videoDownloadCommands.mts` uses `Unsupported video download command: <command>` for direct unsupported invocation, while `siteSessionCommands.mts` and the main default use `Unsupported Electron command: <command>`. This is unreachable through `handleCommand(...)` but worth noting for consistency in future controllers.

## Next Executable Goal Draft

```text
/goal 请按照 Trellis 工作流执行 architecture-boundary-refactor 的 Phase 5.2 子任务：Extract Electron support-log command controller。

本轮只实现 Phase 5.2，不触碰 WebSocket、BrowserWindow、startup、download、config save/proxy、file/path、app updater IPC 或 renderer/preload contract。

目标：
从 electron/main.mts 中抽离 export_support_log renderer command dispatch 到 electron/supportLogCommands.mts，保留 main.mts 作为 composition root。

范围：
- 新增 electron/supportLogCommands.mts
- 新增 electron/supportLogCommands.test.mts
- 小幅修改 electron/main.mts，仅增加 support-log controller delegation 并移除 export_support_log switch case
- controller 通过依赖注入接收 exportSupportLog(): Promise<string>

必须保持：
- renderer command 名 export_support_log 不变
- payload 继续被忽略
- 返回值仍是 support-log 文件路径字符串
- support-log 输出文本、文件名、路径格式和环境字段不变
- exportSupportLog 错误不 catch / 不 rewrap
- main.mts 继续组装 app/config/runtime/log 依赖

验证：
- npm test -- electron/supportLogCommands.test.mts electron/supportLogExport.test.mts
- npm run type-check
- npm run lint
- npm test
- git diff --check
- Claude final diff review
```
