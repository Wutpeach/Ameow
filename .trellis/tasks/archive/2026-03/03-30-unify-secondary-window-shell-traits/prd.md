# Unify secondary window shell traits

## Goal
Align the Settings window and UI Lab window shell behavior with the main window now that the packaged Windows transparent-window startup issue has been resolved.

## Requirements
- Remove the packaged Windows Settings-window opaque fallback so Settings can use the same transparent shell path as the main window.
- Keep secondary-window creation on the shared Electron BrowserWindow path without introducing a separate special-case code path.
- Restore draggable behavior for the frameless Settings window header.
- Keep interactive controls in draggable headers explicitly marked as non-draggable.

## Acceptance Criteria
- [ ] The Settings window uses the transparent-shell creation path on packaged Windows builds.
- [ ] The Settings window header can drag the frameless window and the close button remains clickable.
- [ ] UI Lab continues to use the same transparent frameless secondary-window path and retains a draggable header.
- [ ] Existing Electron window creation and renderer bridge contracts remain intact.

## Technical Notes
- This change spans Electron main-process window creation and renderer window-shell styling.
- Use existing shared window style helpers instead of page-local drag behavior.
