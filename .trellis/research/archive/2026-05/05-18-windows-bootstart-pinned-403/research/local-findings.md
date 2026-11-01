# Local Findings

Date: 2026-05-18

## Observed call chain

1. `src/App.tsx` schedules startup managed runtime bootstrap after the initial window-visible/deferred-startup sequence.
2. That path calls `startRuntimeDependencyBootstrap("startup_auto_retry")`.
3. Electron main forwards the request into `runtimeDependencyGateController.startBootstrap(...)`.
4. The runtime gate calls `ensureManagedYtDlpRuntimeReady(...)` / `ensureManagedGalleryDlRuntimeReady(...)` when managed components are missing.
5. On Windows, those helpers call `ensureManagedDownloaderReleaseReady(...)`.
6. `ensureManagedDownloaderReleaseReady(...)` first calls `fetchPinnedDownloaderRelease(...)`.
7. `fetchPinnedDownloaderRelease(...)` throws `GitHub pinned lookup failed: <status>` when the GitHub release tag API returns a non-OK response.

## Proxy path facts

- `electron/main.mts` defines `fetchWithDesktopSession(...)`, which prefers `session.defaultSession.fetch(...)`.
- `buildManagedRuntimeBootstrapOptions(...)` passes that fetch function into runtime bootstrap.
- `applyConfiguredDesktopProxy(...)` applies the persisted desktop proxy through `session.defaultSession.setProxy(...)`.
- Startup code calls `applyConfiguredDesktopProxy()` right after `await app.whenReady()`.
- Saving config in Settings also re-applies proxy config immediately.

## Current hypothesis

- The bootstart 403 is unlikely to come from `electron/autostart.mts` itself; autostart appears to be a reproducer for startup-time bootstrap, not the network source.
- The most plausible gap is between "the user machine has some proxy configured somewhere" and "Electron default session actually has a persisted desktop proxy before startup bootstrap begins".
- A second plausible branch is that the request does use the proxy, but GitHub still returns 403 under that proxy/IP/user-agent combination. In that case the proxy feature is working, but the release metadata fetch path needs better fallback or diagnostics.

## Evidence still needed

- Real machine state for persisted `globalProxyEnabled` / `globalProxyUrl`.
- Whether bootstart launches before a user-specific proxy environment or system proxy is available on Windows.
- Whether the 403 body/headers indicate GitHub abuse/rate-limit/proxy rejection versus a direct-network block page.
