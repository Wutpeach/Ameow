# Add extensible site-specific video variant parsing for Weibo

## Goal

Add a browser-extension path that can discover higher-quality Weibo video variants even when the user has not selected that quality in the page player.

The implementation should introduce a reusable site-specific parser model rather than hard-coding one-off Weibo behavior into the generic media scanner. This matters because future sites may need similar custom extraction and candidate grouping.

## User Value

- On Weibo, the extension popup should not be limited to the currently playing rendition such as 720p when the same video exposes 1080p or other higher variants.
- Multiple quality URLs for the same Weibo video should appear as one logical resource instead of separate confusing rows.
- The default download action should still prefer the most reliable highest-quality path.
- The user should eventually be able to choose among detected Weibo quality variants from the popup.
- The architecture should allow future site parsers to plug into the same scan and grouping flow.

## Confirmed Facts

- Current generic extension scanning is intentionally passive:
  - `browser-extension/generic-video-detector.js` collects `video.currentSrc`, nested `<source>` URLs, recent `performance` resources, direct page links, images, and audio.
  - `browser-extension/media-network-cache.js` caches observed media responses from `webRequest`.
  - These sources usually only include resources the page has already requested.
- If a Weibo player is currently set to 720p, the extension may only observe the 720p `.mp4` URL.
- Desktop pasted-link and page-backed Weibo downloads now use managed `gallery-dl 1.32.8`, which has upstream Weibo video format selection fixes and defaults to the highest available Weibo format.
- The popup display layer already groups some page-scoped desktop candidates with previewable direct media candidates through `mergeDisplayCandidates(...)`, but it does not have a first-class `variants[]` model.
- `downloadMediaCandidate(...)` currently sends one selected video URL plus a page URL and one direct `videoCandidates` entry to the desktop app.
- Existing constraints from the prior task still apply:
  - do not add browser-to-desktop app launch/native messaging/deep-link behavior;
  - do not force gallery-dl through a redundant fallback route just to obey `balanced` or `data_saver`;
  - keep gallery-dl page extraction as the stable highest-quality Weibo download path where possible.

## Requirements

- Add a site-specific extension parsing layer that can run alongside the generic scanner.
- Implement a Weibo parser that can extract all available variants for the current logical video when the page exposes them in inline state, script JSON, structured data, or observable API payloads.
- Phase 1 should only parse page-local data already available to the content script. It must not add proactive Weibo API fetches.
- Represent same-video variants with a stable grouping contract instead of emitting unrelated one-URL rows.
- Make the popup display one logical Weibo video resource when variants belong to the same video.
- Default Weibo grouped downloads to the best available variant or to the desktop page-extraction candidate when that is more reliable.
- For Weibo grouped popup resources, the default selected variant should be the highest detected quality.
- For Weibo grouped popup resources, an explicit user-selected quality must strictly affect the main download action.
- Strict selected-quality downloads should cross the extension/desktop boundary through an explicit selected-variant payload field rather than overloading ordinary `url` or `videoCandidates` hints.
- If a strict user-selected Weibo variant fails to download, Ameow should fail that task with a clear selected-variant error instead of silently falling back to `gallery-dl` highest-quality extraction.
- If the desktop app is offline, a user-selected Weibo direct variant may fall back to the browser's native download path because the extension is already allowed to download independently.
- When the desktop app is online, selected Weibo variants should be submitted to the desktop queue first. Browser-native download fallback is only for offline or recoverable desktop-connection failure cases.
- Selected Weibo variants downloaded through the desktop queue should participate in the existing post-download compatibility probe/remux/transcode flow. Most Weibo variants are expected to land as MP4 and skip extra processing after probing.
- Pasted Weibo link downloads must keep the current desktop `gallery-dl` highest-quality behavior because pasted links may not have an open browser page for extension-side variant detection.
- Preserve a browser-download/copy-link path for concrete direct variant URLs when available.
- Preserve current fallback behavior when Weibo variant enumeration fails:
  - generic current-page candidate remains available;
  - observed direct media URLs remain available as hints;
  - desktop download still routes through the Weibo provider when a page URL is known.
- Keep the parser registry generic enough for future dedicated parsers such as Instagram, Bilibili edge cases, or other sites with hidden variant manifests.
- Deliver the work in two phases:
  - Phase 1: detect Weibo variants, merge them into one logical popup resource, and default downloads to the highest-quality reliable route.
  - Phase 2: add an explicit popup quality selector for the grouped Weibo resource.
- Add focused tests for parser extraction, candidate normalization, grouping, popup rendering behavior, and download payload routing.

## Acceptance Criteria

### Phase 1: Detection and Grouping

