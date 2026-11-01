# Phase Out videodl With Strengthened Direct Scripts + yt-dlp Fallback

## Goal
Move FlowSelect video downloading toward a simpler, maintainable architecture:
- Primary path: platform-specific direct download scripts (Douyin/Xiaohongshu first)
- Universal fallback: yt-dlp
- Gradual deprecation of videodl with explicit safety gates

## Background
Current download architecture contains three paths:
- Direct CDN download for Douyin/XHS when extension provides direct media URL
- videodl HTTP sidecar for China-platform-first routing
- yt-dlp sidecar fallback

This task defines a phased migration plan to reduce complexity and preserve user success rate.

## Scope
In scope:
- Browser extension extraction contract and quality improvements
- Backend smart router behavior, retry/fallback strategy, and observability
- Settings and feature flag migration strategy (videodl default OFF, then removable)
- Validation dashboard/logging and phased rollout criteria

Out of scope (for this task):
- Adding new platforms beyond Douyin/XHS
- Replacing yt-dlp
- Cloud parser service migration

## Phase Plan

## Phase 0 - Baseline & Instrumentation (No behavior changes)
### Objective
Establish measurable baseline before migration.

### Deliverables
- Unified download outcome taxonomy (direct_success, direct_failed_then_ytdlp_success, all_failed, cancelled)
- Structured logs for each decision point in smart router
- Baseline report template for per-platform success rate and latency

### Validation
- [x] Each download attempt has a route trace in logs
- [x] Progress-complete event emitted on all terminal paths
- [x] 3-day baseline can be generated from logs

## Phase 1 - Strengthen Direct Extraction Contract
### Objective
Increase quality and reliability of extension-provided direct candidates.

### Deliverables
- Extend `video_selected` payload contract with optional direct candidates metadata:
  - `videoUrl` (existing)
  - `videoCandidates[]` (optional list with type/confidence/source)
  - `pageUrl`, `title`, `cookies` remain backward compatible
- Improve detector filtering rules:
  - reject blob URLs
  - rank direct mp4/CDN over manifest URLs
  - keep page URL fallback mandatory

### Validation
- [ ] Payload remains backward compatible with old fields
- [ ] Candidate ranking prefers direct playable media
- [ ] Blob/m3u8-only cases still fallback safely

## Phase 2 - Backend Direct Path Hardening
### Objective
Make direct path resilient enough to become default for Douyin/XHS.

### Deliverables
- Candidate selection policy in backend (if candidates exist)
- One-step retry strategy for expired direct links:
  - retry with next candidate OR re-enter smart path using page URL
- Short TTL cache for normalized page URL -> last known good direct URL (platform-scoped)
- Strong direct payload guards (content-type, payload size, HTTP status) maintained

### Validation
- [ ] Direct failure no longer terminates early when safe fallback exists
- [ ] Cached candidates reduce repeated extraction latency
- [ ] Error message includes stage (extract/select/download/fallback)

## Phase 3 - Routing Migration (Feature Flags)
### Objective
Flip default strategy without breaking existing users.

### Deliverables
- Routing policy update:
  - Douyin/XHS: direct-first -> yt-dlp fallback
  - Other platforms: yt-dlp first
- `videodlEnabled` default OFF for new config
- Keep hidden/manual re-enable switch during canary period

### Validation
- [ ] Fresh install defaults to non-videodl route
- [ ] Existing users keep explicit preference until migrated
- [ ] Manual fallback switch can recover from regressions

## Phase 4 - Deletion Readiness & Cleanup
### Objective
Remove videodl only after passing quality gates.

### Deletion Gates (must all pass)
- [ ] Douyin success rate >= 95% over 7 days
- [ ] XHS success rate >= 95% over 7 days
- [ ] direct_failed_then_ytdlp_success remains stable and bounded
- [ ] No major regressions in file integrity/quality checks

### Deliverables
- Remove videodl sidecar runtime paths and UI dependencies
- Remove stale config fields and health checks
- Update docs/specs and migration notes

