# Position UI Lab beside settings window

## Goal
Open the dev-only UI Lab window adjacent to the settings window instead of always centering it on the screen.

## Requirements
- UI Lab should open with the same horizontal gap pattern used by the settings window.
- When settings is on the right side of the main floating window, UI Lab should open to the right of settings.
- If the preferred side would overflow the current monitor, clamp or fall back so the window still opens within the visible work area.
- Reuse one shared positioning rule instead of duplicating layout math.

## Acceptance Criteria
- [ ] Opening settings from the main window still positions it beside the main floating window.
- [ ] Opening UI Lab from settings positions it beside the settings window instead of screen center.
- [ ] The computed position stays within the current monitor work area.
- [ ] Automated lint, type-check, and tests pass.

## Technical Notes
- Existing settings window placement logic lives in `src/App.tsx`.
- UI Lab launch currently lives in `src/pages/SettingsPage.tsx`.
- Shared placement math should live in `src/utils/` with unit tests.
