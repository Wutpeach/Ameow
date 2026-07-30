## Scenario: Electron Proxy Resolution Contract

_Part 3 of 4._

#### Browser Extension WebSocket Contract

- Fixed bind target:
  - host: `127.0.0.1`
  - port: `39527`
- Request envelope:
  - top-level `action: string`
  - optional `data: object`
- Response envelope:
  - `success: boolean`
  - `message?: string | null`
  - `data?: object | null`
- Correlation contract:
  - if the request includes `data.requestId`, the response must echo `data.requestId`
  - failure responses participating in request correlation must include `data.code`
- Inbound actions to preserve:
  - `ping`
  - `get_theme`
  - `get_language`
  - `sync_download_preferences`
  - `save_image`
  - `save_data_url`
  - `pasted_video_selection_result`
  - `site_session_cookie_sync_result`
  - `protected_image_resolution_result`
  - `video_selected_v2`
- Outbound actions to preserve:
  - `request_download_preferences`
  - `resolve_pasted_video_selection`
  - `site_session_cookie_sync_request`
  - `theme_info`
  - `theme_changed`
  - `language_info`
  - `language_changed`
  - `start_picker`
  - `stop_picker`
  - `resolve_protected_image`
- `video_selected_v2` payload fields to preserve:
  - `url`
  - `pageUrl`
  - `title`
  - `videoUrl`
  - `videoCandidates`
  - `selectionScope`
  - `clipStartSec`
  - `clipEndSec`
  - `ytdlpQualityPreference`
  - `cookies`
  - `requestId`
- `site_session_cookie_sync_request` is a Settings-owned site-session acquisition path, not a download-payload cookie fallback:
  - desktop request data: `{ requestId, siteId, cookieDomains }`
  - extension result data: `{ correlationRequestId, success, siteId, source?, cookies, code?, error? }`
  - supported MVP site id: `youtube`
  - extension must reject unsupported site ids through a local hardcoded whitelist before any `chrome.cookies.getAll(...)` call
  - extension may use desktop-provided `cookieDomains` as request context only; it must read from its own whitelist such as YouTube's `youtube.com` and `google.com`
  - extension must return structured cookie records (`domain`, `expirationDate`, `httpOnly`, `name`, `path`, `secure`, `value`) rather than an authoritative Netscape string
  - desktop must treat the response as untrusted input, validate `siteId`, filter cookie domains through `src/site-sessions.ts`, and rebuild the saved cookie header/Netscape snapshot itself
  - multiple connected extension clients are allowed; the first successful response wins, failed responses are ignored until all connected clients fail, and later duplicate responses for a completed request return `unknown_correlation_request`
  - logs must never include cookie values, cookie headers, or Netscape cookie content
- `resolve_xiaohongshu_drag_media` renderer command contract:
  - request fields:
    - `url`
    - `pageUrl?`
    - `detailUrl?`
    - `sourcePageUrl?`
    - `token?`
    - `noteId?`
    - `imageUrl?`
    - `mediaType?`
    - `videoIntentConfidence?`
    - `videoIntentSources?`
    - `cookies?`
  - response shape:
    - `kind: "video" | "image" | "unknown"`
    - `pageUrl`
    - `detailUrl?`
    - `sourcePageUrl?`
    - `imageUrl`
    - `videoUrl`
    - `videoCandidates`
    - `videoIntentConfidence?`
    - `videoIntentSources?`
  - if extension-side or desktop fallback resolution returns `videoUrl` / `videoCandidates`, Electron main must preserve those fields in the renderer response instead of replacing them with `null` / `[]`.
  - when the renderer queues a Xiaohongshu video after `resolve_xiaohongshu_drag_media`, it must forward preserved `videoUrl` / `videoCandidates` as runtime hints while keeping the canonical note URL in `url` / `pageUrl` for yt-dlp routing.
- `save_image` payload fields to preserve when the extension asks Electron main to perform an authenticated protected-image download:
  - `url`
  - `targetDir?`
  - `originalFilename?`
  - `requestHeaders?`
  - `referrer?`
