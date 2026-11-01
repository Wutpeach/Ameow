# Architecture boundary refactor closeout

## Checklist

- [ ] Review the archived child tasks and commit history for Phase 0 through Phase 5.3.
- [ ] Update `implement.jsonl` and `check.jsonl` with the spec context needed for closeout review.
- [ ] Update the relevant Trellis spec files for the stable boundary decisions.
- [ ] Run `python ./.trellis/scripts/task.py validate architecture-boundary-refactor-closeout`.
- [ ] Confirm the worktree still contains no business code diff.
- [ ] Commit the closeout docs/spec changes with a `chore(...)` message.
- [ ] Archive the closeout task.
- [ ] Record the session journal entry.

## Validation

- `python ./.trellis/scripts/task.py validate architecture-boundary-refactor-closeout`
- `git status --porcelain`

## Stop Conditions

- Stop if any business code file becomes dirty.
- Stop if validation reveals an invalid manifest or broken Trellis task record.
- Stop if a spec change would require touching `electron/main.mts`, `src/App.tsx`, or `browser-extension/background.js`.
