# Implementation Plan: Douyin Download Slow Diagnostics

## Checklist

- [x] Re-read relevant code and specs before editing:
  - `.trellis/spec/backend/logging-guidelines.md`
  - `.trellis/spec/backend/electron-runtime-contracts.md`
  - `.trellis/spec/guides/video-download-patterns.md`
  - `src/electron-runtime/service.ts`
  - `src/electron-runtime/douyinDlDownload.ts`
- [x] Add a small local diagnostic helper for safe `DouyinTiming` payload serialization.
- [x] Add `ensureEngineRuntimeReady("douyin-dl")` duration logging in `src/electron-runtime/service.ts`.
- [x] Add auth-recovery retry boundary logging with `traceId`, provider, engine, and retry reason classification.
- [x] Add `douyinDlDownload.ts` phase logs:
  - start/source shape/cookie counts;
  - config/setup complete;
  - child process start;
  - first stdout/stderr line;
  - child process exit;
  - summary/diagnostic parse;
  - artifact resolution;
  - terminal success/failure;
  - cleanup if slow or terminal.
- [x] Add temporary `child_output` timeline logging for `douyin-dl` stdout/stderr lines with safe summaries and a line-count guard.
- [x] Ensure no log payload contains raw cookie values or generated config contents.
- [x] Add or update focused tests if helpers or log callbacks are injectable enough to assert safely.
- [x] Run focused tests.
- [x] Run `npm run type-check`.
- [x] Run `npm run lint`.
- [x] Use one real Douyin URL run through the app/provider path to inspect `runtime-latest.log` when the environment has valid login/session state.
- [x] Remove temporary `DouyinTiming` runtime/smoke instrumentation after collecting evidence.
- [x] Create follow-up task for `douyin-dl` internal latency optimization: `06-16-douyin-dl-internal-latency-optimization`.

## Validation Commands

```powershell
npm test -- src/electron-runtime/douyinDlDownload.test.ts
npm test -- src/electron-runtime/service.test.ts
npm test -- src/sites/providers.test.ts
npm run type-check
npm run lint
```

## Validation Notes

- `npm test -- src/sites/providers.test.ts` passed and continues to cover Douyin `jingxuan?modal_id=...` provider synthesis to `/video/{id}`.
- `npm test -- src/electron-runtime/douyinDlDownload.test.ts src/electron-runtime/service.test.ts` passed.
- `npm run type-check` passed.
- `npm run lint` passed.
- Smoke run for `https://www.douyin.com/video/7644506999371437489` with warm managed `douyin-dl` runtime produced:
  - `setup_complete.phaseElapsedMs`: about 82-127ms
  - `child_complete.phaseElapsedMs`: about 9-19s depending on repeated output/download state
  - `firstOutputElapsedMs`: about 0.47-0.55s
  - `artifact_resolution_complete.phaseElapsedMs`: about 72-97ms
- The smoke harness also showed `smoke_python_runtime_complete.phaseElapsedMs` around 11.45s because the script calls `ensureOfficialBundledPythonRuntime(...)`, which performs a Python runtime smoke check including venv creation. The app path uses `resolveBundledPythonRuntime(...)` plus `ensureManagedDouyinDlRuntimeReady(...)`, so app evidence should be taken from `runtime_ready_complete.phaseElapsedMs` in `runtime-latest.log`, not from the smoke harness Python-runtime marker.
- Real app/provider-path evidence collected on `video-1781578703406-1`:
  - `runtime_ready_complete.phaseElapsedMs`: 53ms
  - `execute_start -> setup_complete`: 11ms
  - `child_start -> child_complete`: 9,934ms
  - `firstOutputElapsedMs`: 1,367ms
  - `artifact_resolution_complete.phaseElapsedMs`: 7ms
  - `task complete elapsedMs`: 10,106ms
  - no auth-recovery retry occurred
  - provider synthesis was correct: `jingxuan?modal_id=...` became `https://www.douyin.com/video/7644506999371437489`
- Added second-level `child_output` timing logs and validated them with smoke:
  - banner and `Found 1 URL(s) to process` appeared around 0.44-0.45s after child start
  - one run showed an `MsTokenManager` warning around 6.1s and success summary around 8.9s
  - a later run showed no stderr warning and a long gap from `Found 1 URL(s)` at about 0.45s to `✓` at about 39.8s
  - this confirms the remaining delay is inside `douyin-dl` processing the URL/download, not wrapper setup, child startup, parse, artifact resolution, or cleanup
  - empty child output lines are skipped, URLs in child output are query/hash-redacted, and logging is capped at 120 non-empty child output lines per run
- Real app/provider-path evidence with `child_output` collected on `video-1781580470476-1` and `video-1781580487665-2`:
  - runtime readiness stayed fast: 43ms and 36ms
  - provider synthesis stayed correct: `jingxuan?modal_id=...` became `https://www.douyin.com/video/7644506999371437489`
  - first child output stayed fast: 487ms and 465ms
  - `Found 1 URL(s) to process` appeared at about 498ms and 480ms after child start
  - success marker `✓` appeared at about 4,989ms and 19,849ms after child start
  - no stderr warning appeared in these app runs
  - parse/artifact/cleanup stayed negligible: around 20ms outside terminal file normalization/write timing
  - total task time varied from about 5.23s to 19.97s for the same URL, so the variable delay is inside `douyin-dl`'s opaque per-URL processing/download phase rather than Ameow's integration boundaries
- Temporary runtime instrumentation was removed after evidence collection. The runtime code should not retain `DouyinTiming` logs from this diagnostics task.

## Outcome

- The slow phase is not Ameow provider synthesis, managed runtime readiness, wrapper setup, `douyin-dl` process startup, summary parsing, artifact resolution, or cleanup.
- The slow and variable phase is inside `douyin-dl` after it starts processing the URL and before it emits success.
- Follow-up optimization work belongs in `06-16-douyin-dl-internal-latency-optimization`.

## Risk Points

- Accidentally logging raw cookies or token-bearing URLs.
- Adding noisy logs on every stdout/stderr line instead of only first output and phase boundaries.
- Changing `douyin-dl` behavior while adding diagnostics.
- Making diagnostics look like a permanent support-log contract before the investigation is complete.

## Rollback

Rollback should be a narrow revert of `DouyinTiming` helper/calls. No migrations, docs, or config changes should be required.

## Review Gate

Do not run `task.py start` or edit runtime code until the planning artifacts are reviewed or the user explicitly approves proceeding with this implementation scope.
