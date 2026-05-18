# Fix macOS Settings Window Corner Background Leakage

## Goal
Remove the square background artifacts that appear around the four rounded corners of the Settings window on macOS.

## Requirements
- Keep the existing FlowSelect Settings visual style and rounded shell.
- Fix the corner artifact locally in the Settings window instead of changing shared panel-shell behavior for other surfaces.
- Continue using theme tokens and shared style helpers where possible.

## Acceptance Criteria
- [ ] The Settings window no longer shows rectangular background leakage around the rounded corners on macOS.
- [ ] Main window and dropdown panel styling remain unchanged.
- [ ] The Settings shell still reads as the same FlowSelect surface in both themes.

## Technical Notes
The current Settings root panel fills the full transparent Tauri window and uses `getPanelShellStyle()` with an outer shadow. On macOS, that outer shadow can be clipped by the rectangular webview bounds and visually leak outside the rounded shape. Prefer a Settings-specific shell treatment rather than changing the shared helper default.