- Extension-side image-only page buttons may also reuse the same `save_image` websocket action when the page has no verified video asset. Do not add a parallel Electron websocket action just for "image note" variants when the existing `save_image` contract already covers authenticated image fetch.
- Generic browser-extension media triggers may normalize into either `video_selected_v2` or `save_image`; do not add a third Electron websocket action just for right-click or popup-triggered "current media" requests.
- Extension-internal trigger messages for the generic browser-entry layer must stay inside the extension boundary:
  - `download_current_video`
  - `ameow_resolve_video_selection`
  - `ameow_resolve_pasted_video_selection`
  - `resolve_xiaohongshu_context_media`
  - `save_image_from_page`
- `queue_pasted_video_download` renderer command contract:
  - request fields:
    - `url`
    - `pageUrl?`
    - `siteHint?`
  - behavior:
    - Electron main must try extension-assisted pasted selection first for supported site hints before falling back to the plain `queue_video_download` path.
    - Current supported extension-assisted pasted site hints:
      - `bilibili`
      - `douyin`
      - `youtube`
      - `twitter-x`
      - `pinterest`
      - `xiaohongshu`
    - When extension-assisted resolution succeeds, the final queued payload must be normalized through the same `video_selected_v2` forwarding path used by injected-button downloads so `pageUrl`, `selectionScope`, `clipStartSec`, `clipEndSec`, `extensionData`, and cookie policy stay aligned.
- Right-click/current-media title contract:
  - Feed/profile/list pages must not fallback from a missing card-local title to `document.title` before sending `video_selected_v2`.
  - A title may be forwarded only when it was recovered from the local card/dialog/article subtree that produced the media request.
  - When no scoped title exists, the extension should omit `title` and let runtime naming fall back to canonical page URL / note id / downstream metadata.
- Xiaohongshu right-click precision contract:
  - `browser-extension/xiaohongshu-detector.js` right-click scoping must prefer the smallest visible single-note container around the clicked anchor.
  - Scope expansion must stop before a parent container that contains multiple note URLs, otherwise image/video resolution can drift to an adjacent card.
- Xiaohongshu drag token/detail contract:
  - `browser-extension/xiaohongshu-page-bridge.js` is a page-world bridge that must stay listed in MV3 `web_accessible_resources`.
  - `browser-extension/xiaohongshu-contextmenu-guard.js` must inject that bridge at `document_start`, listen for `AMEOW_XIAOHONGSHU_NOTE_LINKS`, and persist the latest `noteId -> { detailUrl, xsecToken, xsecSource }` cache for later content-script reads.
  - `browser-extension/xiaohongshu-detector.js` drag/context payloads must prefer a cached tokenized `detailUrl` over bare `/explore/<noteId>` links or profile-note URLs.
  - `electron/main.mts` must forward `detailUrl` end-to-end when requesting extension-side drag resolution.
  - Tokenized `detailUrl` is a higher-trust canonical hint than drag-time cover image hints. If `detailUrl` contains `xsec_token`, desktop fallback must continue note-aware resolution before finalizing an image download.
- Xiaohongshu video routing contract:
  - Video downloads must enqueue a yt-dlp-compatible note URL, not a direct `xhscdn` URL or extracted m3u8/mp4 candidate.
  - Valid yt-dlp sources are `https://www.xiaohongshu.com/explore/<hexId>` and `https://www.xiaohongshu.com/discovery/item/<hexId>` with optional query parameters.
  - If a canonical note URL already carries `xsec_token` query parameters, provider-side canonicalization must preserve them instead of stripping the URL back to a bare `/explore/<hexId>`.
  - Tokenized `discovery/item/<hexId>?xsec_token=...` detail URLs are preferred when already available.
  - Profile-note URLs must normalize to `/explore/<hexId>` before provider execution.
  - The generic runtime queue must not fetch Xiaohongshu pages/API responses only to discover direct video candidates before provider resolution.
- `requestHeaders` for `save_image` are an Electron-owned allowlist contract:
  - allowed keys: `Accept`, `Cookie`, `Origin`, `Referer`, `User-Agent`
  - all other extension-supplied header keys must be ignored before main-process fetch
- Xiaohongshu protected-image desktop fetch contract:
  - bare CDN-host roots such as `https://sns-webpic-qc.xhscdn.com/` are invalid image targets and must be rejected before download/fallback fetch attempts
  - for `xhscdn` image requests whose page/referrer host is `xiaohongshu.com` or `xhslink.com`, Electron main should prefer `Origin: https://www.xiaohongshu.com` with `referrer: ""` / `referrerPolicy: "no-referrer"` on the Chromium-session fetch path instead of forcing a note-page referrer that Chromium can reject as invalid
