# Implementation Record

## Plan Review

`claude-consult` reviewed the plan before implementation.

Summary:

- `src/core/video-candidate-normalization.ts` is the right canonical location because it depends only on core modules and avoids Electron/runtime reverse dependencies.
- Exporting URL helpers is acceptable because Electron already exposes these helper names through `electron/videoHintNormalization.mts`.
- `video_selected_v2`, renderer command names, and old camelCase/snake_case compatibility are not affected by the proposed consolidation.
- Must-fix plan note: the canonical HTTP URL helper must trim input and keep the more defensive Electron blocklist for `blob`, `data`, `file`, `javascript`, and `mailto`.

## Implementation

- Added `src/core/video-candidate-normalization.ts` as the canonical desktop-side video candidate normalizer.
- Kept `electron/videoHintNormalization.mts` as a compatibility facade that re-exports the canonical helpers.
- Updated `src/electron-runtime/commandRouter.ts` to reuse canonical URL and candidate normalization instead of local duplicate candidate logic.
- Added `src/core/video-candidate-normalization.test.ts` to cover canonical behavior.
- Left browser-extension code, WebSocket protocol, IPC names, renderer command names, download routing, clip fields, title fields, extension data, and diagnostics behavior unchanged.

## Diff Review

`claude-consult` reviewed the final diff.

Summary:

- No must-fix issues.
- Dependency direction is clean: core normalizer depends only on core modules; Electron/runtime import downward.
- Old field compatibility is preserved for `videoCandidates` / `video_candidates` and `mediaType` / `media_type`.
- Pinterest ordering and Douyin/Xiaohongshu quality ordering are preserved through `orderVideoCandidatesForSite`.
- Not exporting the new module from `src/core/index.ts` is acceptable because `normalizeHttpUrl` would conflict with an existing barrel export.

## Validation

Targeted tests:

- `npx vitest run src/core/video-candidate-normalization.test.ts electron/videoHintNormalization.test.mts src/electron-runtime/commandRouter.test.ts electron/videoDownloadCommands.test.mts`

Full checks:

- `npm run type-check`
- `npm run lint`
- `npm test` (110 test files, 681 tests)
- `git diff --check`

All passed.

## Follow-Up

- None required for Phase 2.
