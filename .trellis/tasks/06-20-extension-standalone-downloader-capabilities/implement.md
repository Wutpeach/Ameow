# Implementation plan

## Phase 0: Planning Review

- [x] Review `prd.md` and `design.md` with the user.
- [x] Resolve the Phase 1 default routing question for direct resources when desktop is online: desktop online uses desktop; desktop offline uses browser fallback for direct browser-downloadable resources.
- [x] Do not run `task.py start` until planning is approved.

## Phase 1: Browser direct-download fallback and `[Desktop]` badge

- [x] Read relevant frontend specs before editing:
  - `.trellis/spec/frontend/index.md`
  - UI/design guideline files if popup CSS/HTML changes are needed.
- [x] Add or extend tests around candidate capability classification.
- [x] Add a small browser-extension utility for classifying media candidates.
- [x] Reuse existing candidate URL classification helpers where possible instead of duplicating extension/type regexes.
- [x] Update `browser-extension/manifest.json` with the minimal `downloads` permission.
- [x] Update `downloadMediaCandidate(...)` to:
  - classify the candidate;
  - keep desktop routing for desktop-required candidates;
  - keep desktop routing while the desktop connection is connected or still connecting;
  - fallback to `chrome.downloads.download(...)` for browser-downloadable candidates when desktop is offline;
  - bypass `handlePageImageSelectionRequest(...)` for browser-downloadable image candidates when desktop is offline;
  - pass a useful filename derived from candidate metadata or URL;
  - check `chrome.runtime.lastError` from browser downloads;
  - return structured reasons for popup feedback.
- [x] Update popup row rendering to show exactly one orange `[Desktop]` badge when required.
- [x] Update popup feedback copy to remain concise.
- [x] Add or update browser-extension tests for:
  - direct image/audio/video candidate has no badge;
  - `svg` direct image candidate has no badge;
  - direct URLs with query strings or fragments keep the right classification;
  - null, empty, invalid, `data:`, and no-extension video URLs get `[Desktop]`;
  - `m3u8`, `mpd`, `blob`, `m4s`, `ts`, and `mov` candidates get `[Desktop]`;
  - candidate metadata indicating `manifest_m3u8` overrides a direct-looking extension;
  - offline direct candidate uses browser download path;
  - offline direct image candidate does not call the protected-image desktop path;
  - connecting direct candidate does not immediately call browser download;
  - offline desktop-required candidate does not call browser download.
- [x] Add browser-download failure coverage for `chrome.runtime.lastError`.
- [x] Run targeted tests.

## Phase 1b: Browser download lifecycle basics

- [x] Confirm browser download calls return a download ID on success.
- [x] Track enough download state for accepted/failed feedback without building a full download manager.
- [x] Keep popup row feedback concise and avoid long explanatory button text.
- [x] Preserve the existing desktop-connected path for all candidate types.

## Phase 2: Background media discovery cache

- [x] Decide minimal permission set after Phase 1 ships or is verified.
- [x] Add bounded per-tab media cache in background service worker.
- [x] Capture safe media metadata from background network observations.
- [x] Merge web-request cache candidates into `scanPageMediaForActiveTab()` results.
- [x] Persist only safe bounded cache metadata needed to survive MV3 service worker restarts.
- [x] Add tests for TTL, dedupe, tab isolation, and no sensitive header persistence.
- [x] Verify popup scans improve without duplicate rows.
- [x] Fix preview metadata for network-discovered candidates:
  - image candidates use their own URL as preview;
  - video network candidates inherit the current page poster / Open Graph preview when available;
  - audio candidates remain preview-optional.

## Phase 2.5: Popup resource preview and image grid

- [x] Keep Phase 3 site-specific parser work paused until there is a concrete site failure.
- [x] Review AIX popup resource UX as reference only:
  - inline video preview expands below the selected resource;
  - audio can be sampled directly in the popup;
  - image resources use a grid with dimensions and format metadata.
- [x] Record additional AIX preview lessons:
  - video/audio use one explicit active preview state, so opening one preview closes the previous one;
  - image preview uses an ordered visible-image list and an in-place viewer/lightbox;
  - extensionless media can still be browser-renderable when `contentType` or `mimeType` proves direct audio/video;
  - AIX's programmatic `.play()` / `.pause()`, fetch-to-blob workarounds, custom headers, and large Element UI viewer should not be copied.
- [x] Do not copy AIX's minified Vue/Element UI code or larger 450x600 layout.
- [x] Add popup preview state:
  - one active video preview at a time;
  - one active audio preview at a time;
  - stop/clear active preview when media tab changes or scan results refresh.
