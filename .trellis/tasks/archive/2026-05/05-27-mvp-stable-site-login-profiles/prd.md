# MVP stable site login profiles

## Goal

Implement Phase 1 of stable site login profiles: replace disposable per-capture site login partitions with deterministic per-site app-owned profiles, while keeping the existing manual confirmation-based downloader cookie snapshot flow.

This MVP should solve the immediate "every capture looks like a new browser" problem, especially for Instagram, without attempting automatic credential refresh yet.

## Parent

Roadmap parent: `05-27-stable-site-login-profiles`

## Confirmed Facts

- Settings starts capture through `start_site_session_capture` with `{ siteId }`.
- `electron/siteSessionManager.mts` currently generates `persist:ameow-site-session-${site.id}-${now()}` for each fresh capture.
- `startCapture()` already prevents a second capture window for the same site when one is active.
- `confirmCapture()` reads cookies from the capture partition and saves `<userDataDir>/site-sessions/<siteId>.json`.
- The current code destroys the capture partition on confirm, cancel, and close.
- `clearSession()` currently removes the saved site-session JSON file.
- Capture hardening already handles UA cleanup, Accept-Language, permission denial, popup/navigation restrictions, and same-site supplemental cookie collection.
- External plan review identified that stable partitions make capture-session configuration idempotency mandatory; repeated `webRequest` listener registration would leak and duplicate supplemental cookie processing.

## Requirements

- Use one deterministic app-owned persistent partition per supported site.
- Keep the stable profile after confirm, cancel, and window close.
- `clear_site_session` must remove both the saved downloader cookie file and the stable site profile.
- Keep command names and renderer click behavior compatible for MVP: clicking a site badge, including a ready/logged-in badge, still opens the same capture window flow, now backed by the stable profile.
- Keep downloader injection based on the saved Netscape cookie snapshot.
- Centralize partition naming/resolution so future phases can add refresh, migration, or diagnostics without duplicating literals.
- Ensure capture-session hardening is applied once per stable partition instead of stacking duplicate listeners across repeated captures.
- Avoid unbounded memory growth: capture windows should release renderer resources when closed, and long-lived session listeners must not accumulate across repeated captures.
- Do not implement automatic refresh/retry in this MVP.
- Do not reuse the user's default browser profile.
- Do not add anti-fingerprint browser features beyond preserving existing UA/language hardening.

## Acceptance Criteria

- [ ] Starting capture for Instagram uses a deterministic site partition, not a timestamped partition.
- [ ] Starting capture for any supported site uses the same deterministic partition across separate capture attempts.
- [ ] Confirming capture closes the window and saves downloader cookies without destroying the stable profile.
- [ ] Canceling capture closes the window without destroying the stable profile.
- [ ] User-closing the capture window clears active capture state without destroying the stable profile.
- [ ] Clearing a site session deletes the saved downloader cookie file and destroys that site's stable profile.
- [ ] Existing saved site-session JSON files continue to load and inject cookies into downloads.
- [ ] Tests cover partition naming, confirm/cancel/close preservation, clear cleanup, and existing cookie capture behavior.
- [ ] Tests or focused code structure cover idempotent capture-session hardening so repeated captures do not register duplicate request listeners for the same partition.
- [ ] Backend spec is updated to document the stable app-owned profile contract.

## Out Of Scope

- Automatic credential refresh from a stable profile.
- Automatic retry after auth-required download failures.
- Separate "refresh downloader credentials" UI.
- Profile diagnostics UI.
- Per-site action menu for view/refresh/clear interactions.
- Full anti-fingerprint browser behavior.
