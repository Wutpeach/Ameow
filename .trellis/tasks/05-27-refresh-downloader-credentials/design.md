# Refresh Downloader Credentials Design

## Boundary

This task adds an explicit manual refresh path and per-site actions. It does not add automatic refresh/retry after download failures.

## Backend Contract

Add a generic renderer command:

```ts
"refresh_site_session_credentials"
```

Payload remains `{ siteId }`, matching existing generic site-session commands.

The command should call a new `SiteSessionManager.refreshCredentials()` method.

## Manager Design

`electron/siteSessionManager.mts` already has the extraction/persistence logic in `finalizeCaptureSuccess(partition)`. Refactor only as needed so both flows use the same implementation:

- `confirmCapture()` extracts from the active stable partition after the user opens the login window.
- `refreshCredentials()` extracts from `resolveSiteSessionProfilePartition(siteId)` without opening a window.

Refresh behavior:

- If the same site's capture window is active, return current state without rewriting credentials.
- On success, overwrite the downloader credential snapshot and clear `lastError`.
- On failure, set `lastError` and return current state.
- On failure, keep the prior `sessionCache` and existing JSON file intact.
- Do not destroy the stable profile.
- Do not create a capture window or alter `capturePhase` beyond returning current state.
- Do not merge supplemental cookies during refresh. Supplemental cookies are collected from live request interception during a visible capture session; without a live window they can be stale. Refresh should snapshot cookie-jar cookies only.

Same-site refresh should be blocked while a capture window is active. Different-site refresh can remain allowed because managers are site-scoped.

## UI Design

The current site badges are compact and start capture on click. This task should add direct per-site actions without a broad page redesign.

Recommended MVP interaction:

- Keep the badge primary click as "open site login/profile window".
- Add compact icon buttons or small actions per site for:
  - refresh downloader credentials
  - clear this site login
- Keep the global confirm/cancel buttons for the active capture flow, because confirmation is still tied to an open browser window.

Avoid a large action menu if a direct row action layout is simpler and consistent with existing settings density. If spacing is tight, use icon buttons with accessible titles/tooltips and localized labels.

## State And Copy

Use existing `SiteSessionState` for the returned state. No new state fields are required for MVP.

The UI should distinguish at least these busy actions internally:

- starting capture
- confirming capture
- cancelling capture
- refreshing credentials
- clearing a site

Localized copy should avoid implying a full account login refresh. Preferred language:

- English: "Refresh credentials"
- Chinese: "刷新凭据" or "刷新下载凭据"

## Compatibility

- Existing Douyin alias commands remain unchanged.
- Do not add a Douyin legacy alias for refresh; new refresh behavior is generic only.
- Existing generic commands remain unchanged.
- Saved JSON format remains unchanged.
- `buildExecutionContext(...)` continues reading `getDownloadCookies()`.

## Future Extension

This refresh method is the backend primitive Phase 3 can reuse when an `auth_required` download failure occurs. Phase 3 should add retry guards and download event UX rather than changing the extraction rules again.

## Risks

- Refreshing without an open window may fail if the stable profile has expired cookies; this must not erase previously working saved credentials.
- Merging stale supplemental cookies could make refresh look fresher than it is, especially for Douyin-style supplemental tokens. Skip supplemental merge for refresh.
- Adding per-site actions can crowd the settings card. Keep controls compact and do not redesign the whole page in this task.
- Refresh and clear must target the selected site, not the active capture fallback.
