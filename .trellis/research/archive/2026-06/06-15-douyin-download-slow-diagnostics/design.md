# Design: Douyin Download Slow Diagnostics

## Architecture And Boundaries

Keep the existing download flow:

```text
queue request
  -> src/electron-runtime/service.ts
  -> ensureEngineRuntimeReady(...)
  -> orchestrator / DouyinDlEngine
  -> src/electron-runtime/douyinDlDownload.ts
  -> runStreamingCommand(douyin-dl)
  -> artifact resolution
  -> video-download-complete
```

The diagnostic slice should stay in backend/runtime logs. It must not create renderer events, frontend progress mapping, new Settings switches, or new persistent user-facing behavior.

## Logging Shape

Use a clear temporary prefix:

```text
>>> [DouyinTiming] <phase>: {"traceId":"...","elapsedMs":123,...}
```

Safe fields:

- `traceId`
- `attempt` or `attemptIndex` if available
- `providerId`
- `engineId`
- `elapsedMs`
- `phaseElapsedMs`
- `sourceKind`: `video_page`, `note_page`, `gallery_page`, `jingxuan_modal`, `direct_asset`, `unknown`
- `contentId`
- `hasIntentCookies`
- `cookieKeyCount`
- `hasSummary`
- `summary`: total/success/failed/skipped counts only
- `createdArtifactCount`
- `manifestRecordCount`
- `selectedArtifactExt`
- `diagnosticLine` only after existing sanitization and only if it does not contain cookie-like material

Forbidden fields:

- raw cookies or Netscape cookie text
- generated YAML content
- token values such as `msToken`, `ttwid`, `sid_guard`, `sessionid`
- full URLs with arbitrary query strings unless sanitized to source shape/content id
- high-frequency child-process progress output

## Phase Coverage

`src/electron-runtime/service.ts` should add Douyin-specific timing around runtime readiness:

- before `ensureEngineRuntimeReady("douyin-dl", ...)`
- after readiness returns, with elapsed duration
- before a retry after auth recovery, already partially logged but should be correlated with `DouyinTiming`

`src/electron-runtime/douyinDlDownload.ts` should add timing around:

- start of execution with source shape and safe cookie counts
- output directory/config setup complete
- child process spawn boundary
- first stdout/stderr line observed
- child process close with exit code and duration
- summary/diagnostic parse complete
- artifact resolution complete
- terminal success/failure with result classification/code
- cleanup complete if cleanup itself is unexpectedly slow

`src/electron-runtime/processRunner.ts` should only change if `douyinDlDownload.ts` cannot observe process start/first output well enough through existing callbacks. Prefer keeping process-runner generic behavior unchanged.

## Compatibility And Removal

This is temporary diagnostic instrumentation. It should be easy to remove by deleting the `DouyinTiming` helper/calls without changing download behavior.

No public docs update is required because this task does not change user-facing behavior. If the logs become permanent support-log contract, update `.trellis/spec/backend/logging-guidelines.md` in a later task.

## Validation

- Unit tests should cover safe log payload construction if a helper is introduced.
- Existing focused runtime tests should continue to pass:
  - `npm test -- src/electron-runtime/douyinDlDownload.test.ts`
  - `npm test -- src/electron-runtime/service.test.ts`
- Type/lint checks:
  - `npm run type-check`
  - `npm run lint`

## Expected Evidence From A Real Run

After implementation, one real Douyin run should let us answer:

- Did runtime readiness consume the delay?
- Did `douyin-dl` start quickly?
- How long until first child output?
- Did the child process spend most time before first output or after?
- Did a first attempt fail and trigger site-session recovery?
- Did retry materially improve or double the delay?
- Did output/artifact scanning contribute measurable delay?
