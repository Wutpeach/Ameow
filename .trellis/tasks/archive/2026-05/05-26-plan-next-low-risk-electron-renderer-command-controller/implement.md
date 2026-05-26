# Implementation Plan

## Checklist

- [x] Confirm clean git status, current task none, and parent task existence.
- [x] Create child task and configure initial artifacts.
- [x] Run `task.py validate`.
- [x] Read Phase 5.1 records and current Electron command modules.
- [x] Map remaining `handleCommand(...)` branches in `electron/main.mts`.
- [x] Classify remaining command/action families by extraction risk.
- [x] Draft recommended minimal Phase 5.2 target.
- [x] Consult Claude on the draft plan.
- [x] Record adopted/rejected/follow-up Claude guidance.
- [x] Update `design.md` and parent task record with the final plan.
- [ ] Archive the planning task.
- [ ] Record session journal.

## Validation Commands

```bash
python ./.trellis/scripts/task.py validate .trellis/tasks/05-26-plan-next-low-risk-electron-renderer-command-controller
git status --short
```

No business test suite is required because this planning task must not modify business code.

## Stop Conditions

- Analysis suggests the next cut would touch WebSocket routing, BrowserWindow creation, startup/lifecycle, download queue, or config save/proxy behavior.
- The recommended target cannot be characterized without broad Electron integration changes.
- Any business file becomes dirty.
