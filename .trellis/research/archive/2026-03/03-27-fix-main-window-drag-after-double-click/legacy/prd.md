# Fix Main Floating Window Drag After Double Click

## Goal
Restore normal dragging for the main floating window after the user double-clicks the panel.

## Requirements
- Preserve the existing double-click shortcut behavior on the main panel.
- Ensure the main floating window can still be dragged after a double-click interaction completes.
- Keep ignored interactive targets excluded from panel-level double-click and drag handling.

## Acceptance Criteria
- [ ] Double-clicking the main floating window does not leave the window in a non-draggable state.
- [ ] Single-click drag still moves the main floating window as before.
- [ ] Existing panel double-click shortcut behavior remains unchanged on supported platforms.

## Technical Notes
- This is a desktop interaction bug in the main panel flow.
- Likely touch points are the panel pointer/double-click handlers and any manual window drag state reset logic.
