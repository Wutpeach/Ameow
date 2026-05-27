# Unify center outcome shell lock

## Goal

Create a unified control flow for center outcome feedback in the main floating window so outcome icons finish their animation before the window collapses to icon mode.

This should solve the folder-drop success icon overlapping with the compact cat icon and provide a reusable model for future center status icons.

## Requirements

- Center outcome feedback must own a shell lock while visible, independent of foreground processing/download task state.
- Folder-drop success should use this center outcome lock so the full window does not collapse until the `FolderCheckIcon` feedback completes.
- The solution must not reclassify folder-drop success as `isProcessing` or a download/copy task.
- Existing download success/error feedback should continue to behave as today.
- Future non-download outcomes should be able to use the same center outcome flow without one-off collapse cleanup patches.
- Outcome completion should release the lock and allow the existing shell state machine to collapse normally if the pointer has left.
- Visual language remains unchanged: existing center overlay placement, color, size, and motion are reused.

## Acceptance Criteria

- [ ] Dropping a valid folder shows the center `FolderCheckIcon` outcome and the full window remains full until that outcome finishes.
- [ ] If the pointer has left by the time the folder outcome finishes, the window then collapses to icon mode through the normal shell flow.
- [ ] The folder outcome never overlaps with the compact cat icon.
- [ ] Download success checkmark behavior is unchanged.
- [ ] The implementation uses a reusable center outcome state/lock pattern, not a folder-specific collapse-time cleanup.
- [ ] Targeted tests cover the shell lock release/collapse behavior.

## Notes

- Created after user review of the first folder-drop implementation on 2026-05-27.
- The current in-progress folder-drop task already introduced `FolderCheckIcon` and a folder outcome overlay, but it lacks a general center-outcome shell lock.
