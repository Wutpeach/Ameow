# Fix Shortcut Summon Window Positioning

## Goal
Restore the global shortcut behavior so the main window reacts when the shortcut is pressed and appears near the current mouse position, aligned to the lower-left of the cursor.

## Requirements
- The registered global shortcut must trigger the summon flow again.
- Pressing the shortcut must show the main window if it is hidden or minimized.
- The window should be repositioned relative to the current mouse position using the expected lower-left placement behavior.
- The fix should preserve existing window state handling and avoid regressions for normal window display flows.

## Acceptance Criteria
- [ ] Pressing the configured global shortcut causes the main window to become visible.
- [ ] The main window is repositioned based on the current mouse position instead of staying unchanged.
- [ ] The summon flow works when the window is hidden or minimized.
- [ ] The project passes relevant lint/typecheck/tests for the touched code.

## Technical Notes
- Likely touches the Tauri global shortcut plugin integration and main-window positioning helpers.
- This is a cross-layer desktop fix spanning Rust window control and frontend-triggered window expectations, so existing summon/show patterns should be followed instead of introducing a new display path.
