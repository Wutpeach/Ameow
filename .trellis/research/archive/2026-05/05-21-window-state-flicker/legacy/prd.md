# Window state transition pointer and taskbar stability

## Goal

Fix intermittent Windows desktop instability when the main window switches between full mode and compact icon mode:

- the window must keep responding to pointer enter / leave transitions
- the main window must not briefly appear in the Windows taskbar during compact/full transitions

## Confirmed Facts

- `electron/main.mts` owns native interaction mode changes through `ameow:current-window:set-interaction-mode`.
- The `interactive` branch restores mouse handling, sets the window focusable, reasserts `setSkipTaskbar(true)`, and restarts native pointer-boundary polling.
- The `compact-passthrough` branch previously set the window non-focusable and reasserted `setSkipTaskbar(true)`, but manual Windows validation showed the taskbar flicker still occurred even after that reassertion.
- The current fix hypothesis is that the repeated native focusability toggle itself is the taskbar flicker trigger on Windows, so the Windows interaction path should avoid `setFocusable(true/false)` during the compact/full mode switch.
- The backend runtime contract says Windows must preserve `skipTaskbar: true` through shell-affecting calls, and prior evidence showed `setFocusable(false)` was still the native transition worth isolating.
- `electron/mainWindowPointerBoundary.mts` emits a pointer-boundary event immediately when polling starts. During rapid compact/full transitions, that synchronous emission can race with renderer shell effects and animation phase changes.
- `src/utils/mainWindowShellMachine.ts` now keeps collapse and compact-passthrough ownership separate from the expand-time interaction flip, so the collapse path can stay visually active until the settle handler applies compact passthrough.
- After the refactor, the remaining noticeable latency comes from the renderer-side leave grace and native settle timing, not from Windows focusability flips.
- A Claude second-opinion review agreed that the missing `skipTaskbar` reassertion is the direct taskbar-flicker cause and that pointer-boundary restart timing is a plausible cause for enter/leave instability.

## Requirements

- Keep the Windows main window out of the taskbar during both `interactive` and `compact-passthrough` native mode transitions.
- On Windows, avoid toggling native focusability inside the high-frequency compact/full interaction path if click-through and pointer forwarding can be preserved without it.
- Preserve compact-mode click-through behavior: compact icon mode must keep passthrough mouse behavior and non-focusability.
- Preserve full-mode interaction behavior: full mode must restore normal pointer interaction and pointer-boundary tracking.
- Avoid treating transient pointer-boundary readings during expand as a reason to immediately collapse the window before the expand settles.
- Keep the collapse path linear: the reducer should not flip interaction mode to interactive during collapse, and the settle handler should remain the single owner of compact-passthrough.
- Keep the collapse reaction snappy: leave grace should be short enough to feel immediate without making jittery exits collapse too early.
- Keep the fix narrowly scoped to main-window state transitions and their tests.

## Acceptance Criteria

- [ ] Entering `compact-passthrough` preserves Windows `skipTaskbar: true` without reintroducing a taskbar entry.
- [ ] The Windows compact/full interaction path no longer needs to toggle native focusability to preserve click-through and pointer forwarding.
- [ ] Pointer-boundary polling can be stopped and restarted rapidly without emitting stale events after a stop.
- [ ] The shell state machine no longer schedules a collapse solely from `pointerLeave` while the window is still expanding.
- [ ] Collapse no longer emits a redundant interaction-mode flip before the settle handler applies compact-passthrough.
- [ ] The leave-to-collapse delay feels immediate and does not add a noticeable dead zone after pointer exit.
- [ ] Existing compact/full shell-machine behavior remains covered by focused tests.
- [ ] Focused Electron and shell-machine tests pass.

## Out Of Scope

- Redesigning the compact/full visual animation.
- Changing tray menu behavior or tray icon assets.
- Changing startup window mode policy.
- Changing macOS-specific app visibility behavior.

## Open Questions

None blocking. The reported behavior is covered by repository evidence and the existing Windows tray-first runtime contract.
