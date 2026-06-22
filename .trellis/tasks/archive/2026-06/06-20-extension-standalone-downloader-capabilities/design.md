# Browser extension standalone downloader design

## Architecture Boundary

Ameow should split download responsibility into two explicit capability surfaces:

- Browser extension: lightweight resource discovery and direct browser-native downloads.
- Desktop app: enhanced downloads requiring cookies, site extractors, high-quality stream handling, merge/transcode, queueing, retry, and post-processing.

The extension should not become a full desktop download engine. It should independently handle simple direct resources and route everything complex through the existing desktop bridge.

## Current Flow

Current simplified flow:

```text
Popup scan request
  -> background scanPageMediaForActiveTab()
  -> content generic-video-detector.js
  -> popup rows
  -> downloadMediaCandidate()
  -> handleVideoSelectionRequest() / handlePageImageSelectionRequest()
  -> desktop WebSocket request
```

The new design keeps this flow but inserts capability classification before row rendering and before download routing.

## Proposed Capability Contract

Each popup media candidate should be normalized into a download capability descriptor.

```js
{
  requiresDesktop: false,
  desktopReason: null,
  browserDownloadable: true
}
```

Desktop-required example:

```js
{
  requiresDesktop: true,
  desktopReason: "adaptive_stream",
  browserDownloadable: false
}
```

The visible UI should only care about `requiresDesktop`:

- `false`: no badge.
- `true`: orange `[Desktop]` badge.

`desktopReason` remains internal for tests, logs, tooltip text, or future diagnostics.

## Classification Rules

Initial Phase 1 classifier should be conservative:

- Browser-downloadable:
  - HTTP/HTTPS direct URLs with known single-file image, audio, video, or file extensions.
  - Candidate types already known as direct single-file media.
  - URL extension checks should use the parsed pathname and ignore query strings or fragments.
- Desktop-required:
  - `blob:` URLs.
  - `data:` URLs unless explicitly handled by a later browser-save design.
  - `m3u8`, `mpd`.
  - likely media fragments: `ts`, `m4s`.
  - `mov` in the first implementation, because download may succeed while user playback still fails due to codec/container compatibility.
  - candidates marked as adaptive, manifest, site extractor, protected, login-required, or unknown complex media.
  - candidates where the URL is missing, invalid, or cannot be downloaded by the browser.

The classifier should prefer false positives for `[Desktop]` over telling the user that the browser can download a resource that will fail or produce an incomplete file.

The classifier should reuse existing URL-level media classification helpers where possible, especially `generic-video-selection-utils.js` candidate type logic, while keeping capability routing as a separate higher-level concern.

## Download Routing

Recommended routing:

```text
Candidate download clicked
  -> classify candidate
  -> if requiresDesktop:
       if desktop connected: send desktop request
       else: return desktop_required/offline response
     else:
       if desktop connected or connecting: use/wait for current desktop path
       else: chrome.downloads.download(...)
```

This preserves current desktop-connected behavior while adding offline utility. Phase 1 intentionally does not make direct resources browser-first while the desktop app is online.

The routing decision must distinguish `offline` from transient `connecting`. A direct candidate should not immediately fall back to browser download while the service worker is still trying to reconnect to the desktop app.

For browser-native downloads, Phase 1 must check `chrome.runtime.lastError` from `chrome.downloads.download(...)`, return a structured failure reason, and pass a reasonable filename derived from candidate metadata or URL. Rich progress UI can remain later work, but silent failure is not acceptable.

Browser-downloadable image candidates must bypass the protected-image desktop path when the desktop app is offline. Protected-image fallback remains important for desktop-required or desktop-connected image workflows.

## Popup UI

Resource row:

```text
Title [Desktop]
host / source / type / metadata
```

Rules:

- No badge for direct browser-downloadable resources.
- One orange `[Desktop]` badge for desktop-required or desktop-preferred resources.
- Button labels stay short.
- Long explanations are not shown in the primary row or button.
- Row feedback may use concise messages such as `Desktop required` or `Downloaded by browser`.

