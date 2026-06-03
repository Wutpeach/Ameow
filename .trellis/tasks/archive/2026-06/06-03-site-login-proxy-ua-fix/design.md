# Design: Site Login Proxy And UA Fix

## Boundary

The change stays inside Electron-owned Settings site-session capture. It should not introduce a new cookie acquisition product surface.

## Current Shape

Global proxy settings are validated and applied through `applyConfiguredDesktopProxy(...)`, which uses `session.defaultSession.setProxy(...)`. Site login capture uses `session.fromPartition(partition)`, creating a separate Electron `Session` for each stable app-owned site profile.

Because the capture session is not the default session, configured fixed-server proxy settings may not apply to YouTube/Google login windows even when other Electron fetch paths do use the proxy.

## Proposed Shape

Extract the proxy application logic so it can apply the same validated config to any Electron `Session`-like object with `setProxy(...)`.

`applyConfiguredDesktopProxy(...)` remains the public/default-session entrypoint. Site-session setup calls the shared helper for the capture partition before loading the login URL.

Proxy application must not be tied to capture listener registration. Listener registration should remain idempotent per stable partition, but proxy configuration should run for every capture start so cold starts and runtime proxy changes do not leave a stale partition proxy.

UA and accept-language handling should remain centralized in `siteSessionCaptureHardening.mts`. The implementation may refine fallback UA selection, but should avoid brittle Google-specific spoofing or security bypasses.

## Data Flow

1. User saves or has saved global proxy settings.
2. Electron startup/settings save applies proxy to `defaultSession`.
3. User opens Settings site login capture.
4. `configureSiteSessionCaptureSession(...)` resolves the site partition session.
5. The same validated proxy mode is applied to that partition session.
6. Capture session receives browser-like UA and accept-language.
7. Login URL loads in the capture window and existing confirmation flow persists cookies.

If proxy settings are changed through `save_config`, future captures must use the newly saved config. Applying the new config to already-known site-session partitions during `save_config` is acceptable if the implementation can do so without opening windows or changing cookie state.

## Compatibility

- Existing persisted site-session partitions must remain valid.
- Existing proxy config keys and validation errors must not change.
- Existing browser-extension download payload contracts must not change.
- Existing site-session cookie snapshot file shape must not change.

## Risks

- Applying proxy is asynchronous in the existing code path. The login window creation path must await capture-session proxy configuration before `loadURL`, or the first navigation may miss the configured proxy.
- Existing `configuredSiteSessionCapturePartitions` deduplicates listener setup. Implementation must avoid using that same guard to skip proxy re-application.
- Google/YouTube may still block embedded Electron login after this fix. That result is acceptable for this task and should be reported honestly.
