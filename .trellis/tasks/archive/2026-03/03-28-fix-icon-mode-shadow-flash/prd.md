# Fix icon-mode shadow flash after window transition

## Goal
Remove the delayed shadow appearance that happens after the window-to-icon transition finishes.

## Requirements
- Preserve the existing window-to-icon transition timing and visual intent.
- Ensure icon mode does not show a second shadow transition or delayed shadow pop-in after the main animation completes.
- Keep the fix scoped to the transition/shadow ownership logic for this surface.

## Acceptance Criteria
- [ ] Switching from window mode to icon mode completes without a delayed shadow appearing about 0.5s later.
- [ ] The icon-mode surface keeps a stable shadow state during and after the transition.
- [ ] Existing startup/icon-mode transition behavior remains visually consistent aside from removing the shadow flash.

## Technical Notes
- Frontend-only task.
- Follow Motion for React guidance: avoid mixed ownership where CSS and Motion animate the same visual property across the same transition.
