# Instagram download preference and login state settings

## Goal

Improve Instagram video download reliability by routing Instagram through `yt-dlp` first while keeping `gallery-dl` as a fallback, and expose Instagram in the existing Settings site-login capture UI so saved cookies can be reused by backend downloaders.

## Confirmed Facts

- Instagram currently routes through `src/sites/gallery-dl-supported.ts`.
- The current Instagram engine order is `gallery-dl` primary and `yt-dlp` fallback.
- `DownloadOrchestrator` sorts engine plans by priority descending, so the provider priorities define runtime order.
- Existing site-session capture is centralized in `src/site-sessions.ts`, `electron/siteSessionManager.mts`, and the Settings site badges.
- Site-session capture stores all matching-domain cookies as a Netscape cookie string; `requiredCookieKeys` and `loginCookieKeys` only affect UI readiness.
- Downloader execution injects saved cookies by matching `context.intent.siteId` to a supported site-session id.
- Direct Instagram URLs can currently resolve `intent.siteId` as `instagram.com`; this would not match a saved `instagram` site session.
- Claude second-opinion review agreed that `siteId` normalization is a must-fix item and that `requiredCookieKeys: []` with `loginCookieKeys` containing `sessionid` is a sound Instagram baseline.

## Requirements

- Instagram downloads must try `yt-dlp` before `gallery-dl`.
- `gallery-dl` must remain available as the fallback for Instagram extraction failures.
- Existing Instagram source URL normalization from extension capture evidence must keep working:
  - accepted permalink evidence wins when present;
  - shortcode evidence can synthesize a `/p/`, `/reel/`, or `/tv/` permalink;
  - feed/explore page URLs should not replace a better captured permalink.
- Instagram download intents must use canonical `siteId: "instagram"` for both direct pasted URLs and extension-assisted requests so app-owned cookies can be injected reliably.
- Settings > Site login states must include Instagram using the same badge, capture, confirm, cancel, clear, and status behavior as the other supported sites.
- Instagram login capture must save all cookies for `instagram.com` as downloader-compatible Netscape cookies.
- Instagram readiness should treat captured `sessionid` as the primary login marker and should not require visitor-only cookies such as `csrftoken` or `mid`.
- Existing non-Instagram gallery-dl-supported sites must keep their current engine order and behavior unless explicitly covered by this task.

## Acceptance Criteria

- [ ] Resolving an Instagram permalink with no `siteHint` yields `providerId: "gallery-dl-supported"`, `intent.siteId: "instagram"`, and engine order `["yt-dlp", "gallery-dl"]`.
- [ ] Resolving an Instagram request with `siteHint: "instagram"` yields the same canonical site id and engine order.
- [ ] Existing Instagram permalink evidence and shortcode synthesis tests continue to pass with the new engine order and canonical site id.
- [ ] A representative non-Instagram gallery-dl-supported URL still resolves to `["gallery-dl", "yt-dlp"]`.
- [ ] `SupportedSiteSessionId` includes `instagram`, and `getSiteSessionConfig("instagram")` returns the expected login URL, cookie domains, and login marker keys.
- [ ] The Settings site-login badge list renders Instagram with localized labels and an icon mapping.
- [ ] Site-session manager tests cover Instagram readiness: captured `sessionid` marks the session ready, while no matching Instagram cookies remains missing.
- [ ] Type-check, lint, and focused tests for providers and site sessions pass.

## Notes

- Do not introduce Instagram-specific IPC commands; reuse the existing site-session command surface.
- Do not read browser-extension cookies for generic Instagram downloads; Settings-owned site sessions remain the cookie source for backend downloader execution.
