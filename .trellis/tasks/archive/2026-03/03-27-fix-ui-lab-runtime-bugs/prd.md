# Fix UI Lab Drag And Runtime Bootstrap Bugs

## Goal
Fix the current UI Lab and runtime bootstrap regressions so the lab window can be moved, runtime dependency status does not leak into active download debugging views, and automatic dependency bootstrap can complete successfully instead of hanging in a loading phase.

## Requirements
- Restore draggable behavior after opening the UI Lab surface.
- Keep dependency bootstrap status isolated from unrelated download progress/debugging views.
- Make automatic dependency bootstrap complete or fail explicitly instead of staying stuck in a loading state.

## Acceptance Criteria
- [ ] The UI Lab window can be dragged normally after it opens.
- [ ] Dependency status UI only appears in the intended dependency/bootstrap context.
- [ ] Runtime bootstrap transitions out of the loading phase and reflects success or error correctly.

## Technical Notes
- This task likely spans React UI state and Tauri runtime/bootstrap flows.
- Preserve existing localized status messaging and intentional debug affordances where possible.
