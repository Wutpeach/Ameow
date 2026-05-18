# Limit FlowSelect to a Single Running Instance

## Goal
Prevent users from launching multiple FlowSelect desktop app instances at the same time.

## Requirements
- Enforce a single running FlowSelect desktop instance on supported desktop platforms.
- When the user attempts to launch FlowSelect again, keep the existing instance and bring its main window to the foreground.
- Preserve current tray, shortcut, and window-activation behavior for the primary instance.

## Acceptance Criteria
- [ ] Launching FlowSelect while it is already running does not create a second app instance.
- [ ] A repeat launch focuses and shows the existing main window.
- [ ] Rust startup code compiles cleanly after the change.

## Technical Notes
- Use the official Tauri single-instance plugin in the backend startup path.
- Reuse the existing `show_main_window` helper instead of duplicating window activation logic.
- Keep logging and error handling aligned with current backend conventions.
