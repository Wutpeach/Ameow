# Investigate douyin-dl internal latency optimization

## Goal

Evaluate practical ways to reduce variable Douyin download latency when `douyin-dl` spends several seconds inside its own per-URL processing/download phase.

## Background Evidence

The preceding diagnostics task (`06-15-douyin-download-slow-diagnostics`) found:

- Douyin `jingxuan?modal_id=...` provider synthesis is correct and dispatches `https://www.douyin.com/video/{id}` to `douyin-dl`.
- App/runtime overhead is negligible:
  - provider/pre-engine: about 4-9ms
  - `ensureManagedDouyinDlRuntimeReady(...)`: about 36-53ms
  - wrapper setup/config: about 8-11ms
  - parse/artifact/cleanup: about 20ms in app runs
- `douyin-dl` process startup is not the main bottleneck:
  - first child output appears in about 0.46-0.49s
  - `Found 1 URL(s) to process` appears in about 0.48-0.50s
- Variable delay occurs after `Found 1 URL(s)` and before the success marker:
  - same URL completed in about 5.23s and about 19.97s in app runs
  - smoke runs showed similar variability, including one `MsTokenManager` warning and one about 39.8s opaque gap
- Current managed `douyin-dl` is installed from `jiji262/douyin-downloader` at commit `5144bd3dec91cd2711cfdccbf36c10af17eb93fc`, package version `2.0.0`.
- Upstream currently has newer refs:
  - latest tag observed: `desktop-v0.4.9` at `f856869863ccca107dc2c086487ee8955d84c23f`
  - `main` observed at `dc7e967b1680cf18beae9857fb99eb43fe0aeee6`
- Current CLI supports `--show-warnings`, `--verbose`, and `--thread`. Ameow currently uses YAML `thread: 1` for normal downloads and does not pass CLI `--thread`.
- Current `douyin-dl` internals show plausible latency sources:
  - `MsTokenManager` fetches F2 config from GitHub raw with a 15s timeout when no `msToken` cookie is present, then falls back to a generated token.
  - API client uses `aiohttp.ClientTimeout(total=30)`.
  - detail requests try aid candidates `6383` and `1128`.
  - `_request_json(...)` retries up to 3 times with delays `[1, 2, 5]` on empty 200 / server / retryable failures.
  - media file download happens after detail extraction through `_download_with_retry(...)`.

## Requirements

- Determine whether a supported `douyin-dl` update or configuration change reduces the opaque per-URL delay.
- Build or adapt a benchmark path that can timestamp `douyin-dl` stdout/stderr without adding persistent app runtime logs.
- Record whether each benchmark run's input cookies contain `msToken`; treat `msToken` presence/absence as a first-class comparison dimension.
- Use interleaved current/candidate runs and record absolute timestamps to reduce time-of-day/network bias.
- Preflight each candidate version for CLI, config YAML, output summary, and artifact compatibility before treating it as a low-risk candidate.
- Investigate likely internal delay sources:
  - Douyin detail API latency;
  - msToken / F2 token config fetch behavior;
  - retry/backoff behavior;
  - cookie/session influence;
  - media download transfer variability.
- Compare at least the current pinned/runtime version against any candidate newer version or configuration.
- Keep comparison runs isolated from the app's normal managed runtime unless an implementation is approved.
- If benchmark evidence clearly supports a low-risk managed package pin/config update, this task may implement it directly.
- Keep browser/provider semantics unchanged unless evidence supports a targeted route change.
- Do not reintroduce broad temporary runtime logging as permanent code. If new diagnostics are needed, keep them scoped and remove them before task completion unless explicitly promoted to a support-log contract.
- Preserve support for common links such as `https://www.douyin.com/jingxuan?modal_id=7644506999371437489`.

## Acceptance Criteria

- [ ] A small benchmark or repeatable manual script compares current and candidate behavior for the same Douyin URL/session.
- [ ] Benchmark output captures at least wall time, absolute timestamp, package ref/version, input `msToken` presence, time to first output, time to `Found 1 URL(s)`, time to success marker, stdout/stderr warning summaries, output size, and success/failure.
- [ ] Version comparison uses interleaved runs, with at least one warm-up run excluded per candidate when practical.
- [ ] Current pin is compared against at least one newer upstream candidate when network and install conditions allow.
- [ ] Candidate versions are preflighted for CLI compatibility with `-c`, `-u`, `-p`, `--show-warnings`, and `--version`.
- [ ] Candidate versions are checked for compatibility with Ameow-generated config YAML and `parseDouyinDlSummary(...)` output expectations.
- [ ] Successful outputs are verified as plausible media outputs, not only non-empty files.
- [ ] The investigation identifies whether the dominant delay is detail/token/retry/download, or documents why `douyin-dl` remains opaque.
- [ ] If a low-risk optimization exists, implementation plan includes validation and rollback.
- [ ] If no low-risk optimization exists, the task records that conclusion with evidence.
- [ ] Any temporary diagnostics added for this optimization task are removed or explicitly justified before completion.

## Out Of Scope

- UI progress mapping changes.
- Replacing the entire Douyin provider without a separate design task.
- Long-term support-log schema changes unless explicitly approved.
- Permanent broad child-output logging in app runtime.
- Mutating the user's saved site-session cookies.
- Forking or patching `douyin-downloader` source directly, unless split into a separate design task.
- Provider-side bypass/replacement of `douyin-dl` detail extraction.

## Scope Decision

- Approved: proceed from research into low-risk implementation in the same task if benchmark evidence is strong.
- Low-risk means a managed `douyin-dl` upstream pin/config/CLI-option change with compatible output behavior and straightforward rollback.
- Not approved in this task: forked package patches, broad provider-side replacement, or permanent runtime child-output logging.