- [x] Do not infer active preview from DOM nodes; `renderMediaState()` rebuilds the list, so preview state must be explicit and re-rendered deliberately.
- [x] Gate previewability through `downloadCapabilityUtils.resolveDownloadCapability(candidate)`:
  - `requiresDesktop: true` candidates do not get playable browser preview controls;
  - this keeps `.mov`, manifests, fragments, blob/data URLs, invalid URLs, and indirect media consistent with download routing.
- [x] Add a dedicated popup preview slot between media summary and media list, or otherwise prove that inline row preview does not overflow the scrollport. Prefer the dedicated slot.
- [x] Use the thumbnail play/pause affordance as the primary video/audio preview toggle:
  - play opens video preview or starts/reveals audio sampler;
  - pause stops playback and closes/collapses that preview;
  - add a secondary close button only if the toggle is not discoverable in testing.
- [x] Add video row preview:
  - thumbnail/play affordance opens an inline `<video controls preload="metadata" playsinline>` panel below the row;
  - direct browser-renderable video candidates can preview;
  - desktop-required manifests/fragments/blob/invalid URLs show concise unavailable feedback instead of trying to play.
  - when `candidate.previewUrl` exists, pass it as the video `poster`;
  - do not render `autoplay` and do not call `.play()` programmatically.
  - when the same candidate is active, clicking the pause affordance closes the preview panel.
- [x] Add audio row sampler:
  - preview/play affordance opens or reveals `<audio controls preload="metadata">`;
  - audio preview remains optional when no artwork exists.
  - do not render `autoplay` and do not call `.play()` programmatically.
  - when the same candidate is active, clicking the pause affordance stops and collapses the sampler.
- [x] Redesign image tab rendering:
  - use a compact grid of stable-size thumbnail cards;
  - switch `.ameow-media-list` layout by media type with a data attribute and separate image card class;
  - show extension/format and dimensions when available;
  - keep existing actions: download, copy link, view source;
  - preserve `[Desktop]` badge semantics if an image candidate ever requires desktop.
- [x] Defer popup-local large image overlay for the first Phase 2.5 cut; re-evaluate after image-grid feedback.
- [x] Add/update tests for:
  - video preview markup/controls appear only for previewable direct video candidates;
  - desktop-required video candidates do not render a playable video preview;
  - preview unavailable feedback appears for desktop-required video candidates;
  - only one video preview can be active at a time;
  - only one audio sampler can be active at a time;
  - clicking the active video/audio pause affordance closes or collapses the preview;
  - video preview uses `candidate.previewUrl` as `poster`;
  - video/audio previews have no `autoplay` attribute and JS does not call `.play()`;
  - audio candidates expose an audio sampler;
  - image tab uses grid/card rendering and includes dimensions/format metadata;
  - image cards render cleanly when dimensions are missing;
  - tab switch or refresh clears active preview state;
  - `[Desktop]` badge still renders on image cards if required;
  - download/copy/source actions still work from image cards.
- [x] Run targeted popup tests and `npm test -- browser-extension`.

## Phase 2.5a: Popup preview corrections

- [x] Fix media previewability:
  - extend `download-capability-utils.js` to consider `candidate.contentType` and `candidate.mimeType`;
  - direct `video/*` and `audio/*` candidates can preview even when their URL is extensionless;
  - HLS/DASH manifests, fragments, `blob:`, `data:`, invalid URLs, and desktop-required metadata remain blocked from playable preview.
- [x] Keep preview gating through `downloadCapabilityUtils.resolveDownloadCapability(candidate)` so download routing and preview semantics stay aligned.
- [x] Replace fragile play/pause/unavailable drawing with stable icon geometry:
  - play icon is complete inside the thumbnail;
  - active state clearly shows pause;
  - unavailable state is legible and does not look like a broken play button.
- [x] Add popup-local image lightbox:
  - clicking an image thumbnail opens a dark in-popup overlay;
  - the selected image is shown larger without leaving the popup;
  - clicking the backdrop, close affordance, or pressing `Escape` closes it;
  - row/card menus do not trigger the image preview;
  - keep download/copy/source actions intact.
- [x] Preserve no-autoplay behavior:
  - do not render `autoplay`;
  - do not call `.play()` programmatically;
  - do not copy AIX's media watcher behavior that directly starts playback.
- [x] Add/update tests for:
  - extensionless `contentType: "video/mp4"` previews;
  - extensionless `mimeType: "audio/mpeg"` previews;
  - manifests/fragments/blob/data remain unpreviewable;
  - play/pause/unavailable icon CSS or SVG hooks exist;
  - image thumbnail click opens lightbox state;
  - lightbox closes on backdrop, close control, and `Escape`;
  - image action menu clicks do not open the lightbox.
- [x] Run targeted popup/capability tests and `npm test -- browser-extension`.

## Phase 2.5b: Preview grouping and audio sampler polish

