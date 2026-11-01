# Implementation Plan

## Checklist

1. Load development guidelines before coding.
   - Read relevant `.trellis/spec/backend` and `.trellis/spec/frontend` index files.
   - Use `trellis-before-dev` before editing code.

2. Adjust registry visibility semantics.
   - Change seed-supported first-party entries so never-activated rows do not appear in `listVisibleEntries()`.
   - Preserve full metadata in `listEntries()` for extension registry pushes and URL matching.
   - Update `mergeSeedEntries()` so existing activated rows stay visible while never-activated seed rows remain hidden.
   - Define activated rows by persistent discovery sources: `user_sync`, `auth_required`, or `extension_current_tab`; seed/catalog-only rows stay hidden.
   - Keep activation paths promoting entries to visible.
   - Add a registry demotion/source-removal operation for clear, so successful `clear_site_session` can remove `user_sync` and hide rows with no remaining activation source.

3. Add settings refresh event contract.
   - Add `site-session-state-changed` to `AmeowAppEvent`.
   - Emit the event after successful sync from desktop, successful direct sync from extension, and clear.
   - Refactor or wrap the `clear_site_session` command path so Electron main can perform registry demotion, broadcast registry updates, broadcast pending actions, and emit `site-session-state-changed` after clear succeeds.
   - Continue emitting existing registry and pending-action events where they are already required.

4. Update `SettingsPage`.
   - Subscribe to `site-session-state-changed`.
   - Re-run `loadSiteSessionPanelState()` when the event fires.
   - Ensure clear/sync actions still update local busy/error state without flicker or stale rows.
   - Ensure hub search text and summary derive from the refreshed visible row list.

5. Update tests.
   - `electron/siteSessionRegistry.test.mts`: seed entries are hidden until activation, hidden entries still match URLs, activation promotes visibility.
   - `electron/siteSessionRegistry.test.mts`: stored activated seed rows remain visible after seed metadata merge and still receive updated seed domains/policy metadata.
   - `electron/siteSessionRegistry.test.mts`: clear demotion removes `user_sync` and hides rows with no remaining activation source while preserving rows that still have `auth_required` or `extension_current_tab`.
   - Site-session manager or sync-path tests: a successful saved `partial` snapshot activates the row with `user_sync` and remains visible as incomplete.
   - Electron sync/direct-sync/clear tests: `site-session-state-changed` is emitted after desktop sync, extension direct sync, and clear.
   - Frontend tests if an existing SettingsPage test harness exists; otherwise add focused coverage around event subscription through the desktop runtime mock if local patterns support it.

6. Validate.
   - `npm run type-check`
   - `npm run lint`
   - `npm run test -- electron/siteSessionRegistry.test.mts electron/siteSessionCommands.test.mts electron/extensionRequestBridge.test.mts`
   - Add or adjust focused frontend test command if frontend tests are added.

## Risky Files

- `electron/siteSessionRegistry.mts`
- `electron/main.mts`
- `src/pages/SettingsPage.tsx`
- `src/types/electronBridge.ts`
- `electron/siteSessionRegistry.test.mts`

## Rollback Points

- Registry visibility changes are the highest-risk area because they affect discoverability and activation. If this causes unexpected hidden rows, revert registry visibility changes and instead introduce a settings-specific filtered command.
- Event refresh changes are low-risk if implemented as full panel reload on event; rollback can remove the subscription and event type without altering saved data.

## Review Notes

- Claude review flagged that registry loading cannot directly know whether a cookie snapshot exists. The plan now treats `user_sync` as the persisted activation marker written after any successful snapshot import, including `partial`.
- Claude review also flagged that clear currently has no registry/event hook. The plan now requires a post-clear demotion path plus `site-session-state-changed` emission.

## Product Decision

- `partial` saved snapshots are visible as synced-but-incomplete rows.
