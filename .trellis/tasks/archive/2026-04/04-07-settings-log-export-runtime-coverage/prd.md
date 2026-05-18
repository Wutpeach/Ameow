# Fix settings log export gesture and runtime log coverage

## Goal
Adjust the Settings version interaction so exporting logs requires a double-click, and improve exported logs so they include useful runtime output for troubleshooting.

## Requirements
- Change the Settings version export trigger from the current multi-click behavior to a double-click gesture.
- Preserve the existing export entry point and user-facing affordance in the Settings page.
- Audit the current log export payload and identify why live runtime output is missing or too sparse.
- Improve logging/export so exported logs include meaningful runtime records from the app's execution path.

## Acceptance Criteria
- [ ] Double-clicking the version area in Settings exports logs.
- [ ] Single-clicking the version area no longer exports logs.
- [ ] Exported logs contain more complete runtime output useful for debugging recent app activity.
- [ ] The implementation follows existing Settings UI and logging patterns.

## Technical Notes
- Likely touches both React Settings UI code and Rust/Tauri logging/export code.
- Need to verify whether runtime logs already exist in memory/on disk and whether export is reading the wrong source.
