# Isolate App download event reducer

## Goal

Extract the smallest verifiable pure event-folding logic from `src/App.tsx` for download/transcode runtime events into a renderer-side reducer/helper module, reducing callback complexity without changing UI behavior, event subscriptions, protocol names, payload shapes, or React state/ref ownership.

## Requirements

- Preserve all existing runtime event names and payload shapes.
- Preserve current UI state semantics for download progress, download complete success/failure, cancellation/canceling, queue state, transcode progress, and transcode complete.
- Extract only pure calculation logic from `src/App.tsx`; keep side effects, timers, event subscriptions, refs, Electron bridge calls, and React state ownership in `App.tsx`.
- Start with the smallest set of event helpers that can be verified with focused unit tests.
- Keep `App.tsx` changes limited to calling the helper/reducer from the existing event callbacks.
- Add focused tests for progress updates, complete success, complete failure, canceled/canceling semantics, transcode progress, transcode complete, and queue state updates.
- Record any callback logic that depends on complex React state/ref timing or side effects as follow-up instead of forcing extraction.

## Acceptance Criteria

- [x] A pure renderer-side helper/reducer module exists for selected download/transcode event-to-view-state logic.
- [x] `src/App.tsx` delegates the selected pure event logic to the helper without changing event subscriptions, event names, payloads, UI copy, or state/ref ownership.
- [x] Unit tests cover the required event-folding scenarios.
- [x] `npm run type-check`, `npm run lint`, `npm test`, and `git diff --check` pass.
- [x] Claude plan and final diff reviews are completed and in-scope feedback is addressed.

## Notes

- Parent task: `05-25-architecture-boundary-refactor`.
- Parent phase: Phase 4, App Download Event Reducer.

## Non-Goals

- Do not rewrite `src/App.tsx`.
- Do not split the App component structure.
- Do not migrate to a new state management library.
- Do not change React state/ref ownership.
- Do not change event subscription setup.
- Do not change event names, payloads, UI text, or protocol semantics.
- Do not change cancellation, failure, completion, or transcode pending semantics.
- Do not touch `electron/main.mts`, `browser-extension/background.js`, or `src/pages/SettingsPage.tsx`.
- Do not enter Phase 5.
