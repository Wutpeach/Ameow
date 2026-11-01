# Fix portable output path sync and rename counter reset on folder change

## Goal
Ensure changing output folder in Settings takes effect immediately for all new saves in portable mode, and reset rename sequence counters whenever output folder is changed.

## Requirements
- When user changes `outputPath` in Settings, main window must receive and use the new path immediately.
- Saving/download actions from main window should no longer use stale `targetDir` after folder change.
- When `outputPath` actually changes, rename sequence counters must be cleared.
- Keep existing command/event contracts type-safe (`invoke<T>`, `listen<T>`).

## Acceptance Criteria
- [ ] After selecting folder B in Settings, subsequent image/video saves use folder B instead of old folder A.
- [ ] Rename sequence counters are reset when folder changes (next renamed file starts from reset baseline).
- [ ] No regression for existing rename toggle sync behavior.
- [ ] Typecheck and lint pass for touched files.

## Technical Notes
- Add a dedicated frontend event for output path updates from settings window to main window.
- Keep backend `save_config/get_config/reset_rename_counter` contract stable.
- Avoid `any` at Tauri boundary in new/modified listener code.
