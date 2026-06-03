# Implementation Plan

## Checklist

Implement phases sequentially. Stop after each phase for focused verification and review before expanding scope. The task is complete only after Phase 5 and final verification; phase completion is not a reason to archive the task.

### Phase 0: Pre-implementation context

- [ ] Read backend/frontend specs for extension WebSocket contracts, site sessions, renderer command types, Settings state, popup UI, and runtime auth failure behavior.
- [ ] Confirm current known-site seed data and existing saved snapshot compatibility expectations.

### Phase 1: Registry foundation and old-path removal

- [x] Design and implement a desktop-owned site-session registry module:
  - persisted registry file
  - seed entries from current known site configs
  - normalize site ids/hosts/cookie domains
  - sync authorization / auto-sync state
  - placeholder/known/local-cached icon metadata
- [x] Replace static `SupportedSiteSessionId` authority with registry validation where dynamic entries are accepted:
  - command payload resolution
  - manager lookup
  - Settings state collections
  - download cookie injection
- [x] Keep existing saved snapshot compatibility:
  - existing `site-sessions/<siteId>.json` files load
  - `getDownloadCookies()` still injects saved cookies during execution
- [x] Refactor `SiteSessionManager` to snapshot/import ownership:
  - remove capture/confirm/cancel/refresh/profile diagnostics
  - keep get state/import/clear/download cookie behavior
- [x] Update desktop command controller:
  - registry list/state command for Settings
  - sync command for any registry entry
  - clear command
  - remove obsolete capture/diagnostics/refresh commands and legacy Douyin capture aliases
- [x] Update Settings:
  - render registry entries instead of static `SITE_SESSION_CONFIGS`
  - known icons plus placeholder fallback
  - sync/clear actions only
  - no capture confirmation/cancel UI
- [x] Delete obsolete capture modules/tests/imports when no references remain.
- [x] Run Phase 1 focused tests and type-check.

Phase 1 review checkpoint:

- Local validation passed: `npm run type-check`, `npm run lint`, focused Phase 1 tests, full `npm test`, and `git diff --check`.
- Claude review passed with no must-fix issues. It confirmed no reachable active app-window capture path and no Phase 1 registry/cookie-domain validation defect.
- Phase 2 follow-up: revisit seed merge behavior before user-enabled registry writes, because Phase 1 intentionally forces seed entries back to visible/seeded/auto-sync allowed.

### Phase 2: Browser-extension registry UI and unknown-site enablement

- [ ] Update extension request/response bridge:
  - desktop-to-extension sync by registry entry
  - desktop-to-extension registry push on connect and registry change
  - extension-initiated popup sync if adopted
  - current-tab eligibility query if needed
- [ ] Update browser extension background:
  - receive/cache registry-approved site entries
  - read cookies only for approved domains
  - support current-tab sync
  - support unknown current-tab "enable login-state sync" requests
  - expose current-tab discovered/unsynced state for popup and action badge/dot
  - avoid cookie-value logging
- [ ] Update browser extension popup:
  - add compact login-state/sync panel
  - current-site sync button state
  - top CTA for discovered-but-unsynced active tab
  - action badge/dot support where browser APIs allow it
  - manual enable/sync entry for unknown current tab
  - placeholder/known icon display
  - localized copy
- [ ] Run Phase 2 focused extension/bridge tests.

### Phase 3: Auth-failure discovery and bounded auto-sync

- [ ] Update runtime auth-required handling:
  - remove silent `refreshSiteSessionCredentials`
  - add/upsert dynamic site-session candidate on auth-required failure
  - automatically request extension sync only for seeded or user-enabled entries with auto-sync allowed, using a short bounded timeout
  - retry the failed download at most once after successful sync
  - emit/update pending login-state reminder state for discovered-but-unsynced entries
  - keep download failure terminal behavior otherwise
- [ ] Update main full-window UI:
  - lower-left yellow-dot reminder for pending login-state action
  - click/hover route or copy that directs users to Settings/extension sync
  - keep visual language aligned with existing bootstrap warning-dot indicator
- [ ] Run Phase 3 runtime/reminder tests.

### Phase 4: Local icon handling

- [ ] Add known local icon mappings for seeded entries.
- [ ] Keep placeholder fallback for unknown entries.
- [ ] Optionally fetch/cache favicon metadata when available.
- [ ] Ensure Settings and extension UI do not depend on live remote icon URLs.
- [ ] Run icon metadata/rendering tests where practical.

