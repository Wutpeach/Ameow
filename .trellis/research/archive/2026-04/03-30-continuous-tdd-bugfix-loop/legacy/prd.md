# Continuous TDD Bugfix Loop

## Goal
Run repeated bugfix cycles against the current FlowSelect codebase using strict TDD. Each cycle should identify one concrete defect, reproduce it with a failing automated test, apply the smallest possible fix, verify the broader suite still passes, and record the outcome in `bugfix.md`.

## Requirements
- Scan the codebase for concrete defects, unsafe edge cases, boundary-condition failures, null/undefined risks, concurrency issues, and performance hazards.
- Prioritize defects by severity and work on the highest-value candidate first.
- For each chosen defect, write a test that fails before the fix.
- Keep fixes minimal and scoped to the reproduced defect.
- Run the relevant automated tests after each fix, and run broader verification when practical.
- Append a concise cycle record to `bugfix.md` after each completed fix.
- Do not use subagents; all work stays on the main thread.

## Acceptance Criteria
- [ ] At least one concrete defect is reproduced by a failing automated test before code changes.
- [ ] The defect is fixed with the smallest practical code change.
- [ ] The new test passes after the fix.
- [ ] Relevant verification commands are run and any gaps are reported.
- [ ] `bugfix.md` records the defect, root cause, test coverage, and fix summary.

## Technical Notes
- Treat this as a fullstack maintenance task; defects may land in renderer, Electron runtime, or Rust backend code.
- Prefer existing test patterns and helpers over introducing new custom harnesses.
- `ace-tool` is not available in this session, so repository search falls back to `rg` plus direct file inspection.
