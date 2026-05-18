# Polish download status text and colors

## Goal
Tighten the compact main-window status UI by removing redundant video names from active status cards and making download status helper text use the same blue-tinted emphasis logic as download states.

## Requirements
- Remove the white video title text from the `download active`, `download queued`, and `transcode active` UI states.
- Keep the rest of the card structure intact.
- Update the gray helper/status text in `download active` and `download queued` to use a blue-matched tone.
- Preserve the existing yellow-matched helper text behavior for transcode states.

## Acceptance Criteria
- [ ] The active download card no longer shows a white video name line.
- [ ] The queued download card no longer shows a white video name line.
- [ ] The active transcode card no longer shows a white video name line.
- [ ] Download helper/status text is blue-tinted and visually consistent with the active download accent.

## Technical Notes
- Expected implementation area is the main floating window status rendering in `src/App.tsx`.
- Prefer reusing existing semantic color tokens instead of introducing raw literals.
