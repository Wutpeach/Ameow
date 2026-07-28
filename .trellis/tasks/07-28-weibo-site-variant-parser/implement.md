# Implementation Plan: Weibo site-specific variant parser

## Checklist

- [ ] Read relevant specs before coding:
  - `.trellis/spec/frontend/index.md`
  - `.trellis/spec/backend/index.md`
  - `.trellis/spec/guides/video-download-patterns.md`
- [ ] Inspect current extension scan and popup tests:
  - `browser-extension/generic-video-detector.test.js`
  - `browser-extension/media-network-cache.test.js`
  - popup media rendering tests
  - background download candidate routing tests
- [ ] Add a reusable parser registry module for extension-side site parsers.
- [ ] Add a Weibo parser module with pure helpers for:
  - Weibo host/page detection;
  - status/detail id extraction;
  - bounded JSON/script parsing;
  - recursive variant discovery;
  - variant ranking and grouping.
- [ ] Integrate parser output into `collectPageMediaCandidates()` without breaking generic scan results.
- [ ] Extend background candidate normalization only for bounded optional grouping/variant fields needed by downloads.
- [ ] Extend popup grouping/display so variants from one Weibo video render as one resource.
- [ ] Decide and implement MVP interaction:
  - best/default row only; or
  - explicit per-variant picker.
- [ ] Ensure grouped Weibo row downloads through canonical page/detail URL by default and keeps direct variant URL actions where supported.
- [ ] Preserve no-variant fallback behavior.
- [ ] Update public docs if popup behavior changes.

## Validation Commands

- `node --test browser-extension/generic-video-detector.test.js`
- `node --test browser-extension/media-network-cache.test.js`
- relevant popup/background extension tests after locating exact filenames
- `npm run type-check`
- `npm run lint`
- `npm test`
- `npm run docs:build` if docs are changed
- Manual check on a Weibo page with current playback below the highest available quality:
  - popup shows one logical Weibo video resource;
  - highest available variant is indicated or selected by default;
  - download from popup reaches desktop Weibo provider/gallery-dl path.

## Risky Files

- `browser-extension/manifest.json`
- `browser-extension/generic-video-detector.js`
- `browser-extension/background.js`
- `browser-extension/popup.js`
- `browser-extension/media-network-cache.js`
- `browser-extension/generic-video-selection-utils.js`
- new site parser/registry files under `browser-extension/`
- browser-extension locale files if new UI copy is added

## Planning Gate

Before implementation starts, resolve whether MVP includes an explicit popup variant picker or a collapsed best-by-default grouped row.
