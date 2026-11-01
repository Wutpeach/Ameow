# Update YouTube clip point icons

## Goal
Replace the YouTube injected player controller IN/OUT clip-point icons with the provided SVG design while keeping the existing clip selection behavior unchanged.

## Requirements
- Replace the current IN button icon with the provided SVG path.
- Use a horizontally flipped version of the IN icon for the OUT button.
- Keep existing button sizing, hover, selected, and clip-ready behaviors intact.
- Limit changes to the browser extension YouTube injected controls.

## Acceptance Criteria
- [ ] The YouTube IN button renders the new SVG icon.
- [ ] The YouTube OUT button renders the horizontally flipped version of the same icon.
- [ ] The icon swap does not change clip-point selection or download behavior.
- [ ] Existing YouTube controller button layout remains intact.

## Technical Notes
Update the icon constant(s) in `browser-extension/youtube-detector.js` and adjust `browser-extension/youtube-button.css` only if the new SVG requires different transform or stroke handling.
