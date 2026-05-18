# Fix Transcode Cancel Skipping CPU Fallback

## Goal
Ensure that when a user actively cancels an in-progress video transcode, the backend exits the current transcode flow immediately instead of treating the interruption as a GPU failure and falling back to CPU transcoding.

## Requirements
- A user-triggered `cancel_transcode` during active ffmpeg work must preserve cancellation semantics through the normalization pipeline.
- The GPU full-transcode path must not fall back to CPU when the ffmpeg process was interrupted because the user cancelled the task.
- Existing `cancel_transcode`, `video-transcode-removed`, and `video-transcode-failed` command/event contracts must remain unchanged.
- Cancellation logging should remain explicit without emitting misleading GPU fallback logs for user-cancelled runs.

## Acceptance Criteria
- [ ] Cancelling an active transcode stops the transcode flow without starting CPU fallback work.
- [ ] The transcode queue settles through the existing cancelled/removed path instead of surfacing a failed transcode row for user cancellation.
- [ ] No frontend contract changes are required.
- [ ] Rust verification passes for the touched code path.

## Technical Notes
- The active bug appears in the AE-safe full-transcode GPU branch, which currently treats any ffmpeg error as a genuine GPU failure.
- The codebase already uses `Ok(None)` to represent a cancelled transcode and `mark_video_transcode_cancelled(...)` to settle queue state.