## Phase 2.5 Popup Preview UX

Phase 2.5 should improve resource inspection inside the popup before any site-specific parser work. AIX Downloader's useful pattern is the resource-panel shape, not its implementation stack:

- video and audio remain list-oriented resources with a compact thumbnail/poster area and inline playback affordance;
- video preview expands under the selected row instead of opening a new tab;
- audio preview is a small native sampler tied to the resource row;
- image browsing is denser as a grid of thumbnail cards with dimensions and file type visible;
- image preview can use an ordered visible-image URL list and open the selected image in a viewer/lightbox;
- video/audio preview state is a single explicit active URL or candidate ID, so opening one preview closes the previous one.

Ameow should adapt this to the existing compact popup surface instead of copying AIX's 450x600 Element UI layout.

### Preview Contract

Preview is best-effort inspection only:

- It uses browser-native `<video>`, `<audio>`, and `<img>` elements.
- It does not fetch media manually, synthesize blob URLs, rewrite headers, or bypass site restrictions.
- It does not change the candidate's download capability classification or routing.
- `[Desktop]` remains the only capability badge.
- If a candidate cannot be previewed by the browser, the row remains usable for download/copy/source and may show concise feedback such as `Preview unavailable`.
- Previewability should be gated through the same `downloadCapabilityUtils.resolveDownloadCapability(candidate)` boundary used for download routing. A candidate that requires desktop handling should not render a playable browser preview, even if another helper classifies its URL as direct-looking.
- The capability boundary must account for `candidate.contentType` and `candidate.mimeType` in addition to URL extension. Many browser-renderable media URLs are extensionless; if network or DOM metadata proves a candidate is direct `video/*` or `audio/*`, it can be treated as browser-renderable unless it is a known manifest, fragment, `blob:`, `data:`, or other desktop-required type.
- Preview state should be explicit popup state, not inferred from DOM nodes that are destroyed during `renderMediaState()`.
- The thumbnail playback affordance is the primary open/close control: play opens/starts the preview, pause closes/stops it.
- The play/pause/unavailable affordance should be rendered with stable icon geometry, such as inline SVG or a well-bounded CSS icon, rather than a text glyph or fragile border-only drawing.

Video rows:

- Click the thumbnail/play affordance or compact preview action to open a preview panel.
- Prefer a dedicated preview slot between the media summary and the scrollable list so a usable video player does not silently overflow inside a row or disappear below the list scrollport.
- Use `<video controls preload="metadata" playsinline>`.
- Prefer `candidate.url` for direct video resources and `candidate.previewUrl` as poster when present.
- Do not attempt to preview HLS/DASH manifests, `blob:` URLs, fragments, or other desktop-required resources unless a future browser-native path is explicitly designed.
- Keep only one expanded video preview at a time and pause/close the previous preview when another opens.
- Use the thumbnail play/pause affordance as the close path. When a video preview is open, the affordance switches to pause; clicking it stops playback and removes the preview panel.
- A secondary compact close affordance may be added only if testing shows the play/pause toggle is not discoverable enough.

Audio rows:

- Provide a play/sampler affordance in the preview area or row body.
- Use `<audio controls preload="metadata">`.
- Keep only one audio sampler active at a time.
- Do not require album art; missing preview artwork is acceptable.
- Use the same play/pause affordance for audio. Play starts or reveals the sampler; pause stops playback and hides or collapses the sampler.

Image tab:

- Render image candidates as a grid rather than the current video-style list.
- Switch list layout by media type, for example with `mediaList.dataset.mediaType = "image"` and image-specific card classes instead of forcing row CSS into a grid.
- Use stable card dimensions so image loading does not shift the layout.
- Card primary content is the thumbnail; metadata below should include extension/format and dimensions when known.
- Existing actions remain available: download, copy link, view source.
- Popup-local large image overlay should be added as a Phase 2.5 correction:
  - clicking a thumbnail opens a dark in-popup lightbox with the selected image;
  - clicking the backdrop, a close affordance, or pressing `Escape` closes it;
  - row/card action menus do not trigger the lightbox;
  - keep the first version simple, with optional previous/next and download actions only if they fit the popup without crowding.

