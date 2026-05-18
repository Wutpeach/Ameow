# Convert screenshot overlay actions to icons

## Goal
Replace screenshot overlay action texts (save/copy/delete) with icon buttons and make hover state blue.

## Requirements
- Replace `保存` / `复制` / `删除` text actions with icon-only buttons in both YouTube and Bilibili screenshot panels.
- Use the provided save/copy/delete SVG paths.
- Keep existing click behavior and accessibility labels.
- Update button styles so hovering any action button shows blue feedback.
- Provide a list of existing blue-related color values used in the project.

## Acceptance Criteria
- [ ] YouTube screenshot overlay shows icon buttons for save/copy/delete.
- [ ] Bilibili screenshot overlay shows icon buttons for save/copy/delete.
- [ ] Hovering any overlay action button changes to blue style.
- [ ] Copy action still works and gives visual feedback.
- [ ] A deduplicated list of blue color values in project is reported.

## Technical Notes
- Keep changes scoped to browser extension detector and button CSS files.
- Prefer existing icon-constant pattern already used in detector files.
