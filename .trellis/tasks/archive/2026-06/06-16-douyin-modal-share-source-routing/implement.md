# Implementation Plan: Douyin Modal Share Source Routing

## Checklist

- [x] Re-read required context:
  - `.trellis/tasks/06-16-douyin-modal-share-source-routing/prd.md`
  - `.trellis/tasks/06-16-douyin-modal-share-source-routing/design.md`
  - `.trellis/spec/guides/video-download-patterns.md`
  - `.trellis/spec/backend/electron-runtime-contracts.md`
  - `.trellis/spec/backend/sidecar-runtime-contracts.md`
- [x] Update `src/sites/douyin.ts`:
  - add `iesdouyin.com` as a Douyin-owned host;
  - synthesize modal/content-id fallback video sources as `https://www.iesdouyin.com/share/video/{id}/`;
  - preserve accepted `/video`, `/note`, `/gallery`, direct media, and raw short-link behavior.
- [x] Update provider tests:
  - assert `jingxuan?modal_id=...` routes to share source;
  - assert existing accepted content page sources are not rewritten;
  - assert `v.douyin.com/...` is still passed through;
  - assert capture evidence priority still wins.
- [x] Run focused validation:
  - `npm test -- src/sites/providers.test.ts`
  - `npm test -- src/electron-runtime/douyinDlDownload.test.ts src/electron-runtime/service.test.ts`
  - `npm run type-check`
  - `npm run lint`
  - `git diff --check`
- [x] Run benchmark/smoke validation when Douyin session is available:
  - compare synthesized share URL with bare video URL using `scripts/benchmark-douyin-dl-latency.mjs`;
  - confirm output summary, manifest, and media artifact remain compatible.
- [x] Update spec if the new routing rule becomes a durable provider convention.

## Implementation Notes

Changed `src/sites/douyin.ts` so synthesized video-id fallback sources now use:

```text
https://www.iesdouyin.com/share/video/{id}/
```

Preserved behavior:

- raw `v.douyin.com/...` short links still pass through unchanged;
- accepted `https://www.douyin.com/video/{id}` links still pass through unchanged;
- accepted `note` and `gallery` path kinds still pass through unchanged;
- direct Douyin media URLs still route to `douyin-dl`;
- `intent.originalUrl` and `intent.pageUrl` remain the user/browser URL.

Updated provider tests to cover modal synthesis, short-link pass-through, accepted video path pass-through, accepted share source routing, and non-http evidence fallback.

Updated `.trellis/spec/guides/video-download-patterns.md` so the durable Douyin modal routing convention now documents share-source synthesis instead of bare `/video/{id}` synthesis.

## Validation Results

Commands run:

```powershell
npm test -- src/sites/providers.test.ts
npm test -- src/electron-runtime/douyinDlDownload.test.ts src/electron-runtime/service.test.ts
npm run type-check
npm run lint
git diff --check
node ./scripts/benchmark-douyin-dl-latency.mjs --candidates current --runs 1 --warmups 0 --fresh-runtimes false --url https://www.iesdouyin.com/share/video/7644506999371437489/
```

Results:

- Provider tests: 1 file passed, 36 tests passed.
- Focused runtime tests: 2 files passed, 62 tests passed.
- `npm run type-check`: passed.
- `npm run lint`: passed.
- `git diff --check`: passed with line-ending warnings only for edited TS files.
- Benchmark: passed, output size 47,744,430 bytes, summary success 1/1, report `build/douyin-dl-latency-benchmark/sessions/2026-06-16T05-16-38-952Z/benchmark-report.json`.

## Validation Notes

Recommended benchmark commands:

```powershell
node ./scripts/benchmark-douyin-dl-latency.mjs --candidates current --runs 3 --warmups 0 --fresh-runtimes false --url https://www.iesdouyin.com/share/video/7644506999371437489/
node ./scripts/benchmark-douyin-dl-latency.mjs --candidates current --runs 3 --warmups 0 --fresh-runtimes false --url https://www.douyin.com/video/7644506999371437489
```

If benchmark variance is high, prefer compatibility correctness plus median/slow-tail comparison over a single-run result.

## Follow-up: yt-dlp Primary Routing

After validating that `yt-dlp` supports `v.douyin.com/...`, `www.douyin.com/video/{id}`, and
`www.iesdouyin.com/share/video/{id}/`, Douyin video-compatible sources now plan:

```text
yt-dlp -> douyin-dl fallback
```

Scope:

- modal/content-id links still synthesize `https://www.iesdouyin.com/share/video/{id}/`;
- video/share/short-link/direct media sources use `yt-dlp` first with `fallbackOn: "any"`;
- `/note/{id}` and `/gallery/{id}` remain on `douyin-dl` only until there is explicit `yt-dlp` support evidence;
- the top-level user URL and capture evidence remain preserved on the intent.

Follow-up validation:

```powershell
npm test -- src/sites/providers.test.ts
npm test -- src/orchestration/download-orchestrator.test.ts src/electron-runtime/douyinDlDownload.test.ts src/electron-runtime/ytDlpDownload.test.ts src/electron-runtime/service.test.ts
npm run type-check
npm run lint
git diff --check
yt-dlp --simulate --no-warnings --no-playlist --print "extractor=%(extractor_key)s id=%(id)s format=%(format_id)s" https://www.iesdouyin.com/share/video/7644506999371437489/
```

Results:

- Provider tests: 1 file passed, 36 tests passed.
- Focused orchestrator/runtime tests: 4 files passed, 91 tests passed.
- `npm run type-check`: passed.
- `npm run lint`: passed.
- `git diff --check`: passed with line-ending warnings only.
- `yt-dlp` smoke: `extractor=Douyin id=7644506999371437489 format=bytevc1_720p_677527-3`.

## Risk Points

- `iesdouyin.com` share URLs may behave differently for note/gallery content; only synthesize share URLs for video id fallbacks.
- Some existing tests may assume `/video/{id}` synthesis; update them deliberately.
- Share URL improvement is latency-oriented and may still be subject to Douyin CDN variance.
- Do not rewrite real short links into share URLs inside Ameow; douyin-dl's own short-link resolver should keep owning that path.
