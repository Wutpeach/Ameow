# Plan browser extension standalone downloader

## Goal

Define and later implement a phased capability split where the Ameow browser extension can work as a lightweight standalone downloader, while the Ameow desktop app remains the enhanced download engine for protected, high-quality, merged, or authenticated downloads.

User-facing value:

- Users can download simple resources directly from the browser extension even when the desktop app is not connected.
- Users can still get stronger desktop capabilities when the app is online, including cookies, site extractors, high-quality video handling, stream merging, and post-processing.
- The popup can communicate the capability boundary with one compact orange `[Desktop]` badge instead of long explanatory button text.
- Users can inspect discovered resources inside the popup before downloading: video can be previewed inline, audio can be sampled, and images can be browsed in a denser grid with useful metadata.

## Confirmed Facts

### Current Ameow behavior

- The browser extension is Manifest V3 and has a background service worker.
- `browser-extension/manifest.json` currently does not request the `downloads`, `webRequest`, `declarativeNetRequest`, `notifications`, or `offscreen` permissions used by AIX Downloader.
- `browser-extension/background.js` currently connects to the desktop app through `ws://127.0.0.1:39527`.
- `downloadMediaCandidate(...)` currently normalizes popup media candidates and forwards them through the existing desktop-oriented selection request path.
- `generic-video-detector.js` already scans visible page media from DOM, anchors, source elements, image elements, audio elements, and `performance.getEntriesByType("resource")`.
- `popup.js` already renders media scan rows and exposes per-candidate actions such as download, copy link, and view source.
- Existing extension UI already has connection state handling and a toolbar status indicator.

### AIX Downloader observations

The local reference extension at `D:\aixdownloader-9.0.58` is readable enough for architectural analysis, but it is a packaged extension bundle rather than clean source code.

Reusable lessons:

- Treat the extension as a real browser-side downloader by using `chrome.downloads.download(...)` for simple direct resources.
- Use background-level network observations to discover media resources that DOM scanning can miss.
- Keep a clear distinction between generic resource discovery and site-specific extraction.
- Use download lifecycle hooks, such as filename determination and download change events, to improve browser-native download behavior.
- Use popup-native media inspection so users can verify discovered resources before downloading.
- Present image resources as a grid when dimensions and format matter more than long row text.
- Use a single explicit active preview state for video/audio rows so clicking one resource closes or pauses the previous preview.
- Treat popup previewability as "browser can render this candidate" inside the existing capability boundary, not only "URL has a known downloadable extension"; real media URLs may be extensionless and identified by `contentType` or `mimeType`.
- Use a lightweight image viewer/lightbox pattern for in-popup image inspection: maintain an ordered list of visible image URLs and open the selected image in an overlay, with room for next/previous or download actions later.
- Use DNR/header rules only for narrow, well-understood cases; AIX's broad header/CSP modification strategy should not be copied wholesale.

Non-reusable or risky parts:

- Do not copy minified packaged business code from AIX.
- Do not port broad site parser coverage all at once.
- Do not make the browser extension responsible for complex extractor, merge, transcode, or authenticated download work that the desktop app already handles better.
- Do not copy AIX's programmatic `.play()` / `.pause()` behavior for Ameow previews; Ameow should render native controls after user intent and avoid autoplay-like behavior.
- Do not copy AIX's ad hoc fetch-to-blob paths, custom request headers, or site-specific workarounds for popup preview/download.
- Do not copy AIX's large Element UI image viewer implementation; adapt the behavior to Ameow's compact popup.

## Product Requirements

- The browser extension must have a clearly defined standalone download capability for simple direct resources.
- The desktop app must remain the required or preferred path for downloads that need enhanced capabilities.
- The popup must display at most one capability badge per resource row:
  - No badge means the browser extension can download the resource directly.
  - Orange `[Desktop]` badge means the resource requires or strongly prefers desktop app handling.
- Long capability explanations should not be shown as primary button text.
- Detailed reason strings may exist internally for tooltip, logs, tests, analytics, or future diagnostics, but the visible row badge remains singular.
- The popup should support native resource previews without leaving the popup:
  - video rows can expand an inline `<video controls>` preview;
  - audio rows can expose a compact `<audio controls>` sampler;
  - image rows should use a thumbnail-first grid with format and resolution metadata.
- Media preview is inspection only. It must not change download routing, capability badges, or desktop handoff boundaries.
- Media preview should use browser-native media elements rather than custom fetch-to-blob pipelines.
- Only one video or audio preview should actively play at a time.
- The download action must route according to capability:
  - Browser-downloadable + desktop offline: download through the browser.
  - Browser-downloadable + desktop online: send through the existing desktop path by default.
  - Desktop-required + desktop online: send to desktop.
  - Desktop-required + desktop offline: do not pretend the browser can finish the job; show concise desktop-required feedback.
- Browser-side standalone downloads should use standard browser download APIs rather than custom fetch-to-blob pipelines unless a later design justifies it.
- The design must keep existing desktop-connected behavior intact for high-quality video, login/cookie-backed downloads, and site-specific extractors.

## Capability Classification

Browser-downloadable examples:

- Direct image URLs: `jpg`, `jpeg`, `png`, `webp`, `gif`, `avif`.
- Direct SVG image URLs when they are ordinary downloadable files.
- Direct audio URLs: `mp3`, `m4a`, `aac`, `flac`, `ogg`, `opus`, `wav`.
- Direct video URLs that are single-file browser downloads: `mp4`, `webm`, `m4v`.
- Ordinary direct files where the browser can download the URL without merge, cookies, or extractor help.