### Phase 5: gallery-dl catalog import

- [ ] Add a checked-in/generated gallery-dl cookie-needed seed catalog.
- [ ] Map safe site ids, names, primary hosts, cookie domains, engine hints, and icons.
- [ ] Mark catalog-only entries hidden by default.
- [ ] Keep catalog metadata separate from visible login-state rows, either through `visibility: "hidden_catalog" | "visible"` or an equivalent explicit state.
- [ ] Ensure Settings and extension lists exclude hidden catalog-only entries unless activated.
- [ ] Ensure current-tab relevance does not activate hidden catalog entries by itself; opening a matching tab may show a temporary extension CTA, but must not add the site to the desktop/extension visible list.
- [ ] Ensure current-tab matching can use hidden catalog metadata to enable sync for a matching site.
- [ ] Promote hidden catalog entries to visible registry entries after successful sync, user manual enablement, or auth-required discovery that needs a user reminder.
- [ ] Allow hidden catalog entries to participate in bounded auth-failure auto-sync only after an `auth_required` failure matches the catalog metadata; ordinary browsing/current-tab relevance must not auto-read cookies.
- [ ] Ensure catalog import does not fetch live GitHub data at runtime.
- [ ] Keep yt-dlp support discovery-based.
- [ ] Run catalog seed tests.

### Final verification

- [ ] Update locales and mirrored browser-extension locales.
- [ ] Update backend/frontend specs for dynamic registry and removed capture path.
- [ ] Add/update tests:
  - registry seed/discovery/persistence
  - user-enabled unknown current-tab entries
  - exact-host-only cookie scope for unknown manually enabled sites
  - auth-failure auto-sync gating by authorization state
  - auth-failure sync timeout/failure behavior
  - pending reminder event/count behavior
  - icon placeholder/local metadata behavior
  - hidden catalog entries not rendered by default
  - hidden catalog current-tab relevance does not activate visible rows
  - hidden catalog current-tab activation and sync eligibility
  - hidden catalog auth-failure auto-sync gating and promotion behavior
  - site-session manager import-only behavior
  - command routing and removed-command rejection
  - runtime auth-required discovery behavior
  - extension domain approval/filtering
  - popup helper/UI logic where practical
  - Settings type/lint coverage
- [ ] Run focused tests.
- [ ] Run `npm run type-check`.
- [ ] Run `npm run lint`.
- [ ] Run full `npm run test`.
- [ ] Commit, archive task, and record journal.

## Validation Commands

- `npm run test -- electron/siteSessionManager.test.mts electron/siteSessionCommands.test.mts electron/extensionRequestBridge.test.mts`
- `npm run test -- src/electron-runtime/service.test.ts`
- `npm run test -- browser-extension/site-session-cookie-sync.test.js browser-extension/manifest.test.js`
- Additional registry and popup tests added during implementation
- `npm run type-check`
- `npm run lint`
- `npm run test`

## Risky Files

- `src/site-sessions.ts`
- `src/types/siteSession.ts`
- `src/types/electronBridge.ts`
- `electron/siteSessionManager.mts`
- `electron/siteSessionCommands.mts`
- `electron/extensionRequestBridge.mts`
- `electron/main.mts`
- `src/electron-runtime/service.ts`
- `src/electron-runtime/contracts.ts`
- `src/pages/SettingsPage.tsx`
- `browser-extension/background.js`
- `browser-extension/popup.html`
- `browser-extension/popup.js`
- `browser-extension/popup.css`
- `browser-extension/site-session-cookie-sync.js`
- `.trellis/spec/backend/electron-runtime-contracts.md`

## Rollback Points

- Registry seed/discovery can be tested before UI migration.
- Delete old capture code only after dynamic registry sync works for seeded entries.
- Extension popup UI should be kept minimal to reduce layout risk.
- If full gallery-dl catalog extraction is too large for one edit pass, Phase 5 should still land a maintainable checked-in/generated catalog path, hidden-by-default behavior, and activation tests inside this task rather than becoming a separate follow-up.
- Widen/remove static site-id union gates before the first dynamic-entry test, otherwise registry behavior will be blocked at existing type/runtime boundaries.
