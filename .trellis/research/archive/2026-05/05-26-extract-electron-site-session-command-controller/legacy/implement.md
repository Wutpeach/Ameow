# Implementation Plan

## Checklist

- [x] Confirm clean git status, current task none, and parent task existence.
- [x] Create child task and configure manifests.
- [x] Run `task.py validate`.
- [x] Read the Phase 5.1 planning task.
- [x] Start this Trellis task before code edits.
- [x] Precisely inventory the 10 site-session command branches in `electron/main.mts`.
- [x] Consult Claude on the implementation plan.
- [x] Add `electron/siteSessionCommands.mts`.
- [x] Add `electron/siteSessionCommands.test.mts`.
- [x] Modify `electron/main.mts` narrowly to delegate site-session commands.
- [x] Run focused tests.
- [x] Run full verification.
- [x] Consult Claude on final diff.
- [x] Address concrete in-scope feedback.
- [x] Re-run checks.
- [x] Commit business refactor separately from Trellis metadata.
- [ ] Archive task.

## Validation Commands

```bash
npm test -- electron/siteSessionCommands.test.mts electron/siteSessionManager.test.mts
npm run type-check
npm run lint
npm test
git diff --check
```

## Rollback

Remove `electron/siteSessionCommands.mts` and its tests, then restore the 10 inline site-session switch cases in `electron/main.mts`.
