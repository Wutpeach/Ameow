# Complete App Transcode Event Reducer Follow-up Info

## Scope

- Extend the Phase 4 reducer/helper approach for the remaining transcode event handlers in `src/App.tsx`.
- Extract only pure detail/progress map updates for:
  - `video-transcode-queued`
  - `video-transcode-retried`
  - `video-transcode-removed`
  - `video-transcode-failed`
- Reuse the existing renderer-side helper module and tests.

## Non-Goals

- Do not enter Phase 5.
- Do not touch `electron/main.mts`, `browser-extension/background.js`, or `src/pages/SettingsPage.tsx`.
- Do not change event names, payloads, UI text, subscriptions, React state/ref ownership, or pending side-effect behavior.
- Do not move pending transcode action cleanup, foreground outcomes, queue notices, logging, timers, or Electron bridge calls into reducer helpers.

## Pure Logic Inventory

- `video-transcode-queued`
  - Pure: normalize payload, upsert task into transcode queue detail.
  - Side effects retained in App: event subscription and React setter ownership.
- `video-transcode-retried`
  - Pure: normalize payload, upsert task into detail, remove matching progress entry.
  - Side effects retained in App: `removePendingTranscodeActionTraceId`.
- `video-transcode-removed`
  - Pure: normalize payload, remove task from detail, remove matching progress entry if present.
  - Side effects retained in App: `removePendingTranscodeActionTraceId`.
- `video-transcode-failed`
  - Pure: normalize payload, upsert failed task into detail, remove matching progress entry, summarize error for the caller.
  - Side effects retained in App: `removePendingTranscodeActionTraceId`, `showForegroundTaskOutcome`, `showQueueNotice`, i18n fallback label choice, and any logging/timer behavior.

## Reducer Plan

- Add narrow helpers in `src/utils/downloadEventReducers.ts`:
  - `applyTranscodeQueuedEvent(currentDetail, payload)` -> `VideoTranscodeQueueDetailPayload | null`
  - `applyTranscodeRetriedEvent(currentDetail, currentProgress, payload)` -> `{ detail, progressByTrace } | null`
  - `applyTranscodeRemovedEvent(currentDetail, currentProgress, payload)` -> `{ detail, progressByTrace } | null`
  - `applyTranscodeFailedEvent(currentDetail, currentProgress, payload)` -> `{ detail, progressByTrace, errorSummary } | null`
- Inputs:
  - previous `VideoTranscodeQueueDetailPayload`
  - previous `TranscodeProgressByTrace` where progress cleanup is needed
  - raw partial transcode task payload from the event
- Outputs:
  - next detail/progress values only
  - `null` when the payload cannot normalize to a task
  - failed-event error summary as plain data for App to pass into existing outcome behavior

## Test Plan

- Focused tests in `src/utils/downloadEventReducers.test.ts` for:
  - queued detail upsert
  - retried pending/active detail update and progress removal
  - removed detail/progress cleanup
  - failed detail upsert, progress removal, and summary truncation/first-line handling
  - invalid payload returns `null`
  - progress reference is preserved when removing a missing trace
  - detail task removal returns an equal no-op detail shape for a missing trace without side effects

## Validation Plan

- `npm test -- src/utils/downloadEventReducers.test.ts`
- `npm run type-check`
- `npm run lint`
- `npm test`
- `git diff --check`
- Claude plan review before implementation.
- Claude final diff review before commit.

## Implementation Notes

- Added `upsertTranscodeTaskToDetail` in `src/utils/downloadEventReducers.ts`.
- Exported the existing progress trace removal helper as `removeTranscodeProgressTrace`.
- Removed the complete-only progress removal alias after final diff review and updated the complete handler to use the generic helper.
- Added `summarizeTranscodeFailureError` as a pure alias for failure-summary tests; App foreground outcome still uses the existing `normalized.error ?? failedLabel` expression.
- Updated `src/App.tsx` queued/retried/removed/failed handlers to call setter-local helpers while keeping event callbacks, React setters, pending action cleanup, failed outcome, and queue notice in App.

## Extracted Event Logic

- `video-transcode-queued`
  - Detail upsert via `upsertTranscodeTaskToDetail`.
- `video-transcode-retried`
  - Detail upsert via `upsertTranscodeTaskToDetail`.
  - Progress cleanup via `removeTranscodeProgressTrace`.
- `video-transcode-removed`
  - Detail cleanup via `removeTranscodeTaskFromDetail`.
  - Progress cleanup via `removeTranscodeProgressTrace`.
- `video-transcode-failed`
  - Detail upsert via `upsertTranscodeTaskToDetail`.
  - Progress cleanup via `removeTranscodeProgressTrace`.
  - Failure summary helper tested as pure data handling; visible outcome fallback remains App-owned.

## Logic Kept In App.tsx

- Event subscription setup and cleanup.
- `normalizeVideoTranscodeTask` call and invalid payload early return.
- `removePendingTranscodeActionTraceId`.
- `showForegroundTaskOutcome`.
- `showQueueNotice`.
- `getTranscodeStageLabel(i18n.t, "failed")` fallback.
- React state setter ownership.
- Timers, refs, logging, and Electron bridge calls.

## Claude Plan Review Summary

Claude recommended shrinking the initial event-level reducer idea. Event-level helpers returning both detail and progress would require synchronized access to separate React state values, creating stale-state/ref risks. The adopted plan uses setter-local pure helpers that take the current state supplied by each React functional updater. Claude also noted that queued/retried/failed detail upsert can share one helper and that the existing progress removal helper should be exported instead of duplicated.

## Claude Diff Review Summary

Claude found no must-fix regressions. It confirmed that pending action cleanup, foreground outcome, queue notice, event subscriptions, event names, payloads, React ownership, timers, logging, and Electron bridge behavior stayed in App. Optional feedback was adopted by removing the redundant complete-specific progress-removal alias and adding an extra reference test for progress removal.

## Validation Results

- `npm test -- src/utils/downloadEventReducers.test.ts`: passed, 19 tests.
- `npm run type-check`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 112 files and 709 tests.
- `git diff --check`: passed with only Windows LF-to-CRLF working-copy warnings.

## Follow-up Policy

- If a code block depends on refs, pending action timing, foreground outcome display, queue notice timing, translation fallback, logging, timers, Electron bridge calls, or event subscription ordering, leave it in `src/App.tsx`.
- Record any ambiguous extraction candidate here rather than broadening the Phase 4.5 scope.

## Remaining Follow-up

- None for Phase 4.5.
- Do not continue into Phase 5 in this session.
