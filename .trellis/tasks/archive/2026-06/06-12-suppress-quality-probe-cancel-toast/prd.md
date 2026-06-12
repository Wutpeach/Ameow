# Suppress cancelled toast when closing quality probe

## Status

Implemented; quality checks passed.

## Goal

When a user right-clicks the injected web download button and desktop opens the Full-window advanced quality probe/selection flow, closing that probe UI with the top-right `X` should quietly return the Full window to its normal empty state.

User value:

- Closing a probe/selection UI feels like dismissing an optional choice, not like causing a failed download.
- Users are not shown a psychologically heavy `Download cancelled` result for an action that is expected and reversible.

## Requirements

- Suppress the user-visible `Download cancelled` foreground/center outcome when the user closes an advanced quality probe or selection task from the Full window.
- After close, the Full window should return to its normal empty state with no lingering probe task, progress state, selection UI, or cancellation text.
- Keep real advanced quality probe failures visible to the user.
- Keep normal download cancellation behavior unchanged for active or pending downloads outside the advanced quality probe/selection dismissal case.
- Keep left-click normal downloads unchanged.
- Keep right-click advanced quality probing and quality selection behavior unchanged except for the close/dismiss feedback.
- Do not introduce a new notification surface, modal, or recovery action for this case.

## Confirmed Facts

- `src/electron-runtime/service.ts` has a special `cancelDownload(traceId)` branch for `advancedQualityTasks`.
- That branch currently aborts the advanced task, removes it from queue state, emits queue state, and then emits `video-download-complete` with `success: false` and `error: "Download cancelled"`.
- `src/App.tsx` listens for `video-download-complete`; for unsuccessful payloads it removes progress for the trace and calls `showForegroundTaskOutcome(...)`, which is why `Download cancelled` appears in the Full window.
- The archived advanced-quality task explicitly chose the existing `video-download-complete` failure event for real probe failure notification; this task should not remove failure feedback for actual probe failures.

## Out of Scope

- Localizing or redesigning all download cancellation/error messages.
- Changing the advanced quality option list, labels, or probing algorithm.
- Changing browser-extension right-click trigger behavior.
- Changing cancellation behavior for normal queued or active downloads.
- Adding new UI controls or error-detail affordances.

## Acceptance Criteria

- [x] Given an advanced quality probe/selection task is visible in the desktop Full window, when the user clicks the top-right `X`, the Full window returns to its normal empty state without showing `Download cancelled` or an equivalent cancellation outcome.
- [x] The dismissed advanced quality task is removed from queue/progress state and does not leave a stuck spinner, task row, or selection UI.
- [x] Actual advanced quality probe failures still show a failure result.
- [x] Cancelling normal pending or active downloads continues to behave as it did before this task.
- [x] Task-relevant automated coverage is added or updated where the runtime/frontend boundary can verify the dismissal behavior without over-broad UI changes.
