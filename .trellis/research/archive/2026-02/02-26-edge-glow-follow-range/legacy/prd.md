# Improve Main Window Edge Glow Hover Range and Follow Behavior

## Goal
Make the main window edge glow easier to trigger and visually more obvious, especially near the top-left corner, while making the glow follow mouse movement along edges.

## Requirements
- Increase edge glow trigger sensitivity near corners and edges.
- Enlarge the visible edge glow segment so it is more obvious.
- Replace static corner-only glow behavior with edge-following behavior that moves with cursor position.
- Keep existing visibility gating logic (only show when panel hovered, not dragging content hover, not minimized, not downloading).
- Preserve existing animation smoothness and avoid breaking current interactions.

## Acceptance Criteria
- [ ] When mouse approaches top-left area, edge glow appears without requiring exact corner hover.
- [ ] Moving mouse rightward from top-left causes glow to move right along top edge.
- [ ] Glow segment size is visibly larger than before.
- [ ] Existing non-edge-glow interactions remain unchanged (drag/drop, minimize, progress states).
- [ ] TypeScript checks pass.

## Technical Notes
- Modify edge glow computation and rendering in `src/App.tsx`.
- Use normalized edge-distance computation and nearest-edge segment rendering.
- Keep implementation typed and aligned with existing motion/style patterns.
