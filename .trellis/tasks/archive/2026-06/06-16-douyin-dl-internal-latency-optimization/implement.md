# Implementation Plan: douyin-dl Internal Latency Optimization Research

## Checklist

- [x] Re-read task artifacts and relevant specs before editing:
  - `.trellis/tasks/06-16-douyin-dl-internal-latency-optimization/prd.md`
  - `.trellis/tasks/06-16-douyin-dl-internal-latency-optimization/design.md`
  - `.trellis/spec/backend/logging-guidelines.md`
  - `.trellis/spec/backend/electron-runtime-contracts.md`
  - `.trellis/spec/backend/sidecar-runtime-contracts.md`
  - `.trellis/spec/guides/video-download-patterns.md`
- [x] Build or adapt a benchmark script that:
  - runs `douyin-dl` with a supplied site-session/cookies file and URL;
  - uses isolated output directories per run;
  - timestamps stdout/stderr lines externally;
  - records package ref/version, absolute timestamp, input `msToken` presence, success/failure, output size, warning summaries, and key timing markers;
  - supports interleaved current/candidate run order;
  - detects skipped downloads and excludes them from normal-download comparisons;
  - avoids logging raw cookies or token values.
- [x] Establish baseline with the current pinned package:
  - same URL: `https://www.douyin.com/video/7644506999371437489`;
  - same saved Douyin session;
  - enough repeats to show variability, recommended 5 runs minimum;
  - at least one warm-up run excluded from comparison when practical.
- [x] Preflight every candidate runtime before benchmark comparison:
  - CLI accepts `-c`, `-u`, `-p`, `--show-warnings`, and `--version`;
  - Ameow-generated config YAML is accepted;
  - stdout summary remains compatible with `parseDouyinDlSummary(...)`;
  - manifest/artifact shape remains compatible with `douyinDlDownload.ts` artifact resolution.
- [x] Compare isolated candidate runtimes:
  - current pin `5144bd3dec91cd2711cfdccbf36c10af17eb93fc`;
  - tag `desktop-v0.4.9` / `f856869863ccca107dc2c086487ee8955d84c23f`;
  - upstream `main` / `dc7e967b1680cf18beae9857fb99eb43fe0aeee6` if installable.
- [x] If version comparison does not explain the delay, run source-level temporary timing probes in an isolated venv around:
  - `MsTokenManager` F2 config and token generation;
  - `get_video_detail(...)` and aid attempts;
  - `_request_json(...)` retry/sleep behavior;
  - media `_download_with_retry(...)`.
- [x] Summarize evidence:
  - p50/p95-ish wall time from small sample;
  - `msToken` presence/absence;
  - which phase dominates;
  - whether warnings correlate with slow runs;
  - whether candidate version/config improves latency without behavior regression.
- [x] Decide implementation route:
  - update managed package pin;
  - tune wrapper arguments/config;
  - keep current behavior and document no low-risk optimization;
  - split a high-risk provider-side replacement/bypass into a separate task.
- [x] If code changes are made, run focused validation:
  - `npm test -- src/electron-runtime/douyinDlDownload.test.ts`
  - `npm test -- src/electron-runtime/service.test.ts`
  - `npm test -- src/sites/providers.test.ts`
  - `npm run type-check`
  - `npm run lint`
  - relevant smoke/benchmark commands from this task.
- [ ] If pin/config is updated, verify managed runtime rebuild behavior:
  - changed `installSource` / `packageVersion` causes rebuild;
  - new entrypoint exists after rebuild;
  - rollback to previous manifest pin still works.
- [x] Remove temporary source probes or benchmark-only runtime changes before completion unless explicitly retained as developer tooling.

## Implementation Progress

Added developer benchmark tooling:

- `scripts/benchmark-douyin-dl-latency.mjs`
- Uses the compiled Electron managed Python package manifest as the current pin source.
- Creates isolated benchmark venvs under `build/douyin-dl-latency-benchmark/runtimes/...`.
- Records package ref/source, absolute run timestamp, `msToken` cookie presence, first-output timing, `Found URL` timing, success-marker timing, warnings, summary parsing, media artifact plausibility, and manifest shape.
- Interleaves candidate runs and writes `benchmark-report.json`, `latest-report.json`, and per-session NDJSON.
- Sanitizes output lines and does not print raw cookie values.
- Can retain benchmark timeline output for source-level probe runs; probe events are extracted into `probeEvents` when `[AmeowProbe]` lines are present.

Validation run:

```powershell
node --check scripts/benchmark-douyin-dl-latency.mjs
```

Result: passed.

## Benchmark Evidence

Default site session:

- Source: `C:\Users\Administrator\AppData\Roaming\ameow\site-sessions\douyin.json`
- Cookie key count: 66
- `msToken` present: false
- URL: `https://www.douyin.com/video/7644506999371437489`

Initial current-only validation:

- Report: `build/douyin-dl-latency-benchmark/sessions/2026-06-16T04-20-40-860Z/benchmark-report.json`
- Current pin completed successfully.
- Total elapsed: 4998ms
- `Found URL -> success` gap: 4512ms
- Media output size: 47,744,430 bytes

Interleaved current vs `desktop-v0.4.9`, 1 warmup + 3 measured:

