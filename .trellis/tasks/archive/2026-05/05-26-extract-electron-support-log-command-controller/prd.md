# Extract Electron support-log command controller

## Goal

Extract only the `export_support_log` renderer command dispatch from `electron/main.mts` into a focused Electron command controller, `electron/supportLogCommands.mts`, while preserving command name, payload semantics, return value, error behavior, and `main.mts` composition-root ownership.

## Scope

- Add `electron/supportLogCommands.mts`.
- Add `electron/supportLogCommands.test.mts`.
- Modify `electron/main.mts` only enough to delegate `export_support_log` through the new controller.
- Controller handles only:
  - `export_support_log`
- Controller receives exactly one injected dependency:
  - `exportSupportLog(): Promise<string>`

## Requirements

- Preserve renderer command name `export_support_log`.
- Preserve current payload behavior: payload is unused/ignored.
- Preserve return value: resolved support-log file path string.
- Preserve error behavior: injected `exportSupportLog` errors must pass through without catch/rewrap.
- Preserve the normal IPC rejected-promise command envelope.
- Keep `main.mts` as the composition root. It must continue to assemble app/config/runtime/log dependencies for `exportSupportLog()`.
- Do not move or rewrite `electron/supportLogExport.mts` domain logic.
- Follow the existing `supports()` / `invoke()` controller pattern used by `electron/siteSessionCommands.mts` and `electron/videoDownloadCommands.mts`.

## Acceptance Criteria

- [ ] `electron/supportLogCommands.mts` exposes a controller with `supports(command)` and `invoke(command, payload)`.
- [ ] `electron/main.mts` delegates `export_support_log` through the controller and removes only the inline `export_support_log` switch case.
- [ ] The controller imports no Electron globals and creates no hidden global state.
- [ ] New characterization tests cover:
  - `supports("export_support_log") === true`
  - non-support-log commands return false from `supports()`
  - `invoke("export_support_log", payload)` calls injected `exportSupportLog()` exactly once
  - payload does not affect dispatch
  - returned path string is returned unchanged
  - injected rejection passes through by error object identity
  - direct unknown command invocation throws clear unsupported command text
- [ ] `npm test -- electron/supportLogCommands.test.mts electron/supportLogExport.test.mts` passes.
- [ ] `npm run type-check`, `npm run lint`, `npm test`, and `git diff --check` pass.
- [ ] Claude plan review and final diff review are completed; concrete in-scope feedback is addressed.
- [ ] Business code is committed separately from Trellis archive/journal changes.

## Non-Goals

- Do not modify WebSocket code.
- Do not modify BrowserWindow code.
- Do not modify app startup or lifecycle code.
- Do not modify download queue or existing video download command controller behavior.
- Do not modify config save/proxy/broadcast behavior.
- Do not modify file/path commands.
- Do not modify app updater IPC.
- Do not modify renderer/preload contracts.
- Do not modify support-log output text, filename, path format, or environment fields.
- Do not catch or rewrap errors.
- Do not do unrelated `main.mts` cleanup.
- Do not run broad formatting that creates unrelated diffs.
- Do not enter Phase 5.3.
