# Design: Scheduled Site Session Cookie Refresh

## Current Architecture

Current site-session cookies flow through a single trusted path:

1. Browser extension reads cookies with `chrome.cookies.getAll()`.
2. Electron receives cookie records.
3. Electron filters records against registry cookie domains.
4. Electron writes a site-session snapshot through `SiteSessionManager.importSnapshot()`.
5. Download execution reads saved `cookiesNetscape` via `getDownloadCookies()`.

The scheduled refresh design should reuse this path. The scheduler should not create a second cookie import path.

## Proposed Architecture

Add an Electron-side `SiteSessionRefreshScheduler` owned by `electron/main.mts`.

Responsibilities:

- Track eligible site-session entries.
- Decide when a site is due for refresh.
- Request refresh using existing `syncSiteSessionFromExtension(siteId, manager)`.
- Avoid duplicate in-flight refreshes.
- Record refresh attempt/success/failure metadata.
- Apply retry backoff after failures.

The scheduler should be isolated enough to test without launching Electron.

Likely module:

- `electron/siteSessionRefreshScheduler.mts`
- `electron/siteSessionRefreshScheduler.test.mts`

## Eligibility

A registry entry is eligible for automatic refresh when:

- `entry.autoSyncAllowed === true`
- `entry.syncAuthorization === "seeded"` or `"user_enabled"`
- the site has an existing saved snapshot, or the registry indicates user activation through `user_sync`
- the browser extension is connected

Entries with `syncAuthorization === "auto_discovered"` are not eligible.

Entries with no existing saved snapshot and no `user_sync` discovery source are not eligible, even if they are seeded entries. This is a hard rule, not an implementation option, because startup refresh must not bulk-read cookies for sites the user has never used.

This preserves the authorization boundary: unknown sites discovered from failures become visible and actionable, but are not silently refreshed.

## Trigger Sources

The scheduler should support explicit checks from:

- App startup after a small delay.
- Browser extension client connection.
- Periodic timer, recommended every 6 hours.
- Optional internal request from advanced quality probe code, if consolidating existing pre-probe refresh behavior.

Each check should scan eligible sites and schedule refreshes only for due entries.

## Due Logic

Initial recommended constants:

- `SITE_SESSION_AUTO_REFRESH_TTL_MS = 24 * 60 * 60 * 1000`
- `SITE_SESSION_AUTO_REFRESH_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000`
- `SITE_SESSION_AUTO_REFRESH_STARTUP_DELAY_MS = 30 * 1000`
- `SITE_SESSION_AUTO_REFRESH_BACKOFF_MS = [15m, 1h, 6h]`

A site is due when:

- it has no in-flight refresh;
- it is eligible;
- it is not inside failure backoff;
- its snapshot `updatedAtMs` is missing or older than TTL.

`updatedAtMs === null` does not by itself make a site due. A site without a snapshot is only considered for refresh when `discoverySources` contains `user_sync`.

## State Storage

The scheduler needs metadata beyond the snapshot `capturedAtMs`.

Preferred option: independent refresh state file:

```text
<userDataDir>/site-sessions/refresh-state.json
```

Suggested shape:

```ts
type SiteSessionAutoRefreshState = {
  version: 1;
  sites: Record<string, {
    lastAttemptAtMs: number | null;
    lastSuccessAtMs: number | null;
    nextAttemptAfterMs: number | null;
    failureCount: number;
    lastError: string | null;
  }>;
};
```

Rationale:

- Avoids expanding registry entry semantics with operational scheduler state.
- Keeps registry focused on site discovery, authorization, and display.
- Allows state reset without changing saved cookie snapshots.

## Refresh Execution

Refresh execution should call existing `syncSiteSessionFromExtension(siteId, manager)`.

On success:

- Reset `failureCount`.
- Clear `lastError`.
- Set `lastAttemptAtMs` and `lastSuccessAtMs`.
- Clear `nextAttemptAfterMs`.
- Existing sync path broadcasts registry/state updates.

On failure:

- Keep existing cookie snapshot intact.
- Store summarized error.
- Increment `failureCount`.
- Set `nextAttemptAfterMs` using capped backoff.

## Concurrency

The scheduler should maintain the single in-memory map of in-flight refreshes by `siteId`.

This map should cover:

- scheduled background refresh
- advanced quality pre-probe refresh
- desktop settings sync when it can join or avoid duplicate work
- auth-required recovery when it can join or avoid duplicate work

Manual sync should continue to go through the existing command path. When manual sync succeeds, it should notify the scheduler or call a helper to clear failure backoff for that site.

If manual sync and auto refresh collide, avoid running two extension requests for the same site. Prefer joining or skipping the auto refresh.

## Interaction With Existing Flows

### Download Execution

Do not block downloads on scheduled refresh.

Downloads continue to read the current snapshot through `getDownloadCookies()`.

### Auth Required Recovery

Keep existing auth-required recovery behavior. It is a targeted recovery path and may refresh immediately when the download already failed.

Manual or recovery success should reset scheduler failure state.

### Advanced Quality Probe

Current pre-probe refresh has its own TTL and in-flight map for YouTube / Bilibili. Implementation should migrate that in-flight behavior into the scheduler so two independent in-flight maps do not coexist.

The scheduler should expose a bounded wait API for this path, preserving:

- YouTube / Bilibili scoping unless intentionally expanded
- 24-hour stale threshold
- 2.5-second bounded wait
- failure continues with saved snapshot

## Lifecycle

The scheduler must provide `stop()` / `dispose()` and clear startup/periodic timers during app quit. Leaving the interval running is not acceptable because it can keep the process alive or start refresh work while shutdown is in progress.

## Timeouts And Testability

The scheduler should accept a `now` function, matching the local `SiteSessionManager` testability pattern.

Each individual refresh should have a timeout so a stuck extension request cannot permanently occupy the in-flight slot.

## Observability

Log auto-refresh decisions at low verbosity:

- skipped unsupported site
- skipped because extension disconnected
- skipped because snapshot fresh
- started refresh
- joined/skipped in-flight refresh
- refresh succeeded
- refresh failed with backoff

Avoid user-facing error spam. User-facing surfacing can remain limited to existing site-session state and pending-action indicators.

## Compatibility

Existing site-session snapshots remain valid.

If adding `refresh-state.json`, missing or malformed state should be treated as empty state.

Writes to `refresh-state.json` should use temp-file + rename, matching the snapshot persistence pattern.

Deleting refresh state should not delete cookies or registry entries.
