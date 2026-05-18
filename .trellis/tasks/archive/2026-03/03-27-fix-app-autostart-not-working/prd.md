# Fix app autostart not working

## Goal
Restore the desktop app's "launch at startup" behavior so enabling the setting actually causes the app to start with the operating system again.

## Requirements
- Find the existing autostart toggle flow across frontend config, persisted settings, and Tauri backend integration.
- Fix the bug that prevents the autostart setting from taking effect.
- Preserve the current settings UX and stored config shape unless the bug requires a targeted contract change.
- Keep the implementation compatible with the current Windows desktop build flow.

## Acceptance Criteria
- [ ] Enabling the autostart setting triggers the backend path that registers app startup correctly.
- [ ] Disabling the autostart setting removes or disables the startup registration correctly.
- [ ] Reloading the app reflects the persisted autostart preference without regressions in other settings.
- [ ] Relevant lint and type checks pass for the touched code.

## Technical Notes
- Likely touches frontend settings state and Rust/Tauri autostart plugin wiring, so treat this as a cross-layer bugfix.
- Verify whether the backend uses `tauri-plugin-autostart` consistently with the persisted config contract.
