# Fix Main Window Drag After Drop/Download

## Goal
Prevent the main floating window from entering a browser-style file/object drag state after a drop-triggered download so the window remains draggable immediately afterward.

## Requirements
- Keep accepting external browser/system drag-and-drop into the main panel.
- Prevent the main panel's internal visual layers from starting native DOM drag sessions.
- Reset drag-drop hover state reliably when a drop session ends or the window loses focus.
- Preserve existing clickable controls such as task cancel buttons.
- Keep the fix shared across Windows and macOS Electron builds.

## Acceptance Criteria
- [ ] After dragging media from a browser into the panel and completing the download, dragging the main window still works immediately.
- [ ] Download progress and completion overlays do not start native DOM drags when the user drags on them.
- [ ] External drag-and-drop into the panel still works for files, folders, URLs, and protected-image fallbacks.
- [ ] Existing panel buttons remain clickable and do not start unintended window drags.

## Technical Notes
- Main window dragging currently uses the typed Electron current-window bridge with pointer-driven `setPosition(...)`.
- The fix should not depend on `currentWindow.startDragging()` because the Electron main-process handler is currently a no-op.
- Add targeted tests around any new main-panel interaction helpers.
