# Refresh Downloader Credentials Implementation Plan

## Likely Files

- `electron/siteSessionManager.mts`
- `electron/siteSessionManager.test.mts`
- `electron/siteSessionCommands.mts`
- `electron/siteSessionCommands.test.mts`
- `src/types/electronBridge.ts`
- `src/pages/SettingsPage.tsx`
- locale files under `locales/` and `browser-extension/locales/` if Settings copy is shared there
- `.trellis/spec/backend/electron-runtime-contracts.md`

## Checklist

1. Read current site-session manager, command controller, Settings site-session UI, and backend site-session spec.
2. Add `refreshCredentials()` to `SiteSessionManager`.
3. Refactor cookie extraction so `confirmCapture()` and `refreshCredentials()` share the same snapshot persistence path while allowing refresh to skip supplemental cookie merge.
4. Ensure refresh failure preserves previous `sessionCache` and saved JSON file.
5. Block/no-op same-site refresh while that site's capture phase is not idle.
6. Add `refresh_site_session_credentials` to typed command union and command controller mapping.
7. Update Settings action typing and busy handling to include `refresh`.
8. Add per-site UI action controls for refresh and clear.
9. Keep badge primary click as start/open capture.
10. Keep confirm/cancel controls tied to the active capture flow.
11. Update localization strings.
12. Update backend spec.
13. Validate:
    - `npm run type-check`
    - `npm run lint`
    - `npm test -- electron/siteSessionManager.test.mts electron/siteSessionCommands.test.mts`
    - targeted frontend tests if an existing SettingsPage test suite covers this area

## Test Plan

- Manager:
  - refresh succeeds from stable partition and writes a new snapshot
  - refresh uses stable partition and does not call `createCaptureWindow`
  - refresh failure with no valid cookies preserves prior saved snapshot and cache
  - refresh failure returns `lastError`
  - refresh does not destroy profile
  - refresh skips supplemental cookies from previous capture windows
  - refresh no-ops while same-site capture is active
- Command controller:
  - `refresh_site_session_credentials` routes to `refreshCredentials()`
  - unsupported site behavior remains unchanged
  - Douyin alias behavior remains unchanged
- UI:
  - per-site refresh action invokes refresh command with that site id
  - per-site clear action invokes clear command with that site id
  - badge click still invokes start command

## Manual QA

- Start Instagram capture, log in, confirm.
- Click refresh credentials for Instagram without opening a login window; verify state updates and downloads still receive saved cookies.
- Clear Instagram directly from its row; verify it no longer needs to be the active capture site.
- Smoke one non-Instagram site for refresh/clear command targeting.

## Explicitly Deferred

- Auth-required automatic refresh.
- Retry failed downloads after refresh.
- Profile-vs-cookie diagnostic status split.
- Site-specific stale-cookie validators.

## External Review Notes

Claude Code reviewed the Phase 2 plan. Adopted must-fix feedback:

- Refresh should not merge supplemental cookies because they are collected during live visible capture request interception and may be stale during a no-window refresh.
- Same-site refresh should be blocked/no-op while that site's capture window is active.
- Add the new command only to the generic site-session command set; do not add a Douyin legacy alias.
- Tests must prove refresh preserves the old snapshot on failure.
