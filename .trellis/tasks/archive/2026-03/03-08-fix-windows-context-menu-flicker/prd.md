# Fix Windows context menu flicker close

## Goal
Keep the custom right-click context menu open reliably on Windows instead of closing immediately after it appears.

## Requirements
- Preserve the existing context menu actions and visual design.
- Keep the menu auto-close behavior when the user genuinely clicks away, switches focus, or presses `Escape`.
- Avoid Windows-specific false blur/focus transitions during menu window creation from immediately closing the menu.
- Keep Tauri window interactions typed and cleanup logic safe.

## Acceptance Criteria
- [ ] Right-clicking in the main window opens the context menu and it stays visible on Windows.
- [ ] Clicking outside the menu or focusing the main window still closes the menu.
- [ ] Pressing `Escape` still closes the menu.
- [ ] No new type or lint regressions are introduced in the touched frontend files.

## Technical Notes
The current implementation closes the menu from both the menu window blur listeners and the main-window focus monitor. On Windows, opening a child Webview window can produce transient focus changes, so the close logic needs a short guard window or a more robust close condition.
