# Adjust icon mode size to 60x60

## Goal
Reduce the icon-mode window size from 80x80 to 60x60 without regressing the transition experience between icon mode and the main window.

## Requirements
- Change the icon-mode size contract from `80x80` to `60x60`.
- Preserve the existing icon-window to main-window transition timing and choreography.
- Preserve the existing main-window to icon-window transition timing and choreography.
- Avoid visible flicker, missing transition steps, or single-frame flashes during either direction of the transition.

## Acceptance Criteria
- [ ] Icon mode renders at `60x60`.
- [ ] Switching from icon mode to the main window still shows the current transition behavior without flashes.
- [ ] Switching from the main window to icon mode still shows the current transition behavior without flashes.
- [ ] No related lint or typecheck errors are introduced.

## Technical Notes
This change likely touches both icon-mode sizing constants and shell/window transition code that coordinates reveal and hide animations.
