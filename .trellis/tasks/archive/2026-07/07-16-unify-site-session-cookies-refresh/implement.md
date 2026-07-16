# Implementation Plan: Unified Site-Session Cookies Acquisition And Refresh

## Checklist

1. Remove obsolete main-window pending indicator flow.
   - Remove `siteSessionPendingActions` state, event subscription, computed indicator state, popover styles, and `site-session-pending-indicator` render block from `src/App.tsx`.
   - Remove backend pending-action builder/broadcaster and command handling in `electron/main.mts`.
   - Remove related event/command type entries if they become unused.

2. Remove the global auto-sync setting from product behavior.
   - Remove the Settings UI row and local state for `siteSessionAutoSyncEnabled`.
   - Stop writing `SITE_SESSION_AUTO_SYNC_CONFIG_KEY`.
   - Stop using `resolveSiteSessionAutoSyncEnabled()` to gate download-start refresh.
   - Keep config parsing tolerant of existing stored values.

3. Consolidate persistent cookie sync callers into the scheduler path.
   - Ensure Settings sync uses `sync_site_session_from_extension` and `SiteSessionRefreshScheduler.ensureRefreshed()`.
   - Add or reuse an Electron WS action for extension popup sync, tentatively `site_session_sync_request`, with `{ siteId }`.
   - Change extension popup current-site sync to call that desktop request instead of sending `site_session_cookie_sync_direct` for persistent storage.
   - Remove `site_session_cookie_sync_direct` after no persistent caller needs it.

4. Tighten scheduler eligibility around per-site authorization.
   - Add explicit registry promotion for successful manual sync: non-seeded/auto-discovered entries become `syncAuthorization: "user_enabled"`, `autoSyncAllowed: true`, and include `user_sync`.
   - Pass refresh reason into the raw extension sync/import path.
   - Only manual/user-initiated sync should create `user_sync` authorization.
   - Confirm due checks require existing snapshot or `user_sync`.
   - Ensure download-start refresh follows the same per-site activation rules.
   - Ensure manual user-initiated sync can bypass due checks and establishes `user_sync`.
   - Ensure auto-discovered entries remain visible but not automatically refreshed.

5. Preserve download consumption.
   - Confirm `getDownloadCookies()` still injects app-owned Netscape cookies into the runtime execution context.
   - Confirm `yt-dlp` and `gallery-dl` still receive temporary cookie files and cleanup runs.

6. Update tests.
   - Scheduler eligibility and in-flight behavior.
   - Auto-discovered entry -> manual sync -> promoted to future auto-refresh eligibility.
   - Automated refresh success does not create `user_sync` authorization for a never-manually-synced site.
   - Download-start refresh no longer depends on the global setting.
   - Extension current-tab sync routes through the replacement desktop sync request and canonical refresh.
   - Pending indicator backend/UI cleanup has no stale command/event references.

7. Update docs.
   - Revise cookies/login-state docs to describe per-site first-sync authorization and automatic maintenance.
   - Remove references implying a global automatic cookie sync toggle.
   - Explicitly state that previously synced sites may refresh cookies automatically later, locally, without uploading cookies.
   - Prepare release-facing Chinese copy for the behavior change.

## Validation Commands

- `npm run type-check`
- `npm run lint`
- Relevant focused tests after inspecting package scripts:
  - site-session scheduler tests
  - site-session command tests
  - extension site-session sync tests
  - runtime download cookie tests if touched
- `npm run docs:build` after docs-site pages are changed.

## Risky Files

- `electron/main.mts`
- `electron/siteSessionRefreshScheduler.mts`
- `electron/siteSessionRegistry.mts`
- `electron/extensionRequestBridge.mts`
- `browser-extension/background.js`
- `browser-extension/popup.js`
- `src/pages/SettingsPage.tsx`
- `src/App.tsx`
- `src/types/electronBridge.ts`
- `site/src/content/docs/docs/extension/cookies-and-login.md`
- `site/src/content/docs/en/docs/extension/cookies-and-login.md`

## Rollback Points

- Main-window pending indicator removal can be reverted independently if a visible discovery signal is later required.
- Settings auto-sync UI removal can be reverted independently if a global privacy toggle is reintroduced.
- Extension direct-push removal should happen after canonical popup sync is verified, so the migration can be reviewed at one clear checkpoint.

## Review Gate

Before `task.py start`, review:

- That the implementation scope is accepted as one complex task rather than split into child tasks.
