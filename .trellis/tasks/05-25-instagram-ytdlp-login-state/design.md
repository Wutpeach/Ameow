# Instagram download preference and login state settings design

## Architecture

This task stays inside the existing provider and site-session architecture.

- `src/sites/gallery-dl-supported.ts` remains the owner of Instagram URL normalization because it already resolves accepted Instagram permalinks from extension capture evidence and synthesizes permalinks from shortcode evidence.
- `src/site-sessions.ts` remains the source of truth for supported site login capture definitions.
- `electron/siteSessionManager.mts` continues to capture and persist complete matching-domain cookies as downloader-compatible Netscape cookies.
- `electron/main.mts` continues to inject app-owned downloader cookies by `intent.siteId`; no new IPC or downloader execution path is added.
- `src/pages/SettingsPage.tsx` continues to render site-login badges from `SITE_SESSION_CONFIGS`.

## Download Routing

Instagram stays under `providerId: "gallery-dl-supported"` to preserve existing provider matching and capture-evidence behavior.

The provider will detect the resolved gallery-dl site id for Instagram and build an Instagram-specific engine chain:

```txt
yt-dlp priority 88, when primary, fallbackOn any
gallery-dl priority 52, when fallback, fallbackOn any
```

Other gallery-dl-supported sites keep the existing order:

```txt
gallery-dl priority 88, when primary, fallbackOn any
yt-dlp priority 52, when fallback, fallbackOn any
```

The Instagram `sourceUrl` must remain the normalized permalink chosen by the current logic, not a direct CDN media URL or a feed/explore URL when better capture evidence is available.

## Site ID Normalization

Downloader cookie injection depends on `context.intent.siteId` matching a supported site session id. Direct pasted Instagram URLs currently risk resolving to `instagram.com`, which does not match the desired `SupportedSiteSessionId` value.

The provider layer must normalize Instagram to canonical `siteId: "instagram"` for:

- direct pasted Instagram permalinks with no `siteHint`;
- extension-assisted requests with `siteHint: "instagram"`;
- captured permalink/shortcode flows that start from feed or explore pages.

This is a must-fix compatibility requirement, not just a label change.

## Site Login Capture

Add Instagram to the existing site-session configuration:

```ts
{
  id: "instagram",
  displayName: "Instagram",
  labelKey: "desktop:settings.siteSessions.sites.instagram",
  loginUrl: "https://www.instagram.com/",
  cookieDomains: ["instagram.com"],
  requiredCookieKeys: [],
  loginCookieKeys: ["sessionid"],
}
```

Rationale:

- `requiredCookieKeys: []` matches Instagram public-content behavior and avoids treating visitor-only cookies as mandatory.
- `sessionid` is the primary logged-in session marker.
- `csrftoken` and `mid` are not login markers because visitors may have them.
- All captured matching-domain cookies are still saved and passed to downloaders; the key list only determines Settings readiness.

## Settings UI

The Settings site login page already maps `SITE_SESSION_CONFIGS` into badge rows. Adding Instagram should require only:

- extending `SupportedSiteSessionId`;
- adding the config entry;
- adding an `InstagramLogo` component and export;
- adding an `instagram` entry to `SITE_SESSION_LOGOS`;
- adding localized labels in `locales/en/desktop.json` and `locales/zh-CN/desktop.json`.

No new layout, custom Instagram controls, or new IPC commands should be introduced.

## Compatibility

- Existing saved sessions for current sites remain unchanged.
- No migration is needed because Instagram is a newly supported site-session id.
- Existing non-Instagram gallery-dl-supported site routing must stay unchanged.
- The browser extension may already send `siteHint: "instagram"`; direct pasted URLs must also work without that hint.

## Verification Strategy

Focused automated checks should cover:

- provider routing and canonical `siteId`;
- preservation of Instagram permalink evidence and shortcode synthesis;
- non-Instagram gallery-dl-supported routing order;
- site-session config and runtime guard support for `instagram`;
- site-session manager readiness for captured Instagram cookies;
- renderer type and Settings icon/localization coverage through `type-check` and `lint`.