Desktop-required or desktop-preferred examples:

- `blob:` URLs.
- `data:` URLs, unless a later design explicitly supports safe browser-side data URL saving.
- HLS/DASH manifests such as `m3u8` and `mpd`.
- Fragment or segment resources such as `ts` and `m4s` when they represent stream parts.
- Audio/video separated adaptive streams.
- `mov` should be treated as desktop-preferred in the first implementation because container/codec compatibility is inconsistent even when the bytes can be downloaded.
- Resources that need cookies, session state, referer-sensitive access, or site-specific extractor logic.
- High-quality site video downloads where the browser-visible candidate is likely only a preview, low-quality stream, or incomplete stream.

## Phased Delivery Plan

### Phase 1: Browser direct-download fallback and single badge

- Add a reusable capability classifier for popup media candidates.
- Add `downloads` permission to the browser extension.
- Route direct browser-downloadable candidates through `chrome.downloads.download(...)` when desktop is offline.
- Preserve desktop routing for desktop-required candidates.
- Preserve desktop routing while the desktop connection is connected or still connecting; do not immediately fall back to browser download during a transient WebSocket connecting state.
- For browser-native downloads, handle `chrome.runtime.lastError`, return structured failure reasons, and derive a usable filename from candidate metadata or URL.
- Browser-downloadable images must bypass the protected-image desktop path when the desktop app is offline.
- Render only one orange `[Desktop]` badge for desktop-required or desktop-preferred candidates.
- Keep visible button copy short.

### Phase 1b: Browser download lifecycle basics

- Track enough browser download state to confirm a download was accepted or failed.
- Surface concise popup feedback such as `Downloaded by browser`, `Browser download failed`, or `Desktop required`.
- Keep richer lifecycle features, notifications, and conflict-routing out of the first pass unless they are required to avoid silent failure.

### Phase 2: Background media discovery cache

- Add background-level media discovery for current tabs using browser extension APIs where available.
- Cache recent media responses by tab and merge them into popup scan results.
- Keep cache bounded by TTL, tab, and count.
- Avoid collecting or exposing unnecessary sensitive request data.
- Account for MV3 service worker restarts by persisting only the safe bounded cache data needed for scan merging.

### Phase 2.5: Popup resource preview and image grid

- Add popup-native resource preview before investing in site-specific parsers.
- Let directly renderable video candidates expand an inline preview player in the popup.
- Let audio candidates be sampled from the popup with native audio controls.
- Redesign the image tab as a compact grid of thumbnail-first cards showing image format, dimensions when known, and existing actions.
- Fix previewability so directly renderable extensionless media candidates can preview when `contentType` or `mimeType` proves they are browser-renderable audio/video, while manifests, fragments, `blob:`, `data:`, and desktop-required resources remain blocked from playable preview.
- Add a popup-local image lightbox so clicking an image thumbnail opens a larger preview overlay without leaving the popup.
- Use stable icon rendering for play/pause/unavailable affordances so the preview control is legible at popup thumbnail size.
- Keep previews best-effort and non-blocking. Unpreviewable resources should remain downloadable or desktop-routable through the existing capability classifier.
- Keep the popup compact and task-focused; do not copy AIX's larger 450x600 Element UI layout wholesale.

### Phase 3: Targeted site-specific enhancement

- Pause this phase until a real supported-site failure proves that generic DOM scanning, background media cache, and desktop `yt-dlp` / `gallery-dl` handoff are insufficient.
- Add site-specific parsers only for Ameow-supported sites where generic scanning has proven insufficient.
- Treat parser output as hints for the existing capability pipeline, not as a separate download engine.
- Prefer desktop handoff for complex site media, especially high-quality, authenticated, or merged downloads.

### Phase 4: Download lifecycle polish

- Improve conflict behavior and optional richer status feedback for browser-native downloads.
- Evaluate whether notifications or an offscreen document are justified; do not add them by default.
- Update public docs to explain the browser-extension vs desktop-app capability split.

## Acceptance Criteria

- [ ] Planning defines the browser-extension vs desktop-app capability boundary.
- [ ] Planning records the AIX Downloader lessons that Ameow should absorb and the risky parts it should avoid.
- [ ] Planning defines the single orange `[Desktop]` badge rule.
- [ ] Planning splits implementation into staged deliverables that can be validated independently.
- [ ] Phase 1 implementation, when started later, can be validated without requiring Phase 2 or Phase 3.
- [ ] Planning includes the external Claude review outcomes that materially affect Phase 1 scope and tests.
- [ ] Phase 2.5 popup preview planning defines video, audio, and image browsing behavior without changing download routing.
- [ ] No product code is changed as part of this planning task before the user approves implementation.

## Out Of Scope For This Planning Task

- Implementing browser downloads.
- Adding extension permissions.
- Adding network listeners or DNR rules.
- Adding or porting site-specific parser code.
- Changing desktop download engine behavior.
- Implementing native messaging or desktop launch/wake behavior; that remains related to the existing desktop launch bridge evaluation task.

## Open Questions

- None blocking. The Phase 1 routing decision is: desktop online uses desktop by default; desktop offline falls back to browser download only for browser-downloadable direct resources.
