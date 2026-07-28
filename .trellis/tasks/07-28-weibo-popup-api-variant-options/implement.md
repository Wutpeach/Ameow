# Implementation Plan: Weibo popup API variant options

## Checklist

- [x] Read implementation specs before coding:
  - `.trellis/spec/frontend/index.md`
  - `.trellis/spec/backend/index.md`
  - `.trellis/spec/guides/video-download-patterns.md`
- [x] Inspect current extension bridge patterns:
  - `browser-extension/xiaohongshu-contextmenu-guard.js`
  - `browser-extension/xiaohongshu-page-bridge.js`
  - `browser-extension/protected-image-detector.js`
  - `browser-extension/protected-image-page-bridge.js`
- [x] Add a Weibo document-start injector scoped to Weibo hosts.
- [x] Add `browser-extension/weibo-page-bridge.js`.
- [x] Expose the bridge in `browser-extension/manifest.json` web-accessible resources.
- [x] Add a bounded observed-variant cache consumed by `weibo-variant-parser.js`.
- [x] Merge observed API variants with existing DOM-script variants.
- [x] Preserve existing grouped candidate fields and highest-quality default selection.
- [x] Add tests for API-response-only variants.
- [x] Add tests proving popup selector rendering for a grouped candidate with multiple variants.
- [x] Add/adjust tests for selected-variant routing if production behavior changes.
- [x] Merge direct media rows with grouped Weibo variant rows when the direct URL is one of the grouped variants.
- [x] Filter Weibo observed/API and DOM-script variants to the current status id/canonical page URL.
- [x] Prevent nested recommendation/sidebar variants from inheriting an outer current Weibo status id.
- [x] Merge Weibo direct player rows with grouped desktop variant rows when `?layerid=` and canonical `/detail/{id}` refer to the same status.

## Validation Commands

- `npx vitest run browser-extension/weibo-page-bridge.test.js browser-extension/weibo-variant-parser.test.js browser-extension/generic-video-detector.test.js browser-extension/popup-download-capability.test.js`
- `npm run type-check`
- `npm run lint`
- `npm run package:browser-extension`

## Risky Files

- `browser-extension/manifest.json`
- `browser-extension/weibo-variant-parser.js`
- `browser-extension/generic-video-detector.js`
- `browser-extension/popup.js`
- new Weibo bridge/injector files under `browser-extension/`

## Manual Check

On a Weibo page where the player is currently on a lower rendition:

- open the extension popup after the page finishes loading;
- verify one logical Weibo video row appears;
- verify the row shows multiple quality options;
- verify the highest detected quality is selected by default;
- select a lower quality and submit download;
- verify the selected variant is preserved in the extension download payload.

## Planning Gate

User approved implementation by saying "开始"; task was moved to `in_progress`.