- [ ] Weibo pages can produce a site-specific logical video candidate with grouped quality variants when variant metadata is present.
- [ ] Phase 1 does not issue additional Weibo API requests; it only uses page-local data visible to the loaded page/content script.
- [ ] A page currently playing 720p can still expose a higher Weibo variant in extension scan results when the page metadata/API includes it.
- [ ] Variants for the same Weibo video are merged into one popup resource row rather than displayed as unrelated rows.
- [ ] The grouped Weibo row clearly indicates the highest available quality or variant count without relying on the global yt-dlp quality selector.
- [ ] Downloading the grouped Weibo row uses the reliable highest-quality path by default.
- [ ] Copying or browser-downloading a concrete variant still uses that variant URL when available.
- [ ] When no variants can be parsed, existing generic scan and current-page fallback behavior remains unchanged.
- [ ] The parser integration is registry-based or otherwise modular enough that a future site parser can be added without editing the generic detector internals heavily.

### Phase 2: Variant Selection

- [ ] The grouped Weibo popup row exposes a quality-selection interaction for detected variants.
- [ ] The quality-selection interaction is a compact inline dropdown or segmented menu within the grouped resource row, not separate top-level rows per quality.
- [ ] The selected quality is visible before download and remains scoped to that grouped Weibo resource.
- [ ] For Weibo grouped resources, the highest detected quality is selected by default.
- [ ] For Weibo grouped resources, selecting a lower quality strictly changes the main download action to that selected quality.
- [ ] Selected Weibo variants are represented by an explicit selected-variant payload field so the backend can distinguish user intent from passive `currentSrc` hints.
- [ ] If a selected Weibo variant fails because the direct URL is expired, unauthorized, blocked by referer, or otherwise unavailable, the task reports a selected-quality failure instead of silently downloading another quality.
- [ ] When the desktop app is online, selected Weibo variants are downloaded through the desktop queue/output-folder workflow.
- [ ] Desktop-queued selected Weibo variants participate in the existing compatibility probe/remux/transcode flow and skip extra processing when already compatible.
- [ ] If the desktop app is offline, a selected Weibo direct variant can use browser-native download fallback while preserving the selected quality.
- [ ] Pasted Weibo link downloads remain unchanged and default to desktop `gallery-dl` highest-quality extraction.
- [ ] Selecting a concrete variant changes copy/direct-variant actions to that variant.
- [ ] Downloading through desktop still has a safe default path when a selected direct variant is unavailable or unsuitable.
- [ ] The quality selector contract is generic enough for future grouped candidates from other site parsers.

### Validation and Docs

- [ ] Tests cover Weibo parser fixtures, one-video-many-variants grouping, currently-playing-720-with-1080-available behavior, no-variant fallback, and download routing from grouped candidates.
- [ ] Tests cover quality-selection state, selected-variant routing, and grouped-row rendering.
- [ ] Public docs are updated if the popup behavior or user-visible Weibo quality behavior changes.

## Out Of Scope

- Browser-to-desktop app launching or native messaging.
- Replacing desktop gallery-dl Weibo page extraction.
- Forcing gallery-dl to implement `balanced` or `data_saver` quality control.
- Adding custom parsers for non-Weibo sites in this task.
- Guaranteeing variant extraction when Weibo does not expose variant metadata to the loaded page/session.

## Product Decisions

- This task should eventually deliver both broader Weibo quality detection and explicit quality selection.
- Work may be implemented in phases.
- Phase 1 should prioritize parser architecture, grouped candidate display, and highest-quality default download.
- Phase 2 should add the quality selector after the grouped candidate contract is stable.
- The Phase 2 quality selector should be a compact inline dropdown or segmented menu on the grouped resource row.
- Quality variants should not be expanded into separate top-level popup rows.
- For Weibo grouped popup resources, the selector defaults to the highest detected quality.
- For Weibo grouped popup resources, the selector strictly controls the main download action.
- Strict selected-quality downloads should use an explicit cross-layer selected-variant field, tentatively named `selectedVideoVariant`.
- Strict selected-variant failures should be visible and actionable; they must not silently fall back to another quality.
- Browser-native fallback is allowed for selected Weibo direct variants when the desktop app is offline.
- Desktop-online downloads should prefer the desktop queue for selected Weibo variants; browser-native fallback is reserved for offline or recoverable desktop-connection failure cases.
- Desktop-queued selected Weibo variants should reuse the existing compatibility probe/remux/transcode path instead of adding a custom post-processing path.
- Phase 1 parser work should be page-local only. If page-local data does not expose complete variants on some Weibo pages, users may report those samples for a later bounded API-probing enhancement.
- Pasted Weibo link downloads remain page/link based and default to `gallery-dl` highest-quality extraction; they do not attempt extension-side quality selection.
- The compact selector should follow the existing extension localization style: short labels in `browser-extension/locales/*/extension.json`, with English and Simplified Chinese copy added together.

## Open Questions

- None blocking planning review.
