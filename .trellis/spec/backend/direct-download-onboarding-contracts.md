# Direct Download Onboarding Contracts

> Retired historical contract. `direct` is no longer a backend engine id, and site-provider planning must not create direct HTTP download routes from media candidates. Keep this file only as background for older archived tasks; new platform work should route through `yt-dlp`, `gallery-dl`, or a dedicated managed sidecar backend.

> Do not use this document as an implementation template for new work.

---

## Scenario: Add a New Direct-Download Platform

### 1. Scope / Trigger

- Trigger: any change that adds a new platform-specific direct route (for example, `kuaishou`, `weibo`) with browser button injection.
- Why this needs code-spec depth: this is a cross-layer contract (`manifest/content script` -> `background payload` -> `Rust router/direct downloader`) and partial updates silently break fallback behavior.

### 2. Signatures

Required extension files:
- `browser-extension/<platform>-detector.js`
- `browser-extension/<platform>-button.css`
- `browser-extension/manifest.json` new `content_scripts` entry

Required desktop bridge payload contract:

```json
{
  "action": "video_selected_v2",
  "url": "<videoUrl or pageUrl>",
  "pageUrl": "<canonical page url>",
  "videoUrl": "<optional direct media url>",
  "videoCandidates": [
    {
      "url": "https://...mp4",
      "type": "direct_cdn|direct_mp4|indirect_media|manifest_m3u8",
      "confidence": "high|medium|low",
      "source": "video_element|video_source|json_ld|script_scan|..."
    }
  ],
  "title": "<optional title>",
  "ytdlpQualityPreference": "<optional best|balanced|data_saver>"
}
```

Required backend touch points in `src-tauri/src/lib.rs`:
- URL detection helpers:
  - `fn is_<platform>_url(url: &str) -> bool`
  - `fn is_<platform>_cdn_url(url: &str) -> bool`
- direct download function:
  - `async fn download_<platform>_direct(...) -> Result<DownloadResult, String>`
- router integration:
  - `download_video_smart(...)` direct branch before yt-dlp default
  - `handle_ws_message(..., "video_selected_v2")` platform branch and retry pipeline
- candidate policy integration:
  - `DirectPlatform` enum variant and `is_direct_candidate_for_platform(...)` mapping

### 3. Contracts

#### 3.1 Extension Injection Contract

- Detector must be idempotent for SPA pages (processed marker + mutation observer).
- Detector must support both:
  - control-bar injection when player controls exist
  - floating fallback button when controls are unavailable
- Injected button click must call one download path (`handleDownload`-style), not duplicate handlers.
- For control-bar platforms, use shared style helper to keep custom button spacing aligned with native controls:
  - `browser-extension/control-style-utils.js`
  - `window.AmeowControlStyleUtils.isControlBarReady(...)`
  - `window.AmeowControlStyleUtils.syncHorizontalMarginsFromNative(...)`

Detector skeleton (minimum):

```javascript
(function () {
  "use strict";

  const PROCESSED_ATTR = "data-flowselect-processed";

  function isVideoPage() { /* platform URL check */ }
  function extractVideoCandidates() { /* sorted + filtered */ }
  function extractVideoUrl(candidates) { /* best direct candidate or null */ }
  function extractTitle() { return document.title || ""; }

  function handleDownload() {
    const pageUrl = window.location.href;
    const videoCandidates = extractVideoCandidates();
    const videoUrl = extractVideoUrl(videoCandidates);
    if (videoUrl || videoCandidates.length > 0) {
      chrome.runtime.sendMessage({
        type: "video_selection",
        url: videoUrl || pageUrl,
        pageUrl,
        videoUrl,
        videoCandidates,
        title: extractTitle(),
      });
      return;
    }

    // Mixed-media sites may need an image save path instead of forcing
    // an image-only note through video routing.
    chrome.runtime.sendMessage({
      type: "save_image_from_page",
      url: resolvePrimaryImageUrl(),
      pageUrl,
    });
  }
})();
```

#### 3.2 Candidate Parsing Contract

- Reject non-http and `blob:` URLs.
- Reject image-like CDN URLs from the target site when building video hints; only actionable media URLs (for example `.m3u8`, `.mp4`, or platform-specific video CDN paths) may enter `videoUrl` / `videoCandidates`.
- On mixed-media note pages, detector/content-script code must resolve media kind before transport. Image-only notes must not be sent through `video_selection` just because the site itself supports video on other notes.
- Do not promote unstable stream-variant URLs such as Pinterest `*.cmfv` HLS/CMAF resources to preferred direct hints; treat them as low-trust signals unless a downstream resolver explicitly normalizes them.
- Keep `videoCandidates` optional and backward compatible.
- Detector/content-script code may filter obviously invalid candidates, but candidate ranking authority belongs to the runtime normalization layer, not `background.js`.
- If a detector includes `mediaType`, background normalization must preserve it; downstream runtime/provider layers may use it as a defensive guard against image-as-video regressions.
- Runtime normalization must prefer higher-trust direct CDN/mp4 candidates over manifest (`.m3u8`) hints, and may apply provider-specific ordering such as Pinterest trust ordering or Douyin/Xiaohongshu quality heuristics.
- Treat extension `videoUrl` / `videoCandidates` as hints, not source of truth. If backend later resolves canonical media from the page/API, it must validate hint URLs again before allowing them to override the resolved asset.
- Do not send only direct URL without `pageUrl`; fallback needs canonical page URL.

#### 3.3 Manifest Registration Contract

