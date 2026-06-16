# Design: douyin-dl Internal Latency Optimization Research

## Architecture And Boundaries

This task should treat Ameow's production runtime as the integration boundary and study `douyin-dl` behind that boundary.

Keep unchanged unless an evidence-backed implementation is approved:

- Douyin provider source synthesis in `src/sites/douyin.ts`
- Electron queue/runtime flow in `src/electron-runtime/service.ts`
- Download result handling in `src/electron-runtime/douyinDlDownload.ts`
- UI progress mapping and user-facing copy
- Saved site-session cookie files

Research code should prefer scripts and temporary isolated runtime directories over app runtime instrumentation.

## Research Tracks

### Track A: Repeatable Benchmark

Create or adapt a script that runs `douyin-dl` with the same URL/session repeatedly and records:

- total wall time;
- time to first stdout/stderr output;
- time to `Found 1 URL(s) to process`;
- time to success marker / summary;
- stderr warning summaries;
- output size and success/failure;
- package source/ref/version under test.

The benchmark should avoid false "fast" runs from skipped existing files. Use fresh output directories per run, or verify that each run actually downloads a media file and does not return only skipped state.

Benchmark validity controls:

- Record whether the input cookie snapshot contains `msToken`; compare runs with the same `msToken` state first.
- Run candidates in an interleaved order such as current/candidate/current/candidate instead of all current runs followed by all candidate runs.
- Include one warm-up run per candidate when practical and exclude warm-up from comparison.
- Record absolute timestamps for each run so time-of-day network variation can be inspected.
- Verify output as plausible media, not only `size > 0`; prefer `ffprobe` when available, otherwise record size and extension and compare against sibling runs.
- Detect skipped downloads and keep them out of latency comparisons unless the scenario being measured is explicitly skip behavior.

The benchmark may reuse logic from `scripts/smoke-douyin-dl-session-download.mjs`, but should not add permanent app runtime logging.

### Track B: Upstream Version Comparison

Compare the current pinned source:

```text
jiji262/douyin-downloader@5144bd3dec91cd2711cfdccbf36c10af17eb93fc
```

Against candidates discovered during planning:

```text
desktop-v0.4.9 -> f856869863ccca107dc2c086487ee8955d84c23f
main -> dc7e967b1680cf18beae9857fb99eb43fe0aeee6
```

Run candidates in isolated benchmark venv/config/output roots. Do not change `electron/managedPythonPackageManifest.mts` until the benchmark evidence supports an implementation.

Before treating a newer ref as low risk, preflight compatibility:

- CLI accepts `-c`, `-u`, `-p`, `--show-warnings`, and `--version`.
- Ameow-generated YAML from `buildConfigYaml(...)` does not produce unknown-key or missing-required-key failures.
- stdout summary remains parseable by `parseDouyinDlSummary(...)`, or a narrow parser update is included and covered by tests.
- manifest/output artifact shape remains compatible with `pickManifestArtifact(...)` and related artifact resolution.

If a candidate clearly improves latency and keeps output behavior compatible, the implementation path is a managed package pin update plus runtime bootstrap validation.

This task is allowed to proceed from research into that low-risk implementation path without opening another task.

### Track C: Source-Level Phase Attribution

If version comparison is inconclusive, use a temporary benchmark-only copy/venv of `douyin-downloader` with narrow timing probes around likely slow sites:

- `auth/ms_token_manager.py`
  - F2 config fetch;
  - real msToken generation;
  - fallback token generation.
- `core/api_client.py`
  - `_default_query()`;
  - `get_video_detail(...)`;
  - each `aid` candidate;
  - `_request_json(...)` attempts and retry sleeps.
- `core/downloader_base.py`
  - `_download_aweme_assets(...)`;
  - `_download_with_retry(...)` media transfer attempts.

These probes should stay outside production runtime code. If a candidate production change requires patching upstream package behavior, decide separately whether to pin a newer upstream ref, vendor/fork a patch, or defer.

## Candidate Fix Classes

### Low Risk

- Update managed `douyin-dl` pin to a newer upstream ref if benchmarked faster and compatible.
- Add or adjust benchmark/smoke tooling used only by developers.
- Pass an existing safe CLI option such as `--verbose` only in benchmark scripts, not normal app downloads.

### Medium Risk

- Change managed package source to a fork/patch if upstream has a clear isolated latency bug and no upstream release/ref contains the fix.
- Change wrapper CLI arguments such as `--thread` if evidence shows benefit and no output/ordering regressions.

### High Risk / Separate Design

- Bypass `douyin-dl` detail extraction using Ameow provider-side requests.
- Replace `douyin-dl` with another extractor.
- Add long-lived app runtime child-output logging.

## Compatibility And Rollback

If implementation updates the managed package pin:

- `electron/managedPythonPackageManifest.mts` is the main rollback point.
- The runtime metadata should force managed runtime rebuild when `installSource` or `packageVersion` changes.
- Validation should include reinstall/force reinstall smoke, normal app-provider smoke, and focused runtime tests.

If no implementation is selected:

- Record benchmark data and conclusion in the task.
- Leave production code unchanged.

## Decision Gate

Do not start implementation until the planning artifacts are reviewed. After benchmarking, choose one:

- update pin/config with evidence;
- keep current pin and document no low-risk optimization;
- open a separate design task for provider-side replacement/bypass.

Approved in this task:

- managed `douyin-dl` upstream pin/config/CLI-option change with clear benchmark evidence;
- benchmark/developer tooling needed to compare current and candidate behavior.

Requires a separate task:

- forked package patches;
- provider-side detail extraction bypass or replacement;
- permanent app runtime child-output logging.
