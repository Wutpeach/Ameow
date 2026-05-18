# Hide mac Dock Icon For Tray-First App

## Goal
Make FlowSelect behave like a tray/menu-bar utility on macOS so it does not show a Dock icon during normal startup and window reveal flows.

## Requirements
- Keep the existing tray-first behavior and main-window reveal flow intact.
- Ensure macOS startup applies an app activation mode that hides the Dock icon.
- Avoid changing Windows taskbar behavior or non-macOS startup behavior.
- Keep the implementation testable with focused regression coverage.

## Acceptance Criteria
- [ ] macOS startup configures the Electron app as a tray/menu-bar utility without a Dock icon.
- [ ] Main window and settings window can still be shown from tray actions after the Dock icon is hidden.
- [ ] Non-macOS behavior remains unchanged.
- [ ] Focused tests cover the mac-only activation handling.

## Technical Notes
- Electron defaults to a regular foreground app on macOS unless activation policy or Dock visibility is adjusted.
- `app.setActivationPolicy("accessory")` and `app.dock.hide()` should be applied carefully and only on macOS.
