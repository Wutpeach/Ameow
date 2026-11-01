# Design

## Current Dispatch Order

`electron/main.mts` currently routes `handleCommand(command, payload = {})` in this exact order:

1. `getVideoDownloadCommandBridge()`
   - If `supports(command)` is true, call `invoke(command, payload)` and return.
2. `getSiteSessionCommandController()`
   - If `supports(command)` is true, call `invoke(command, payload)` and return.
3. `getSupportLogCommandController()`
   - If `supports(command)` is true, call `invoke(command, payload)` and return.
4. Inline `switch (command)` for the remaining renderer commands.
5. `default`
   - Throw `new Error(\`Unsupported Electron command: ${command}\`)`.

The registry must preserve this order exactly. It must not reorder support checks, eagerly invoke controllers differently, or change fallback into the remaining switch.

## Already Controllerized Command Families

### Video Download

Owned by `electron/videoDownloadCommands.mts`.

Commands:

- `queue_video_download`
- `queue_pasted_video_download`
- `cancel_download`
- `cancel_transcode`
- `retry_transcode`
- `remove_transcode`
- `check_ytdlp_version`
- `get_gallery_dl_info`
- `get_runtime_dependency_status`
- `get_runtime_dependency_gate_state`
- `refresh_runtime_dependency_gate_state`
- `start_runtime_dependency_bootstrap`

Current notes:

- Exposed type is named `VideoDownloadCommandBridge`.
- It already matches the registry-compatible shape: `supports()` plus `invoke()`.
- It has richer dependencies than the others and must continue to be created by `main.mts` through the lazy getter.
- Direct unknown invocation currently throws `Unsupported video download command: <command>`, but this is not reached through `handleCommand(...)` for unknown commands because `supports()` gates it.

### Site Session

Owned by `electron/siteSessionCommands.mts`.

Commands:

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

Current notes:

- Exposed type is named `SiteSessionCommandController`.
- It matches the registry-compatible shape.
- `main.mts` remains owner of site-session manager construction and capture-window/session wiring.
- Direct unknown invocation throws `Unsupported Electron command: <command>`.

### Support Log

Owned by `electron/supportLogCommands.mts`.

Command:

- `export_support_log`

Current notes:

- Exposed type is named `SupportLogCommandController`.
- It matches the registry-compatible shape.
- `main.mts` remains owner of `exportSupportLog()` environment/config/runtime/log dependency assembly.
- Direct unknown invocation throws `Unsupported Electron command: <command>`.

## Remaining Switch Families

These commands remain in the inline `switch` in `electron/main.mts`:

### Config And Theme

- `get_config`
- `save_config`
- `broadcast_theme`

Risk: medium. `save_config` writes raw config and applies desktop proxy settings; `broadcast_theme` emits cross-window state.

### Output Folder And Context Menu

- `open_current_output_folder`
- `begin_open_output_folder_from_context_menu`
- `begin_pick_output_folder_from_context_menu`
- `open_folder`

Risk: medium to high. Context-menu commands touch window lifecycle, dialogs, config writes, and event emission.

### Autostart And Shortcut

- `get_autostart`
- `set_autostart`
- `get_current_shortcut`
- `register_shortcut`

Risk: medium. These touch OS integration, `globalShortcut`, config, and main-window show/focus behavior.

### Window Geometry

- `set_window_size`
- `set_window_position`

Risk: high for this architecture phase because they directly mutate `BrowserWindow` state.

### File, Image, Rename, Clipboard

- `reset_rename_counter`
- `process_files`
- `download_image`
- `save_data_url`
- `get_clipboard_files`

Risk: medium. These mix tested helper calls with rename state, file intake dependencies, image download dependencies, protected-image fallback behavior, and clipboard access.

### UI Lab

- `dev_ui_lab_apply_scenario`

Risk: medium. It is dev-only but mutates scenario/runtime display state and emits renderer events.

### Xiaohongshu Drag Resolution

- `resolve_xiaohongshu_drag_media`

Risk: high. This crosses extension request correlation, pending maps, cookies, desktop fallback fetch, logging, and result selection.

## Registry Decision

Recommendation: do a minimal registry in Phase 5.3, but only for already controllerized renderer command handlers.

This is worth doing now because:

- There are now three extracted handlers with the same runtime interface.
- `handleCommand(...)` has repeated `getX(); if (x.supports(command)) return x.invoke(command, payload);` boilerplate.
- A registry can reduce the repeated dispatch loop without moving any remaining switch behavior.
- It creates a stable place to add future controllerized families one at a time.
- It can preserve lazy initialization by storing getter functions, not controller instances.

This should not become a broad architecture abstraction. It is not a mandate to extract the remaining switch families, and it should not introduce a deep framework, decorators, maps keyed by command names, or eager registration side effects.

## Minimum Phase 5.3 Implementation

Recommended implementation target:

- Prefer an inline registry directly in `electron/main.mts`: an ordered array plus a loop in or near `handleCommand(...)`.
- Extract a tiny pure helper module only if characterization tests cannot reasonably cover the dispatch behavior without importing `electron/main.mts`.
- Represent the registry as an ordered array of lazy getter functions:

```ts
const rendererCommandControllerGetters = [
  getVideoDownloadCommandBridge,
  getSiteSessionCommandController,
  getSupportLogCommandController,
];
```

