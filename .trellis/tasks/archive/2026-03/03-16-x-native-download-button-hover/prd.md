# Match X Native Download Button Hover Shape

## Goal
Align the injected FlowSelect download button on X with the native action button background behavior.

## Requirements
- Keep the X download button injection logic unchanged.
- Change the X button idle state so it has no visible background fill.
- Change the X button hover state from a pill-like shape to a circular background.
- Keep the X button vertically aligned with native action buttons in both the timeline and tweet detail view.
- Keep the icon readable and preserve the existing click target size.

## Acceptance Criteria
- [ ] The X button no longer shows the gray idle background when the mouse is not hovering.
- [ ] The hover background reads as a circle instead of a capsule.
- [ ] The X button sits on the same vertical baseline as native action buttons in tweet detail view.
- [ ] The change is scoped to the X extension surface and does not alter other site button styles.

## Technical Notes
- Ownership is in `browser-extension/twitter-button.css`.
- `browser-extension/twitter-detector.js` should remain unchanged unless the CSS fix proves insufficient.
- `browser-extension/manifest.json` loads `flowselect-shared.css` before `twitter-button.css`, so the X-specific CSS can safely override shared defaults.
