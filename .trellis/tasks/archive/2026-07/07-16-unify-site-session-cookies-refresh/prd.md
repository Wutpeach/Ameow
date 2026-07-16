# Unify site-session cookies acquisition and refresh

## Goal

Unify Ameow's site-session cookie acquisition, storage, refresh, and download consumption flow so login-state behavior is easier to reason about, less duplicated, and more stable across desktop settings, browser extension popup, download startup, auth-required recovery, advanced quality probing, and scheduled refresh.

Users should only need to explicitly sync a site once. After a successful sync for that site, Ameow should treat that site as authorized for ongoing automatic cookie maintenance on the same local machine, without a global "automatic login-state sync" toggle.

The main window should not keep obsolete site-session pending indicator UI if the recent status-dot cleanup was intended to remove it.

## Requirements

- Use one canonical site-session cookie acquisition and import path for persistent site-session snapshots.
- Preserve the authorization boundary: Ameow must not silently read cookies for a site until the user has explicitly synced/enabled that site or an existing saved snapshot/user activation already exists.
- A successful manual/current-tab/settings sync should authorize future automatic refresh for that site.
- Automated refresh success must not by itself create `user_sync` authorization for a site the user has not explicitly synced.
- A successful manual sync of an `auto_discovered` site must promote that site to a user-authorized entry eligible for future automatic refresh.
- Scheduled/background refresh should be controlled by per-site activation state instead of the current global `siteSessionAutoSyncEnabled` setting.
- Remove the global Settings "automatic login-state sync" switch if it no longer represents product behavior.
- Download startup, scheduled refresh, auth-required recovery, advanced quality probing, and Settings refresh should coordinate through the same refresh mechanism and avoid duplicate in-flight refreshes for the same site.
- Extension popup current-site sync should not bypass the canonical import/refresh rules with a separate long-term cookie path.
- Remove the extension direct-push persistent import path (`site_session_cookie_sync_direct`) after popup sync is migrated to the canonical desktop-requested refresh flow.
- Saved site-session cookies must remain local to the user's machine and continue to be passed to `yt-dlp` / `gallery-dl` only through the existing temporary cookie-file execution pattern.
- Existing saved snapshots and registry files should remain compatible or be migrated safely.
- Clean up remaining site-session pending indicator code if it is confirmed obsolete.
- Auth-required site discovery should not surface through a main-window status dot or pending indicator. Discovery may surface inside Settings, the extension login-state drawer, or task-specific failure/recovery UI.
- User-facing documentation and release notes must explicitly state that sites the user has already synced may have cookies refreshed automatically later, while emphasizing local-only handling, per-site authorization, extension-based cookie access, and no cookie upload.

## Acceptance Criteria

- [ ] There is a single documented persistent site-session sync flow from browser extension cookie read to desktop snapshot import.
- [ ] Settings manual sync, extension current-tab sync, scheduled refresh, download-start refresh, auth-required recovery, and advanced-quality pre-probe either use the same refresh coordinator or clearly delegate into the same canonical path.
- [ ] Extension popup current-site sync triggers a desktop-requested extension cookie read, not a direct persistent cookie push into Electron.
- [ ] A manually synced `auto_discovered` site becomes eligible for future automatic refresh.
- [ ] Scheduled/download-start/auth-required/advanced-quality refresh success does not incorrectly mark never-manually-synced sites as user-authorized.
- [ ] Automatic refresh runs only for sites that have an existing user activation/saved snapshot and does not bulk-read unsupported or never-used sites.
- [ ] The global auto-sync setting is removed from Settings UI and no longer gates background refresh behavior.
- [ ] Download-start refresh no longer depends on a global auto-sync switch; it follows the same per-site activation/eligibility rules.
- [ ] Duplicate in-flight refresh requests for the same site are joined or skipped consistently.
- [ ] Persistent site-session snapshots continue to produce valid Netscape cookie files for `yt-dlp` and `gallery-dl` downloads.
- [ ] Obsolete `site-session pending` main-window indicator state/rendering and backend pending-action command/event plumbing are removed.
- [ ] User-facing docs for Cookies/login-state are updated if visible behavior changes.
- [ ] Release notes or release-facing copy explicitly explain the new per-site automatic refresh behavior when this ships.
- [ ] Relevant unit tests cover scheduler eligibility, manual sync authorization, extension sync routing, and download-start refresh gating.

## Notes

- Current evidence from code review:
  - `src/App.tsx` still contains `siteSessionPendingActions` state and `site-session-pending-indicator` rendering.
  - `electron/main.mts` still builds pending site-session actions for `auto_discovered` entries that are not `ready`.
- Persistent site-session sync currently has multiple entry points, including desktop pull-style refresh and extension direct push.
- `siteSessionAutoSyncEnabled` currently gates download-start refresh, while the scheduled refresh scheduler starts independently.
  - `activateEntry(siteId, "user_sync")` currently does not set `syncAuthorization: "user_enabled"` or `autoSyncAllowed: true`, so manual sync promotion must be explicit.
  - `syncSiteSessionFromExtensionRaw()` currently marks `user_sync` for every successful sync reason; implementation must separate manual/user-initiated sync from automated refresh.

## Product Decisions

- Auth-required discovery should not show a main-window status dot or pending indicator. It should be represented through Settings, the extension login-state drawer, or task-specific failure/recovery UI.
- The extension remains responsible for reading browser cookies via extension APIs. Electron owns orchestration, import, refresh metadata, in-flight joining, and persistence. The old `site_session_cookie_sync_direct` persistent import path should be removed rather than kept as a compatibility alias.
- Extension popup sync should use a replacement desktop request action, tentatively `site_session_sync_request`, carrying `{ siteId }`. Electron should handle that request by calling the canonical manual refresh path.
- Documentation and release-facing copy should explicitly describe that previously synced sites may refresh cookies automatically later, and should frame this as local per-site maintenance rather than a global cookie sync.

## Open Questions

- None yet.
