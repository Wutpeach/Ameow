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
- [ ] Keep Phase 1 Weibo parsing page-local only; do not add proactive Weibo API fetches.
- [ ] Integrate parser output into `collectPageMediaCandidates()` without breaking generic scan results.
- [ ] Extend background candidate normalization only for bounded optional grouping/variant fields needed by downloads.
- [ ] Extend popup grouping/display so variants from one Weibo video render as one resource.
- [ ] Phase 1: ensure grouped Weibo row defaults to the highest detected quality and keeps canonical page/detail URL routing where no explicit variant has been selected.
- [ ] Preserve no-variant fallback behavior.
- [ ] Phase 2: add compact inline dropdown or segmented-menu quality selector UI for grouped Weibo variants.
- [ ] Phase 2: route selected-variant copy/direct actions and make Weibo grouped main downloads strictly use the selected variant.
- [ ] Add an explicit selected-variant payload field, tentatively `selectedVideoVariant`, instead of overloading ordinary `url` or `videoCandidates`.
- [ ] Extend raw download input validation and runtime routing so explicit selected variants are not confused with passive current-playback hints.
- [ ] Keep selected Weibo variants desktop-first when the desktop app is online.
- [ ] Reuse existing desktop compatibility probe/remux/transcode behavior for desktop-queued selected Weibo variants.
- [ ] Ensure strict selected-variant failures report an actionable selected-quality error and do not silently fall back to another quality.
- [ ] Preserve browser-native download fallback for selected Weibo direct variants when the desktop app is offline or submission fails recoverably.
- [ ] Preserve pasted Weibo link downloads on gallery-dl highest-quality extraction.
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

Before implementation starts, resolve the payload/runtime representation for strict selected-variant downloads.