### UX Constraints

- Keep the popup dense and readable. The media list should not become a full gallery app.
- Avoid long visible explanatory copy. Use titles/tooltips and row feedback for preview failures.
- Respect current theme tokens and browser-extension popup visual language.
- Avoid autoplay. User action starts playback.
- Stop active preview playback when the user toggles the same preview off, switches media tabs, or opens another preview.
- Render media preview elements without `autoplay` and do not call `.play()` programmatically.
- Do not copy AIX's direct `.play()` / `.pause()` watcher behavior. Ameow may create or remove native media controls after a user click, but actual playback should remain controlled by the browser-native player UI.

## AIX Downloader Lessons To Absorb

Absorb:

- Use `chrome.downloads.download(...)` for direct browser-side downloads.
- Track download IDs enough to return meaningful success/failure state.
- Consider `onDeterminingFilename` only when Ameow needs browser-native filename control.
- Use background-level discovery to catch resources that DOM scanning misses.
- Keep site-specific logic separate from generic discovery.
- Use popup-native media inspection so users can verify discovered resources before downloading.
- Use an image-grid browsing mode for image resources where dimensions and format matter more than row text.
- Use a single explicit active preview ID for video/audio rows, inspired by AIX's one-active-preview state.
- Use media metadata such as `contentType` and `mimeType` to avoid misclassifying extensionless browser-renderable resources as unpreviewable.
- Adapt AIX's image viewer idea into a compact popup-local lightbox instead of requiring users to open images in a new tab.

Avoid:

- Copying minified code.
- Broadly modifying CORS, CSP, Referer, Origin, or User-Agent headers.
- Adding a large parser matrix before evidence shows where Ameow's current scanning fails.
- Recreating desktop-level merging, extractor, or queue logic in the extension.
- Copying AIX's programmatic media `.play()` / `.pause()` behavior.
- Copying AIX's fetch-to-blob preview/download workarounds or broad custom request-header paths.
- Copying AIX's large Element UI viewer; only copy the product behavior that users can preview images in place.

## Phase 2 Network Discovery Shape

Background discovery should maintain a bounded per-tab cache:

```js
{
  tabId,
  pageUrl,
  url,
  mediaType,
  contentType,
  contentLength,
  source: "web_request",
  capturedAt
}
```

The popup scan result should merge:

- content-script scan results;
- background web request cache entries for the active tab.

The cache should not persist sensitive request headers or cookies.

Because the extension background is an MV3 service worker, Phase 2 should not assume in-memory cache durability. Persist only safe bounded media metadata needed to survive service worker restarts, and prune it aggressively by TTL, tab, and total count.

## Compatibility Notes

- Adding `downloads` is a user-visible extension permission change.
- The release/docs plan should acknowledge the extension update permission prompt caused by adding `downloads`.
- Adding `webRequest` or DNR later should be deferred to Phase 2 and documented separately because it changes the extension permission surface more than Phase 1.
- Popup preview should not require new extension permissions beyond the resource URLs already displayed in the popup.
- Firefox or non-Chromium behavior should not be assumed unless a later task targets it.
- Desktop launch/wake behavior is a separate task; this task should integrate with it only through status and feedback.

## Rollback Shape

- Phase 1 can be rolled back by removing the `downloads` permission, classifier usage, and browser-download fallback path.
- UI badge changes should be isolated so rows can return to current rendering without affecting scan logic.
- Phase 2 network cache should be additive and removable without changing content-script scanning.
- Phase 2.5 popup preview can be rolled back by returning image rows to the existing list rendering and removing inline player state, without changing scanning or download routing.
