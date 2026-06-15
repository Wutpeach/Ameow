# Implementation Plan: Scheduled Site Session Cookie Refresh

## Scope

Implement an Electron-side scheduler for automatic site-session cookie refresh. The scheduler should be default-on, internal, non-blocking for downloads, and should reuse the existing extension sync and snapshot import path.

## Files Likely To Change

- `electron/main.mts`
- `electron/siteSessionManager.mts` if helper state exposure is needed
- `electron/siteSessionRefreshScheduler.mts` new
- `electron/siteSessionRefreshScheduler.test.mts` new
- `electron/siteSessionAuthRecovery.mts` possibly only to notify/reset scheduler state after successful recovery
- `src/electron-runtime/service.ts` only if advanced quality pre-probe refresh is migrated to scheduler API
- `.trellis/spec/backend/electron-runtime-contracts.md` if implementation establishes a reusable scheduler contract

## Ordered Steps

1. Add scheduler module.
   - Define constants for TTL, interval, startup delay, timeout/backoff.
   - Define refresh state shape and load/save helpers.
   - Persist refresh state with temp-file + rename.
   - Define eligibility and due-decision helpers.
   - Define the single shared in-flight refresh tracker.
   - Accept `now` injection for stable tests.
   - Add per-refresh timeout handling.

2. Add focused tests for scheduler decisions.
   - Eligible `seeded` / `user_enabled` entries refresh when stale.
   - `auto_discovered` entries are skipped.
   - Fresh snapshots are skipped.
   - Extension disconnected skips.
   - No snapshot and no `user_sync` is skipped.
   - Failure sets backoff.
   - Failure preserves the old cookie snapshot.
   - Success clears backoff.
   - In-flight refresh prevents duplicate requests.
   - Malformed `refresh-state.json` is treated as empty state.
   - Deleting `refresh-state.json` does not delete cookie snapshots.

3. Wire scheduler into `electron/main.mts`.
   - Create lazy singleton near site-session registry/manager.
   - Provide dependencies:
     - registry listing
     - manager lookup
     - extension connection count
     - refresh function using `syncSiteSessionFromExtension`
     - user data dir
     - logger
   - Start scheduler after app readiness with startup delay.
   - Trigger a check when extension connects.
   - Stop scheduler on app shutdown.

4. Reset scheduler failure state after successful manual sync.
   - `syncSiteSessionFromExtension()` success should mark refresh success or clear failure state.
   - `site_session_cookie_sync_direct` success should do the same.
   - Auth recovery success should do the same.

5. Coordinate advanced quality pre-probe refresh.
   - Replace local `preProbeSiteSessionRefreshes` map with scheduler in-flight behavior.
   - Preserve behavior:
     - only YouTube / Bilibili if keeping site allowlist
     - 24-hour stale threshold
     - 2.5-second bounded wait
     - failure continues with saved snapshot

6. Preserve auth-required recovery behavior.
   - Keep immediate targeted sync/retry.
   - On success, clear scheduler failure/backoff state for the site.

7. Validate manually and with tests.

## Validation Commands

Run targeted tests first:

```powershell
npm run test -- electron/siteSessionRefreshScheduler.test.mts
npm run test -- electron/siteSessionManager.test.mts
npm run test -- electron/siteSessionAuthRecovery.test.mts
npm run test -- electron/extensionRequestBridge.test.mts
npm run test -- src/electron-runtime/service.test.ts
```

Then run broader gates:

```powershell
npm run type-check
npm run lint
```

## Risks And Guardrails

- Do not introduce per-download cookie reads.
- Do not auto-refresh `auto_discovered` sites.
- Do not clear old snapshots on refresh failure.
- Do not make downloads wait for scheduled refresh.
- Do not allow a second in-flight map to coexist with scheduler-owned in-flight refresh state.
- Do not auto-refresh seed/catalog entries that have no snapshot and no `user_sync`.
- Avoid noisy user-facing errors.
- Avoid writing scheduler operational state into cookie snapshot files unless necessary.

## Completion Evidence

- Tests cover due/skip/backoff/in-flight behavior.
- Manual sync still updates state and clears backoff.
- Extension popup direct sync clears backoff.
- Auth recovery success clears backoff.
- Download injection still reads saved snapshots only.
- Scheduler timers are disposed on app shutdown.
- Existing auth-required retry tests still pass.
- Existing advanced quality refresh behavior is preserved or covered by equivalent scheduler tests.
