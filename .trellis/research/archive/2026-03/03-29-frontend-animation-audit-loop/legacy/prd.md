# Frontend Animation Audit Loop

## Goal
Run an ongoing frontend animation review loop for the current project and fix the highest-priority animation defect through strict TDD.

## Requirements
- Review frontend animation behavior, motion state transitions, timing, and edge cases in the current codebase.
- Prioritize defects by severity and address the highest-risk issue first.
- For each defect, write a failing regression test before making any production code changes.
- Apply the smallest fix needed to make the new test pass.
- Run targeted and relevant broader verification after the fix.
- Append each completed cycle to `bugfix.md`.
- Keep all work on the main thread with no subagents.

## Acceptance Criteria
- [ ] A concrete frontend animation defect is identified and justified as the next highest-priority item.
- [ ] A regression test is added and confirmed to fail before the fix.
- [ ] The minimal production fix makes the new test pass.
- [ ] Relevant verification commands pass after the change.
- [ ] `bugfix.md` records the defect, root cause, tests, fix, and verification.

## Technical Notes
- Focus on frontend animation code paths, including Motion for React usage and shell/window transition behavior.
- Use repo-local patterns and existing test structure.
- Prefer literal repo search because semantic search tooling is unavailable in this environment.