- Twitter/X image drag contract:
  - renderer-side page context for X image drags must canonicalize `https://x.com/<user>/status/<id>/photo/<n>` back to `https://x.com/<user>/status/<id>` before passing `pageUrl` into `download_image`
  - deterministic `pbs.twimg.com/media/...?...&name=<variant>` image URLs should upgrade to `name=orig` before generic `maxurl` probing so the image path does not depend on extractor heuristics
  - for `pbs.twimg.com` image requests whose page/referrer host is `x.com` or `twitter.com`, Electron main must not force a full page `Referer` or `Origin` header on the Chromium-session fetch path because Chromium may reject even the canonical status URL as an invalid referrer for image fetches
  - if Chromium-session fetch still fails for a public X image request, Electron main may fall back to a plain Node `http/https` request using the sanitized header set rather than the browser session referrer contract
- Protected-image fallback order is part of the transport contract:
  1. renderer `download_image`
  2. Electron direct download
  3. extension `resolve_protected_image`
  4. content-script local export
  5. page bridge fetch
  6. extension background fetch
  7. authenticated Electron `save_image` with forwarded `requestHeaders` / `referrer`
  8. extension reports `protected_image_resolution_result`
- The page-bridge asset `browser-extension/protected-image-page-bridge.js` must stay listed in MV3 `web_accessible_resources`; otherwise CSP-protected sites can break the protected-image fallback before step 5.

Validation and error matrix:

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Site CSP blocks inline bridge injection | MV3 content script + manifest | Page bridge still loads from `chrome.runtime.getURL(...)` | Keep `protected-image-page-bridge.js` in `web_accessible_resources` |
| Content script and page bridge both fail to read bytes | `browser-extension/background.js` fallback chain | Extension tries background fetch, then authenticated `save_image` | Report only the final correlated result back to Electron |
| Extension button targets an image-only page/note | `browser-extension/*-detector.js` -> `background.js` -> `electron/main.mts` | Extension skips `video_selected_v2` and maps directly to `save_image` with page-derived `referrer`/headers | Reuse existing `save_image` action instead of inventing a new Electron websocket contract |
| Browser right-click hits an image resource or an image-only note | `browser-extension/background.js` context-menu path | Extension routes to `save_image` instead of forcing the selection through `video_selected_v2` | Reuse `save_image_from_page` / `save_image`; do not invoke video runtimes for image-only targets |
| Xiaohongshu homepage/feed right-click starts on one note card while the nearest large parent contains multiple cards | `browser-extension/xiaohongshu-detector.js` scope resolution | Resolved image/video belongs to the clicked card only | Stop scope expansion before the first multi-note parent |
| Xiaohongshu feed/profile page has no scoped card title | `browser-extension/xiaohongshu-detector.js` -> `background.js` -> `src/electron-runtime/service.ts` | Request omits `title`, so runtime naming falls back to canonical URL/id instead of page title pollution | Never fallback to feed/profile `document.title` for right-click naming |
| Xiaohongshu drag payload initially says `mediaType: "image"` but bridge cache later exposes a tokenized `detailUrl` plus medium/high video intent | `browser-extension/xiaohongshu-detector.js` -> `background.js` -> `electron/main.mts` | Desktop still treats the note as video-eligible and queues the canonical note URL instead of finalizing the cover image immediately | Let tokenized `detailUrl` + confidence override the earlier weak image guess |
| Dragged Xiaohongshu card payload exposes only a note page URL plus an ambiguous cover image | renderer `resolve_xiaohongshu_drag_media` -> Electron main -> runtime page fetch | Desktop resolves the note page to canonical media before deciding image vs video | Prefer canonical page media over card-cover heuristics; tokenized `detailUrl` is the preferred canonical page hint |
| Extension-side Xiaohongshu drag resolution returns a direct `videoUrl` and candidates | `electron/main.mts` -> renderer queue payload | Response and queued request preserve the media hints; provider still executes the canonical note URL | Normalize response through a tested helper and forward hints from renderer queueing |
| Xiaohongshu image drag resolves to a bare `xhscdn` host root or Chromium rejects the note page as an invalid referrer | renderer `download_image` -> `electron/main.mts` protected-image fetch | Desktop must reject the bare root as invalid and, for real Xiaohongshu CDN image requests, avoid a note-page referrer that Chromium blocks | Filter CDN roots before image selection; use origin-only Xiaohongshu headers plus `no-referrer` session fetch fallback |
| X image drag comes from an overlay page like `/status/<id>/photo/1` | renderer image drop parsing -> `download_image` | Desktop image download receives the canonical status permalink instead of the overlay URL | Canonicalize X overlay URLs before forwarding `pageUrl` |
| `pbs.twimg.com` request is valid but Chromium rejects the X status referrer as invalid | `electron/main.mts` image download fetch | Desktop still attempts the image download without forcing a referrer contract that Chromium blocks | Drop `Referer`/`Origin` for public X image requests and keep a non-session HTTP fallback |
| X dragged image URL is a low-resolution `name=small` / `name=medium` variant | renderer `upgradeImageUrl` | Download path upgrades to `name=orig` before fetch | Prefer deterministic `pbs.twimg.com` variant rewriting ahead of generic `maxurl` |
| Xiaohongshu page bridge asset is omitted from MV3 resources or not injected at `document_start` | `browser-extension/manifest.json` + `xiaohongshu-contextmenu-guard.js` | Feed/profile API responses are missed, so `detailUrl` stays bare or null and video drag fallback regresses | Keep `xiaohongshu-page-bridge.js` in `web_accessible_resources` and inject it before page feed requests fire |
| Bare Xiaohongshu CDN MP4 enters the generic video queue without a note URL | `src/sites/xiaohongshu.ts` provider routing | The Xiaohongshu provider must not claim it solely from the CDN host; generic fallback may handle it as an ordinary URL | Require a canonical note URL or explicit Xiaohongshu note context before using the Xiaohongshu provider |
| Extension sends unexpected request header names | `electron/main.mts` `save_image` path | Main process drops unapproved headers before fetch | Restrict to the allowlist |
| Authenticated desktop download succeeds after browser-context failure | `protected_image_resolution_result` correlation | Original `download_image` call resolves with the saved path instead of timing out | Resolve the pending protected-image request once |

