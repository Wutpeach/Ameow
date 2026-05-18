# Refine Bulk Download Queue UI and Per-Task Cancellation

## Goal
Improve the batch video download experience so the floating window shows queue state clearly, removes duplicate count display, and allows users to inspect and cancel queued/running tasks one at a time.

## Requirements
- Remove the numeric count rendered in the center of the circular progress indicator during multi-task downloads.
- Keep the active-task badge in the top-left corner as the only count indicator when multiple tasks are active.
- Make the top-left badge clickable and show a task list popover for current download work.
- Each task row in the popover must show task identity, current progress state, and an individual cancel button.
- Change the main cancel action from "cancel all" semantics to "cancel one task at a time".
- The first cancel click should cancel the current task represented by the main progress view, and repeated clicks should cancel subsequent remaining tasks rather than clearing the whole queue at once.
- Keep frontend queue/task state synchronized with backend queue lifecycle updates.

## Acceptance Criteria
- [ ] When multiple downloads are active, the circular progress ring no longer shows the task count in its center.
- [ ] The top-left queue badge remains visible for multi-task downloads and opens/closes a task list when clicked.
- [ ] The task list renders all current queued/running download tasks with progress text and an item-level cancel action.
- [ ] Clicking the main cancel button during batch download cancels only one task per click.
- [ ] Clicking a row-level cancel button cancels only that specific task.
- [ ] Queue/task UI updates correctly when tasks start, complete, or are cancelled.
- [ ] TypeScript and Rust command/event contracts remain aligned after the queue detail changes.

## Technical Notes
- Development type: fullstack.
- Cross-layer flow:
  - Rust queue state/source of truth -> Tauri event payloads -> React local task state -> badge/popover/progress UI.
- Contract updates required before implementation:
  - `cancel_download` should accept an optional or required `traceId` so cancellation targets a single task.
  - Backend should expose queue detail payloads that let the frontend render task rows deterministically.
  - Frontend `invoke<T>()` and `listen<T>()` types must be updated together with Rust serde payloads.
- Queue behavior definition:
  - Main cancel button targets the currently displayed task when a single task is shown.
  - In aggregate/multi-task mode, main cancel button targets the oldest visible active task, one per click.
  - Item-level cancel button targets that row's `traceId` only.
  - Cancelling one task must not clear pending siblings or unrelated active tasks.
- Edge cases:
  - Unknown progress for a queued task should render a waiting state instead of fake percentages.
  - Completing/cancelling the final task must close popover state safely and reset transient cancelling UI.
  - Repeated cancel clicks while the same task is already cancelling should be ignored.
