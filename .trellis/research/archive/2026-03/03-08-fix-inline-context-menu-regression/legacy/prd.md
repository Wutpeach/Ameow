# Fix inline context menu regression on Windows

## Goal
Restore the custom right-click context menu after the inline overlay migration so it can open reliably on Windows.

## Requirements
- Keep the existing inline context menu layout and actions unchanged.
- Preserve auto-close behavior for real dismiss cases such as clicking away or pressing `Escape`.
- Remove any stale focus-based close behavior that only made sense for the old separate context menu window.
- Keep the touched frontend logic typed and cleanup-safe.

## Acceptance Criteria
- [ ] Right-clicking the main panel opens the inline context menu on Windows.
- [ ] The menu does not immediately dismiss from a false focus transition.
- [ ] Clicking outside the menu or pressing `Escape` still closes it.
- [ ] No new lint or type errors are introduced in the touched files.

## Technical Notes
The previous implementation used a dedicated Tauri window for the context menu and relied on window focus changes to close it. After migrating to an inline overlay inside `src/App.tsx`, that focus listener became stale and may now race with the same-window context menu open flow on Windows.
