# Fix macOS Main Window Double-Click Open Output Folder

## Goal
Fix the macOS bug where double-clicking the idle main floating window fails to open the current output folder.

## Requirements
- Keep the existing user-facing shortcut: double-clicking the blank area of the main floating window opens the current output folder.
- Make the interaction reliable on macOS even when small cursor movement happens between clicks.
- Preserve the existing drag behavior for moving the floating window.
- Preserve the existing guard conditions so double-click open is disabled while minimized, while tasks are running, or when the queue popover is open.
- Keep the `open_current_output_folder` Tauri command contract unchanged unless the frontend path is proven insufficient.

## Acceptance Criteria
- [ ] On macOS, double-clicking the idle main panel opens the current output folder reliably.
- [ ] Small pointer jitter between the first and second click does not get misinterpreted as a drag before the folder-open action can happen.
- [ ] Normal window dragging from the main panel still works.
- [ ] Right-click menu folder actions continue to work without regression.
- [ ] `npm run lint`, `npm run type-check`, and relevant tests pass.

## Technical Notes
- The current interaction chain is `src/App.tsx` -> `invoke("open_current_output_folder")` -> `src-tauri/src/lib.rs`.
- The likely fix point is the main panel pointer interaction logic in `src/App.tsx`.
- If new interaction heuristics are introduced, they should stay local to the main panel code or a small shared helper with tests.
