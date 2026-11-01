# Fix folder drag full-window state

## Goal

Fix the main floating window behavior when a user drops a folder onto the full window to set the output folder.

The folder drop should communicate that the export/output folder was updated, and it must not leave the main window stuck in a full state with controls hidden.

## Requirements

- Treat a successful folder drop as an output-folder settings action, not as a foreground download/copy task.
- Show folder-specific icon-only success feedback instead of a visible text toast.
- Keep the folder-drop success feedback visually aligned with the existing center success overlay: same placement, color, sizing logic, and motion language; only the icon changes from checkmark to folder-check.
- Preserve existing error feedback for invalid or inaccessible folder drops.
- Always clear drop-hover/drop-lock state after a folder drop is consumed.
- Do not clear the real pointer-hover state in a way that hides the mini controls while the shell remains full.
- After the drop interaction ends, the main window should follow the normal compact/full hover contract:
  - remain full with controls visible while the pointer is inside the full panel;
  - collapse back to icon after the pointer leaves and no task/status lock is active.
- File, image, URL, and video drops must continue to use the existing processing/download behavior.

## Acceptance Criteria

- [ ] Dropping a valid folder updates `outputPath` and refreshes UI state.
- [ ] The success feedback uses a center `FolderCheckIcon`, not a checkmark and not visible text.
- [ ] The folder success icon reuses the existing success overlay color and motion behavior instead of introducing a new visual language.
- [ ] After dropping a valid folder, mini controls including the settings button remain available whenever the full shell is still shown under the pointer.
- [ ] After moving the pointer away from the full shell following a folder drop, the window collapses back to icon mode.
- [ ] Invalid folder drops still show their typed error messages.
- [ ] Existing file/media/URL drop behavior is unchanged.
- [ ] Targeted tests cover folder-drop state cleanup and shell-machine regression where practical.

## Notes

- Created from user report on 2026-05-27.
- Current task status is planning; implementation has not started.