- Replace only the repeated three guard blocks with an ordered loop:

```ts
for (const getController of rendererCommandControllerGetters) {
  const controller = getController();
  if (controller.supports(command)) {
    return controller.invoke(command, payload);
  }
}
```

- Leave the existing switch exactly where it is after the registry loop.
- Do not move remaining switch cases into the registry in Phase 5.3.
- Do not add a new exported business-code interface unless local typing cannot stay clear without it.
- Add one short implementation comment near the registry: `Order matters: first supporting controller wins.`
- Future controller additions must verify command sets are disjoint; if two controllers support the same command, the first registry entry wins.

## Interface Type Recommendation

A shared command controller interface is optional, not required.

Preferred smallest cut:

- In `main.mts`, use the existing structural TypeScript shape if typing is introduced locally.
- Avoid creating a new exported `rendererCommandController` module in Phase 5.3 unless tests need a pure dispatch helper.

If a type is necessary, keep it local or in an Electron-owned module:

```ts
type RendererCommandController = {
  supports(command: AmeowRendererCommand): boolean;
  invoke<TResult>(
    command: AmeowRendererCommand,
    payload?: Record<string, unknown>,
  ): Promise<TResult>;
};
```

Because `electron/main.mts` is currently `// @ts-nocheck`, a new shared exported type may add ceremony without meaningful safety unless the registry helper is extracted into a typed module.

## ESM And Lazy Initialization

The registry must use getter functions rather than importing or constructing controller instances at module evaluation time.

Why:

- Current controller creation is lazy.
- `getVideoDownloadCommandBridge()` also constructs or reaches runtime and extension bridge dependencies.
- Eager controller creation could change startup behavior and ESM evaluation ordering.
- Lazy getters keep `main.mts` as the composition root and preserve the current first-use timing.

ESM risk is low if Phase 5.3 only defines an array of existing local function references after those functions are declared, or uses a helper that receives getter functions from `main.mts`. ESM risk increases if a new module imports `main.mts`, constructs controllers, or owns Electron dependencies.

## Fallback And Error Behavior

The registry loop must only invoke controllers after `supports(command)` returns true.

Required behavior:

- If no controller supports the command, fall through to the existing switch.
- If the switch does not support the command, throw the existing text:
  - `Unsupported Electron command: <command>`
- If a controller invocation rejects or throws, let the original error object pass through.
- Do not catch, wrap, normalize, or convert controller errors.

## Characterization Tests

Recommendation: add characterization tests before or with the registry change if `handleCommand(...)` remains hard to import safely.

Most valuable test target:

- A pure helper, if extracted, should verify:
  - controllers are checked in declared order
  - only the first supporting controller is invoked
  - unsupported commands return a miss sentinel instead of throwing
  - switch commands such as `get_config` are not consumed by controllers
  - payload object is passed through by identity
  - rejection object identity passes through
  - final unknown command text remains exactly `Unsupported Electron command: <command>`

If no helper is extracted, rely on existing controller tests plus any feasible focused test around the changed dispatch path. If testing the inline loop would require brittle `main.mts` lifecycle imports, prefer extracting a tiny pure dispatch helper and test that helper.

Do not attempt broad `main.mts` import tests unless the app lifecycle side effects are already isolated; importing `main.mts` may pull Electron startup state and make tests brittle.

## Files For Later Implementation

Likely touched:

- `electron/main.mts`

Optional if choosing a pure helper for testability:

- `electron/rendererCommandControllerRegistry.mts`
- `electron/rendererCommandControllerRegistry.test.mts`

Validation should also run existing characterization tests:

- `electron/videoDownloadCommands.test.mts`
- `electron/siteSessionCommands.test.mts`
- `electron/supportLogCommands.test.mts`

## Risk Level

Risk: low to medium.

Low because the minimum change only replaces repeated guard boilerplate with an ordered loop over the same lazy getter functions.

Medium because `handleCommand(...)` is a central renderer command entry point, so ordering, fallback, and error passthrough must be locked down with focused tests.

## Claude Consult Summary

Claude agreed the registry is worth doing now, but only barely: three identical guard blocks are enough to justify a tiny ordered loop, as long as Phase 5.3 does not introduce a broader framework or move remaining switch behavior.

Adopted:

- Keep the registry limited to already controllerized command handlers.
- Use lazy getter functions, not controller instances, to preserve first-use initialization.
- Preserve exact order: video download, site session, support log, then switch fallback.
- Prefer inline array plus loop in `electron/main.mts`.
- Add one short comment that order matters and first supporting controller wins.
- Add or keep characterization coverage for order, first-match behavior, switch-command fallback, payload identity, rejection identity, and exact unknown-command text.
- Record command collision as a future contributor risk: current sets are disjoint, but first match would win if overlap is introduced.

Rejected:

- No recommendation was rejected outright.

Deferred:

- Shared `RendererCommandController` interface. Because `electron/main.mts` is currently `// @ts-nocheck`, an exported interface adds ceremony without safety unless a typed helper module is needed for tests.
- Naming cleanup from `VideoDownloadCommandBridge` to `VideoDownloadCommandController`; this is cosmetic and out of scope for Phase 5.3.
- Pure helper module as the default path. It remains a fallback if inline dispatch is too hard to test without importing `main.mts` lifecycle side effects.
