# Refine icon-main window switch behavior

## Goal
Adjust the main window and icon-mode transition rules so the app switches to icon mode immediately after the pointer leaves the main window, unless the app is in a state that requires the full main window to remain visible.

## Requirements
- When the app is in main-window mode and the pointer leaves the main window, transition to icon mode immediately instead of waiting for the normal idle timeout.
- When the app is in icon mode and the pointer enters the icon surface, transition back to main-window mode.
- If the app is in any state that requires the main window to stay visible, such as active download, transcription, or runtime/dependency setup, keep the main window mode even after pointer leave.
- After a blocking state ends, do not switch to icon mode immediately. Wait for the existing idle delay, then switch to icon mode if the pointer is still not hovering the main window.
- Preserve the existing transition animation behavior while changing only the switching trigger logic.
- Identify and report the current idle delay value used by the existing implementation.

## Acceptance Criteria
- [ ] Leaving the main window in an idle-ready state immediately starts the transition into icon mode.
- [ ] Entering the icon surface expands the UI back into main-window mode.
- [ ] Long-running states that need visible status keep the app in main-window mode while active.
- [ ] Once a blocking state finishes, the app waits for the existing idle delay before collapsing to icon mode.
- [ ] The current idle delay value is confirmed from code and reported.

## Technical Notes
- The change likely spans renderer state logic and Electron/Tauri window sizing or animation orchestration.
- Reuse existing "busy" or "window should stay expanded" state derivation if one already exists.
