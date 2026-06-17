# Fix single-download queue badge

## Goal

Make the full floating window queue badge match the queue contract so users are not shown unnecessary queue UI when only one download-related task is running.

## Confirmed Facts

- `src/App.tsx` currently derives `showVideoTaskBadge` from `totalTaskCount > 0 || isQueuePopoverOpen`, so a single active download can render the top-left badge.
- `.trellis/spec/frontend/type-safety.md` already states the intended frontend contract: show the queue badge when `totalCount > 1`, and use `totalCount` as the badge number.
- Download queue state is emitted through `video-queue-count` with `activeCount`, `pendingCount`, `totalCount`, and `maxConcurrent`.
- `src/electron-runtime/service.ts` sets `AmeowElectronDownloadRuntime.maxConcurrent` to `options.maxConcurrent ?? 3`.
- Backend scheduling starts pending downloads while `active.size < maxConcurrent`; therefore the current default runtime cap is 3 active video downloads, but that is a concurrency cap rather than a task-addition cap.

## Requirements

- Full floating window should not show the queue badge for exactly one total active/pending task.
- The queue badge should still appear when more than one video/download/transcode task is relevant, and the badge number should remain the total task count.
- The queue popover should remain usable while open, including the ability to close it even if task counts change.
- Preserve progress display, cancellation behavior, and queue-detail ordering.
- Do not change backend download queue concurrency behavior.
- Update affected tests and any Trellis specs that describe queue badge visibility if needed.

## Acceptance Criteria

- [x] With one active video download and no pending/transcode tasks, the full window does not render the top-left queue badge.
- [x] With two or more total tasks, the full window renders the badge with the correct total count.
- [x] The queue popover can close correctly after being opened.
- [x] Backend queue scheduling and the default concurrency cap of 3 are unchanged.
- [x] Relevant frontend reducer/view tests cover the new badge visibility behavior.
- [x] Specs no longer contradict the implemented badge behavior.

## Out Of Scope

- Changing the current default max concurrent video downloads from 3.
- Adding a user setting for download concurrency.

## Notes

- This is a lightweight frontend-focused fix. PRD-only planning should be enough before implementation.
