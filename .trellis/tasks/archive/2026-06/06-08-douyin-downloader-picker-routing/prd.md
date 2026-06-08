# Douyin downloader update and generic picker source routing

## Goal

Improve Douyin download reliability through two planned goals:

1. Evaluate whether Ameow should update its managed `douyin-dl` backend from upstream `jiji262/douyin-downloader`, focusing on download-core impact rather than upstream desktop GUI changes.
2. Fix picker-based downloads through a generic captured-source routing pattern that other site providers can reuse.

User-facing value:

- Douyin users who click the browser extension's picker on a visible item should not fail just because the browser address bar is a generic or incomplete SPA URL.
- Future site providers should be able to prefer picker-target evidence without duplicating brittle ad hoc source-selection logic.

## Confirmed Facts

- Ameow installs `douyin-dl` as a managed Python package from `https://github.com/jiji262/douyin-downloader/archive/<git-ref>.zip`.
- Current pin lives in `electron/managedPythonPackageManifest.mts`:
  - `DOUYIN_DOWNLOADER_VERSION = "2.0.0"`
  - `DOUYIN_DOWNLOADER_GIT_REF = "5144bd3dec91cd2711cfdccbf36c10af17eb93fc"`
- GitHub upstream state checked on 2026-06-08:
  - latest release: `desktop-v0.4.9`, published 2026-05-28, tag SHA `f856869863ccca107dc2c086487ee8955d84c23f`
  - current Ameow pin matches upstream tag `desktop-v0.4.8`
  - upstream `main` is at `dc7e967b1680cf18beae9857fb99eb43fe0aeee6`
- Upstream compare `5144bd3...f856869...` shows four commits. Although the release is named `desktop-v0.4.9`, the changed files include download-core paths: `core/api_client.py`, `core/downloader_base.py`, `core/user_downloader.py`, `core/user_modes/*`, config defaults/loaders, and audio/transcript extraction modules.
- Upstream compare `f856869...dc7e967...` shows two additional `main` commits touching `core/downloader_base.py`, `core/video_downloader.py`, and media quality tests.
- `src/sites/douyin.ts` currently selects a `douyin-dl` source from accepted canonical/OG URLs or `ameowCapture.contentIds.modal_id`, then falls back to `input.pageUrl ?? input.url`.
- `browser-extension/capture-evidence.js` picker payload can carry `targetHref` and `targetSrc`, but the Douyin provider does not currently use them.
- `src/sites/gallery-dl-supported.ts` already has a provider-local pattern for Instagram that prioritizes capture evidence URLs such as `targetHref` and `targetSrc`.
- `douyin-dl did not produce an output file: URLParser - ERROR - Unsupported...` is emitted after `douyin-dl` exits without a usable artifact; the URLParser diagnostic comes from upstream `douyin-downloader`.

## Requirements

- Evaluate the latest upstream `jiji262/douyin-downloader` release and decide whether Ameow should update the managed `douyin-dl` pin based on backend/download behavior relevant to Ameow.
- Treat upstream desktop GUI additions as non-goals unless they also affect the CLI package, downloader core, config schema, or output behavior used by Ameow.
- Use a conservative update threshold: do not update solely because a newer upstream release exists; update only when review finds a clear benefit to Ameow's CLI/download path and validation passes.
- If updating, change the managed runtime manifest through the existing pinning mechanism and ensure stale managed runtimes rebuild based on metadata/source/version mismatch.
- Preserve the existing sidecar-first backend architecture; do not reintroduce direct-download backend paths.
- Fix Douyin picker downloads where the address bar/page URL is incomplete but extension evidence contains a usable content target or ID.
- Prefer a reusable provider helper/contract for source selection from capture evidence:
  - accepted canonical URLs
  - accepted Open Graph URLs
  - picker `targetHref`
  - picker `targetSrc`
  - bounded structured-data URLs
  - provider-owned content ID synthesis
  - final fallback to `pageUrl ?? url`
- Make the generic helper provider-owned/configurable: each site must define what URL shapes are accepted and how content IDs may be synthesized.
- Ensure Douyin still synthesizes `https://www.douyin.com/video/{id}` from `modal_id`, including when that ID is present in `pageUrl`/`url` rather than extension evidence.
- Ensure Douyin source synthesis also handles `content_id` extracted from `/video|note|gallery/{id}` evidence, preserving the original content path type instead of always forcing `/video/{id}`.
- Ensure Douyin provider matching can consider bounded capture evidence, so a picked Douyin target is not missed just because the top-level `url`/`pageUrl` is generic or non-Douyin.
- Keep `blob:` and other non-HTTP(S) media values out of backend source URLs.
- Improve tests around picker evidence so regressions are caught before packaging.

## Acceptance Criteria

- [ ] Research note or design section records whether `douyin-downloader` should move from `5144bd3...` / `desktop-v0.4.8` to a newer upstream ref, separating desktop-only changes from CLI/download-core changes and documenting risks plus validation results.
- [ ] If the update is accepted, `electron/managedPythonPackageManifest.mts` pins the chosen upstream ref/version and managed runtime smoke checks still verify the reported CLI version.
- [ ] Douyin provider tests prove `targetHref` / `targetSrc` evidence pointing at accepted Douyin content pages wins over a generic page URL.
- [ ] Douyin provider tests prove `jingxuan?modal_id=...` can synthesize `/video/{id}` even without extension `ameowCapture.contentIds`.
- [ ] Douyin provider tests prove `/note/{id}` and `/gallery/{id}` evidence keep their path type and are not rewritten to `/video/{id}`.
- [ ] Douyin provider matching tests cover a picked Douyin evidence URL when the top-level page URL is generic or non-Douyin.
- [ ] A shared helper or clearly reusable pattern covers capture-evidence source ordering for site providers without hardcoding Douyin-only behavior.
- [ ] The shared helper filters non-HTTP(S) values such as `blob:` before provider acceptance checks.
- [ ] Browser extension picker tests continue to prove `targetHref` and `targetSrc` are preserved in `ameowCapture`.
- [ ] Runtime/download tests cover the user-facing failure path enough to prevent unsupported page URLs from being sent to `douyin-dl` when better evidence exists.
- [ ] Relevant docs/specs are updated if the capture-evidence contract or supported Douyin behavior changes.

## Out Of Scope

- Building a full Douyin DOM/network parser inside the extension.
- Downloading directly from Douyin CDN/blob URLs in the backend.
- Changing the user-visible extension picker interaction model beyond evidence quality/selection.
- Replacing `douyin-downloader` with another backend.

## Open Questions

- None currently blocking planning.

## Notes

- Upstream repository: https://github.com/jiji262/douyin-downloader
- This is a complex task because it touches managed runtime dependency policy, browser-extension capture evidence, backend provider routing, and runtime validation.
- Update-threshold decision from user: follow the conservative recommendation. Prefer no pin change unless upstream changes demonstrably improve Ameow's CLI/download path; if updating, prefer a tagged release over `main`.
- Claude planning review completed. Must-fix implementation notes: read `content_id` as well as `modal_id`, preserve `/note` and `/gallery` path types during synthesis, consider capture evidence in Douyin provider matching, and filter non-HTTP(S) source candidates in the generic helper.
- Upstream review result recorded in `upstream-review.md`: keep the current pin for this pass because `desktop-v0.4.9` does not change `core/url_parser.py` and adds dependency/runtime surface without a demonstrated fix for the current failure.
