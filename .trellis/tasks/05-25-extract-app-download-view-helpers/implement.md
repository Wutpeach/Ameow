# Implementation Plan

## Steps

1. Confirm the worktree is clean and the parent task artifacts are available.
2. Validate this child task with `task.py validate`.
3. Consult `claude-consult` on the plan before editing code.
4. Add `src/utils/downloadViewHelpers.ts` with the extracted pure helpers and existing constants.
5. Replace the corresponding helper definitions in `src/App.tsx` with imports from the new module.
6. Add `src/utils/downloadViewHelpers.test.ts` covering download and transcode helper behavior.
7. Run:
   - `npm run type-check`
   - `npm run lint`
   - `npm test`
8. Consult `claude-consult` on the resulting diff.
9. Fix only concrete, in-scope feedback.
10. Re-run the same validation commands.
11. Update task records with the result.
12. Commit only Phase 1 files with:
   - `refactor(ui): extract download view helpers from App`

## Guardrails

- Do not edit browser-extension files.
- Do not edit Electron protocol files.
- Do not edit runtime command/router behavior.
- Do not change `src/types/videoRuntime.ts` unless type-check proves it is strictly required.
- Do not move event listeners or state updates out of `src/App.tsx`.
- Stop before Phase 2.

## Expected Files

- `src/App.tsx`
- `src/utils/downloadViewHelpers.ts`
- `src/utils/downloadViewHelpers.test.ts`
- `.trellis/tasks/05-25-extract-app-download-view-helpers/*`
- parent task record only if needed to note Phase 1 completion

## Result

Implemented Phase 1 only.

- Extracted download/transcode view helpers from `src/App.tsx` into `src/utils/downloadViewHelpers.ts`.
- Kept all React state, refs, effects, event subscriptions, IPC commands, and runtime payload contracts in place.
- Added focused unit tests in `src/utils/downloadViewHelpers.test.ts`.
- `claude-consult` reviewed the plan before implementation and the diff after implementation.
- Adopted diff-review feedback by adding tests for `finalizing_mp4`, non-downloading download stages, and transcode active-stage fallback behavior.

Validation passed:

- `npm run type-check`
- `npm run lint`
- `npm test` (109 test files, 669 tests)
