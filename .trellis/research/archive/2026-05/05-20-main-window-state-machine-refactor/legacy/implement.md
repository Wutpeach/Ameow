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

- Status: in progress, reducer/controller refactor committed; latest fix adds native pointer-boundary input because live repro showed DOM leave was still missing after focus stayed inside the app.
- Last committed checkpoint: `b30cede` (`refactor: centralize main window shell state`).
- Completed checkpoint scope: removed the normal 3-second idle collapse path, simplified shared collapse predicates, documented the compact hover contract, and centralized compact/full decisions in `src/utils/mainWindowShellMachine.ts`.
- Current follow-up scope: added `electron/mainWindowPointerBoundary.mts`, `ameow:current-window:pointer-boundary`, preload/runtime/type wiring, and an `App.tsx` subscription that maps native inside/outside facts to the existing reducer `pointerEnter` / `pointerLeave` path.
- Root cause after latest live repro: the reducer was not receiving a normal leave input. Windows transparent/layered Electron windows can miss Chromium DOM `mouseleave` / `mouseout` after the compact-to-full morph; clicking another app produced collapse only because focus/blur became an indirect cleanup signal.
- Validation run after latest fix: `npm test -- mainWindowPointerBoundary mainWindowShellMachine`, `npm test`, `npm run type-check`, and `npm run lint` all passed on Windows.
- Next step: verify manually in dev runtime that compact icon -> full -> move cursor outside collapses without clicking/focusing another app. Re-enter during the short grace should keep full, and drag/drop/context-menu/task locks should still hold full. Dev runtime is running at `http://127.0.0.1:1420/`.

## Rollback Points

- `src/App.tsx`
- `src/utils/mainWindowMode.ts`
- any new renderer helper introduced for the state machine
