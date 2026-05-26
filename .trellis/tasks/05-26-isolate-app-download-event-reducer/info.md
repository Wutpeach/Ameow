# Isolate App Download Event Reducer Info

## Scope

- Inspect `src/App.tsx` runtime event callbacks for:
  - `video-download-progress`
  - `video-download-complete`
  - `video-queue-state`
  - `video-transcode-progress`
  - `video-transcode-complete`
- Extract only pure event-to-view-state calculations that can be unit tested outside React.
- Keep all side effects and ownership-sensitive logic in `App.tsx`.

## Non-Goals

- Do not rewrite the App component or split its component structure.
- Do not change event subscriptions, event names, payloads, UI text, or protocol fields.
- Do not change React state/ref ownership.
- Do not move timers, refs, Electron bridge calls, cancellation commands, event emission, or UI side effects into the reducer/helper.
- Do not change canceling/canceled, failed, completed, or transcode pending behavior.
- Do not touch `electron/main.mts`, `browser-extension/background.js`, or `src/pages/SettingsPage.tsx`.
- Do not enter Phase 5.

## Compatibility Rules

- Existing event callback ordering in `App.tsx` must remain recognizable.
- Helper inputs must be plain previous-view-state plus event payload.
- Helper outputs must be plain next-view-state or small data objects for the existing callback to apply.
- If an extraction would require reading or mutating refs, scheduling timers, invoking desktop commands, emitting events, or changing React update timing, leave that part in `App.tsx` and record it as follow-up.

## Pre-Implementation Discovery Plan

- Map current App event callback data flow.
- Separate pure calculation from side effects.
- Choose the smallest event helper set that covers the requested scenarios.
- Consult Claude on the plan before editing production code.

## Validation Plan

- Focused reducer/helper unit tests.
- `npm run type-check`
- `npm run lint`
- `npm test`
- `git diff --check`
- Claude plan review before implementation.
- Claude final diff review before commit.

## Implementation Notes

- Added pure reducer/helper module: `src/utils/downloadEventReducers.ts`.
- Added focused reducer tests: `src/utils/downloadEventReducers.test.ts`.
- Updated `src/App.tsx` to delegate selected pure calculations from existing listeners while keeping event subscriptions, side effects, refs, timers, and React state ownership in App.

## Extracted Event Logic

- `video-download-progress`
  - Progress map upsert.
  - Monotonic stage folding via `advanceDownloadStage`.
- `video-download-complete`
  - Progress map removal.
  - Success/cancelled/error-summary outcome classification.
- `video-queue-count`
  - Queue state normalization and "clear cancelling ids" decision.
- `video-queue-detail`
  - Detail normalization.
  - Progress pruning to live rendered queue tasks.
  - Cancelling trace pruning to live rendered queue tasks.
- `video-transcode-queue-count`
  - Transcode queue state normalization.
  - Pure decision to clear transcode progress when no active transcodes remain.
- `video-transcode-progress`
  - Progress map upsert as active transcode task.
  - Queue detail upsert as active transcode task.
- `video-transcode-complete`
  - Transcode progress removal.
  - Transcode detail task removal.

## Logic Kept In App.tsx

- Event subscription setup and cleanup.
- `prepareMainWindowForForegroundTask`.
- `showForegroundTaskOutcome`.
- `showQueueNotice`.
- `removeCancellingTraceId` and `cancellingTraceIdsRef` synchronization.
- `removePendingTranscodeActionTraceId`.
- Console logging.
- Timers, refs, Electron bridge calls, and React state ownership.
- `video-transcode-queued`, `video-transcode-retried`, `video-transcode-removed`, and `video-transcode-failed` handlers, because they include denser pending-action/ref/outcome/notice side effects and can be considered in a later pass.

## Claude Plan Review Summary

Claude approved the small reducer/helper extraction scope, with one must-fix note: when extracting `video-queue-detail`, the App caller must continue syncing `cancellingTraceIdsRef` after pruning cancelling IDs because completion events read that ref synchronously. It also recommended tests for backend "canceled/cancelled" errors without an explicit local cancelling flag, transcode queue progress reference preservation when already empty, and monotonic progress folding. These were added.

## Claude Diff Review Summary

Claude found no must-fix correctness, contract, React state/ref, cancellation, completion, failure, or transcode semantic regressions. It noted redundant normalize/filter work in the first diff. The implementation was adjusted to use narrower helpers so App computes normalized queue detail/state and normalized transcode task once per event before feeding setter closures.

## Validation Results

- `npm test -- src/utils/downloadEventReducers.test.ts`: passed, 13 tests.
- `npm run type-check`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 112 files and 703 tests.
- `git diff --check`: passed with only Windows LF-to-CRLF working-copy warnings.
