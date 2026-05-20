# Professional full-project code review and fixes

## Goal

Produce a professional, repository-grounded code review for the current Ameow project, then fix the highest-value issues found in that review.

## Confirmed Facts

- Ameow is an Electron desktop app with a React/TypeScript frontend, Electron main/preload runtime, browser extension, and supporting Node/PowerShell scripts.
- The repository currently uses `src/` for frontend and shared runtime-facing TypeScript, `electron/` for Electron main/preload code, `browser-extension/` for the extension, and `scripts/` for build/runtime support scripts.
- The project has meaningful automated tests in `src/`, `electron/`, `browser-extension/`, and `scripts/`, which can be used as signals during review.
- The initial review identified concrete P2 issues in cross-layer video download metadata preservation and dropped-file memory handling.
- The user approved moving from review/reporting into implementation in this same task.

## Requirements

- Preserve extension-originated `extensionData` when `video_selected_v2` WebSocket payloads are converted into `queue_video_download` runtime requests.
- Add or update focused tests so clip fields, quality preference, and `extensionData` are all covered by the Electron bridge contract.
- Reduce the renderer risk from dropped files that lack desktop file paths by removing duplicate manual base64 conversion and adding a bounded, less blocking fallback.
- Keep the fix scoped to the reviewed issues; do not attempt the larger `@ts-nocheck` bridge migration in this task.

## Acceptance Criteria

- [x] A review report is produced with findings listed before any summary.
- [x] Each finding includes file path, line reference, severity/priority, issue description, and root-cause explanation.
- [x] The report covers code smells, potential defects, maintainability/readability concerns, and performance risks where applicable.
- [x] Findings are prioritized so the user can distinguish must-fix items from lower-priority cleanup.
- [x] `video_selected_v2` queue payload construction preserves `extensionData`.
- [x] Dropped-file handling no longer performs hand-written byte-by-byte base64 conversion in the hot path.
- [x] Focused tests for changed bridge behavior pass.
- [x] Type-check and lint pass, or any remaining failures are documented with cause.

## Out Of Scope

- Exhaustively reviewing vendored dependencies, generated artifacts, or archived Trellis tasks.
- Producing a stylistic lint-only checklist detached from runtime risk.
- Fully removing `@ts-nocheck` from Electron main/preload; that is a larger migration.

## Open Questions

- None currently blocking planning. The requested deliverable and review style are sufficiently clear from the user request.