## Requirements
- Cross-layer contract compatibility is mandatory during Phases 1-3.
- No terminal download path may omit `video-download-complete` emission.
- All fallback decisions must be observable in logs.
- Behavior changes must be gated by config/feature flags until validated.

## Acceptance Criteria
- [ ] A phased implementation can be executed without breaking existing flow.
- [ ] Every phase has explicit validation checks and rollback option.
- [ ] Baseline and post-change metrics are comparable.
- [ ] videodl removal happens only after deletion gates are satisfied.

## Technical Notes
- Affected backend core: `src-tauri/src/lib.rs` (smart router, direct downloader, fallback)
- Affected extension contract: `browser-extension/background.js`, platform detectors
- Affected frontend settings: `src/pages/SettingsPage.tsx`
- Suggested normalized cache key strategy: strip dynamic share/signature params and preserve platform + content identity.
- Keep code-spec alignment with `.trellis/spec/guides/video-download-patterns.md` and backend quality/type-safety guides.

## Phase 0 Contract Definition (Code-Spec Depth)
### Target code-spec files
- `.trellis/spec/guides/video-download-patterns.md`
- `.trellis/spec/guides/cross-layer-thinking-guide.md`
- `.trellis/spec/backend/type-safety.md`
- `.trellis/spec/backend/error-handling.md`
- `.trellis/spec/backend/logging-guidelines.md`

### Concrete contract
- Add structured trace log line with prefix `>>> [DownloadTrace]` and JSON payload:
  - `traceId` (string)
  - `stage` (string)
  - `tsMs` (number)
  - `payload` (object)
- Terminal `payload` must include:
  - `outcome`: `direct_success | direct_failed_then_ytdlp_success | non_direct_success | all_failed | cancelled`
  - `finalRoute`: `direct_douyin | direct_xiaohongshu | yt_dlp | videodl | null`
  - `routeChain`: string array
  - `durationMs`: number
  - `error`: optional string
- Behavior is observability-only in Phase 0: no routing priority or fallback policy changes.

### Validation and error matrix
| Condition | Expected | Action |
|---|---|---|
| Smart router entry | One `router_entry` trace | Keep URL + context flags in payload |
| Route decision | One `route_selected`/`route_policy` trace | Ensure selected route is explicit |
| Attempt started | One `attempt_start` per try | Include attempt number + route |
| Attempt failed before fallback | One `attempt_failed` trace | Include route + error summary |
| Terminal success/failure/cancel | One `terminal` trace | Must contain outcome/finalRoute/routeChain |
| Cancel path | Outcome is `cancelled` | Do not classify as `all_failed` |

### Good / Base / Bad cases
- Good:
  - `video_selected` creates a trace chain and ends with a `terminal` event.
  - Failed first attempt with fallback has both `attempt_failed` and terminal outcome.
- Base:
  - Legacy success path still emits completion event; only extra trace logs are added.
- Bad:
  - Missing `terminal` trace after a completed/finalized attempt.
  - Unstructured free-text logs without `traceId`, making baseline aggregation impossible.

## Rollback Strategy
- For hard removal, rollback is commit-level: revert the cleanup commit if emergency restore is required.
- Keep DownloadTrace outcome taxonomy stable so pre/post-removal metrics remain comparable.

## Gate Waiver Decision (2026-02-26)
- Initial decision: waive waiting for 3-day baseline / 7-day deletion-gate windows.
- Final decision (same day, user-directed): proceed with direct hard removal of videodl runtime paths and UI controls.
- Risk acceptance: deletion gates are explicitly waived for this iteration.

## Execution Checklist
- [x] Implement Phase 0 instrumentation and template
- [waived] Collect 3-day baseline
- [x] Implement Phase 1 and run compatibility tests
- [x] Implement Phase 2 and run resilience tests
- [x] Implement Phase 3 with canary rollout
- [waived] Review deletion gates
- [x] Implement Phase 4 cleanup (hard removal by directive)

