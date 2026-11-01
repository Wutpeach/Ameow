# browser extension boundary refactor

## Plan

1. Remove extension-side short-link expansion.
2. Simplify extension forwarding to stop rewriting URLs or deriving extra routing hints.
3. Keep browser-only selection and image resolution paths intact.
4. Keep backend provider routing and downloader execution as-is.
5. Keep generic video cookies owned by backend site-login state, not extension payloads.
6. Remove Xiaohongshu from generic pasted-video extension assistance unless a browser-only fallback is still explicitly required.
7. Update tests to reflect raw URL forwarding and provider-first routing.
8. Run focused validation.

## Work Items

- [x] Delete or retire `browser-extension/short-link-resolution.js`.
- [x] Remove `resolveVideoSelectionShortLinks(...)` usage from `browser-extension/background.js`.
- [x] Stop extension-side short-link URL rewriting that exists only for routing.
- [x] Keep `queue_pasted_video_download` as a browser-assisted fallback path only when page context is needed.
- [x] Remove `xiaohongshu` from the generic pasted-video extension-assisted site set unless an explicit browser-only fallback remains justified.
- [x] Keep provider matching in backend site registries and provider implementations.
- [x] Confirm no remaining runtime short-link pre-expansion code was added or required.
- [x] Do not add generic browser-extension cookies to video queue payloads; leave cookies for backend site-login state and request-level browser/media resolution flows.
- [x] Update or delete tests that assert browser-side short-link expansion.
- [x] Add tests that assert Xiaohongshu pasted video URLs stay backend-first.

## Validation

- `npm run test -- src/core/short-links.test.ts`
- `npm run test -- src/download-capabilities/provider-alignment.test.ts`
- `npm run test -- src/orchestration/download-orchestrator.test.ts`
- `npm run test -- electron/videoDownloadCommands.test.mts`
- `npm run test -- src/electron-runtime/ytDlpDownload.test.ts`
- `npm run test -- src/sites/providers.test.ts`
- `npm run test -- src/utils/xiaohongshu.test.ts`
- `npm run test -- src/electron-runtime/xiaohongshuPageHints.test.ts`
- `npm run test -- browser-extension/xiaohongshu-drag-resolution-utils.test.js`

## Rollback Points

- If raw short links stop reaching the correct provider, restore only the minimum routing helper needed in backend, not the extension-side expansion chain.
- If pasted-page selection loses metadata needed by image or current-item flows, restore only the browser-only selection fields, not URL rewriting.
- If a site-specific downloader cannot handle a short redirect host, add a backend provider rule or downloader fallback instead of reintroducing extension pre-expansion.
