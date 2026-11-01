# Fix icon-mode to main-window double toggle after web media drag-drop

## Goal
Fix the bug where dragging an image or video from a web page into compact icon mode causes the app to switch between compact icon mode and the main window twice, then incorrectly remain on the main window.

## Requirements
- Reproduce and isolate the transition path triggered by web image/video drag-drop while the app is in compact icon mode.
- Prevent duplicate or conflicting compact/main window transition requests during that flow.
- Preserve the intended behavior for successful drag-drop handling and normal compact-mode interactions.

## Acceptance Criteria
- [ ] Dragging a web image into compact icon mode does not trigger repeated compact/main window switching.
- [ ] Dragging a web video into compact icon mode does not trigger repeated compact/main window switching.
- [ ] After the drag-drop flow completes, the window remains in the intended mode instead of ending in the main window due to a race or duplicate event.

## Technical Notes
- Recent history already includes a compact window transition race fix, so the existing guard logic should be reviewed first.
- This is likely a frontend event sequencing issue, but the Tauri window-event path should be verified if the frontend alone does not explain the duplicate transitions.
