# Fix transparent window corner glow bleed

## Goal
Remove unintended black and blue corner artifacts around the transparent rounded main window without breaking existing motion and edge-follow effects.

## Requirements
- Keep the current scale and border-radius animation behavior unchanged.
- Preserve the edge-follow hover effect as an internal border-attached highlight.
- Remove outer shadows and glows that bleed into transparent window corners.
- Ensure drag hover visuals stay inside the rounded panel bounds.

## Acceptance Criteria
- [ ] Idle main window corners show no black shadow bleed on macOS.
- [ ] Drag-hover state shows no blue corner haze outside the rounded panel.
- [ ] Existing hover/edge-follow animation still appears intentional and responsive.
- [ ] Changes remain safe for Windows transparent window composition.

## Technical Notes
- Prefer inset-only panel shadows for the rounded transparent shell.
- Clip all visual overlays to the animated panel radius.
- Replace outer drop-shadow edge glow with masked border rendering.
