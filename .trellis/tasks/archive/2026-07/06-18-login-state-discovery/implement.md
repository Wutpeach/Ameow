# Login State Discovery Implementation Plan

## Checklist

- [x] Add config helper constants for:
  - `siteSessionAutoSyncEnabled`
  - `siteSessionDiscoveryDismissed`
- [x] Update `src/App.tsx` config loading/saving to support the discovery point state.
- [x] Add or refactor a separate blue discovery point without removing the existing site-specific pending-action behavior, gated by:
  - full-window mode
  - runtime/bootstrap indicator not currently active
  - `siteSessionDiscoveryDismissed !== true`
  - `siteSessionAutoSyncEnabled !== true`
- [x] Build the in-window discovery popover by reusing the runtime popover surface style pattern.
- [x] Add zh-CN and en locale copy for:
  - discovery title
  - compact behavior hint
  - Ignore
  - Confirm
  - optional sync-enabled feedback/error copy
- [x] Add a Settings control or recovery entry for `siteSessionAutoSyncEnabled` so users who ignored the blue discovery point can still enable the feature later, and enabled users can understand/control the setting.
- [x] Add runtime option/contract `refreshSiteSessionBeforeDownload`.
- [x] Call `refreshSiteSessionBeforeDownload` after provider planning and before `buildExecutionContext(...)`.
  - In `src/electron-runtime/service.ts`, place the call after the resolved plan is available and before orchestrator engine attempts are evaluated, so sync runs once per queued download rather than once per engine candidate.
- [x] Extend site-session refresh reason with `"download_start"`.
- [x] Define `DOWNLOAD_START_SITE_SESSION_REFRESH_TIMEOUT_MS` in the 5-8 second range and use it for the download-start hook.
- [x] Implement Electron main download-start sync hook:
  - return unless config `siteSessionAutoSyncEnabled === true`
  - resolve registry entry by URL/domain first, then `siteId`
  - skip ready snapshots only when they are fresh enough; for catalog entries with no required/login cookie keys, do not rely only on `availability === "ready"`
  - call existing scheduler/sync path for the matched entry only
  - treat `null` refresh results as non-fatal skips
  - log and continue on extension disconnected, timeout, or sync failure
- [x] Ensure successful sync of hidden gallery-dl catalog entries makes them visible in Settings through existing `user_sync` activation.
- [x] Add the `siteSessionAutoSyncEnabled` toggle card to the existing Settings site-session page above the badge list.
- [x] Add a subtle horizontal divider between the Settings auto-sync toggle card and the site badge area; do not add empty-state copy when no badges are visible.
- [x] Preserve existing auth-required recovery, scheduled refresh, and advanced-quality refresh behavior.
- [x] Update README/docs-site local-only and per-site sync documentation.

## Recommended Sync Timing

Use a short pre-download wait. The hook should wait long enough to attach cookies to the first attempt when the extension is available, but fall back to normal download when sync is slow or unavailable.

Recommended initial timeout: reuse or mirror the advanced-quality refresh timeout if suitable, otherwise choose a focused short timeout and document it in tests.

## Validation

- `npm run type-check`
- `npm run lint`
- Focused tests for:
  - config flag parsing/persistence behavior
  - blue discovery point visibility gates
  - Ignore hides only the discovery point
  - Confirm enables download-time auto sync
  - download-start sync matches seeded site by `siteId`
  - download-start sync matches gallery-dl catalog site by URL/domain using a catalog-only site such as Patreon or Boosty, not Instagram because Instagram is also seeded
  - download-start sync fires once per queued download, not once per engine candidate
  - simultaneous downloads for the same site join/deduplicate in-flight refresh where applicable
  - drag/paste/extension `video_selected_v2` paths all reach the runtime hook when they queue video downloads with identifiable URLs/site hints
  - generic unmatched video downloads do not attempt site-session sync
  - image/local-file paths do not attempt video site-session sync
  - hidden catalog sync activation makes the entry visible
  - partial sync snapshots still allow cookie injection where cookies were saved
  - extension disconnected/null refresh result continues download
  - sync failure continues download and leaves auth-required fallback intact
- `npm run docs:build` after docs changes
- `git diff --check`

## Risk Points

- Gallery-dl catalog ids may not match provider `intent.siteId`; URL/domain matching must be tested.
- Instagram appears in both seeded configs and the gallery-dl catalog; catalog-specific tests should use catalog-only entries.
- Catalog entries often have no required/login cookie keys, so readiness can be too permissive; freshness checks matter.
- Pre-download sync must not block downloads indefinitely.
- Do not read cookies for every known site at opt-in or startup.
- Do not record raw cookie values, account identifiers, or protected URLs in logs/telemetry.
