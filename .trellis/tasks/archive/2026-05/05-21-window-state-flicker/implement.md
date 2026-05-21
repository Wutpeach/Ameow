# Window state transition pointer and taskbar stability implementation plan

## Checklist

- [x] Activate the task with `task.py start` after plan review.
- [x] Load pre-development specs with `trellis-before-dev`.
- [x] Update `electron/main.mts` so the Windows `compact-passthrough` interaction branch preserves `skipTaskbar` without repeatedly toggling focusability in the hot path.
- [x] Update `electron/mainWindowPointerBoundary.mts` to make the initial `start()` emission cancellable when `stop()` happens immediately after a restart. Use `setTimeout(emitIfChanged, 0)` in the Electron main process, not `setImmediate` or `process.nextTick`.
- [x] Update `src/utils/mainWindowShellMachine.ts` so `pointerLeave` during `expanding` records `pointerInside: false` without immediately scheduling collapse.
- [x] Remove redundant collapse-path interaction-mode flips from the reducer so collapse ownership stays in the settle path.
- [x] Remove the duplicate 100ms full-container focus timer from the expand-start path.
- [x] Remove the double-RAF compact native settle and let collapse completion apply compact-passthrough inline.
- [x] Shorten the full-window pointer-leave collapse grace to 80ms.
- [x] Add or update focused tests in `electron/mainWindowPointerBoundary.test.mts` and `src/utils/mainWindowShellMachine.test.ts`.
- [x] Add a pointer-boundary cancellation test: `start()` then `stop()` before the deferred timeout fires must not call `webContents.send`.
- [x] Rewrite the shell-machine `pointerLeave`-during-`expanding` test so it expects `expanding` with no immediate collapse effects, then collapse scheduling from `expandAnimationComplete` if the pointer remains outside.
- [x] Manually validate on Windows that compact/full toggles no longer cause taskbar entry flicker after focusability removal from the hot path.
- [x] Run focused tests for the changed modules.
- [x] Run broader validation if focused tests pass.

## Validation Commands

- `npm run test -- electron/mainWindowPointerBoundary.test.mts src/utils/mainWindowShellMachine.test.ts`
- `npm run type-check`
- `npm run lint`

## Risk Points

- Delaying the first pointer-boundary emission must not make compact icon hover feel laggy. The delay should be limited to the next timer turn, not the recurring 50 ms poll interval.
- Ignoring collapse scheduling during `expanding` must still allow collapse after `expandAnimationComplete` when the pointer remains outside.
- The Windows taskbar fix must reuse the existing `keepMainWindowOffWindowsTaskbar` helper instead of adding duplicate platform checks.
- Keep the timing surface small. If a timing workaround is still needed after the refactor, centralize it in the settle handler instead of spreading more timers across `App.tsx`.
- The `electron/main.mts` IPC handler currently has no focused automated test. Treat the Windows manual rapid-toggle check as required coverage for the taskbar flicker fix.

## Manual Check

On Windows, rapidly switch between compact icon and full mode at least 20 times. Confirm:

- the main window still expands on compact icon hover
- the window collapses after pointer leave once the full panel is settled
- no main-window taskbar entry appears or flickers during transitions
