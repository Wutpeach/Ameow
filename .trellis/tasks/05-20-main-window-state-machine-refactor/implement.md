# Implementation Plan

1. Read the current compact/full interaction flow in `src/App.tsx` and map the existing timers, refs, and animation callbacks into explicit state-machine events.
2. Introduce a small renderer-side controller or reducer that owns the shell state and accepts explicit events for pointer enter/leave, animation completion, task-lock changes, context-menu changes, and blur.
3. Move the normal enter/leave contract off the 3-second idle path. Keep idle only if a fallback safety path is still justified after the reducer shape is in place.
4. Simplify `src/utils/mainWindowMode.ts` so it only exposes reusable predicates/constants that still matter after the refactor.
5. Keep Electron main unchanged unless a native adapter boundary needs a small adjustment for the new renderer contract.
6. Add or update tests around the new state transitions, especially hover enter/leave, expand-cancel-after-leave, and post-morph settle behavior.
7. Run targeted tests first, then `npm run type-check`, `npm run lint`, and any focused unit tests that cover the new reducer/helpers.
8. Verify the window no longer depends on a 3-second idle wait for normal compact/full switching.

## Validation Points

- Shell transitions remain stable under rapid enter/leave cycles.
- Pointer leave during expand does not strand the window in full mode.
- Task locks, context menus, drag state, and blur still block collapse when expected.
- The renderer state machine does not duplicate native window ownership.

## Current Handoff

- Status: in progress, full reducer/controller refactor implemented; needs dev runtime verification on the live main window before commit/archive.
- Last committed checkpoint: `78f30edd` (`refactor: simplify main window interaction state`).
- Completed checkpoint scope: removed the normal 3-second idle collapse path, simplified shared collapse predicates, and documented the compact hover contract in frontend specs.
- Current follow-up scope: replaced scattered compact/full decisions with `src/utils/mainWindowShellMachine.ts`, a pure reducer that owns pointer enter/leave, drop enter/leave, lock changes, startup settle, animation completion, collapse timer tokens, and native mode effects. `src/App.tsx` now dispatches shell events and executes reducer effects instead of independently deciding expand/collapse from hover refs, DOM `:hover`, animation callbacks, and timers.
- Root cause after live repro: compact/full ownership was split across handlers and callbacks. Fixing individual guards just moved the failure to another owner. The refactor removes DOM `:hover` from compact/full decisions and makes the reducer-issued collapse timer / transition effects the single path.
- Validation run: `npm test`, `npm run type-check`, and `npm run lint` all passed on Windows.
- Next step: verify manually in dev runtime that startup settles to compact when unhovered, repeated icon -> full -> leave cycles collapse consistently, and hover/drag/drop/context-menu guards still hold the full shell.

## Rollback Points

- `src/App.tsx`
- `src/utils/mainWindowMode.ts`
- any new renderer helper introduced for the state machine
