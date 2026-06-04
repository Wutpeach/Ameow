# Design

## Architecture

The desktop site-session registry should remain the authority for supported site metadata, cookie domains, matching, and activation. The settings page should consume a settings-facing list that represents user-visible saved or activated login-state rows, not the entire supported-site catalog.

The browser extension should keep receiving the full registry payload so it can match current tabs and sync supported sites even when those sites are hidden from desktop settings.

## Data Flow

### Startup And Catalog

- Seed-supported sites remain present in `registry.listEntries()` so `requireEntry()`, URL matching, extension registry push, and desktop sync validation continue to work.
- Seed entries that have never been activated should not appear in the settings-facing visible list.
- Hidden catalog entries are activated by existing flows:
  - `activateEntry(siteId, "user_sync")` after successful sync
  - `enableCurrentTabSite()` after explicit current-tab enablement
  - `upsertAuthRequiredSite()` after auth-required recovery

### Settings Visibility

Two viable implementation choices exist:

- Registry-first: make seed entries default to `hidden_catalog`, then rely on existing `activateEntry()` / auth-required paths to promote them to `visible`.
- State-first: keep registry visibility unchanged, but add a settings-specific command that filters rows by saved session state.

Recommended approach: registry-first, because the existing hidden catalog behavior already covers recognition metadata and activation, and tests already encode that model for gallery-dl catalog entries.

Visibility should be based on persistent registry activation sources, not on the registry trying to inspect saved cookie snapshot files:

- New seed-supported entries default to `hidden_catalog`.
- Successful snapshot import calls `activateEntry(siteId, "user_sync")` after `importSnapshot(...)` returns without `lastError`. This includes `partial` states, because partial is a saved snapshot with incomplete readiness rather than an import failure.
- Auth-required recovery calls `activateEntry(..., "auth_required")` through `upsertAuthRequiredSite(...)`.
- Current-tab enablement records `extension_current_tab`.
- `listVisibleEntries()` continues to expose rows with `visibility: "visible"`.

Compatibility note: `mergeSeedEntries()` currently forces seed entries visible. That behavior must be narrowed so a seed entry only stays visible if its stored `discoverySources` contain an activation source beyond seed/catalog metadata, such as `user_sync`, `auth_required`, or `extension_current_tab`. Brand-new seed entries and stored seed-only entries should remain `hidden_catalog`.

Legacy note: if a historical saved cookie file exists without a persisted activation source, the registry cannot discover that from `mergeSeedEntries()` alone. If this compatibility matters during implementation, prefer a small migration or settings-facing reconciliation that activates entries with existing non-missing state; do not make registry loading directly depend on `SiteSessionManager`.

### Clear And Demotion

Clearing a saved session removes the snapshot file through `SiteSessionManager.clearSession()`. To keep settings visibility aligned with saved state, the clear command path also needs a registry demotion step:

- Remove the `user_sync` discovery source for that site after clear succeeds.
- Recompute visibility from remaining activation sources.
- If only catalog sources remain, set `visibility: "hidden_catalog"`.
- If `auth_required` or `extension_current_tab` remains, keep the row visible as missing/incomplete because it is still actionable.

### Live Refresh

Electron should emit a renderer event after site-session state changes:

```ts
type SiteSessionStateChangedPayload = {
  siteId: string;
  state: SiteSessionState;
  registryEntries?: SiteSessionRegistryEntry[];
};
```

The event should be emitted after:

- successful `syncSiteSessionFromExtension()`
- successful `site_session_cookie_sync_direct`
- successful `clear_site_session`
- registry activation that affects settings visibility

`clear_site_session` currently routes through the generic site-session command controller, so implementation needs an explicit hook or wrapper in Electron main to emit refresh events and perform registry demotion after clear.

`SettingsPage` should subscribe with `desktopEvents.on("site-session-state-changed", ...)` and refresh the panel. The simpler and safer behavior is to call the existing `loadSiteSessionPanelState()` on each event; direct per-site state patching can be added later if performance becomes relevant.

`site-session-pending-actions-changed` remains scoped to pending-action count and should not be overloaded for settings panel refresh.

## Contracts

- Add `site-session-state-changed` to `AmeowAppEvent`.
- Keep `get_site_session_registry` returning settings-visible rows unless a new command is introduced. Extension websocket registry pushes must continue to use `listEntries()` rather than `listVisibleEntries()`.
- Preserve `site_session_cookie_sync_direct` and `sync_site_session_from_extension` as separate sync paths.
- Add a registry operation for post-clear demotion or source removal rather than manually editing registry entries outside the registry module.

## Trade-Offs

- Hiding unsynced seed entries removes desktop settings as the initial sync entry point for those sites. Users will initiate first sync from the browser extension or through auth-required recovery.
- Keeping partial saved snapshots visible gives users a way to diagnose and clear incomplete cookie captures, but it means not every visible row is immediately usable for downloads.

## Product Decision

"Synced" means any saved snapshot exists, including `partial`. A `partial` snapshot is visible in settings, while the badge status communicates that required/login cookies are still missing or incomplete.
