# Implementation Plan: Weibo video quality and gallery-dl handling

## Checklist

- [x] Read relevant specs before coding:
  - `.trellis/spec/frontend/index.md`
  - `.trellis/spec/backend/index.md`
  - `.trellis/spec/guides/video-download-patterns.md`
- [x] Confirm latest stable gallery-dl release from official upstream sources:
  - PyPI package version;
  - Codeberg release/tag;
  - GitHub release mirror status.
- [x] Update `electron/managedPythonPackageManifest.mts` from `gallery-dl==1.32.1` to the selected current stable version.
- [x] Force reinstall or rebuild the managed gallery-dl runtime and verify `gallery-dl --version`.
- [x] Inspect the selected gallery-dl Weibo extractor behavior:
  - whether it still selects highest `quality_index` by default;
  - whether release notes/tests indicate the Weibo video format selection fix applies to our target URLs;
  - whether metadata output can help verify selected quality.
- [x] Add fixtures for Weibo grouped variants:
  - one logical video with 720 currently playing and higher variants available;
  - one single-variant fallback case;
  - one `tv/show` URL case.
- [x] Keep gallery-dl command planning lean unless a supported upstream option is found for highest-quality verification.
- [x] Do not add a fallback route solely to force `balanced` or `data_saver` behavior for gallery-dl-backed Weibo downloads.
- [x] Ensure current playback media URLs do not override Weibo page/provider extraction when gallery-dl can resolve the page.
- [x] Add tests for managed package pinning, gallery-dl command planning, Weibo provider routing, and runtime payload handling.
- [x] Update docs if visible behavior changes.

## Implementation Results

- Updated the managed gallery-dl package pin to `gallery-dl==1.32.8`.
- Kept normal Weibo detail/status routing as `gallery-dl` primary with `yt-dlp` fallback.
- Kept Weibo `tv/show` routing on the existing supported `yt-dlp` path.
- Added a provider regression test where a current 720p direct playback URL is present, but the Weibo page URL still drives gallery-dl extraction through `https://weibo.com/detail/<id>`.
- Did not add browser-to-desktop launch behavior.
- Did not add a forced fallback route for gallery-dl `balanced` / `data_saver` control.
- Updated public supported-site docs in Chinese and English with Weibo quality behavior.

## Validation Results

- `npx vitest run electron/managedRuntimeBootstrap.test.mts`
- `npx vitest run electron/downloaderVersionInfo.test.mts`
- `npx vitest run src/sites/providers.test.ts`
- `npx vitest run src/electron-runtime/galleryDlCommandPlan.test.ts`
- `npm run type-check`
- `npm run lint`
- `npm run docs:build`
- `npm run runtime:smoke:downloaders` verified fresh managed install with `gallery-dl` version `1.32.8`.
- `npm test` passed 144 test files and 1002 tests.

## Validation Commands

- `npm run type-check`
- `npm run lint`
- Relevant browser-extension tests, likely:
  - `node --test browser-extension/generic-video-detector.test.js`
  - `node --test browser-extension/generic-video-selection-utils.test.js`
  - any new Weibo quality propagation tests
- Relevant runtime tests, likely:
  - tests covering `src/sites/weibo.ts`
  - tests covering `src/electron-runtime/galleryDlCommandPlan.ts`
  - tests covering `electron/managedPythonPackageManifest.mts`
  - tests covering payload normalization and selected quality handling

## Risky Files

- `browser-extension/generic-video-detector.js`
- `browser-extension/generic-video-selection-utils.js`
- `browser-extension/background.js`
- `src/sites/weibo.ts`
- `src/sites/gallery-dl-support.ts`
- `src/electron-runtime/galleryDlCommandPlan.ts`
- `electron/managedPythonPackageManifest.mts`
- `electron/managedRuntimeBootstrap.mts`
- `src/electron-runtime/ytDlpCommandPlan.ts`
- shared runtime types under `src/core/` and `src/types/`

## Review Before Start

- Confirm whether "best quality" should override the current default `balanced` preference for Weibo when multiple variants are known.
- Confirm whether gallery-dl should remain the primary Weibo engine for all normal Weibo pages after the version update.
- Confirm whether a direct selected media URL is allowed to bypass `gallery-dl` only when gallery-dl cannot resolve the page.