- [x] Merge duplicate display candidates for the same resource in the popup:
  - combine desktop-required/enhanced candidates with direct browser-renderable candidates when they describe the same media;
  - show a single row/card with one orange `[Desktop]` badge when any merged candidate has desktop capability;
  - keep preview controls wired to the browser-renderable candidate when available;
  - keep download actions routed through the preferred candidate for the current connection state, preserving desktop-online and browser-offline fallback behavior.
- [x] Keep grouping conservative:
  - prefer exact stable IDs or explicit grouping hints when present;
  - merge current-page desktop/enhanced video or audio candidates with direct browser-renderable candidates captured from the same page URL, such as Bilibili page URLs plus `bilivideo.com` CDN media;
  - do not use matching title, duration, size, or host as a primary merge key because those hints can be missing, generic, or shared by unrelated resources;
  - prefer the desktop/current-page candidate title for merged display rows because direct CDN candidates often expose only resource filenames or opaque IDs.
- [x] Replace the native audio controls with a compact Ameow-styled sampler:
  - keep a hidden native `<audio preload="metadata">` element as the playback engine;
  - render a custom play/pause control, time text, and themed progress range;
  - user gestures may call `.play()` only from the custom sampler button, never on preview open or initialization;
  - preserve no `autoplay` behavior.
- [x] Add/update tests for:
  - desktop-required manifest/indirect candidate plus direct playable candidate render as one display item;
  - merged item can preview through the direct candidate and still displays `[Desktop]`;
  - merged item uses the enhanced candidate for desktop-capable routing and the direct candidate for browser fallback metadata;
  - unrelated resources remain separate;
  - audio sampler renders custom controls instead of native `audio.controls = true`;
  - `.play()` only appears in the explicit sampler button flow and no `autoplay` appears.
- [x] Run targeted popup tests and `npm test -- browser-extension`.

## Phase 2.5c: Site title metadata polish

- [x] Keep Phase 3 parser work paused; this phase only improves display/download title metadata.
- [x] Add narrow Bilibili title cleanup:
  - prefer known Bilibili video title elements when present;
  - remove common Bilibili page-title suffixes such as `_哔哩哔哩_bilibili`;
  - treat cleaned Bilibili page titles as more authoritative than local player-control DOM labels and CDN filenames;
  - keep generic/CDN fallback behavior for non-Bilibili sites.
- [x] Add narrow YouTube title cleanup:
  - prefer Open Graph title or known watch-page heading when present;
  - remove the browser page suffix `- YouTube`;
  - treat cleaned YouTube page titles as more authoritative than local player-control DOM labels and CDN filenames;
  - do not add a broader YouTube parser.
- [x] Do not change download routing, capability classification, popup grouping, or desktop handoff.
- [x] Add/update detector tests for Bilibili cleanup, Bilibili selector priority, YouTube cleanup, and unknown-site non-cleaning behavior.
- [x] Run targeted detector tests and browser-extension checks.

## Phase 3: Targeted site-specific enhancement

- [ ] Paused until user reports or scan failures justify a parser.
- [ ] Review user reports or scan failures to choose the first target site.
- [ ] Add parser only when generic scan + background cache are insufficient.
- [ ] Keep parser output as candidate hints that pass through the capability classifier.
- [ ] Prefer desktop handoff for complex parser outputs.
- [ ] Add focused tests for the target site fixture or mocked payload.

## Phase 4: Browser download lifecycle polish

- [ ] Evaluate filename control with `chrome.downloads.onDeterminingFilename`.
- [ ] Add conflict behavior only if the default browser behavior is insufficient.
- [ ] Evaluate richer browser-download status feedback beyond the Phase 1b basics.
- [ ] Avoid adding notifications/offscreen unless the product need is clear.
- [ ] Update public docs under `site/src/content/docs/` explaining:
  - extension standalone downloads;
  - `[Desktop]` badge meaning;
  - desktop app enhanced capabilities.

## Validation Commands

Use targeted commands first, then broader checks before finishing:

```bash
npm test -- browser-extension
npm run type-check
npm run lint
npm run docs:build
```

Adjust the exact test command if the repository's current test runner requires a different filter.

## Risky Files

- `browser-extension/manifest.json`: permission changes affect install/update prompts.
- `browser-extension/background.js`: download routing and desktop bridge behavior.
- `browser-extension/popup.js`: row rendering and feedback.
- `browser-extension/popup.css`: badge styling.
- `browser-extension/generic-video-detector.js`: scan result shape if changed.

## Rollback Points

- After Phase 1, browser direct-download fallback can be disabled by routing all downloads through the existing desktop path and hiding the badge.
- After Phase 2, background media cache can be disabled independently while keeping content-script scanning.
- Site-specific parser work must be isolated enough to remove without affecting generic scanning.
