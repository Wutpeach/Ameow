# Main Window State Machine Notes

## Findings

- `src/App.tsx` currently mixes state, refs, timers, DOM hover reconciliation, and animation handoff inside one component.
- The current collapse path depends on a 3-second idle timer plus a separate pointer-leave grace timer.
- `mouseleave` alone is not reliable during morph transitions.
- DOM `:hover` reconciliation is already needed, which suggests the current logic is compensating for stale event ordering.

## Working Conclusion

- The cleanest refactor is to make the renderer the single decision-maker for compact/full mode.
- Electron main should remain a native adapter only.
- The 3-second idle timer should not be part of the normal enter/leave contract.

## Relevant Specs

- `.trellis/spec/frontend/state-management.md`
- `.trellis/spec/frontend/motion-guidelines.md`
- `.trellis/spec/backend/electron-runtime-contracts.md`
