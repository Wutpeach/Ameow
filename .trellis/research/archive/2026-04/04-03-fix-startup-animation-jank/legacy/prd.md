# Fix startup animation jank during first launch

## Goal
Reduce the visible stutter in the first few main-window transitions after app launch by deferring non-critical startup work until after the initial reveal/settle period.

## Requirements
- Keep the current compact/full animation behavior and visual timing intact.
- Delay non-critical startup checks so they do not compete with the first user-visible transition window.
- Keep startup auto-runtime bootstrap behavior, but schedule it later than the initial status/update checks.
- Preserve existing typed desktop bridge contracts and on-demand refresh fallback paths for foreground actions.

## Acceptance Criteria
- [ ] First-launch startup no longer begins runtime/update checks during the earliest reveal window.
- [ ] Automatic runtime bootstrap starts later than the initial deferred startup checks.
- [ ] Existing startup-triggered runtime/update flows still work without breaking manual foreground-task recovery.
- [ ] Relevant startup timing tests are updated to match the new deferred behavior.

## Technical Notes
- Primary touch points are `src/App.tsx` and `src/utils/startupWindowState.ts`.
- The change should prefer centralized startup timing constants/helpers over adding new ad hoc timers in multiple effects.
