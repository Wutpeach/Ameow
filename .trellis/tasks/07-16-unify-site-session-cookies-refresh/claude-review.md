# Claude Review

## Summary

Claude reviewed the planning artifacts for unifying site-session cookie acquisition and refresh. The overall direction is sound, but the plan needs to make two implementation details explicit before starting:

- A manually synced `auto_discovered` entry must be promoted to a user-authorized entry. Current `activateEntry(siteId, "user_sync")` only adds a discovery source and does not set `syncAuthorization: "user_enabled"` or `autoSyncAllowed: true`.
- The replacement for extension popup `site_session_cookie_sync_direct` needs a named desktop request path. Popup sync should send a site sync request to Electron, and Electron should call the canonical scheduler path.

## Must-Fix Findings

1. `auto_discovered` entries are not eligible for auto-refresh after current `activateEntry()`.

   Current scheduler authorization requires `autoSyncAllowed === true` and `syncAuthorization` of `seeded` or `user_enabled`. `auto_discovered` entries start with `autoSyncAllowed: false` and `syncAuthorization: "auto_discovered"`, and `activateEntry()` does not change either field.

   Planning update: successful manual/user-initiated sync must promote non-seeded entries to `syncAuthorization: "user_enabled"` and `autoSyncAllowed: true`.

2. Extension popup migration needs an explicit command shape.

   Current popup sync sends cookies directly through `site_session_cookie_sync_direct`. After removal, the popup should send a site sync request to Electron, then Electron should call `syncSiteSessionFromExtension(siteId, manager, "manual")`.

   Planning update: introduce a replacement WS action, tentatively `site_session_sync_request`, with `{ siteId }`.

3. Current raw sync always marks `user_sync`.

   `syncSiteSessionFromExtensionRaw()` currently calls `activateEntry(siteId, "user_sync")` for every successful sync, regardless of whether the reason was manual, scheduled, download-start, auth-required, or advanced-quality.

   Planning update: pass refresh reason into the raw sync/import path and only mark/promote `user_sync` for user-initiated manual sync.

## Additional Checks To Add

- Auto-discovered entry -> manual sync -> entry becomes eligible for future auto-refresh.
- Scheduled/download/advanced-quality refresh success does not create `user_sync` activation for a never-manually-synced site.
- Popup current-site sync uses the replacement desktop request and receives a usable success/failure response.
- Pending-action command/event removal includes `isSiteSessionIndicatorHovered` and all stale command/event type entries.

