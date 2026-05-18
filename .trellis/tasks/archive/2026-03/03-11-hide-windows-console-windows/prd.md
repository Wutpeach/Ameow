# Hide Windows backend console windows

## Goal
Prevent transient Windows console windows from appearing during backend post-processing flows such as AE-friendly ffmpeg normalization.

## Requirements
- Hide Windows console windows for backend CLI child processes that are part of video post-processing.
- Keep non-Windows behavior unchanged.
- Do not change download naming behavior in this task.

## Acceptance Criteria
- [ ] Enabling `AE-Friendly Format` no longer shows a transient console window during ffmpeg post-processing on Windows.
- [ ] Backend child-process execution still succeeds on Windows after the change.
- [ ] Non-Windows code paths compile unchanged.

## Technical Notes
Apply the Windows-only hide-console behavior at the shared process-launch helper level so ffmpeg and related CLI probes use the same launch policy.