Good / Base / Bad cases:
- Good:
  - Weibo protected-image drag fails canvas export and browser-context fetches, then succeeds through authenticated `save_image` with forwarded cookies and referrer.
  - Dragging an image from `https://x.com/<user>/status/<id>/photo/1` downloads the `pbs.twimg.com` asset through the image path using the canonical status permalink, not the overlay URL.
  - Right-clicking a Xiaohongshu feed card resolves one local note URL, routes image-only notes to `save_image`, routes video notes to `video_selected_v2`, and either keeps a scoped card title or omits `title` entirely.
- Base:
  - Public image download still uses the normal `download_image` path with no `save_image` metadata.
  - An image-only site button may reuse `save_image` as long as the extension still preserves the existing payload fields and request correlation semantics.
  - Generic context-menu and popup triggers may stay extension-internal as long as they eventually normalize into either `video_selected_v2` or `save_image`.
  - Ambiguous Xiaohongshu drag payloads may defer final classification to `resolve_xiaohongshu_drag_media`, which may upgrade cover-image hints into a video queue decision when a tokenized `detailUrl` and video intent are present.
  - Xiaohongshu homepage card drag may remain image-only only when no scoped video signal, no tokenized `detailUrl`, and no medium/high video intent were recovered.
- Bad:
  - Extension forwards arbitrary header names to Electron main.
  - Renderer forwards `https://x.com/<user>/status/<id>/photo/1` as the final X image `pageUrl`, causing Chromium referrer validation to reject the request path.
  - Electron main forces a full X/Twitter `Referer` onto `pbs.twimg.com` image fetches even after Chromium has proven that referrer invalid for the request.
  - Image-only notes are forced through `video_selected_v2`, causing the runtime to invoke `yt-dlp` on a page with no video formats.
  - A generic right-click/current-media trigger falls back to `document.title` from a feed/profile page and pollutes output naming for an otherwise precise card-scoped request.
  - Xiaohongshu right-click scoping expands into a multi-card parent and resolves media from an adjacent note instead of the clicked card.
  - Renderer trusts the dragged cover image as the source of truth for Xiaohongshu cards without first checking whether the note page actually resolves to video.
  - Renderer or Electron downloads a Xiaohongshu cover image while a tokenized `detailUrl` and medium/high video intent are still available for yt-dlp note routing.
  - A previous Xiaohongshu detail-view video pollutes a later homepage card drag because re-resolution trusted document-wide `performance` or script signals without card-local scope or note-linked `detailUrl`.
  - Electron main changes the protected-image action names or payload keys without updating this contract in the same task.

