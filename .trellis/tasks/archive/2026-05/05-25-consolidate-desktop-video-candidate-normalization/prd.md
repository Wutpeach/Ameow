# Consolidate desktop video candidate normalization

## Goal

Consolidate duplicate desktop-side video candidate normalization so Electron-side adapters and the runtime command router reuse one canonical normalizer while preserving existing protocols, payload compatibility, routing behavior, and tests.

## Scope

- Inspect and consolidate normalization currently duplicated between:
  - `electron/videoHintNormalization.mts`
  - `src/electron-runtime/commandRouter.ts`
- Add a canonical runtime-neutral normalizer in the shared desktop/core layer.
- Keep Electron-facing modules as protocol adapters where needed.
- Preserve existing URL filtering, candidate metadata normalization, de-duplication, Pinterest video-hint filtering, and site-specific ordering behavior.
- Add focused tests for canonical behavior and affected callers.

## Non-Goals

- Do not modify `browser-extension/background.js`.
- Do not modify the browser-extension protocol.
- Do not modify WebSocket endpoint names or `video_selected_v2`.
- Do not remove old field compatibility such as camelCase/snake_case variants.
- Do not change renderer command names, IPC contracts, or download behavior.
- Do not work on SettingsPage/config helper, App reducer, Phase 3, JavaScript-to-TypeScript migration, bundling, or unrelated refactors.

## Acceptance Criteria

- [ ] One canonical desktop-side candidate normalizer exists and is reused by both Electron adapter code and `src/electron-runtime/commandRouter.ts`.
- [ ] Callers only adapt protocol field names and no longer duplicate candidate URL/media metadata normalization.
- [ ] Empty, missing, invalid, duplicated, and unusual candidate inputs preserve current behavior.
- [ ] Pinterest hint filtering keeps direct MP4/manifest-like video URLs and drops non-video Pinterest/page/image URLs.
- [ ] Non-Pinterest candidates keep existing metadata and ordering behavior, including Douyin/Xiaohongshu quality ordering.
- [ ] `videoUrl`, `videoCandidates`, `siteHint`, `title`, `clipStartSec`, `clipEndSec`, and extension data compatibility are preserved.
- [ ] Focused tests cover canonical normalizer behavior and existing Electron/runtime caller behavior.
- [ ] `npm run type-check`, `npm run lint`, and `npm test` pass before commit.

## Follow-Up Policy

If any branch has ambiguous behavior not covered by current tests, keep behavior unchanged and record it as a follow-up instead of expanding this phase.
