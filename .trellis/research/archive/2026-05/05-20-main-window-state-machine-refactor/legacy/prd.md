# main window state machine refactor

## Goal

Refactor the main floating window interaction logic so compact/full transitions are driven by an explicit renderer-owned state machine instead of scattered timers, hover checks, and animation side effects.

## Confirmed Facts

- The current implementation spreads main-window behavior across `src/App.tsx`, `src/utils/mainWindowMode.ts`, and `electron/main.mts`.
- The existing flow combines `shellPhase`, `isMinimized`, hover refs, leave timers, idle timers, compact hotspot polling, and animation completion callbacks.
- The 3-second idle collapse currently acts as a fallback for hover/race issues, not as the desired primary contract.
- `mouseleave` can be lost during expand/collapse morphs, and DOM `:hover` can be stale during transparent/layered transitions.
- Electron main should keep owning native window adapters only.

## Requirements

- Renderer must own the transition decision logic for compact/full window mode.
- The transition model must make enter/leave, expand complete, collapse complete, blur, context-menu state, and lock state explicit inputs.
- The normal enter/leave path should be immediate or short-grace, not dependent on a 3-second idle timer.
- Any idle behavior that remains must be a fallback, not the primary enter/leave contract.
- Native window operations such as `setInteractionMode` and `animateBounds` must remain in Electron main.
- The refactor must preserve transition-token checks for async bounds animation completion.

## Acceptance Criteria

- [ ] Hover enter expands the window immediately or through a short handoff, without waiting for idle.
- [ ] Hover leave collapses the window through the explicit state machine path, not by depending on the 3-second idle timer.
- [ ] Pointer leave during expand/collapse morphs resolves consistently and does not leave the window stuck in full mode.
- [ ] The window no longer relies on `mouseleave` alone as the source of truth for collapse.
- [ ] The 3-second idle path is removed from the normal enter/leave interaction contract.
- [ ] Full-mode and compact-mode behavior remains stable across drag, context menu, task-lock, and blur cases.
- [ ] Tests cover the new state transitions and the known hover/morph race cases.

## Out of Scope

- Reworking unrelated download, transcode, or task queue flows.
- Changing unrelated Electron runtime ownership outside the main-window adapter boundary.
- UI redesign of the main window beyond what the state-machine refactor requires.

## Open Questions

- Idle collapse is removed from the normal enter/leave contract; any remaining fallback behavior must not own the primary compact/full switch.
- Should the transition model be implemented as a reducer, a small controller object, or another local state-machine helper?