## Session Progress (2026-02-26)
- Added structured `DownloadTrace` logging with terminal outcome taxonomy and route chain metrics.
- Added baseline report template for per-platform success/failure/latency tracking.
- Fixed sidecar runtime issues:
  - yt-dlp wrapper now auto-resolves python and bootstraps `yt_dlp` module.
  - videodl wrapper now resolves script paths for both source and target runtime layouts.
  - deno wrapper now avoids self-recursive PATH resolution.
- Improved routing/testing behavior:
  - temporary videodl phase-out gate enabled by default (`FLOWSELECT_DISABLE_VIDEODL`).
  - YouTube route skips extension cookies and enables stable JS challenge runtime settings.
- Fixed direct-download cancel responsiveness and frontend completion icon state to show `X` on cancelled terminal result.
- Implemented Phase 1 payload hardening for direct candidates:
  - Douyin/Xiaohongshu detectors now emit optional `videoCandidates[]` (`url/type/confidence/source`) with direct-first ordering and blob filtering.
  - Extension background normalizes and forwards `videoCandidates` while keeping legacy `url/pageUrl/videoUrl` fields unchanged.
  - Backend parses `videoCandidates`, selects direct candidate safely, and routes Douyin/XHS to smart fallback when no direct candidate exists.
- Implemented Phase 2 direct-path hardening (core logic):
  - Added platform-scoped short TTL direct URL cache keyed by normalized `pageUrl` (`platform + normalized page identity`).
  - Added backend candidate policy `cache -> videoUrl -> videoCandidates` with deduplication and trace visibility.
  - Added one-step direct retry (next candidate) before falling back to smart router by `pageUrl`.
  - Wired direct-failure fallback into smart router with preserved trace chain context for terminal outcome classification.
  - Added stage-oriented error prefixes for direct/fallback pipeline errors (`[download]`, `[fallback]`) in terminal failure paths.
- Implemented Phase 3 routing migration baseline:
  - `download_video_smart` now uses `yt-dlp` as the primary route; videodl is only an optional fallback for China URLs when `videodlEnabled` is true.
  - `FLOWSELECT_DISABLE_VIDEODL` semantics updated to explicit force-disable only (no implicit default disable).
  - Settings page now treats videodl as a hidden canary switch by showing the toggle only in Developer Mode.
  - Updated backend/spec docs to reflect Phase 3 route policy (`direct-first for direct candidates`, `yt-dlp first`, optional canary videodl fallback).
- Implemented Phase 4 deletion-readiness tooling:
  - Added `./.trellis/scripts/download_trace_report.py` to generate baseline/deletion-gate markdown reports directly from `>>> [DownloadTrace]` logs.
  - Report includes platform success rates, outcome taxonomy ratios, route latency percentiles, failure top causes, and gate-status summary.
  - Added command examples to baseline template for both 3-day baseline and 7-day deletion-gate windows.
- Added automated regression tests for `download_trace_report.py`:
  - Added `./.trellis/scripts/tests/test_download_trace_report.py` covering parse-failure accounting, platform/outcome aggregation, window filtering, and deletion-gate status generation.
- Applied soft decommission + gate waiver rollout:
  - Smart router now requires `videodlEnabled && FLOWSELECT_ENABLE_VIDEODL_CANARY=1 && !FLOWSELECT_DISABLE_VIDEODL` before enabling videodl fallback.
  - `get_videodl_health` now reports explicit soft-disabled status when emergency env is not enabled.
  - Settings page labels videodl as emergency canary and surfaces the required env override.
- Applied hard removal rollout (user-directed):
  - Removed videodl fallback path from `download_video_smart`; routing is now direct path (Douyin/XHS CDN) + yt-dlp only.
  - Removed videodl sidecar runtime/state/commands from backend (`VideodlServerState`, health/status commands, sidecar start/stop path).
  - Removed videodl settings UI and config toggles from `SettingsPage`.
  - Removed videodl packaging/runtime files: `scripts/videodl_http_server.py`, `src-tauri/binaries/videodl-server-*`, and `tauri.conf.json` externalBin entry.
  - Updated backend/spec docs to reflect post-videodl architecture.
