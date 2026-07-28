# Add extensible site-specific video variant parsing for Weibo

## Goal

Add a browser-extension path that can discover higher-quality Weibo video variants even when the user has not selected that quality in the page player.

The implementation should introduce a reusable site-specific parser model rather than hard-coding one-off Weibo behavior into the generic media scanner. This matters because future sites may need similar custom extraction and candidate grouping.

## User Value

- On Weibo, the extension popup should not be limited to the currently playing rendition such as 720p when the same video exposes 1080p or other higher variants.
- Multiple quality URLs for the same Weibo video should appear as one logical resource instead of separate confusing rows.
- The default download action should still prefer the most reliable highest-quality path.
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
- Represent same-video variants with a stable grouping contract instead of emitting unrelated one-URL rows.
- Make the popup display one logical Weibo video resource when variants belong to the same video.
- Default Weibo grouped downloads to the best available variant or to the desktop page-extraction candidate when that is more reliable.
- Preserve a browser-download/copy-link path for concrete direct variant URLs when available.
- Preserve current fallback behavior when Weibo variant enumeration fails:
  - generic current-page candidate remains available;
  - observed direct media URLs remain available as hints;
  - desktop download still routes through the Weibo provider when a page URL is known.
- Keep the parser registry generic enough for future dedicated parsers such as Instagram, Bilibili edge cases, or other sites with hidden variant manifests.
- Add focused tests for parser extraction, candidate normalization, grouping, popup rendering behavior, and download payload routing.

## Acceptance Criteria

- [ ] Weibo pages can produce a site-specific logical video candidate with grouped quality variants when variant metadata is present.
- [ ] A page currently playing 720p can still expose a higher Weibo variant in extension scan results when the page metadata/API includes it.
- [ ] Variants for the same Weibo video are merged into one popup resource row rather than displayed as unrelated rows.
- [ ] The grouped Weibo row clearly indicates the highest available quality or variant count without relying on the global yt-dlp quality selector.
- [ ] Downloading the grouped Weibo row uses the reliable highest-quality path by default.
- [ ] Copying or browser-downloading a concrete variant still uses that variant URL when available.
- [ ] When no variants can be parsed, existing generic scan and current-page fallback behavior remains unchanged.
- [ ] The parser integration is registry-based or otherwise modular enough that a future site parser can be added without editing the generic detector internals heavily.
- [ ] Tests cover Weibo parser fixtures, one-video-many-variants grouping, currently-playing-720-with-1080-available behavior, no-variant fallback, and download routing from grouped candidates.
- [ ] Public docs are updated if the popup behavior or user-visible Weibo quality behavior changes.

## Out Of Scope

- Browser-to-desktop app launching or native messaging.
- Replacing desktop gallery-dl Weibo page extraction.
- Forcing gallery-dl to implement `balanced` or `data_saver` quality control.
- Adding custom parsers for non-Weibo sites in this task.
- Guaranteeing variant extraction when Weibo does not expose variant metadata to the loaded page/session.

## Open Question

- Should the first version of grouped Weibo resources expose an explicit per-variant quality picker in the popup, or only collapse variants into one row and default to the best route while retaining copy/source actions for diagnostics?
