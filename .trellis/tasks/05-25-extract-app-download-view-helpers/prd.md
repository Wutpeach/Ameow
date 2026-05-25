# Extract App download view helpers

## Goal

Extract side-effect-free download/transcode view helper logic from `src/App.tsx` into a focused, testable module while preserving the existing App component, hooks, state ownership, UI behavior, and runtime protocol contracts.

## Confirmed Facts

- The parent task is `.trellis/tasks/05-25-architecture-boundary-refactor`.
- Phase 1 scope in the parent task is "Extract App Download / Transcode Pure Logic".
- `src/App.tsx` currently contains pure helper logic for:
  - download stage label/status formatting
  - ETA formatting
  - stage advancement
  - queue state/detail normalization
  - transcode task normalization, sorting, merging, and progress/status text
- `src/App.tsx` also contains event subscriptions and React state updates for download/transcode events; those are out of scope for this phase.

## Requirements

- Do not split the `App` component.
- Do not rewrite hooks.
- Do not change state management.
- Do not change UI behavior, copy, visual states, timing, or ordering.
- Do not change renderer event names, Electron event names, IPC commands, WebSocket actions, or payload shapes.
- Extract only side-effect-free helper logic related to download/transcode view state.
- Keep translation behavior equivalent by injecting a translation function into helpers that format localized text.
- Add focused unit tests for the extracted helpers.
- Do not start Phase 2.

## Acceptance Criteria

- [ ] Download status formatting behaves the same for preparing, downloading, ETA, activity-token, and fallback-label cases.
- [ ] Download stage advancement preserves monotonic behavior and the existing preparing-progress guard.
- [ ] Queue state/detail normalization preserves current clamping, defaults, invalid-task filtering, and fallback labels.
- [ ] Transcode normalization, sorting, merge, status text, progress percent, and format label helpers preserve current behavior.
- [ ] `src/App.tsx` imports and uses the extracted helpers without changing event subscriptions or React state ownership.
- [ ] Focused tests cover the extracted pure helpers.
- [ ] `npm run type-check`, `npm run lint`, and `npm test` pass before commit.

## Out of Scope

- No event reducer extraction.
- No hook extraction.
- No component splitting.
- No changes to runtime payload types.
- No changes to extension protocol or Electron command/event contracts.
- No desktop-side video candidate normalizer work.
