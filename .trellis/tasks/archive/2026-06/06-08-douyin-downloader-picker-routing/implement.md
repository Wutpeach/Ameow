# Implementation Plan

## Goal 1: Douyin Downloader Update Review

- [x] Read backend/runtime specs before code edits:
  - `.trellis/spec/guides/video-download-patterns.md`
  - `.trellis/spec/backend/sidecar-runtime-contracts.md`
  - `.trellis/spec/backend/electron-runtime-contracts.md`
- [x] Inspect upstream `jiji262/douyin-downloader` diff between `5144bd3...`, `desktop-v0.4.9`, and `main`.
- [x] Classify changed upstream files as desktop-only, CLI-facing, downloader-core-facing, config-facing, dependency-facing, or output-contract-facing.
- [x] Decide whether to pin latest tagged release, pin a specific newer commit, or keep current pin using the conservative threshold: update only for a demonstrated Ameow CLI/download-path benefit plus passing validation.
- [x] If updating, modify `electron/managedPythonPackageManifest.mts`:
  - `DOUYIN_DOWNLOADER_GIT_REF`
  - `DOUYIN_DOWNLOADER_VERSION` if `douyin-dl --version` changes
- [x] Run/build enough runtime code so `dist-electron` uses the current manifest.
- [x] Verify managed runtime metadata stays consistent when source/version is unchanged.

Update decision note: no managed runtime manifest update was made, so the manifest-edit sub-bullets are not applicable in this pass. `upstream-review.md` records why the current pin remains the safer choice under the conservative threshold.

## Goal 2: Generic Picker Source Routing

- [x] Read frontend/browser-extension specs if picker code changes.
- [x] Add a reusable helper for provider-owned capture source selection.
- [x] Filter non-HTTP(S) source candidates inside the helper before provider predicates run.
- [x] Migrate Douyin provider to the helper.
- [x] Parse Douyin `modal_id` from raw/evidence URLs, not just `ameowCapture.contentIds`.
- [x] Parse Douyin `content_id` from raw/evidence `/video|note|gallery/{id}` URLs and preserve the path type.
- [x] Extend Douyin provider matching to bounded capture evidence URLs where appropriate.
- [x] Ensure accepted picker `targetHref` / `targetSrc` wins over generic page URLs.
- [x] Leave Instagram on its existing local logic unless migration is clearly equivalent and low-risk.

## Tests

- [x] Add/adjust `src/sites/providers.test.ts` cases:
  - Douyin target permalink evidence beats `jingxuan` page URL.
  - Douyin target source evidence can come from `targetHref` and `targetSrc`.
  - Douyin raw `jingxuan?modal_id` synthesizes `/video/{id}` without extension evidence.
  - Douyin `/note/{id}` and `/gallery/{id}` evidence preserve their path type.
  - Douyin can match from capture evidence when top-level `url`/`pageUrl` are generic.
  - Generic helper filters `blob:` and other non-HTTP(S) source candidates.
  - Existing Instagram source evidence behavior still passes.
- [x] Keep browser extension capture evidence tests passing.
- [x] Keep command router extension-data preservation tests passing.

## Validation Commands

- [x] `npm test -- src/sites/providers.test.ts`
- [x] `npm test -- browser-extension/capture-evidence.test.js`
- [x] `npm test -- src/electron-runtime/commandRouter.test.ts`
- [x] `npm run electron:build`
- [x] `npm run runtime:smoke:downloaders`
- [ ] `npm run runtime:smoke:douyin-session -- <cookies-file> [url]` when authenticated Douyin cookies are available

Douyin session smoke note: not run in this environment because `%APPDATA%\ameow\site-sessions\douyin.json` is missing and no authenticated cookies file was provided.

Additional validation run:

- [x] `npm run type-check`
- [x] `npm run lint`
- [x] `git diff --check`

## Risk Points

- Upstream `douyin-downloader` may change config keys, output paths, manifest behavior, or version output.
- Passing raw direct media URLs to `douyin-dl` may be unsupported even if the host matches Douyin CDN domains.
- A generic helper can become too global if it tries to validate source URLs without provider predicates.
- Douyin SPA pages may still lack any recoverable content ID; that requires a separate extension/network-evidence enhancement.
