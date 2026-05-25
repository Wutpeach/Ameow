# Consolidate Desktop Video Candidate Normalization Info

## Current Duplicate Implementations

`electron/videoHintNormalization.mts` currently owns:

- generic HTTP(S) URL normalization for desktop video hints
- Pinterest hint filtering for direct MP4 and manifest-like URLs
- optional candidate metadata cleanup
- media type normalization from `mediaType` / `media_type`
- candidate de-duplication by normalized URL
- `orderVideoCandidatesForSite` ordering
- helper exports used by Electron main, extension request bridge, Xiaohongshu drag-media result builder, and tests

`src/electron-runtime/commandRouter.ts` currently duplicates much of the same candidate normalization:

- local HTTP URL normalization
- local Pinterest video hint filtering
- local optional label/media type cleanup
- local candidate filtering/de-duplication
- local call to `orderVideoCandidatesForSite`

The router also owns broader queue payload normalization, including required route URL validation, page/video URL normalization, extension data, drag diagnostics, clip ranges, and video quality. This task should not move those broader responsibilities unless directly needed to reuse the candidate normalizer.

## Canonical Module Placement

Use `src/core/video-candidate-normalization.ts`.

Reasoning:

- It can depend on `src/core/site-hints.ts`, `src/core/video-candidate-order.ts`, and `src/core/types/media-candidate.ts`.
- `electron/` may import `../src/core/...` as it already does.
- `src/electron-runtime/commandRouter.ts` may import `../core/...` without creating a reverse dependency.
- It avoids putting shared protocol logic in `electron/` or `src/electron-runtime/`, which would recreate cross-layer coupling.

## Planned Callers

- `electron/videoHintNormalization.mts`
  - Keep public helper names for Electron-side compatibility.
  - Delegate core URL/candidate normalization to the canonical module.
  - Continue to provide Electron `.mjs` import surface for existing Electron tests/callers.

- `src/electron-runtime/commandRouter.ts`
  - Keep queue payload normalization local.
  - Replace local candidate normalization helpers with canonical normalizer calls.
  - Keep required URL, page URL, extension data, drag diagnostic, clip range, and quality normalization behavior unchanged.

## Compatibility That Must Stay Stable

- `video_selected_v2` and `queue_video_download` field names remain compatible.
- `videoCandidates` and `video_candidates` remain accepted by `commandRouter`.
- Candidate `mediaType` and `media_type` remain accepted.
- Pinterest only accepts direct MP4 and manifest-like hint URLs.
- Non-Pinterest HTTP(S) hints remain accepted for runtime-owned validation.
- Candidate order still comes from `orderVideoCandidatesForSite`.
- Duplicate candidate URLs are removed after URL normalization.
- `clipStartSec`, `clipEndSec`, `title`, `siteHint`, `extensionData`, and diagnostics are not changed by this candidate-only consolidation.

## Validation Focus

- `electron/videoHintNormalization.test.mts`
- `src/electron-runtime/commandRouter.test.ts`
- new canonical normalizer tests
- `npm run type-check`
- `npm run lint`
- `npm test`
