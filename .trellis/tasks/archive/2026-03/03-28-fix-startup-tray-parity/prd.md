# Fix desktop startup tray parity and flash

## Goal
Make desktop startup behavior consistent across dev and portable builds so first launch enters tray/icon mode without showing the main window, and reduce visible startup flicker and unnecessary startup delay.

## Requirements
- Portable first launch should honor the same tray/icon startup path as dev.
- Startup should avoid briefly showing the main window or unrelated icon/window before tray/icon mode is ready.
- Investigate the main contributors to slow startup in both dev and portable startup flows.
- Keep existing startup semantics intact for non-tray launches and explicit window opens.

## Acceptance Criteria
- [ ] Portable first launch no longer opens the main window when startup should enter tray/icon mode.
- [ ] Dev startup no longer visibly flashes an intermediate icon/window before tray/icon mode stabilizes.
- [ ] Startup flow changes are limited to the intended launch modes and do not regress explicit main-window launch behavior.
- [ ] Lint/typecheck and targeted validation pass for the touched areas.

## Technical Notes
- Recent baseline commit: `57465b5 fix(electron): align portable startup with dev shell`.
- Likely cross-layer path: desktop shell/bootstrap, Electron/Tauri runtime bridge, tray/window state initialization, and frontend render timing.
- Research should identify whether the flash is caused by an early visible BrowserWindow/Tauri window, delayed tray readiness, or a race in startup config/bootstrap.
