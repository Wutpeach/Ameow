# Autonomous TDD Bugfix Loop

## Goal
Continuously execute TDD-driven bug-fix cycles against the current FlowSelect codebase, prioritizing high-severity defects and closing each cycle with tests, verification, and a recorded summary.

## Requirements
- Repeatedly scan the repository for actionable defects, logic errors, edge-case failures, null/undefined hazards, concurrency issues, and performance risks.
- Prioritize defects by severity and fix higher-risk issues first.
- For each selected defect, add a focused regression test before the code fix so the current state fails first.
- Keep the implementation minimal and scoped to the defect under test.
- Run targeted verification and the full relevant test suite after each fix.
- Record each completed cycle in `bugfix.md`.
- Do not use subagents; all work stays on the main thread.

## Acceptance Criteria
- [ ] At least one full scan -> red -> green -> refactor -> verify -> record cycle is completed.
- [ ] Each completed fix has a regression test that fails before the fix and passes after it.
- [ ] `bugfix.md` is updated with the defect description, root cause, tests, and fix summary.
- [ ] Verification commands are run and any gaps are reported.

## Technical Notes
- Treat this as a fullstack task because defects may span renderer, Electron runtime, scripts, and shared utilities.
- Favor existing test patterns in `src/**/*.test.ts`.
- Keep cross-layer payload and Electron preload contracts stable unless both sides are updated together.
