# Clean up Xiaohongshu direct download and parsing

## Goal

Make Xiaohongshu video downloads rely on yt-dlp using canonical note URLs, and remove the older direct-link extraction / page-resolution paths that were built to recover xhscdn video assets manually.

The cleanup should make the codebase easier to reason about: Xiaohongshu videos should follow the same high-level path as other yt-dlp-managed sites, while any remaining Xiaohongshu image handling should stay separate and explicit.

## Confirmed Facts

- The runtime site strategy for `xiaohongshu` is already `single_engine` with `engineOrder: ["yt-dlp"]` in `src/download-capabilities/runtime-site-strategies.ts`.
- `src/sites/xiaohongshu.ts` still accepts direct xhscdn video assets and `videoCandidates`, preserves candidates on the video intent, and canonicalizes note URLs before building the yt-dlp plan.
- `src/electron-runtime/xiaohongshuPageHints.ts` still performs page/API/HTML media probing and extracts direct CDN or m3u8 candidates.
- `src/electron-runtime/service.ts` calls `resolveXiaohongshuPageHints(...)` before queue execution.
- `electron/main.mts` contains Xiaohongshu hidden-detail and drag-resolution fallback logic that can resolve direct media candidates before download.
- `browser-extension/xiaohongshu-detector.js` still extracts video candidates, direct video URLs, and media metadata for download payloads.
- The app still has Xiaohongshu image flows (`save_image_from_page`, protected image/background fetch, drag image handling) that may be independent from video direct-link cleanup.
- Product decision: Xiaohongshu image saving/drag behavior should be preserved for now.
- yt-dlp's Xiaohongshu extractor `_VALID_URL` only matches `https://www.xiaohongshu.com/explore/<hexId>` and `https://www.xiaohongshu.com/discovery/item/<hexId>` forms; profile URLs, `xhslink.com`, and bare CDN URLs must be normalized before reaching yt-dlp.
- yt-dlp has a test case for `discovery/item/<id>?xsec_token=...`, so a tokenized detail URL is a valid preferred yt-dlp source when available.

## Requirements

- Xiaohongshu video downloads should route through yt-dlp using a URL that matches yt-dlp's extractor (`www.xiaohongshu.com/explore/<hexId>` or `www.xiaohongshu.com/discovery/item/<hexId>`), not xhscdn direct video URLs or extracted m3u8/direct candidates.
- Remove or disable Xiaohongshu-specific direct video candidate extraction from extension, Electron runtime, and provider layers where it only exists to feed video downloads.
- Remove Xiaohongshu page-hint probing from the generic download queue path if yt-dlp no longer needs pre-resolved CDN URLs.
- Preserve canonical URL handling for note URLs: expand `xhslink.com`, convert profile-note URLs to `/explore/<hexId>`, and prefer tokenized `discovery/item/<hexId>?xsec_token=...` detail URLs when available.
- Preserve non-video image saving and image drag behavior.
- Update tests and backend/frontend specs so future work does not reintroduce Xiaohongshu direct-video fallback paths.

## Acceptance Criteria

- [ ] Xiaohongshu video plans use `yt-dlp` only and do not depend on `videoCandidates` or direct xhscdn URLs for success.
- [ ] Pasted, extension-injected, and drag/drop Xiaohongshu video flows enqueue canonical note/page URLs for yt-dlp.
- [ ] All Xiaohongshu yt-dlp source URLs match `https://www.xiaohongshu.com/(explore|discovery/item)/<hexId>` with optional query parameters.
- [ ] The queue path no longer performs Xiaohongshu direct-video page/API probing before runtime execution.
- [ ] Existing Xiaohongshu image download/drag behavior remains available.
- [ ] Obsolete Xiaohongshu direct-video tests are removed or rewritten around yt-dlp canonical URL routing.
- [ ] `npm run type-check`, `npm run lint`, and task-relevant tests pass.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.

## Open Questions

- None currently blocking requirements.
