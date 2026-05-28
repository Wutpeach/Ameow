# Analyze floating window and new tab cat icon bugs

## Goal

Diagnose and plan fixes for two reported UI regressions without implementing yet:

1. After a download completes, the main window remains in full mode until the pointer enters and leaves again, instead of returning to icon mode automatically.
2. When opening a new browser tab, a very large cat icon can flash briefly before normal page content appears.

## Requirements

- Preserve the compact/full hover contract: compact expands on pointer enter, unlocked full mode collapses after the short leave path.
- Download completion must not require a fresh mouse enter/leave cycle before the full window can collapse.
- Completion/outcome feedback should remain visible for its intended duration before collapse is allowed.
- The browser extension must not flash oversized injected cat imagery during page or tab initialization.
- Fixes should be scoped to the affected state synchronization and injected UI styling/load order.
- Do not start implementation until the plan is reviewed and approved.

## Acceptance Criteria

- [ ] A completed download returns the full window to icon mode after the completion/outcome state clears when the pointer is outside the window.
- [ ] The full window remains open after completion if the pointer is still inside the window.
- [ ] No regression to startup compact behavior, drag/drop locks, context menu locks, runtime/app update locks, or foreground outcome display timing.
- [ ] New browser tab/page initialization never displays an oversized cat icon; injected icons are hidden or size-constrained until their stylesheet and parent dimensions are ready.
- [ ] Focused tests cover the shell lock-release collapse behavior and any reusable extension styling guard if implemented.

## Notes

- User requested: create a task, analyze root causes, propose fixes, send the plan to Claude for review, then stop and wait for a decision.
