# Prevent completion checkmark in icon mode

## Goal
Ensure the main window does not collapse into icon mode after a download or transcode completes if the completion confirmation checkmark still needs to be shown in the full main panel.

## Requirements
- Keep the completion confirmation checkmark in the main window presentation, not the icon-mode presentation.
- Prevent post-completion window-mode handoff from racing with completion-state rendering.
- Keep the fix scoped to the main-window state and task-outcome flow without changing unrelated idle/minimize behavior.

## Acceptance Criteria
- [ ] After a download completes, the confirmation checkmark is shown in the full main window instead of icon mode.
- [ ] After a transcode completes, the confirmation checkmark is shown in the full main window instead of icon mode.
- [ ] Existing icon-mode transitions still work when no completion confirmation is active.

## Technical Notes
- Likely involves the compact main window interaction state machine in the React renderer.
- Verify whether a Tauri completion event or follow-up timer is releasing minimize/collapse too early.
