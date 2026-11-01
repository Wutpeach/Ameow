# Design

## Boundary

`electron/main.mts` remains the composition root. It continues to own:

- `siteSessionManagers`
- `createSiteSessionManager(...)` wiring
- capture-window creation and BrowserWindow/session hardening
- app startup/shutdown cleanup
- IPC channel registration

The new controller owns only site-session command membership and method dispatch.

## Controller Shape

Use the existing command bridge pattern from `electron/videoDownloadCommands.mts`:

```ts
type SiteSessionCommandController = {
  supports(command: AmeowRendererCommand): boolean;
  invoke<TResult>(
    command: AmeowRendererCommand,
    payload?: Record<string, unknown>,
  ): Promise<TResult>;
};
```

Dependencies:

```ts
createSiteSessionCommandController({
  resolveSiteSessionIdFromPayload,
  requireSiteSessionManager,
});
```

## Command Mapping

Generic site-session commands:

- `get_site_session_state` -> resolve site id from payload, call `manager.getState()`
- `start_site_session_capture` -> resolve site id from payload, call `manager.startCapture()`
- `complete_site_session_capture` -> resolve site id from payload, call `manager.confirmCapture()`
- `cancel_site_session_capture` -> resolve site id from payload, call `manager.cancelCapture()`
- `clear_site_session` -> resolve site id from payload, call `manager.clearSession()`

Legacy Douyin aliases:

- `get_douyin_session_state` -> require `"douyin"`, call `getState()`
- `start_douyin_session_capture` -> require `"douyin"`, call `startCapture()`
- `complete_douyin_session_capture` -> require `"douyin"`, call `confirmCapture()`
- `cancel_douyin_session_capture` -> require `"douyin"`, call `cancelCapture()`
- `clear_douyin_session` -> require `"douyin"`, call `clearSession()`

## Compatibility

- No payload mutation beyond the existing site-id resolution.
- No catch/wrap around manager method promises.
- Unknown command throws `Unsupported Electron command: <command>` if invoked directly on the controller.
- Unsupported site id continues to throw `Unsupported site session: <siteId>`.
- `handleCommand(...)` should delegate to the new controller before the remaining switch cases, mirroring the existing video download bridge pattern.

## Dependency Direction

The controller must not import Electron runtime globals (`app`, `BrowserWindow`, `ipcMain`, `session`) and must not create hidden global state. It may import types and pure site-session command helpers. If the site-id resolver is moved, it should live in a small non-main module to avoid duplicating logic.
