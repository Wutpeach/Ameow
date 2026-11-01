# Prevent Icon Mode During Download Preparation

## Goal
Prevent the main floating window from entering icon mode while a video download task is in progress, including the early "preparing" phase before normal progress updates arrive.

## Requirements
- Treat queued or visually active download work as foreground work for idle/minimize decisions.
- Keep the current "Preparing..." content visible in the full floating window instead of allowing the shell to collapse into icon mode.
- Make the busy-state calculation resilient to event ordering differences between queue count events, queue detail events, and progress events.
- Keep the fix scoped to the floating-window task state logic unless local evidence shows a backend contract change is required.

## Acceptance Criteria
- [ ] While a download is queued or showing "Preparing...", the floating window does not minimize into icon mode.
- [ ] Once all download/transcode/runtime-gate foreground work is finished, idle minimize still works as before.
- [ ] No stale progress or queue-state regression is introduced when queue events arrive out of order.

## Technical Notes
- Current behavior suggests `video-queue-count` can transiently report no ongoing work while `video-queue-detail` or progress-derived UI still shows a foreground download state.
- The fix should prefer a derived foreground-work signal that matches the visible task state the user sees.
