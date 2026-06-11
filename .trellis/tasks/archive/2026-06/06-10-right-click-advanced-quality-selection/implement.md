# Implementation Plan: Right-click advanced quality selection

## Pre-flight

- Read `prd.md` and `design.md`.
- Load backend/frontend Trellis specs before editing.
- Do not change popup quality presets, floating launcher quality UI, or docs unrelated to this feature.

## Ordered Checklist

### 1. Types and command contracts

- Add `advancedQualityRequest?: boolean` to queued video request/raw input types.
- Add internal selected-quality fields for runtime-owned selected selector/label.
- Add queue task phase and quality option payload types.
- Add renderer command type for `select_advanced_quality_option`.

Validation:

- Type-check catches all payload contract sites.

### 2. Extension right-click trigger

- Add right-click handler to YouTube injected main download button.
- Add right-click handler to Bilibili injected main download button.
- Preserve current left-click behavior.
- Preserve clip range fields.
- Suppress native context menu on the injected download button only.
- Add localized tooltip copy if needed: left-click normal download, right-click choose quality.

Validation:

- Existing detector tests for injected buttons still pass.
- Add/update tests for right-click payload and context menu suppression if test harness exists.

### 3. Extension/background/Electron payload threading

- Preserve `advancedQualityRequest` in `normalizeMediaSelectionPayload(...)`.
- Preserve it in forwarded `video_selected_v2` payload.
- Preserve it in debug summaries where useful.
- Preserve it in `buildVideoSelectedV2QueuePayload(...)`.
- Preserve it in `commandRouter.ts` normalization.

Validation:

- Add unit tests for background forwarding if feasible.
- Update `electron/videoDownloadCommands.test.mts`.
- Update `src/electron-runtime/commandRouter.test.ts`.

### 4. Runtime advanced task state

- Add advanced-quality task state collection in `service.ts`.
- Include advanced tasks in `getQueueState()` / `getQueueDetail()`.
- Add dedupe by site/url/clip range.
- Branch `queueVideoDownload(...)` when `advancedQualityRequest` is true.
- Probe tasks must not enter `runTask(...)`, reserve stems, or record normal telemetry.

Validation:

- Runtime tests for advanced request creating a probing task.
- Runtime tests for duplicate request returning same traceId.

### 5. Probe implementation

- Add focused yt-dlp metadata probe helper.
- Ensure yt-dlp runtime is ready before probe.
- Run probe with abort support.
- Parse dump-json formats.
- Group options by height and generate user-facing labels.
- Store internal selector by option id.
- Treat no options or probe errors as probe failure.

Validation:

- Unit test parser/grouping with fixtures.
- Unit test probe failure cleanup.

### 6. Probe failure behavior

- On probe failure:
  - remove advanced task from state
  - emit queue state/detail update
  - emit `video-download-complete` with `success: false`
  - use meaningful error copy such as `更多画质探测失败`
- Do not auto-download.
- Do not show recovery buttons.

Validation:

- Test queue cleanup and failure event emission.
- Test normal download telemetry is not recorded for probe failure.

### 7. Selection command and continuation

- Add `select_advanced_quality_option` renderer command.
- Runtime validates traceId and optionId.
- Runtime removes selecting task state and continues same visible task into normal download with selected internal selector/label.
- Existing cancel path must handle probing/selecting tasks.

Validation:

- Test selecting a valid option starts normal download path.
- Test invalid traceId/optionId rejects safely.
- Test cancel during probing/selecting does not start download.

### 8. Apply selected selector to yt-dlp

- Update yt-dlp command planning to prefer runtime-owned selected selector when present.
- Include selected label in output/task label if low-risk.
- Keep preset behavior unchanged when no selected selector exists.

Validation:

- Update `ytDlpCommandPlan` / `engineManifest` tests.
- Verify existing quality preset tests still pass.

### 9. Renderer queue UI reuse

- Render `probing_quality` using current task/circular status style.
- Render `selecting_quality` options inside the existing queue task visual language.
- No modal, no independent panel, no new visual system.
- Selection invokes `select_advanced_quality_option`.

Validation:

- Focused reducer/helper tests if queue normalization changes.
- Manual screenshot/visual check if dev server is run.

### 10. Final verification

Run focused tests first, then broader checks:

- Extension-related tests changed by detectors/background.
- Electron bridge tests.
- Runtime service/command router tests.
- yt-dlp planning/parser tests.
- Renderer queue/reducer tests.
- `npm run type-check`
- `npm run lint`

## Rollback Points

- If runtime probe-first lifecycle becomes too broad, keep only extension right-click payload threading disabled behind no-op runtime behavior and do not expose UI.
- If renderer queue UI becomes too invasive, stop before Phase 9 and keep design for a follow-up child task.
- If yt-dlp probe behavior is unstable, land parser/probe helpers with fixtures first and defer UI wiring.
