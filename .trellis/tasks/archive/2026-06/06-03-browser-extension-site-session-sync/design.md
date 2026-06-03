# Design: Browser Extension Site Session Sync

## Boundary

The feature is a Settings-owned site-session capture path. The browser extension is an acquisition backend for a user-directed sync, not a generic downloader cookie provider.

## Current Architecture

- Settings invokes Electron commands for site-session state and capture.
- Electron main owns `SiteSessionManager` instances and persisted snapshots.
- Browser extension communicates with Electron over loopback WebSocket.
- Browser extension can read cookies through `chrome.cookies.getAll(...)`.
- Browser extension already converts cookies into Netscape cookie format, but that helper currently lives in `background.js`.

## Proposed Architecture

Add an extension-backed sync path for `youtube`:

1. Settings user clicks a YouTube sync/login action.
2. Desktop sends a request to connected extension clients through the existing extension request bridge.
3. Extension validates the site request against a local supported-site whitelist.
4. Extension reads cookies for YouTube's allowed domains, filters/deduplicates them, and returns structured cookie records plus source/profile metadata.
5. Desktop validates the response against the server-side site config.
6. `SiteSessionManager` persists an imported snapshot in the same shape as existing Electron capture snapshots.
7. Settings refreshes site-session state.
8. Settings shows browser/profile source metadata from the last successful sync when available.

For MVP, if multiple extension clients are connected, the first successful sync response wins. Later duplicate responses for the same request must be ignored by the request bridge and must not overwrite the saved snapshot.

## Data Contract

Suggested request:

```json
{
  "action": "site_session_cookie_sync_request",
  "requestId": "...",
  "siteId": "youtube",
  "cookieDomains": ["youtube.com", "google.com"]
}
```

Suggested response:

```json
{
  "action": "site_session_cookie_sync_result",
  "requestId": "...",
  "siteId": "youtube",
  "source": {
    "browser": "chrome",
    "profileLabel": "Default",
    "extensionId": "..."
  },
  "cookies": [
    {
      "domain": ".youtube.com",
      "expirationDate": 1790000000,
      "httpOnly": true,
      "name": "LOGIN_INFO",
      "path": "/",
      "secure": true,
      "value": "..."
    }
  ]
}
```

The desktop should treat this as untrusted input and rebuild both `cookies` and `cookiesNetscape` itself. It should not accept a prebuilt Netscape string from the extension as authoritative.

The extension request should include `cookieDomains` as an instruction, not as trust material. The extension must have its own site whitelist and the desktop must independently filter response records through `src/site-sessions.ts`.

## Security And Privacy

- Sync is user-initiated from Settings.
- No periodic or silent cookie extraction.
- The extension reads only configured domains for the requested site.
- The desktop filters the received records through `src/site-sessions.ts` allowed domains.
- Unsupported site IDs must be rejected before any cookie read occurs.
- Logs must never include cookie values, raw cookie headers, or prebuilt Netscape content.
- Do not store passwords, localStorage, authorization headers, or arbitrary page data.
- Logs must summarize counts and domains, not cookie values.

## Compatibility

- Existing `site-sessions/youtube.json` consumers should not change.
- Existing browser-extension download requests must not begin attaching generic cookies.
- Existing non-YouTube embedded capture flow should keep working unless explicitly changed.
- YouTube Settings copy should route users to extension sync instead of embedded capture.

## Risks

- Browser extension permissions are sensitive; product copy must explain user-directed sync plainly.
- `google.com` cookies are broad and sensitive. Filtering should be limited to cookies needed for YouTube downloader auth readiness where possible, but first implementation may need to preserve enough cookie records for `yt-dlp`.
- Multiple connected browser extension clients could return different profiles. MVP uses first successful response and shows source/profile metadata; a profile picker is intentionally deferred.
- Some Chrome users may install the extension in a browser/profile where they are not logged into YouTube.
