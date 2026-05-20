# Implementation Plan

## Ordered Checklist

1. Inspect repository structure and identify review boundaries. `[done]`
2. Seed spec/context manifests for the review task. `[done]`
3. Launch read-only sub-agents for independent subsystem review where useful. `[done]`
4. Review high-risk files and tests in parallel from the main session. `[done]`
5. Verify each candidate finding against source code and surrounding context. `[done]`
6. Rank findings by severity and implementation urgency. `[done]`
7. Deliver a consolidated review with findings first, then open questions or residual risks, then a brief summary. `[done]`
8. Fix `browser-extension/background.js` async `video_selection` listener contract and add/adjust tests.
9. Fix `src/pages/SettingsPage.tsx` site-session refresh and AE Portal rollback behavior, with focused tests if existing harness supports it.
10. Fix `src/electron-runtime/processRunner.ts` abort listener cleanup and add a regression test.
11. Run focused tests, then type-check/lint as the final quality gate.

## Validation

- Ensure every final finding has a checked file path and line number.
- Ensure each finding is backed by direct repository evidence.
- Ensure the final response covers the user-requested categories:
  - code smells
  - potential defects and technical debt
  - readability/maintainability
  - performance
- Focused test targets:
  - `browser-extension/background*.test.*` or an equivalent extracted helper test if available.
  - `src/electron-runtime/processRunner.test.ts`.
  - Settings-page tests if available; otherwise rely on type-check plus code inspection for the narrow UI changes.

## Risk Notes

- Line numbers can drift if files change during review; verify them late in the process.
- Sub-agent findings are advisory until re-checked in the main session.
- Broad repository review risks low-signal nitpicks; keep the bar high and prioritize only meaningful issues.
- Browser-extension service-worker code has limited test seams; prefer the smallest possible change for the async listener contract.

## Rollback

Rollback is per file: revert only the focused edits in `browser-extension/background.js`, `src/pages/SettingsPage.tsx`, `src/electron-runtime/processRunner.ts`, and any tests added in this task.
