# Design: Conditional site-session refresh before advanced quality probe

## Scope

This task enhances the advanced-quality probe path only.

V1 applies to YouTube and Bilibili advanced-quality probes when those sites have desktop-managed site-session sync support.

Normal left-click downloads and ordinary non-advanced queueing must not gain a pre-download sync dependency.

## Data Flow

Current advanced-quality path:

```text
extension right-click
  -> queue_video_download advancedQualityRequest
  -> ElectronDownloadRuntime.queueVideoDownload
  -> advanced task
  -> buildAdvancedQualityProbeContext
  -> buildExecutionContext
  -> getSiteSessionManager(siteId).getDownloadCookies()
  -> yt-dlp --dump-single-json
```

New path:

```text
advanced task
  -> resolve provider/engine/site id
  -> optional pre-probe site-session refresh hook
  -> buildExecutionContext reads refreshed desktop snapshot
  -> yt-dlp probe uses desktop-owned cookies
```

The browser extension supplies fresh cookies only through the existing site-session sync flow. Probe execution still consumes desktop-owned saved cookies.

## Runtime Boundary

Add an optional injected runtime callback instead of importing site-session modules into `src/electron-runtime/service.ts`.

Candidate shape:

```ts
refreshSiteSessionBeforeAdvancedQualityProbe?(input: {
  traceId: string;
  siteId: string;
  pageUrl?: string;
  url: string;
}): Promise<void>;
```

`service.ts` calls this hook before the final `buildExecutionContext(...)` call that injects cookies.

The hook is best-effort:

- success updates the saved site-session snapshot
- failure is logged and ignored
- timeout is treated as failure
- unsupported site/session state skips without error

## Electron Main Responsibilities

Electron main owns the site-session refresh policy because it already owns:

- `getSiteSessionRegistry()`
- `getSiteSessionManager(siteId)`
- `syncSiteSessionFromExtension(siteId, manager)`
- extension connection state

Policy:

- only `youtube` and `bilibili` for V1
- only registry entries with approved sync authorization:
  - `seeded`
  - `user_enabled`
- skip `auto_discovered` entries unless later explicitly authorized
- skip when no extension client is connected
- skip when the saved snapshot is fresh
- refresh when the saved snapshot is stale or absent-but-syncable

## Staleness And Timeout

Use code-owned constants:

```ts
ADVANCED_QUALITY_SESSION_REFRESH_STALE_MS = 24 * 60 * 60 * 1000
ADVANCED_QUALITY_SESSION_REFRESH_TIMEOUT_MS = 2500
```

The exact timeout may be adjusted within the PRD-preferred 2-3 second range.

Fresh snapshots skip refresh. Stale snapshots attempt refresh once before the probe.

## In-Flight Dedupe

Maintain a site-level in-flight map in Electron main:

```ts
Map<string, Promise<void>>
```

If a pre-probe sync for the same site is already running, later probe requests await the same promise instead of starting another extension sync.

The promise must be removed in `finally`.

## Failure Behavior

If pre-probe refresh fails, times out, or is skipped:

- log a diagnostic message with `traceId`, `siteId`, and reason
- continue the advanced-quality probe with the currently saved desktop snapshot
- do not show a new prompt
- do not fail the advanced request solely because refresh failed

The existing auth-required retry path remains unchanged for hard auth failures after normal download execution.

## Tests

Focused checks:

- stale Bilibili snapshot triggers pre-probe sync before cookies are injected into probe context
- fresh Bilibili snapshot skips pre-probe sync
- sync failure falls back to saved cookies and still runs probe
- sync timeout falls back to saved cookies and still runs probe
- no extension connection skips sync and still runs probe
- concurrent Bilibili advanced probes share one in-flight sync
- normal non-advanced downloads do not call the pre-probe refresh hook
- unauthorized auto-discovered entries do not auto-sync

Existing verification remains:

- `npm run type-check`
- `npm run lint`
- focused runtime / Electron command tests touched by this task
