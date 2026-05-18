# Fix context menu shadow artifact

## Goal
Remove the visible dark shadow block that appears near the lower-left corner of the context menu window, especially in the white theme.

## Requirements
- Keep the existing context menu structure and actions unchanged.
- Preserve theme-aware styling through `ThemeContext` tokens.
- Adjust the menu surface or container styling so transparent window rendering does not produce corner shadow artifacts.

## Acceptance Criteria
- [ ] The context menu no longer shows a clipped dark shadow block in the white theme.
- [ ] The context menu remains visually correct in the black theme.
- [ ] No hardcoded theme colors are introduced.

## Technical Notes
The context menu is rendered in a transparent Tauri window. Outer shadows that extend beyond the panel bounds may clip against the transparent window and create visible artifacts. Favor a contained surface treatment over a shadow that bleeds outside the window edge.
