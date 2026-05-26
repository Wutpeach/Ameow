# Implementation Plan

## Checklist

- [x] Verify planning artifacts and context manifests with `task.py validate`.
- [x] Start the Trellis task after planning review gate.
- [x] Load `trellis-before-dev` for frontend/spec guidance before edits.
- [x] Read Phase 4 reducer implementation and App transcode handlers.
- [x] Consult Claude on the concrete extraction plan.
- [x] Add narrow reducer helpers to `src/utils/downloadEventReducers.ts`.
- [x] Add focused tests to `src/utils/downloadEventReducers.test.ts`.
- [x] Update `src/App.tsx` to call the new helpers from existing callbacks.
- [x] Run focused reducer tests.
- [x] Run full validation: `npm run type-check`, `npm run lint`, `npm test`, `git diff --check`.
- [x] Consult Claude on the final diff.
- [x] Address concrete in-scope feedback.
- [x] Re-run required checks.
- [ ] Archive the Trellis child task.
- [ ] Commit business changes as `refactor(ui): complete transcode event reducer helpers`.
- [ ] If Trellis archive or journal-only changes need a separate commit, commit them as chore metadata separately.

## Risk Points

- Do not move `removePendingTranscodeActionTraceId` into reducers.
- Do not move `showForegroundTaskOutcome` or `showQueueNotice` into reducers.
- Do not move i18n fallback label selection into reducers.
- Do not alter listener creation or cleanup.
- Do not touch Phase 5 files.

## Rollback

- Revert the new helper calls in `src/App.tsx` back to the inline existing pure operations.
- Keep or remove tests depending on whether the helper code remains.

## Validation Commands

```bash
npm test -- src/utils/downloadEventReducers.test.ts
npm run type-check
npm run lint
npm test
git diff --check
```