Required tests and assertion points:
- Browser-extension checks:
  - Right-click a Xiaohongshu image-only homepage card and assert the request routes to `save_image` instead of `video_selected_v2`.
  - Right-click a Xiaohongshu video homepage card and assert the resolved `pageUrl` belongs to the clicked note instead of a sibling card or parent feed/profile URL.
  - Right-click a Xiaohongshu homepage card with no reliable card-local title and assert the forwarded request omits `title`.
- Regression checks:
  - Keep the existing Xiaohongshu drag-resolution checks proving that document-global stale media alone cannot upgrade an image card to video.
  - Add/keep checks proving that a cached tokenized `detailUrl` survives drag payload parsing and reaches Electron `resolve_xiaohongshu_drag_media`.
  - Add/keep checks proving that `resolve_xiaohongshu_drag_media` preserves extension-resolved `videoUrl` and `videoCandidates`, and renderer queueing forwards them as hints.
  - Add/keep checks proving that bare `xhscdn` host roots are rejected as image hints in renderer/runtime parsing.
  - Add/keep checks proving that Xiaohongshu protected-image desktop fetch uses the origin-only / no-referrer fallback instead of a note-page referrer on the Chromium session path.
  - Add/keep checks proving that video queue URL normalization preserves valid downloader-owned page URL variants such as X `/photo/<n>` overlays.
  - Add/keep checks proving that X `pbs.twimg.com` image URLs upgrade to `name=orig` before generic `maxurl` probing.
  - Manually verify a Xiaohongshu waterfall video drag still queues the canonical note URL when the extension result returns only `kind: "image"` plus a tokenized `detailUrl` and medium video intent.
  - Manually drag a real X image and verify the app shows a loading indicator during transfer, then settles into a short success state only after the file is written.
  - Reload the extension after manifest/background changes and assert the generic context-menu entry still appears for supported `video`, `image`, `link`, `page`, and `frame` contexts.

#### Config Compatibility Contract

- Config file path:
  - keep effective file name `settings.json` under the current app config directory
  - current Electron runtime leaves `migrateLegacyConfigIfNeeded()` as a no-op; do not assume automatic legacy config migration unless it is reintroduced in code and updated here in the same task
- String transport contract:
  - `get_config` returns raw JSON string
  - `save_config` accepts raw JSON string payload
- Compatibility-critical keys:

| Key | Status | Contract |
|-----|--------|----------|
| `outputPath` | Canonical | Preserve exact key and current fallback to `<Desktop>/Ameow_Received` when absent. |
| `theme` | Canonical | Preserve `black` / `white`. |
| `language` | Canonical | Preserve `en` / `zh-CN`; normalize language variants on read. |
| `shortcut` | Canonical | Preserve current accelerator string semantics. |
| `renameMediaOnDownload` | Canonical | Keep as primary rename-toggle key. |
| `videoKeepOriginalName` | Legacy inverse key | Continue reading/writing until a dedicated cleanup migration removes it. |
| `renameRulePreset` | Canonical | Preserve `desc_number`, `asc_number`, `prefix_number`. |
| `renamePrefix` | Canonical | Preserve string semantics. |
| `renameSuffix` | Canonical | Preserve string semantics. |
| `defaultVideoDownloadQuality` | Canonical | Preserve as current desktop/extension quality preference key. |
| `ytdlpQualityPreference` | Legacy fallback | Continue tolerating as legacy fallback during migration. |
| `aeFriendlyConversionEnabled` | Canonical | Preserve current bool semantics. |
| `aePortalEnabled` | Canonical | Preserve current bool semantics. |
| `aeExePath` | Canonical | Preserve current string semantics. |
| `devMode` | Canonical | Preserve current bool semantics for devtools gating. |
| `clipDownloadMode` | Legacy ignored key | Continue tolerating existing values on read; do not surface or reuse them as clip-download behavior. |

- Non-config state that must stay runtime-owned:
  - autostart
  - updater/install state
  - tray/menu state
  - WebSocket server running state

#### Packaging / Updater Direction Contract

