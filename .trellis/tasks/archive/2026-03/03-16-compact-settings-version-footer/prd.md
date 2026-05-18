# Compact Settings Version Footer

## Goal
Reduce the vertical footprint of the settings page footer that only displays the app version so the bottom area feels more proportionate.

## Requirements
- Shrink the footer height on the settings page.
- Preserve the existing app version display and version tap interaction.
- Keep the visual treatment consistent with the compact FlowSelect settings window.

## Acceptance Criteria
- [ ] The footer occupies less vertical space than before.
- [ ] The version string still renders as `v${APP_VERSION}`.
- [ ] Version tap hint/export behavior still works.

## Technical Notes
Adjust the footer layout in `src/pages/SettingsPage.tsx` by tightening padding and hint spacing without introducing new visual patterns or theme regressions.
