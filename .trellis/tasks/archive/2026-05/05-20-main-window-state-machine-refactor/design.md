# Design

## Architecture

Use a renderer-owned state machine to decide the main window's interaction state. The state machine should be the single place that interprets pointer enter/leave, window blur, context menu state, drag state, task-lock state, and animation completion events.

Keep Electron main as a native adapter only:

- `setInteractionMode(...)`
- `animateBounds(...)`
- any other window API needed to realize renderer decisions

## Proposed State Model

Use explicit states for the visible shell:

- `compact`
- `expanding`
- `full`
- `collapsing`

Use explicit events instead of implicit side effects:

- `pointer_enter`
- `pointer_leave`
- `expand_animation_complete`
- `collapse_animation_complete`
- `task_lock_changed`
- `context_menu_changed`
- `window_blurred`
- `drag_state_changed`
- `shortcut_show`

## Boundaries

`src/App.tsx` should own:

- current state
- transition guards
- derived render flags
- event dispatch
- collapse/expand handoff logic

`src/utils/mainWindowMode.ts` should only hold shared predicate helpers and constants that are truly reusable.

`electron/main.mts` should not decide UI state. It should only honor renderer requests and preserve native-window contracts.

## Idle Timer Policy

The 3-second idle timer is not part of the primary enter/leave contract. If retained at all, it should be demoted to a fallback safety mechanism that cannot override the explicit hover-driven state machine.

Preferred outcome:

- enter immediately expands
- leave immediately or shortly collapses
- idle is not required for normal compact/full switching

## Risk Areas

- Stale `mouseleave` during morphs
- Stale DOM `:hover` after transparent-window transitions
- Races between animation completion and pointer leave
- Duplicate ownership between renderer timers and native bounds callbacks

## Compatibility Notes

- Preserve transition token verification for async `animateBounds(...)` completion.
- Preserve compact-passthrough interaction mode semantics in Electron main.
- Avoid introducing a second source of truth for hover or minimized state.

## Rollback Shape

If the refactor causes regressions, rollback should be possible by restoring the previous renderer state flow without changing Electron main contracts.
