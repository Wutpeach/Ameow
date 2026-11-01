# Fix Windows taskbar icon and tray icon

## Goal
Ensure the Windows desktop runtime uses the FlowSelect cat icon instead of the default Electron icon, and keep the main app window out of the Windows taskbar while preserving the tray icon.

## Requirements
- The Windows tray icon must use the project cat icon asset.
- The main desktop window must not appear in the Windows taskbar.
- Existing tray behavior must remain unchanged: tray click shows the main window and tray menu still works.
- Packaged Windows builds must continue to resolve the icon asset correctly.

## Acceptance Criteria
- [ ] Launching the Electron desktop runtime on Windows shows the FlowSelect cat icon in the tray instead of the default Electron icon.
- [ ] The main window does not create a taskbar entry on Windows.
- [ ] Showing and hiding the main window still works from the tray.
- [ ] Type check passes after the change.

## Technical Notes
- Primary runtime ownership lives in `electron/main.mts`.
- Windows packaging icon configuration lives in `electron-builder.config.mjs`.
- Prefer reusing an existing app icon asset source instead of introducing duplicate icon logic.
