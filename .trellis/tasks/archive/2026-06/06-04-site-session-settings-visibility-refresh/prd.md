# Fix site session settings visibility and live refresh

## Goal

Make the site-session settings panel reflect the user's actual saved login-state profiles instead of the full supported-site catalog, and keep the panel fresh when browser-extension sync happens while the settings page is already open.

This task covers two related UX defects:

- Unsynced seed-supported sites such as Instagram and Xiaohongshu currently appear in the desktop settings panel even when no site-session cookie snapshot exists.
- When a user syncs a site from the browser-extension popup, an already-open desktop settings page can remain stale until it is manually reopened or refreshed.

## Confirmed Facts

- `src/site-sessions.ts` seeds `douyin`, `bilibili`, `xiaohongshu`, `youtube`, and `instagram`.
- `src/site-session-registry.ts` currently creates every seed registry entry with `visibility: "visible"`.
- `electron/siteSessionRegistry.mts` returns settings registry rows through `listVisibleEntries()`, which only filters by `visibility === "visible"`.
- `src/pages/SettingsPage.tsx` loads `get_site_session_registry`, then fetches state for every returned entry; it does not filter rows by saved snapshot state.
- Extension popup sync uses `site_session_cookie_sync_direct`; desktop settings sync uses `sync_site_session_from_extension`. Both can save snapshots through the desktop site-session manager.
- Electron already broadcasts `site-session-pending-actions-changed`, but that event is for pending-action count and is not a settings-panel state refresh contract.

## Requirements

- Settings must not show seed-supported sites that have never been synced, enabled, or otherwise activated.
- A site that becomes synced from the browser extension while settings is open must appear or update in the settings panel without requiring the user to reopen settings.
- A site that is cleared from settings must update immediately. If clearing removes the only saved/activated state, the row must disappear; if another activation reason remains, such as an auth-required pending action, the row may remain visible with missing/incomplete state.
- Existing support for extension current-tab enablement, auth-required discovery, and desktop-initiated sync must continue to work.
- The implementation must keep registry/catalog concerns separate from saved-session state so hidden catalog entries can still be matched and activated by extension or auth-required flows.
- The settings panel must surface actionable incomplete saved sessions instead of silently hiding them. A saved `partial` snapshot counts as synced for visibility, while its badge/status must still communicate that it is incomplete.

## Acceptance Criteria

- [ ] With no saved cookie snapshot for Instagram or Xiaohongshu, those rows do not appear in the desktop settings site-session panel.
- [ ] After syncing a supported site from the browser-extension popup, an already-open settings panel updates automatically to show the site and its latest state.
- [ ] After syncing from the desktop settings panel, the affected row state updates and remains visible.
- [ ] After clearing a visible site-session row, the row state updates immediately; rows with no remaining activation reason disappear, while auth-required or explicitly enabled rows can remain visible as missing/incomplete.
- [ ] Hidden catalog entries can still be matched by extension current-tab sync/enable flows and by auth-required recovery.
- [ ] A saved `partial` snapshot remains visible in settings and shows an incomplete/missing-cookie state instead of being hidden.
- [ ] Focused tests cover registry visibility, settings refresh event handling, and direct extension sync state propagation.

## Out of Scope

- Changing which sites are supported by site-session sync.
- Fixing browser-extension stale-install or service-worker reload behavior.
- Redesigning the full settings hub or popup UI.

## Decisions

- "Synced" means any saved cookie snapshot exists for settings visibility. This includes `partial`; readiness remains a status indicator, not the visibility gate.
- Registry visibility should be driven by persistent activation sources. A successful snapshot import, including `partial`, activates the entry with `user_sync`; clearing removes that saved-session activation source and may hide the row if no other activation source remains.

## Notes

- This is a cross-layer task touching Electron registry/state events and the React settings panel, so it should have `design.md` and `implement.md` before implementation starts.
