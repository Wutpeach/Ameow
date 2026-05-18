# Implementation Plan

## Ordered Checklist

1. Provider routing
   - Update `src/sites/xiaohongshu.ts` so Xiaohongshu video plans do not depend on `videoUrl` or `videoCandidates`.
   - Stop matching bare xhscdn direct video assets as Xiaohongshu unless a page URL or explicit site hint identifies the note.
   - Ensure yt-dlp source URL normalization outputs only `www.xiaohongshu.com/explore/<hexId>` or `www.xiaohongshu.com/discovery/item/<hexId>` with optional query params.
   - Prefer tokenized `discovery/item/<hexId>?xsec_token=...` detail URLs when available; otherwise use `/explore/<hexId>`.
   - Update provider tests.

2. Runtime pre-resolution cleanup
   - Remove `resolveXiaohongshuPageHints(...)` from `src/electron-runtime/service.ts`.
   - Trim or remove `src/electron-runtime/xiaohongshuPageHints.ts` direct-video hint logic.
   - Preserve only image/drag helpers still needed by `electron/main.mts` or renderer flows.

3. Electron main cleanup
   - Remove hidden-detail polling and fallback branches that only exist to discover Xiaohongshu direct video URLs.
   - Keep command compatibility and any image-oriented drag/context resolution still needed for `save_image_from_page`.
   - Update backend contract docs for the simplified Xiaohongshu video path.

4. Browser extension cleanup
   - Simplify `browser-extension/xiaohongshu-detector.js` video payloads to send note/page URL plus `siteHint: "xiaohongshu"`.
   - Preserve or surface tokenized `detailUrl` as the preferred yt-dlp URL when it already matches the extractor.
   - Remove direct video candidate extraction if no image path uses it.
   - Keep image URL extraction and `save_image_from_page`.
   - Update or remove Xiaohongshu drag resolution utility tests as needed.

5. Specs and tests
   - Update `.trellis/spec/backend/index.md` and `.trellis/spec/backend/electron-runtime-contracts.md`.
   - Update frontend specs if they still require forwarding Xiaohongshu video `detailUrl` / direct candidates.
   - Run focused tests and global checks.

## Validation Commands

```bash
npm run type-check
npm run lint
npm test -- --run src/sites/providers.test.ts src/electron-runtime/service.test.ts src/electron-runtime/xiaohongshuPageHints.test.ts
node --check browser-extension/xiaohongshu-detector.js
node --test browser-extension/xiaohongshu-drag-resolution-utils.test.js
```

Adjust the focused test list if modules are deleted or tests move.

## Risky Files / Rollback Points

- `browser-extension/xiaohongshu-detector.js`: large site-specific file with both video and image behavior. Keep edits localized and syntax-check after each major change.
- `electron/main.mts`: contains mixed Xiaohongshu image, drag, hidden detail, and queue logic. Remove video-only code carefully.
- `src/electron-runtime/xiaohongshuPageHints.ts`: may be deletable only after checking all imports.
- Specs may contain old direct-download requirements that should be updated with code changes.

Rollback point: after provider/test cleanup, before removing extension and Electron hidden-detail code. If image behavior becomes entangled, keep image helpers and defer deeper removal.

## Review Gate Before Start

- User has approved preserving image save/drag behavior.
- User should approve this design before `task.py start`.
