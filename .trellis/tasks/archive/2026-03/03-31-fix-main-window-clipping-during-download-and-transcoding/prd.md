# Fix main window clipping during video download and transcoding

## Goal
Prevent the main floating window from being visually clipped while a video download is running, and verify the transcoding state does not introduce the same clipping behavior.

## Requirements
- Identify the code path that changes main-window presentation during video download progress/status updates.
- Fix the clipping so the main window remains fully visible throughout the download flow.
- Verify whether the transcoding state uses the same presentation logic and ensure it also avoids clipping.
- Keep the fix scoped to window presentation behavior without regressing existing compact-window interactions.

## Acceptance Criteria
- [ ] Starting a video download no longer causes the main window to appear clipped or cropped.
- [ ] Entering transcoding state does not cause the main window to appear clipped or cropped.
- [ ] Existing download/transcoding status UI remains functional.

## Technical Notes
- Likely touches renderer window-state presentation and/or desktop runtime window resizing/positioning logic.
- Existing unrelated local changes in the worktree must be preserved.
