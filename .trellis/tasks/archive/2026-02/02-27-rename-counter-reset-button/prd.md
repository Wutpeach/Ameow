# Add Rename Counter Reset Button

## Goal
When auto-rename is enabled in Settings, show a solid rounded-rectangle reset button at the bottom-left of the main window. Clicking it clears the rename sequence counter used by auto-renamed files.

## Requirements
- Add a new reset button in main UI bottom-left.
- The button is visible only when auto-rename is enabled.
- The button style should match Settings button shape language:
  - Settings button: outlined rounded rectangle (existing)
  - Reset button: solid rounded rectangle (new)
- Clicking the reset button clears the rename numbering counter.
- Clearing the counter must affect subsequent auto-rename downloads.

## Acceptance Criteria
- [ ] Auto-rename OFF: reset button hidden.
- [ ] Auto-rename ON: reset button visible in main UI bottom-left.
- [ ] Click reset button: rename sequence counter is cleared.
- [ ] Next auto-renamed download starts from reset baseline.
- [ ] No impact on non-renamed download behavior.

## Technical Notes
- This is a cross-layer feature:
  - Frontend: settings state + main page conditional rendering + button click action.
  - Backend: persistent/derived rename counter reset command.
- Define a clear command contract for reset action and error handling.
- Keep implementation scoped; avoid unrelated UI changes.

## Code-Spec Depth (Cross-Layer Contract)

### Contract
- Config key dependency: `renameMediaOnDownload` controls button visibility.
- New command (to be implemented): clear rename sequence counter.
- Command response: success/failure with explicit error message on failure.

### Validation & Error Matrix
- Rename disabled -> reset button not rendered.
- Rename enabled -> reset button rendered.
- Reset command success -> counter cleared and next renamed file uses reset baseline.
- Reset command failure -> UI gets error and does not falsely claim success.

### Good / Base / Bad
- Good: rename ON, click reset, next renamed file index resets correctly.
- Base: rename OFF, button hidden, no reset action available.
- Bad: reset fails due filesystem/config issue, frontend handles error without crash.
