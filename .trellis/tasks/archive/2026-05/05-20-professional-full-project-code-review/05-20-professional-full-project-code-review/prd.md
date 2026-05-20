# Professional Full-Project Code Review

## Goal

Produce a professional, repository-grounded code review for the current Ameow project, then fix the high-confidence P1/P2 issues that are small and directly actionable.

## Confirmed Facts

- The repository is a single-repo desktop application project with a React/TypeScript frontend in `src/`, Electron runtime code in `electron/`, a browser extension in `browser-extension/`, and supporting scripts/configuration at the repo root and in `scripts/`.
- The git worktree is currently clean on `main`.
- The initial user request was a professional code review; the follow-up "继续" was treated as approval to continue into focused fixes for the reported findings.
- The review used multiple read-only sub-agents, and the final result was consolidated into one prioritized report.
- Project guidance requires using `fff` tools for file and content search inside the indexed repository.
- The highest-confidence issues selected for fixing are:
  - `browser-extension/background.js` async `video_selection` response missing `return true`.
  - `src/pages/SettingsPage.tsx` site-session refresh fail-fast behavior and hardcoded `douyin` error attribution.
  - `src/pages/SettingsPage.tsx` AE Portal optimistic toggle without rollback.
  - `src/electron-runtime/processRunner.ts` abort listener cleanup gap.

## Requirements

- Review the current project codebase for:
  - code smells
  - potential defects and behavioral risks
  - technical debt
  - readability and maintainability concerns
  - notable performance bottlenecks or wasteful patterns
- Cite concrete file paths and line numbers for each finding.
- Explain the root cause for each finding, not just the surface symptom.
- Prioritize findings so the user can distinguish high-severity issues from lower-priority cleanup.
- Use repository evidence only; avoid speculative findings that cannot be grounded in code.
- Keep the final deliverable focused on review findings first, with only a brief summary afterward.
- Fix the selected high-confidence findings without broad refactors.
- Add focused regression tests where practical for changed behavior.

## Acceptance Criteria

- [x] The review covers the main maintained code areas: `src/`, `electron/`, `browser-extension/`, and relevant `scripts/` or top-level config/runtime files when risk warrants.
- [x] Each reported finding includes severity/priority, file path, line reference, issue description, and root-cause explanation.
- [x] Findings are ordered by severity, with the most important items first.
- [x] The report explicitly addresses code smells, potential defects, maintainability/readability, and performance where applicable.
- [x] If no issue is found in a reviewed area, the final report does not invent one; it may instead mention residual testing or coverage risk.
- [x] The final answer is a consolidated report, even if multiple sub-agents are used during review.
- [x] `video_selection` background messages keep the Chrome response channel open for async `sendResponse`.
- [x] Site-session state refresh handles per-site failures without discarding successful site states and without hardcoding `douyin`.
- [x] AE Portal toggle rolls back local UI state if config read/write fails.
- [x] `runStreamingCommand()` removes abort listeners after child process completion.
- [x] Focused tests pass for changed behavior, plus type-check/lint or documented blockers.

## Out Of Scope

- Reviewing vendored dependencies, generated artifacts, `node_modules`, or archived Trellis task contents as product code.
- Providing style-only nitpicks that are not connected to correctness, maintainability, or operational risk.
- Removing `@ts-nocheck` from Electron main/preload; that is a larger follow-up task.
