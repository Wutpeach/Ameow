# TDD Defect Fix Loop

## Goal
Run repeated TDD bug-fix iterations against the current FlowSelect repository, focusing on concrete defects that can be reproduced with automated tests before code changes.

## Requirements
- Scan the repository for high-signal defect candidates across frontend, Electron main-process, shared utilities, and scripts.
- For each selected defect, write a failing regression test before implementing the fix.
- Apply the smallest safe code change that makes the new test pass without broad refactors.
- Re-run targeted and full-project verification after each fix.
- Record each completed cycle in `bugfix.md`.

## Acceptance Criteria
- [ ] At least one full Red -> Green -> Refactor cycle is completed for a concrete defect.
- [ ] New regression coverage is added for the fixed defect.
- [ ] `npm test`, `npm run lint`, and `npm run type-check` pass after the fix.
- [ ] `bugfix.md` records the defect, root cause, tests, and fix.

## Technical Notes
- The repository currently has unrelated uncommitted changes, so new edits should avoid interfering with in-progress work where possible.
- Use literal search fallback because the `ace-tool` semantic search is not available in this session.
