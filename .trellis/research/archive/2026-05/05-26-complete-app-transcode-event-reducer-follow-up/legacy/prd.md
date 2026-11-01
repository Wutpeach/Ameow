# Complete App transcode event reducer follow-up

## Goal

Complete the Phase 4 App event reducer follow-up by extracting the remaining pure detail/progress calculations for `src/App.tsx` transcode queued, retried, removed, and failed events into the existing reducer helper module without changing user-visible behavior or side-effect ownership.

## Scope

- Work only in the renderer App transcode event path.
- Handle pure calculation logic for these existing events:
  - `video-transcode-queued`
  - `video-transcode-retried`
  - `video-transcode-removed`
  - `video-transcode-failed`
- Prefer extending:
  - `src/utils/downloadEventReducers.ts`
  - `src/utils/downloadEventReducers.test.ts`
- Keep `src/App.tsx` as the owner of event subscriptions, React state setters, refs, pending action removal, notices, foreground outcomes, logging, timers, and Electron bridge calls.

## Requirements

- Preserve all existing event names and payload shapes.
- Preserve current UI text and transcode queue/detail/progress semantics.
- Preserve React state/ref ownership and the existing event subscription layout in `src/App.tsx`.
- Extract only logic that can be proven pure from previous detail/progress state and normalized task payload.
- Keep invalid or missing task payload behavior safe by returning no update from reducer helpers.
- Add focused tests for queued, retried, removed, failed, invalid payload, and reference-preservation behavior.
- Record any logic that cannot be proven pure as follow-up instead of extracting it.

## Acceptance Criteria

- [x] Pure helpers/reducers exist for the selected transcode queued/retried/removed/failed detail/progress state updates.
- [x] `src/App.tsx` delegates only those pure updates to helpers while keeping side effects in place.
- [x] Focused tests cover:
  - transcode queued detail upsert
  - transcode retried status/detail update and progress cleanup
  - transcode removed detail/progress cleanup
  - transcode failed detail upsert, progress cleanup, and error summary handling
  - safe behavior when trace/task data is missing or invalid
  - necessary reference preservation for unchanged progress/detail paths
- [x] `npm test -- src/utils/downloadEventReducers.test.ts` passes.
- [x] `npm run type-check`, `npm run lint`, `npm test`, and `git diff --check` pass.
- [x] Claude plan review and final diff review are completed; concrete in-scope feedback is addressed.
- [ ] The task is archived and committed separately from the business refactor commit if Trellis metadata requires a separate chore commit.

## Non-Goals

- Do not enter Phase 5.
- Do not modify `electron/main.mts`.
- Do not modify `browser-extension/background.js`.
- Do not modify `src/pages/SettingsPage.tsx`.
- Do not rewrite or split `src/App.tsx`.
- Do not change React state/ref ownership.
- Do not change event subscriptions, event names, event payloads, or UI copy.
- Do not move pending action, notice, foreground outcome, logging, timer, or Electron bridge side effects out of `src/App.tsx`.
- Do not introduce a new state management library.
- Do not perform unrelated refactors.

## Confirmed Facts

- Current Trellis task was none before creation.
- Parent task `05-25-architecture-boundary-refactor` exists.
- Phase 4 completed in `05-26-isolate-app-download-event-reducer` and created `src/utils/downloadEventReducers.ts` plus focused reducer tests.
- Phase 4 explicitly left `video-transcode-queued`, `video-transcode-retried`, `video-transcode-removed`, and `video-transcode-failed` as follow-up because they mix pure detail/progress updates with pending action and user-visible side effects.
