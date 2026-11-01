# Investigate Douyin download slow diagnostics

## Goal

Add narrow temporary diagnostics that identify where Douyin downloads spend time when a user-visible download appears to sit in the parsing/preparing phase for too long.

User-facing value:

- We can tell whether slow Douyin downloads are caused by managed runtime readiness, provider source selection, `douyin-dl` startup, Douyin detail API/network/auth behavior, site-session recovery retry, or output/result scanning.
- We can make the next fix decision from evidence instead of guessing or changing UI progress states.

## Confirmed Facts

- User-observed common Douyin links such as `https://www.douyin.com/jingxuan?modal_id=7644506999371437489` should be supported.
- `src/sites/douyin.ts` extracts `modal_id` and synthesizes `https://www.douyin.com/video/{id}` before dispatching `douyin-dl`.
- `src/electron-runtime/service.ts` already logs coarse `ElectronRuntimeTiming` markers for task start, pre-engine completion, engine completion, and terminal events.
- Existing coarse timing does not split the `douyin-dl` execution phase into config generation, child-process execution, first child output, summary parsing, result artifact resolution, or cleanup.
- `src/electron-runtime/douyinDlDownload.ts` currently captures child stdout/stderr for diagnostics but does not emit frontend progress events.
- The user explicitly does not want progress mapping added in this task.
- `douyin-dl` detail extraction can be slow because upstream requests `/aweme/v1/web/aweme/detail/`, may try multiple `aid` values, retries failed/empty responses, and may depend on saved Douyin login cookies.
- Runtime auth recovery may retry a Douyin download once after site-session sync when a narrow detail/auth failure is classified as `auth_required`.
- Logging guidelines forbid raw cookies, tokens, full file contents, and high-frequency logs.

## Requirements

- Add temporary runtime diagnostics only; do not change user-facing progress mapping, UI labels, download behavior, provider routing, or managed runtime pins.
- Log enough phase timing to distinguish:
  - queue/pre-engine time already covered by `ElectronRuntimeTiming`;
  - `ensureEngineRuntimeReady("douyin-dl")` wait time;
  - Douyin source URL shape selected for `douyin-dl`;
  - `douyin-dl` config/write/setup time;
  - child process execution duration;
  - time until first stdout/stderr line;
  - whether the run produced a summary, failure diagnostic, manifest artifact, or filesystem fallback artifact;
  - auth recovery retry boundaries.
- Keep logs safe:
  - include `traceId`;
  - include provider/engine/source shape and content id when useful;
  - include booleans or counts for cookie presence, not cookie values;
  - include sanitized/tail diagnostics already captured by existing paths when needed;
  - never log raw cookie strings, generated YAML content, token values, or full media URLs with sensitive query parameters.
- Make the temporary nature obvious through a stable prefix such as `>>> [DouyinTiming]`.
- Keep log volume low: one line per phase boundary or terminal outcome, not per progress tick.
- Ensure diagnostics land in the existing durable runtime log/support-log capture path.
- Keep implementation easy to remove after the investigation is complete.

## Acceptance Criteria

- [ ] A Douyin download attempt logs phase timing for `douyin-dl` setup, child execution, first output, result resolution, and cleanup/terminal outcome.
- [ ] Runtime logs show whether `ensureEngineRuntimeReady("douyin-dl")` took meaningful time for the same `traceId`.
- [ ] Auth-recovery retry logs make it clear when a second `douyin-dl` attempt is running after site-session sync.
- [ ] Logs include safe context only: no raw cookies, no YAML contents, no token values.
- [ ] Existing Douyin `jingxuan?modal_id=...` source synthesis remains unchanged.
- [ ] No frontend progress mapping or UI text changes are introduced.
- [ ] Focused tests or type checks cover the changed logging surface where practical.
- [ ] `npm run type-check` and relevant focused tests pass before implementation is reported complete.

## Out Of Scope

- Adding frontend progress mapping for `douyin-dl`.
- Updating `douyin-downloader` / `douyin-dl` pinned version.
- Changing Douyin provider routing or direct-CDN handling unless implementation uncovers an immediate correctness blocker.
- Replacing `douyin-dl`.
- Solving the slow-download root cause in this task; this task gathers evidence for the next decision.

## Notes

- Relevant code:
  - `src/electron-runtime/service.ts`
  - `src/electron-runtime/douyinDlDownload.ts`
  - `src/electron-runtime/processRunner.ts`
  - `electron/main.mts`
  - `src/sites/douyin.ts`
- Relevant specs:
  - `.trellis/spec/backend/logging-guidelines.md`
  - `.trellis/spec/backend/electron-runtime-contracts.md`
  - `.trellis/spec/guides/video-download-patterns.md`

## Open Questions

- None blocking planning. The main review decision is whether to proceed with this narrow temporary instrumentation scope.
