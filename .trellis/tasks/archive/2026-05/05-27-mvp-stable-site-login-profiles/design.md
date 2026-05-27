# MVP Stable Site Login Profiles Design

## Boundary

This child task changes the lifecycle of the Electron login profile. It should not change the downloader credential contract or add automatic refresh.

Settings UI click behavior remains intentionally unchanged in this MVP: clicking any site badge opens the capture window flow. Later phases should introduce clearer per-site actions for viewing the profile, refreshing downloader credentials, and clearing login state.

## Proposed Architecture

Add/centralize a partition resolver near the site-session manager boundary:

```ts
resolveSiteSessionProfilePartition(siteId) -> `persist:ameow-site-session-${siteId}`
```

`startCapture()` should use this resolver instead of embedding a timestamped partition string.

## Capture Lifecycle

### Start

- If a capture window is already open for the site, return current state.
- Otherwise resolve the stable partition and create a visible capture `BrowserWindow`.
- Apply existing capture-session configuration to that partition before loading the site URL, but make that configuration idempotent per partition.

### Confirm

- Read cookies from the stable partition.
- Save the downloader credential snapshot.
- Close the capture window.
- Do not destroy the stable partition.

### Cancel / Window Close

- Close or observe the window closing.
- Clear in-memory capture state.
- Do not destroy the stable partition.

### Clear

- Delete `<userDataDir>/site-sessions/<siteId>.json`.
- Destroy/clear the deterministic stable partition for that site.
- Return a missing/idle state.

## Future-Proofing Requirements

- Keep cookie snapshot extraction independent enough that a future task can call it without opening a new window.
- Keep clear/reset as an explicit manager path so future UI can call one reset operation.
- Keep `capturePartition` tracking, but it should refer to the stable partition for the active site.
- Keep session hardening setup centralized/idempotent so future refresh flows can safely reuse the same stable partition.
- Avoid adding Instagram-only branching in the MVP; the profile lifecycle should apply to every supported site.

## Compatibility

- Saved JSON cookie snapshots remain unchanged.
- Existing site configs remain the source of truth for allowed domains and login markers.
- Existing Douyin alias commands remain unchanged because they route into the same manager.
- The old temporary partitions are not migrated. They were intended to be disposable and should not be reused.
- No new Settings interaction model is introduced in MVP, so future per-site action menus should not need to unwind a partial UI redesign from this task.

## Risk And Mitigation

- Risk: a site's stable profile gets into a bad login state.
  - Mitigation: `clear_site_session` must remove both profile and snapshot.
- Risk: applying `configureSiteSessionCaptureSession` repeatedly to the same partition registers duplicate webRequest handlers.
  - Mitigation: make capture-session configuration idempotent per partition. With stable partitions, duplicate `webRequest.onBeforeSendHeaders` handlers would leak and process the same request multiple times.
- Risk: persistent profile stores more data than the old temporary flow.
  - Mitigation: clear action must be reliable and tests should prove the manager calls profile cleanup.
- Risk: users may worry that stable login profiles increase memory usage.
  - Mitigation: closed capture windows should release renderer resources; persistent state is primarily disk-backed profile data. Idempotent session hardening prevents long-lived listener accumulation. Future diagnostics can track profile size if needed.
- Risk: future auth-required refresh UX could be conflated with MVP capture behavior.
  - Mitigation: document automatic refresh as deferred; only keep extension points in this child task.