- Windows:
  - canonical packaged artifact: Electron Builder `nsis`
  - installer builds use the NSIS installer URL from `latest.json`
  - portable ZIP builds may self-update from the portable ZIP metadata in `latest.json` when the running directory has the portable marker and passes path-safety checks
  - packaged runtime files must include the Windows icon asset used at runtime (`desktop-assets/icons/icon.ico`) if Electron main loads that asset after launch
- macOS:
  - canonical packaged artifacts remain arch-specific DMGs
  - because the current repo ships unsigned open-source DMGs, Electron in-app auto-update is intentionally out of scope until code signing/notarization exists
  - macOS users stay on manual release install flow in Phase 1
- Release workflow continuity:
  - GitHub Releases stays the canonical distribution channel
  - `release-notes/v<version>.md` stays mandatory
  - browser-extension ZIP stays a separate release asset
- Renderer-facing updater contract:
  - on Windows installer builds, preload updater API may surface an available update
  - on macOS unsigned builds, preload updater API should resolve `null` instead of presenting a broken update path
  - stable update channel resolves from the public GitHub Releases stable manifest URL ending in `/releases/latest/download/latest.json`
  - prerelease opt-in resolves from config key `receivePrereleaseUpdates === true`; when enabled, Electron main must query the GitHub Releases API, select the latest non-draft prerelease that publishes `latest.json`, and use that asset URL as the manifest source
  - if prerelease opt-in is enabled but no usable prerelease manifest asset exists, Electron main must log a warning and fall back to the stable manifest instead of failing the whole update check
  - update version comparison must respect semver prerelease precedence, so `0.3.0` remains newer than `0.3.0-rc6`

#### App Update Manifest Channel Contract

- Source files:
  - `electron/main.mts`
  - `electron/appUpdate.mts`
  - `src/updates/versioning.ts`
  - `src/updates/appUpdatePreferences.ts`
- Inputs:
  - config key `receivePrereleaseUpdates?: boolean`
  - stable manifest URL: `https://github.com/Wutpeach/Ameow/releases/latest/download/latest.json`
  - GitHub prerelease list API: `https://api.github.com/repos/Wutpeach/Ameow/releases`
- Output contract:
  - `window.ameow.updater.check()` still returns `AppUpdateInfo | null`
  - `downloadAndInstall()` still consumes the chosen manifest's `platforms["windows-x86_64"].url`
- Selection rules:
  - when `receivePrereleaseUpdates !== true`, use the stable manifest URL only
  - when `receivePrereleaseUpdates === true`, fetch the releases API with GitHub headers, skip drafts, find the first prerelease whose assets include `latest.json`, and use that asset `browser_download_url`
  - if the prerelease query fails or yields no usable manifest, fall back to the stable manifest URL
  - compare remote vs current version with semver-aware prerelease ordering rather than loose numeric token ordering
- Validation and error matrix:
  - stable config / stable manifest newer than current -> return update info from stable manifest
  - prerelease opt-in / prerelease release has `latest.json` -> return update info from prerelease manifest
  - prerelease opt-in / newest prerelease is a draft -> skip it and continue scanning
  - prerelease opt-in / prerelease release lacks `latest.json` -> skip or fall back, do not throw a renderer-facing crash
  - current version `0.3.0` / remote `0.3.0-rc6` -> treat remote as not newer
  - current version `0.3.0-rc6` / remote `0.3.0` -> treat remote as newer
- Good / Base / Bad cases:
  - Good:
    - A stable user receives `0.3.1` from the stable manifest while prerelease releases exist publicly.
    - An opted-in user on `0.3.0` receives `0.3.1-rc1` from the latest prerelease release asset when that release publishes `latest.json`.
  - Base:
    - Opt-in is absent or `false`, so updater behavior stays stable-only with no GitHub prerelease API dependency on the hot path.
  - Bad:
    - Stable users are shown `0.3.0-rc6` as newer than installed `0.3.0`.
    - Opted-in users hit one prerelease release without `latest.json` and the app stops checking updates entirely instead of falling back.
- Required tests:
  - unit test manifest selection from a releases payload containing drafts, prereleases without `latest.json`, and a usable prerelease release
  - unit test config helper that only enables prerelease channel when `receivePrereleaseUpdates === true`
  - unit test semver comparison covering stable-vs-prerelease ordering on the same base version