- Add one `content_scripts` entry in `browser-extension/manifest.json` with:
  - explicit `matches` for platform domains
  - `js: ["<platform>-detector.js"]` (minimum)
  - if control-bar style parity is required, include helper before detector:
    - `js: ["control-style-utils.js", "<platform>-detector.js"]`
  - `css: ["<platform>-button.css"]`
  - `run_at: "document_idle"`

#### 3.4 Background Bridge Contract

- Reuse `background.js` generic `video_selection -> video_selected_v2` bridge and `normalizeVideoCandidates`.
- Detector/content-script code should send the stable internal extension message name `video_selection`.
- Do not add per-platform message shape variants; all platforms share one payload contract.
- Exception: when a mixed-media site resolves an image-only note, the extension may use a dedicated internal message that maps to the existing Electron `save_image` websocket action instead of forcing the request through `video_selected_v2`.
- `background.js` may normalize URLs, derive `siteHint`, and attach cookies/title, but it must not perform platform-specific candidate ranking or engine/route selection.
- Preserve optional `ytdlpQualityPreference` passthrough on shared payloads:
  - direct route ignores it for the direct attempt
  - any fallback into `download_video_smart(...)` must preserve the normalized tier

#### 3.5 Backend Routing Contract

- New platform branch must preserve terminal completion semantics:
  - success path emits completion
  - error path emits completion
  - cancel path emits completion
- Direct route failures must fallback to smart router by `pageUrl` when safe.
- Keep yt-dlp as universal fallback for non-direct inputs.

#### 3.6 File-Delta Checklist (Implementation Template)

1. `browser-extension/<platform>-detector.js`: create based on Douyin/XHS detector pattern.
2. `browser-extension/<platform>-button.css`: create platform-specific button style.
3. `browser-extension/control-style-utils.js`: reuse for control-bar style/spacing alignment when needed.
4. `browser-extension/manifest.json`: add `content_scripts` match/js/css.
5. `src-tauri/src/lib.rs`: add URL detectors + direct downloader + router integration.
6. `.trellis/spec/guides/video-download-patterns.md`: add platform note after implementation lands.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|---|---|---|---|
| Missing `content_scripts` entry | Extension load on target site | No button appears | Add manifest entry for platform domains |
| Button injected repeatedly on SPA nav | Navigate between posts/items | Only one active button per player/card | Add processed marker + observer/url-change guards |
| `videoCandidates` contains `blob:` | Background normalization | Candidate filtered out | Enforce detector + background filtering |
| `videoUrl` / `videoCandidates` contains same-site image CDN URL | Resolver + trace logs | Invalid hint is ignored; backend keeps canonical resolved video | Tighten detector filters and backend hint validators together |
| `ytdlpQualityPreference` missing/invalid | WS payload handling | Backend normalizes to `best` | Keep field optional and avoid platform-specific variants |
| Direct URL returns HTTP 4xx/5xx | Backend direct attempt | Emits error trace then falls back when `pageUrl` is available | Preserve retry/fallback chain |
| Missing completion emit on error | Frontend progress bar | Progress closes on all terminal outcomes | Emit `video-download-complete` in all terminal paths |
| New platform direct candidate never selected | Trace logs | Candidate counts > 0 and route selected when CDN URL present | Add platform mapping in `is_direct_candidate_for_platform` |

### 5. Good / Base / Bad Cases

- Good:
  - Detector sends `videoUrl + pageUrl + videoCandidates`; backend direct succeeds.
  - Detector sees same-site poster/image resources, but only real media URLs survive candidate filtering and backend validation.
  - First direct candidate fails, second candidate or yt-dlp fallback succeeds; completion event still emitted once.
- Base:
  - Detector cannot find direct media; sends only `pageUrl`; backend routes to yt-dlp.
- Bad:
  - Detector sends `blob:` as `videoUrl`.
  - Backend direct branch returns early on error without fallback despite valid `pageUrl`.
  - Manifest updated but detector file/css missing (build/runtime mismatch).

### 6. Tests Required (with assertion points)

- Extension injection assertions:
  - Open platform page and confirm one Ameow button is visible.
  - SPA navigation does not duplicate buttons.
- Payload contract assertions:
  - DevTools message shows `url`, `pageUrl`, optional `videoUrl`, `videoCandidates[]`, `title`, optional `ytdlpQualityPreference`.
  - Extension-side `videoCandidates` excludes `blob:` and other invalid URLs before transport.
  - Runtime normalization tests assert provider-specific candidate ordering after the payload reaches the desktop runtime.
- Backend route assertions:
  - Direct CDN URL triggers `<platform>` direct route.
  - Invalid direct URL triggers fallback to `download_video_smart(pageUrl, ...)`.
  - `video-download-complete` emitted for success/error/cancel.
- Build/type assertions:
  - `cargo check --manifest-path src-tauri/Cargo.toml` passes.
  - Extension package has no missing detector/css references.

### 7. Wrong vs Correct

#### Wrong

```javascript
chrome.runtime.sendMessage({
  type: "video_selection",
  url: video.currentSrc // may be blob:, no pageUrl fallback
});
```

```rust
if is_new_platform_cdn_url(&url) {
    return download_new_platform_direct(app, url, cookie_header, title).await;
    // direct fail can end pipeline without fallback
}
```

#### Correct

```javascript
chrome.runtime.sendMessage({
  type: "video_selection",
  url: videoUrl || pageUrl,
  pageUrl,
  videoUrl,
  videoCandidates,
  title
});
```

```rust
if is_new_platform_cdn_url(&url) {
    // direct branch + trace
    // on non-cancel failure, retry/fallback to smart router by pageUrl
}
// default: yt-dlp path
```
