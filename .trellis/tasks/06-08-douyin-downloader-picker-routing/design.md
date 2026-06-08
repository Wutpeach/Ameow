# Design: Douyin Downloader Update And Generic Picker Source Routing

## Architecture And Boundaries

Keep the existing flow:

```text
browser extension / UI request
  -> RawDownloadInput
  -> site provider resolves provider-owned sourceUrl
  -> sidecar engine plan
  -> managed runtime executor
```

The generic fix belongs in the site-provider layer, not in the extension as a site-specific URL rewriter and not in `douyinDlDownload.ts` as downloader-specific rescue logic. Providers own the question "which source URL should this engine receive?"

## Goal 1: Upstream Dependency Evaluation

Current state:

- Ameow pins `douyin-downloader` by Git archive URL in `electron/managedPythonPackageManifest.mts`.
- Current pin: `5144bd3dec91cd2711cfdccbf36c10af17eb93fc`.
- Latest release observed on 2026-06-08: `desktop-v0.4.9` at `f856869863ccca107dc2c086487ee8955d84c23f`.
- Upstream `main` observed on 2026-06-08: `dc7e967b1680cf18beae9857fb99eb43fe0aeee6`.

Evaluation should compare:

- CLI entrypoint name and `--version` output stability.
- Supported URL patterns and URLParser behavior for Douyin `/video/{id}`, `/note/{id}`, `/gallery/{id}`, and `jingxuan?modal_id=...` if upstream supports it.
- Config compatibility with Ameow's generated YAML, especially `browser_fallback`, `download_manifest.jsonl`, path/output behavior, and cookie handling.
- Dependency changes that affect managed Python runtime bootstrap or package size.
- Whether upstream changes are GUI-only, CLI-facing, downloader-core-facing, or config/output-contract-facing.

Known upstream diff observations:

- `desktop-v0.4.9` is not purely desktop GUI work. It includes changes in `core/api_client.py`, `core/downloader_base.py`, `core/user_downloader.py`, `core/user_modes/*`, and config modules, plus audio/transcript extraction additions.
- Upstream `main` after `desktop-v0.4.9` further changes `core/downloader_base.py`, `core/video_downloader.py`, and media quality tests.
- The review should identify whether those core changes improve Ameow's actual CLI execution path before changing the pin.

Default policy, confirmed by the user: prefer "no pin change unless the review finds relevant CLI/download-core benefit." If there is relevant benefit, prefer the latest tagged release over `main` unless a specific bug fix exists only on `main` and the risk is explicitly accepted.

## Goal 2: Generic Capture Source Routing

Introduce a reusable provider helper, likely under `src/sites/`, that resolves source URLs from bounded capture evidence:

```ts
type CaptureSourceResolutionOptions = {
  isAcceptedSource(value: string | undefined): boolean;
  synthesizeSource?(input: RawDownloadInput): string | undefined;
  fallback?(input: RawDownloadInput): string;
};
```

Suggested ordering:

1. `ameowCapture.canonicalUrl`
2. `ameowCapture.ogUrl`
3. `ameowCapture.targetHref`
4. `ameowCapture.targetSrc`
5. `ameowCapture.structuredDataUrls[]`
6. `input.url`
7. `input.pageUrl`
8. provider-specific synthesis from IDs found in evidence or URL query/path
9. fallback `input.pageUrl ?? input.url`

The exact order may put provider synthesis before raw fallback for Douyin so `jingxuan?modal_id=...` becomes `/video/{id}` instead of being passed directly to `douyin-dl`.

The helper must not decide which URL shapes are valid globally. Providers pass an `isAcceptedSource` predicate, which keeps Instagram, Douyin, and future sites independent.

The helper should filter non-HTTP(S) values before invoking provider predicates. This keeps `blob:` and browser-internal URLs out of backend engine plans without forcing each provider to repeat the same guard.

Provider-specific synthesis must be allowed to re-examine URLs that failed `isAcceptedSource`. For Douyin, `jingxuan?modal_id=...` is not an accepted downloader source, but it contains an ID that can produce an accepted `/video/{id}` source.

## Douyin Source Rules

Accepted Douyin engine sources:

- `https://www.douyin.com/video/{15-20 digit id}`
- `https://www.douyin.com/note/{15-20 digit id}`
- `https://www.douyin.com/gallery/{15-20 digit id}`
- direct Douyin media URLs only if the existing provider intentionally supports them through `douyin-dl`

Synthesized Douyin source:

- `modal_id` from `ameowCapture.contentIds.modal_id`
- `modal_id` parsed from `pageUrl`, `url`, `targetHref`, `targetSrc`, canonical/OG, or structured-data URLs
- `content_id` from accepted `/video|note|gallery/{id}` paths
- path type from evidence URLs, so `/note/{id}` and `/gallery/{id}` remain note/gallery sources instead of being rewritten to `/video/{id}`

If a picker target contains an accepted content permalink, it should beat a generic SPA page URL.

Douyin provider matching should also inspect bounded capture evidence URLs (`targetHref`, `targetSrc`, canonical/OG, structured-data URLs) so picker requests can route to Douyin even when the top-level browser page is an aggregator, redirect, or other generic page.

Instagram migration to the helper is deliberately optional. Existing Instagram evidence-priority behavior should remain unchanged unless the migration is mechanically equivalent and covered by tests.

## Compatibility And Rollback

- Managed runtime update rollback is a manifest-only pin revert if validation fails.
- Provider helper rollback should be isolated to provider source selection; `douyinDlDownload.ts` executor behavior should remain mostly unchanged.
- Existing extension payload contract remains version `1`; no schema migration is required if only existing fields are consumed better.

## Validation Strategy

- Unit tests:
  - provider helper source ordering
  - provider helper non-HTTP(S) filtering
  - Douyin target evidence precedence
  - Douyin `jingxuan?modal_id` synthesis without extension evidence
  - Douyin `content_id` and `/note|gallery` path preservation
  - Douyin provider matching from evidence-only URLs
  - Instagram/gallery provider remains equivalent after helper adoption if migrated
- Existing tests:
  - `npm test -- src/sites/providers.test.ts`
  - `npm test -- browser-extension/capture-evidence.test.js`
  - relevant command router tests for preserving `extensionData`
- Runtime checks:
  - `npm run electron:build`
  - `npm run runtime:smoke:downloaders`
  - `npm run runtime:smoke:douyin-session -- <cookies-file> [url]` when valid Douyin session cookies are available
