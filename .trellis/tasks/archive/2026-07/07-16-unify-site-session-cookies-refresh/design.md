# Design: Unified Site-Session Cookies Acquisition And Refresh

## Current Problems

Persistent site-session cookies currently have more than one acquisition path:

- Desktop pull path: Electron asks the extension for a site-session cookie sync, then imports the result.
- Extension direct push path: the extension popup reads cookies for the current tab and sends `site_session_cookie_sync_direct` to Electron.
- Multiple callers trigger refresh work: Settings, extension popup, scheduled refresh, download start, auth-required recovery, and advanced quality pre-probe.

The refresh policy is also split:

- `siteSessionAutoSyncEnabled` gates download-start sync.
- The scheduled refresh scheduler starts independently of that global setting.
- Per-site activation already exists through `user_sync` and saved snapshots, but the global switch makes the product model harder to explain.

The main window also still contains `site-session pending` indicator state/rendering and backend pending-action command/event plumbing, even though the recent UI direction removed the blue status-dot behavior.

## Target Product Model

Site-session cookie access is authorized per site.

- First successful user-initiated sync for a site authorizes future automatic refresh for that site.
- A site with an existing valid snapshot or `user_sync` activation remains eligible for automatic maintenance.
- A seeded site that the user has never synced is not silently read in the background.
- An `auto_discovered` site is visible/actionable, but not automatically refreshed until the user explicitly syncs/enables it.
- There is no global auto-sync setting in Settings.
- Main-window pending status dots are not used for site-session discovery.

## Canonical Flow

All persistent site-session imports should use the same canonical flow:

1. A caller requests refresh for `siteId` through `SiteSessionRefreshScheduler.ensureRefreshed()`.
2. The scheduler owns in-flight joining, timeouts, due checks, and refresh metadata.
3. The scheduler calls the Electron refresh dependency.
4. Electron broadcasts a `site_session_cookie_sync_request` to connected extension clients.
5. The extension reads and filters cookies using the registry entry.
6. Electron imports the returned cookie records through `SiteSessionManager.importSnapshot()`.
7. Electron records refresh success, broadcasts registry/state changes, and downloads later consume `getDownloadCookies()`. For manual/user-initiated sync only, Electron also marks/promotes the registry entry as user-authorized.

Manual Settings sync and extension popup sync should both enter this flow. The extension popup can still initiate the action, but it should ask Electron to refresh the matching site rather than sending long-term cookies through a separate direct-import command.

The extension remains the component that reads browser cookies. The ownership change is orchestration and persistence: Electron owns the refresh request, in-flight joining, import, registry activation, refresh metadata, and broadcasts; the extension owns browser API access and cookie filtering for the requested site.

Registry activation must distinguish user-initiated sync from automated refresh:

- Manual Settings sync and extension popup current-site sync should mark `user_sync`.
- If the entry is `auto_discovered`, successful manual sync should promote it to `syncAuthorization: "user_enabled"` and `autoSyncAllowed: true`.
- Scheduled refresh, download-start refresh, auth-required recovery, and advanced-quality pre-probe should import fresh cookies and update refresh metadata, but should not create `user_sync` authorization for a site the user has never explicitly synced.

The popup replacement for `site_session_cookie_sync_direct` should be an Electron-owned request, tentatively:

```text
site_session_sync_request { siteId }
```

Electron should resolve the manager, call `syncSiteSessionFromExtension(siteId, manager, "manual")`, and return a success/failure payload compatible with the existing popup busy-state UX.

## Scheduler Eligibility

Scheduled/background refresh eligibility should be based on site state, not a global switch:

- `entry.autoSyncAllowed === true`
- `entry.syncAuthorization === "seeded"` or `"user_enabled"`
- the entry has an existing saved snapshot, or `discoverySources` includes `user_sync`
- at least one extension client is connected
- the site is not in failure backoff
- the saved snapshot is missing for an already activated site, or older than the refresh TTL

`auto_discovered` entries remain ineligible until the user syncs/enables them.

Download-start refresh should use the same per-site authorization rules. It may force a bounded refresh when the site is stale/missing/partial, but should not be controlled by `siteSessionAutoSyncEnabled`.

Auth-required recovery should route through the same scheduler, but it should not silently promote an `auto_discovered` site. If recovery cannot refresh because the site is not authorized, the registry/discovery state can still guide the user to Settings or the extension drawer.

Advanced quality pre-probe may keep its current YouTube/Bilibili scope and short timeout, but it should still route through the same scheduler and in-flight map.

## UI And Config Changes

Remove the Settings global auto-sync row and stop reading/writing `siteSessionAutoSyncEnabled` for product behavior.

Existing config values can remain ignored for compatibility; no destructive migration is required. Avoid deleting arbitrary config keys in-place unless the config store already has a clear migration pattern.

Remove the main-window site-session pending indicator state/rendering and the backend command/event plumbing that only exists to feed that indicator:

- `get_site_session_pending_actions`
- `site-session-pending-actions-changed`
- `buildSiteSessionPendingActionsPayload()`
- `broadcastSiteSessionPendingActions()`
- main-window `siteSessionPendingActions` state and `site-session-pending-indicator` render block

Auth-required discovery should still update the registry and be visible in Settings / extension drawer where appropriate.

Docs and release-facing copy should explicitly explain the behavior change:

- Previously synced sites may be refreshed automatically later.
- Refresh remains local to the user's machine.
- The browser extension reads browser cookies only for eligible/synced sites.
- Ameow does not upload cookies.
- This is per-site maintenance, not a global all-site cookie sync.

## Compatibility

Existing snapshots under `site-sessions/<siteId>.json` remain valid.

Existing `refresh-state.json` remains valid.

Existing registry entries remain valid. Entries with `user_sync` or saved snapshots become the source of truth for future background refresh eligibility.

The old extension direct-push persistent import command (`site_session_cookie_sync_direct`) should be removed after all callers are migrated to desktop-requested refresh. Do not keep it as a long-term compatibility alias for persistent snapshots, because that would preserve the split import model this task is removing.

## Risks

- Multiple connected browser extensions may return different cookie sets. The existing request bridge resolves the first success; keep that behavior unless a separate product decision changes browser/profile selection.
- Removing the global switch changes behavior for users who had it off but already synced sites. The new product model intentionally treats prior per-site sync as authorization for background maintenance.
- If no extension is connected, refresh must skip/fail softly and existing snapshots must continue to be used for downloads.
- Under-explaining the behavior change could create privacy confusion. Documentation and release copy are part of the acceptance criteria, not optional polish.
