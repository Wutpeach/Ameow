# Auth Failure Assisted Credential Refresh

## Goal

When a download fails because saved site credentials look expired, Ameow should use the app-owned stable browser profile to refresh the downloader credential snapshot and retry the same download once. This should reduce manual re-login work while preserving the current explicit site-login model.

## User Value

- A user who has already logged into a supported site through Settings should not need to manually press Refresh every time the saved downloader cookie snapshot expires.
- If the stable profile is also expired, the app should fail predictably and leave the user on the existing manual login/refresh path instead of looping or opening surprise windows.

## Confirmed Facts

- Download failures are already classified as `auth_required` when engines throw `E_AUTH_REQUIRED` or messages/context match login, cookie, auth, 403, or forbidden patterns.
- Phase 1 created stable app-owned Electron profiles with partitions like `persist:ameow-site-session-<siteId>`.
- Phase 2 added `SiteSessionManager.refreshCredentials()`, which re-reads the stable profile cookie jar and rewrites the downloader cookie snapshot without opening a login window.
- `refreshCredentials()` intentionally skips stale supplemental cookies and preserves the prior snapshot when refresh fails.
- Download execution currently injects app-owned Netscape cookies through `buildExecutionContext(...)` when `context.intent.siteId` has a saved site session.
- The orchestrator currently stops the engine chain for `auth_required` failures; retry behavior belongs above or around orchestration, not in cross-engine fallback rules.

## Requirements

- Detect `auth_required` failures from a download task after the normal engine/orchestrator attempt fails.
- For supported site-login IDs only, attempt one silent credential refresh from the stable app-owned profile.
- Retry the same queued download at most once after a successful refresh result that leaves the site session `availability` as `ready` or `partial`.
- The retry must rebuild the engine execution context so the downloader receives the latest saved Netscape cookie snapshot.
- Refresh/retry must not open a site login window and must not reuse the user's default browser profile.
- Refresh/retry must not run for cancelled downloads, input errors, unsupported sites, missing `siteId`, non-auth failures, or while the same site's capture flow is active.
- If refresh fails, remains `missing`, or the retry also fails, emit one final `video-download-complete` failure for the original trace and leave the user on the existing manual site-login path.
- Preserve existing queue semantics, output stem reservation, telemetry, transcode follow-up, and complete-event guarantees.
- Add logging/telemetry-visible detail sufficient to diagnose whether a failure was initial auth failure, refresh skipped/failed, or retry failed.

## Acceptance Criteria

- [ ] A supported-site download whose first attempt fails with `auth_required` calls the site credential refresh hook once and then executes the engine again with refreshed cookies.
- [ ] A successful retry emits one success `video-download-complete` event for the original trace and does not emit an intermediate failure completion.
- [ ] If refresh is unavailable, returns `missing`, throws, or the retry fails, the task emits exactly one final failure completion and does not loop.
- [ ] Cancelled, `input_invalid`, unsupported-site, and generic non-auth failures do not call credential refresh.
- [ ] Existing manual Settings capture, refresh, clear, and cookie injection behavior stays unchanged.
- [ ] Focused tests cover success retry, refresh skip/failure, retry failure guard, and non-auth/no-site no-op cases.

## Out Of Scope

- Opening a login browser window automatically after a failed silent refresh.
- Adding new anti-fingerprint, proxy, captcha, or platform-security bypass behavior.
- Site-specific cookie validation policies beyond the existing `SiteSessionManager` readiness state.
- Redesigning Settings site-login UI; manual per-site controls already exist from Phase 2.
