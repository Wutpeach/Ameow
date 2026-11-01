# Main Window Folder Drop Sets Output Path

## Goal
Allow users to drag a Windows folder onto the Electron main floating window and use that dropped folder as the app export directory.

## Requirements
- Capture folder drag/drop at the Electron preload boundary instead of relying on renderer-only path access.
- Resolve the dropped absolute path on Windows and validate that it is an existing directory in the Electron main process.
- Surface typed success or error results back to the renderer.
- When a valid folder is dropped on the main floating window, update the persisted `outputPath` config to that folder and refresh the UI state.
- Reject files or invalid paths with explicit user-visible feedback without breaking existing drag/drop flows.

## Acceptance Criteria
- [ ] Dragging a real folder from Windows Explorer onto the main Electron window resolves its absolute path.
- [ ] Valid folder drops persist `outputPath` and the main window UI reflects the new export directory.
- [ ] File drops continue to follow existing file-processing behavior and are not misclassified as output-folder changes.
- [ ] Invalid drops return typed errors and do not corrupt config state.
- [ ] Relevant tests cover path resolution/validation and renderer integration behavior where practical.

## Technical Notes
- This is a fullstack Electron feature crossing renderer, preload, main, and config persistence.
- Follow the reference contract from `F:/ElectronMVP/.trellis/spec/big-question/windows-folder-drag-path.md`.
- Keep Electron preload security boundaries intact: renderer receives typed results, filesystem validation stays in main.
