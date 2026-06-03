# Browser extension site session sync

## Goal

Let users capture YouTube login state from their normal browser profile through the Ameow browser extension, while keeping Settings as the only user-facing site-session entry point.

This is the follow-up to the failed Electron embedded YouTube login attempt: Google blocks app-controlled login windows with "This browser or app may not be secure", so YouTube should use a user-directed extension sync instead of an app-owned login window.

## MVP Scope

- YouTube only.
- User-initiated sync from Settings, not automatic background scanning.
- Browser extension reads only the configured YouTube cookie domains.
- Desktop app persists the result into the existing `site-sessions/youtube.json` shape.
- Existing download execution continues reading the saved Settings site-session snapshot.
- If multiple extension clients/profiles are connected, MVP uses the first successful response and displays/records source metadata so users can identify the browser/profile used.

## Confirmed Facts

- The extension manifest already grants `cookies` permission and `<all_urls>` host permissions.
- The extension already has `getCookiesForUrl(...)` and `cookiesToNetscape(...)` helpers for request-level flows.
- Existing extension cookie helper returns a prebuilt Netscape string; this task needs a new or variant helper that returns structured raw cookie records so the desktop can validate and rebuild the snapshot.
- The desktop app already exposes a loopback WebSocket used by the extension for `video_selected_v2`, image save, and resolution callbacks.
- The extension request bridge already has a broadcast request / pending response pattern that can be reused, but multiple connected clients may respond from different browser profiles.
- Existing Settings site-session capture stores cookies under `<userDataDir>/site-sessions/<siteId>.json`.
- `siteSessionManager` currently saves snapshots only from an Electron partition cookie jar; it does not yet expose an import/sync method for extension-provided cookies.
- Current backend spec says browser-extension video download payloads must not provide generic downloader cookies as fallback. This task should preserve that rule by making extension cookies update the Settings-owned site-session snapshot instead of bypassing it per download.

## Requirements

- Add a YouTube Settings action that requests browser-extension login-state sync.
- Require explicit user action before reading browser cookies.
- If the extension is disconnected, Settings must show a clear action/error that the Ameow extension must be installed and connected.
- The extension must only read cookies for the requested supported site and its configured cookie domains.
- The extension must reject unsupported site IDs through a hardcoded local whitelist; it must not accept arbitrary URLs/domains from the desktop request.
- The desktop app must validate the requested site ID and must drop any returned cookie whose domain does not match the configured site cookie domains.
- Extension responses must include profile/source metadata sufficient for Settings to show where the login state came from.
- Do not build a profile selector in the MVP.
- The persisted snapshot must be compatible with existing `getDownloadCookies()` and downloader cookie-file execution.
- The implementation must not introduce manual `cookies.txt` import UI.
- The implementation must not silently auto-scan or periodically extract cookies.
- The implementation must not attach extension cookies directly to generic `video_selected_v2` payloads as a downloader fallback.
- Hide YouTube embedded Electron login in the MVP. It is known to fail with Google's embedded-browser block and should not be offered as a fallback.

## Acceptance Criteria

- [ ] From Settings, a user can initiate YouTube login-state sync from the connected browser extension.
- [ ] Extension-side sync reads only YouTube/Google allowed cookies for YouTube.
- [ ] Extension rejects unsupported site sync requests without reading cookies.
- [ ] Desktop receives the cookie snapshot over the existing loopback channel or a deliberate request/response extension bridge.
- [ ] Desktop drops cross-site or malformed cookie records even if the extension returns them.
- [ ] Desktop persists a valid `site-sessions/youtube.json` snapshot with `cookies`, `cookieHeader`, and `cookiesNetscape`.
- [ ] Settings displays or records profile/source metadata from the successful extension sync so users can confirm which browser profile responded.
- [ ] With multiple connected extension clients, the first successful response wins and duplicate later responses do not overwrite the saved snapshot.
- [ ] Settings state updates to `ready` or `partial` according to the existing site-session policy after sync.
- [ ] If no relevant cookies are available, the user sees a non-crashing "not logged in / login in browser first" style error.
- [ ] If the extension is disconnected, the user sees an install/connect prompt instead of an Electron login window failure.
- [ ] Tests cover extension cookie filtering, desktop payload validation, persisted snapshot shape, and Settings command routing.
- [ ] `npm run type-check`, `npm run lint`, and focused tests pass.

## Out Of Scope

- Automatic background cookie extraction.
- Manual cookies import UI.
- Supporting Bilibili, Douyin, Xiaohongshu, Instagram, or other sites in the first implementation.
- Reading browser cookie databases directly from the desktop app.
- Launching or controlling the user's browser profile directly.
- Solving Safari/Firefox extension support.
- Browser profile/client picker UI.

## Open Questions

- None blocking planning. The MVP should hide YouTube embedded Electron login and route YouTube through user-initiated extension sync.
