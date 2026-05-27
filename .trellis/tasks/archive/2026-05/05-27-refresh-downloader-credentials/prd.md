# Refresh downloader credentials from stable profile

## Goal

Implement Phase 2 of stable site login profiles: let users refresh a site's downloader cookie snapshot from the already-stable app-owned browser profile, and give each site explicit actions for opening, refreshing, and clearing login data.

Phase 1 made the app preserve one stable profile per site. Phase 2 should use that foundation to separate "open the login browser" from "refresh the downloader credentials", so users do not need to re-open or re-login just to rewrite the downloader cookie file when the profile already has valid cookies.

## Parent

Roadmap parent: `05-27-stable-site-login-profiles`

## Confirmed Facts

- Phase 1 commit `c58bc3a` introduced deterministic site partitions: `persist:ameow-site-session-<siteId>`.
- `electron/siteSessionManager.mts` already has the core cookie extraction path in `finalizeCaptureSuccess(partition)`.
- `confirmCapture()` currently uses the same extraction path after a visible capture window is open.
- The saved downloader credential snapshot remains `<userDataDir>/site-sessions/<siteId>.json` with a Netscape cookie string.
- Settings currently invokes one generic action handler for `start`, `confirm`, `cancel`, and `clear`.
- Settings currently renders site badges that start capture on click.
- The current "Clear" button only targets the active capture site, so users cannot clearly clear an arbitrary ready/missing site without first opening capture.
- Download failure classification already has `auth_required`, but automatic refresh/retry is Phase 3 and out of scope here.

## Requirements

- Add an explicit refresh operation that re-reads cookies from a site's stable profile partition and rewrites the downloader credential snapshot.
- Refresh must not open a new login window.
- Refresh must not clear the stable profile.
- Refresh must use the same site cookie-domain filtering, required/login cookie rules, and Netscape cookie generation as manual capture confirmation.
- Refresh must not merge stale supplemental cookies collected during a previous visible capture window; without a live capture window, refresh should snapshot Chromium cookie-jar cookies only.
- Refresh failure must not delete the previous saved credential snapshot.
- Refresh for a site with an active capture window should be blocked/no-op and return the current state, because mid-login cookies are not trustworthy.
- Settings must expose per-site actions for:
  - Open / login / view the stable profile window.
  - Refresh downloader credentials from the stable profile.
  - Clear that specific site's saved credential snapshot and stable profile.
- Keep current command names compatible; add a new generic site-session command rather than site-specific commands.
- Do not implement automatic auth-failure refresh or retry in this task.
- Do not add broad profile diagnostics, proxy/fingerprint controls, or reuse of the user's default browser profile.

## Acceptance Criteria

- [ ] Renderer can invoke a new generic refresh command with `{ siteId }`.
- [ ] Refresh from a stable profile with valid site cookies updates `<userDataDir>/site-sessions/<siteId>.json` and returns a ready/partial/missing state consistent with site rules.
- [ ] Refresh with no valid site cookies returns an error state while preserving any previously saved downloader credential snapshot.
- [ ] Refresh does not create a capture window.
- [ ] Refresh does not destroy or clear the stable profile.
- [ ] Refresh while the same site's capture window is active does not rewrite credentials.
- [ ] Per-site UI allows clearing any listed site directly, not only the currently active capture site.
- [ ] Per-site UI allows refreshing any listed site directly.
- [ ] Existing start/confirm/cancel/clear command behavior remains compatible.
- [ ] Tests cover command routing, manager refresh behavior, preservation of previous snapshot on refresh failure, and per-site UI action wiring where practical.
- [ ] Backend spec is updated to document the refresh credential command and behavior.

## Out Of Scope

- Automatic refresh after `auth_required` download failures.
- Automatic download retry after refresh.
- Stale-cookie detection before a download starts.
- Profile size diagnostics.
- Site-specific custom refresh policies beyond existing cookie key rules.
- Full redesign of the Settings site-login page beyond the minimal per-site actions required by this task.
