# Fix Blue Corner Tint During Video Download

## Goal
Eliminate the blue translucent tint appearing at the four window corners while a video download is in progress.

## Requirements
- Keep the current download progress UI behavior unchanged.
- Remove corner blue tint artifact specifically caused by download-state visual styling.
- Preserve existing hover visual style when not downloading.

## Acceptance Criteria
- [ ] During active video download, no blue translucent tint appears in the four rounded-corner areas of the main window.
- [ ] Progress ring, cancel action, and completion flow still work as before.
- [ ] No regression in non-download idle/hover visual states.

## Technical Notes
- Adjust download-state shadow styling in `src/App.tsx` main container style.
- Prefer an inset-only highlight for download state to avoid outer glow leaking into transparent corner regions.