- Report: `build/douyin-dl-latency-benchmark/sessions/2026-06-16T04-22-13-178Z/benchmark-report.json`
- Current: median total 6362ms, max 8794ms.
- `desktop-v0.4.9`: median total 3182ms, max 4512ms.
- Both candidates passed CLI preflight and output/media/manifest checks.

Follow-up current vs `desktop-v0.4.9`, 5 measured:

- Report: `build/douyin-dl-latency-benchmark/sessions/2026-06-16T04-26-23-817Z/benchmark-report.json`
- Current: median total 3024ms, max 5496ms.
- `desktop-v0.4.9`: median total 3751ms, max 5127ms.
- This contradicted the first comparison enough that a managed pin update is not evidence-backed.

Decision: do not update `electron/managedPythonPackageManifest.mts` in this task based only on version comparison. The observed performance difference is dominated by run-to-run network/media transfer variance, not a stable upstream ref improvement.

## Source-Level Probe Evidence

Temporary probes were applied only inside the isolated current benchmark venv under `build/douyin-dl-latency-benchmark/runtimes/...`; production runtime code was not modified.

Probe run:

- Report: `build/douyin-dl-latency-benchmark/sessions/2026-06-16T04-31-04-421Z/benchmark-report.json`
- Runs: 3 current measured runs with `--verbose true`
- Total elapsed: 13744ms, 2419ms, 3517ms

Phase attribution:

- Slow run, 13744ms total:
  - F2 config load: 213.1ms
  - real msToken generation: 375.3ms
  - detail API request: 239.5ms
  - `get_video_detail` total: 620.3ms
  - media `download_with_retry`: 12348.3ms
- Fast run, 2419ms total:
  - real msToken generation: 331.2ms
  - `get_video_detail` total: 665.7ms
  - media `download_with_retry`: 841.4ms
- Medium run, 3517ms total:
  - real msToken generation: 613.8ms
  - `get_video_detail` total: 943.5ms
  - media `download_with_retry`: 1886.8ms

Conclusion: the previously opaque long phase is primarily media file transfer variability inside `douyin-dl` / its selected Douyin CDN URL. In these runs, msToken and detail API work were sub-second and did not explain the 10s+ slow case.

Cleanup:

- Removed the patched isolated current benchmark venv at `build/douyin-dl-latency-benchmark/runtimes/x86_64-pc-windows-msvc/current`.
- Kept benchmark report artifacts under `build/douyin-dl-latency-benchmark/sessions/...`.
- No production runtime source or managed package pin was changed.

## Validation

Commands run:

```powershell
node --check scripts/benchmark-douyin-dl-latency.mjs
npm test -- src/electron-runtime/douyinDlDownload.test.ts src/electron-runtime/service.test.ts src/sites/providers.test.ts
npm run type-check
npm run lint
git diff --check
```

Results:

- `node --check`: passed.
- Focused tests: 3 files passed, 95 tests passed.
- `npm run type-check`: passed.
- `npm run lint`: passed.
- `git diff --check`: passed.

## Benchmark Notes

Recommended benchmark outputs:

```json
{
  "state": "ok",
  "packageRef": "5144bd3...",
  "runIndex": 1,
  "startedAt": "2026-06-16T00:00:00.000Z",
  "hasMsTokenCookie": true,
  "totalElapsedMs": 5230,
  "firstOutputElapsedMs": 465,
  "foundUrlElapsedMs": 480,
  "successMarkerElapsedMs": 4989,
  "stderrWarningCount": 0,
  "warningKinds": [],
  "outputSize": 47744430
}
```

Keep raw line logs optional and sanitized. The summary should be enough for comparing runs.

## External Review Notes

Claude review agreed with the staged research plan and recommended tightening benchmark validity before implementation:

- record `msToken` cookie presence for every run;
- use interleaved current/candidate runs instead of sequential batches;
- preflight candidate CLI/config/output compatibility before treating a newer ref as low risk;
- add summary-parser and artifact-shape checks for candidate output;
- avoid false positives from skipped downloads, output caching, or non-media files.

## Risk Points

- Candidate upstream refs may change output layout, manifest format, CLI behavior, or dependency set.
- A faster run may be caused by network/cache variance instead of a real improvement; compare multiple runs.
- Existing output files can cause skipped downloads and false fast results.
- Missing vs present `msToken` can dominate latency and must not be mixed casually in comparisons.
- Sequential all-current/all-candidate runs can produce false conclusions from time-of-day network variance.
- Newer upstream refs may keep the same package version string while changing CLI/config/output contracts.
- msToken/session experiments must not mutate the user's saved site-session snapshot.
- Installing candidate runtimes must not overwrite the app's normal managed runtime unless implementation is approved.

## Rollback

- Benchmark-only scripts can be reverted without app behavior impact.
- Managed package pin changes roll back through `electron/managedPythonPackageManifest.mts`.
- Any temporary patch to an isolated venv/package copy must not be committed as production code.

## Review Gate

Planning is ready only after the user chooses the research scope:

- benchmark plus implementation of a low-risk pin/config improvement if evidence is strong.

The user approved this scope. After final artifact validation, the next workflow step is review/activation (`task.py start`) before implementation.

Do not implement forked package patches, provider-side bypass/replacement, or permanent app runtime child-output logging in this task.
