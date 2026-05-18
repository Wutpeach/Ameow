# Fix macOS Floating Window Border and Minimize Behavior

## Goal
Fix the macOS floating window UX so the main panel has no unwanted white frame and minimizing keeps a visible icon-mode window on desktop instead of hiding the app.

## Requirements
- Remove the visible white frame around the main floating window on macOS.
- Ensure minimize action in main UI goes to icon mode instead of hiding the window.
- Ensure app can be restored reliably from macOS Dock re-open behavior.
- Keep Windows taskbar-hide behavior intact.

## Acceptance Criteria
- [ ] Main window in normal mode no longer shows a white outer frame on macOS.
- [ ] Clicking the top-right control in the main panel switches to icon mode rather than hiding the window.
- [ ] When app is hidden and user clicks Dock icon, main window is shown and focused.
- [ ] Build/type checks pass for changed frontend/backend files.

## Technical Notes
- Align main window config and frontend full-size constants to remove transparent margin dependence.
- Add a platform-gated helper for `set_skip_taskbar` to avoid forcing macOS window into hidden taskbar behavior.
- Handle Tauri `RunEvent::Reopen` to restore main window on macOS.
