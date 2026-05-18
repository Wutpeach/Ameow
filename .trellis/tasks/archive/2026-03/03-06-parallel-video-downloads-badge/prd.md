# Parallel Video Downloads And Active-Task Badge

## Goal
Enable video downloads to run in parallel instead of strict serialization, while keeping the main window aligned with the current UI language and showing the real-time number of active download tasks.

## Requirements
- Replace the single-runner backend video queue with a bounded-concurrency scheduler.
- Remove the frontend-only serial video runner so user-triggered downloads can also start concurrently.
- Upgrade the `video-queue-count` event contract from a single `count` field to explicit task-state fields.
- Keep `video-download-progress` and `video-download-complete` usable under concurrency by attaching task identity.
- Preserve the existing single-task progress experience when only one download is active.
- When multiple downloads are active, the main window must show an active-task badge in real time and avoid misleading single-task progress semantics.
- Update the badge visual style so it matches the current panel design language in both themes.
- Keep terminal events emitted on every success / failure / cancel path.

## Acceptance Criteria
- [ ] Starting multiple video downloads results in more than one task executing at the same time.
- [ ] The main window badge displays the current number of actively downloading video tasks.
- [ ] Pending work, if any, is not confused with active work in the badge count.
- [ ] Single active download still shows a meaningful progress ring and status text.
- [ ] Multi-download state does not flicker between unrelated task progress payloads.
- [ ] All updated Tauri events are typed consistently in Rust and TypeScript.
- [ ] Badge and queue status styling match the current panel/theme system.
- [ ] Lint and typecheck pass after the change.

## Technical Notes
- Use a fixed backend concurrency limit for now rather than a new settings surface.
- Event payload contract target:
  - `video-queue-count`: `{ activeCount, pendingCount, totalCount, maxConcurrent }`
  - `video-download-progress`: include `traceId`
  - `video-download-complete`: include `traceId`
- Cancel semantics should remain safe under concurrency; if fine-grained cancel is not implemented in this pass, UI behavior must not imply per-task cancel for multiple concurrent downloads.
