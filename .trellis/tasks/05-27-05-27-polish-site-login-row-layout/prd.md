# Polish Site Login Row Layout

## Goal

Clean up the Settings > Site login states layout so each site reads as one coherent row, with row-level actions aligned to the site content and capture actions attached to the active site instead of floating at the bottom.

## Problem

The current site login section visually splits each site into a left badge and a right button column. After diagnostics were added, the left side became taller while the right-side Refresh/Clear buttons remained visually detached and misaligned. The bottom Cancel button also appears as a global action, making it unclear which site it affects.

## Requirements

- Convert each site login item into one full-width row surface.
- Keep the existing site icon and status dot, with the dot as the only visible status indicator.
- Remove visible status copy and the compact diagnostics line from each row.
- Avoid browser-default hover tooltips on the site row or status dot.
- Place Refresh and Clear actions inside the same row, aligned with the row content.
- When a site capture is active, show Save session and Cancel actions inside that site row instead of the bottom action area.
- Hide the global bottom Cancel button when no capture is active.
- Preserve existing command behavior and site-session backend contracts.
- Preserve existing theme tokens, Neon primitives, and compact Settings visual language.
- Avoid adding new colors, modal flows, or broad Settings redesign.

## Acceptance Criteria

- [ ] Site rows no longer appear as separate left/right columns.
- [ ] Refresh/Clear controls align visually with each site row.
- [ ] Save/Cancel controls appear on the active capture site's row.
- [ ] No standalone bottom Cancel button remains in the idle state.
- [ ] Each row shows only the site icon, status dot, site title, and row actions.
- [ ] Site rows and status dots do not show browser-default hover tooltips.
- [ ] Existing start, confirm, cancel, refresh, and clear command flows still work.
- [ ] `npm run type-check` and `npm run lint` pass.

## Out Of Scope

- Changing site-session backend commands or diagnostics contracts.
- Adding new profile-management features.
- Reworking the full Settings navigation or visual system.
