# Design

## Boundary

`electron/main.mts` remains the Electron composition root. It continues to own:

- IPC channel registration
- `exportSupportLog()` environment assembly
- `app.getVersion()`, `process.platform`, `process.arch`
- config path/log directory/runtime log path lookup
- `readConfigObject`, `getRuntimeDependencyStatus`, and `readRecentRuntimeLogLines`

The new controller owns only:

- support-log command membership
- `export_support_log` dispatch to the injected callable
- defensive unknown-command error text

## Current Behavior Inventory

Current `electron/main.mts` command branch:

```ts
case "export_support_log":
  return exportSupportLog();
```

Current behavior:

- Command name: `export_support_log`
- Payload: not read
- Called function: `exportSupportLog()`
- Return value: `Promise<string>` resolving to the generated support-log file path
- Error behavior: no catch/rewrap; rejections from `exportSupportLog()` propagate through `handleCommand(...)` and Electron IPC

## Controller Shape

Use the existing command-controller pattern:

```ts
type SupportLogCommandController = {
  supports(command: AmeowRendererCommand): boolean;
  invoke<TResult>(
    command: AmeowRendererCommand,
    payload?: Record<string, unknown>,
  ): Promise<TResult>;
};
```

Dependencies:

```ts
createSupportLogCommandController({
  exportSupportLog(): Promise<string>;
});
```

Unknown direct controller invocation should throw:

```ts
new Error(`Unsupported Electron command: ${command}`)
```

This matches `siteSessionCommands.mts` and `handleCommand(...)` default behavior.

## Main Wiring

Add a lazy controller getter in `electron/main.mts`, mirroring existing bridge/controller lazy getters:

```ts
let supportLogCommandController = null;

function getSupportLogCommandController() {
  if (supportLogCommandController) return supportLogCommandController;
  supportLogCommandController = createSupportLogCommandController({
    exportSupportLog,
  });
  return supportLogCommandController;
}
```

Delegate after existing video download and site-session controllers and before the remaining switch:

```ts
const supportLogCommands = getSupportLogCommandController();
if (supportLogCommands.supports(command)) {
  return supportLogCommands.invoke(command, payload);
}
```

Remove only the inline `export_support_log` switch case.

## Compatibility

- No support-log payload parsing is introduced.
- No support-log output text or file behavior changes.
- No Electron globals are imported into the controller.
- No errors are caught or wrapped.
- `main.mts` remains the only owner of Electron/runtime/config/log dependency assembly.

## Completion Summary

Status: completed.

Implemented Phase 5.2 only. Extracted `export_support_log` renderer command dispatch from `electron/main.mts` into `electron/supportLogCommands.mts`.

Files changed:

- `electron/main.mts`
- `electron/supportLogCommands.mts`
- `electron/supportLogCommands.test.mts`

Behavior preserved:

- Command name remains `export_support_log`.
- Payload remains ignored.
- `exportSupportLog()` remains assembled and owned by `main.mts`.
- Return value remains the generated support-log path string.
- Rejected errors pass through without catch/rewrap.
- IPC command envelope remains unchanged.
- WebSocket, BrowserWindow, startup/lifecycle, download, config save/proxy/broadcast, file/path, app updater IPC, renderer/preload contract, and support-log domain output were not touched.

Tests added:

- `supports("export_support_log")` is true.
- Neighboring non-support-log commands are false.
- `invoke("export_support_log", payload)` calls injected `exportSupportLog()` once.
- Payload is ignored.
- Omitted payload is accepted.
- Path string returns unchanged.
- Rejected error object identity passes through.
- Direct unknown command invocation throws `Unsupported Electron command: <command>`.

Validation:

- `npm test -- electron/supportLogCommands.test.mts electron/supportLogExport.test.mts`: passed, 2 files / 8 tests.
- `npm run type-check`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 114 files / 724 tests.
- `git diff --check`: passed with only Windows LF-to-CRLF working-copy warning.

Claude plan review:

- No must-fix issues.
- Confirmed one-command controller is appropriately small.
- Confirmed lazy injection preserves composition root and ESM initialization order.
- Recommended adding a no-payload invocation test; adopted.

Claude final diff review:

- No must-fix issues and no optional changes worth holding the commit.
- Confirmed behavior preservation, no scope creep, clean dependency direction, safe dispatch position, and sufficient tests.

Commit:

- `93f0cd1 refactor(electron): extract support log command controller`

Follow-up:

- None required for Phase 5.2.
- Future Phase 5.x may consider simple folder/path commands, but must keep context-menu/window/config side effects out unless explicitly scoped.
