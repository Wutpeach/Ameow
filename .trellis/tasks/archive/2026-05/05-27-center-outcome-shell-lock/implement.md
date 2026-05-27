# Implementation Plan

## Steps

1. Define center outcome state in `src/App.tsx`.
   - Replace or wrap `folderDropOutcome` with a general `centerOutcome`.
   - Include enough metadata or a kind enum to select icon/cancelled/error text.
   - Keep replacement semantics explicit: setting a new center outcome clears/replaces the previous center outcome timer.

2. Drive shell lock from all center outcomes.
   - Rename shell lock `foregroundOutcome` to `centerOutcome` in `src/utils/mainWindowShellMachine.ts` and callers.
   - Update the effect that currently sets lock `foregroundOutcome`.
   - Lock active condition should include `isForegroundTaskOutcomeVisible || centerOutcome !== null`.
   - Audit `src/utils/mainWindowMode.ts` helper names/inputs and update only if they are now representing generic center outcome behavior.

3. Render folder outcome through existing overlay.
   - Use `ForegroundOutcomeOverlay` with `FolderCheckIcon` and `successIconStrokeWidth={2}` for folder success.
   - Keep download overlay behavior unchanged unless a small render refactor is needed.

4. Replace folder-specific outcome timer with center outcome timer.
   - Timer clears `centerOutcome`.
   - Do not clear the outcome from collapse effects.
   - Clear the center outcome timer on component unmount.
   - Do not use `foregroundOutcomeRequestIdRef` for folder-only center outcomes unless download outcomes are fully unified into the same request lifecycle.

5. Add tests.
   - Add or update `mainWindowShellMachine.test.ts` to prove releasing `centerOutcome` outside starts collapse after the lock clears.
   - Add coverage that releasing `centerOutcome` while pointer remains inside keeps the shell full.
   - Add coverage that acquiring `centerOutcome` during `collapsePending` returns the shell to full and cancels collapse.
   - Add any small helper tests if outcome selection logic is extracted.

## Validation

- `npm test -- src/utils/mainWindowShellMachine.test.ts src/utils/mainWindowMode.test.ts`
- `npm run lint`
- `npm run type-check`
- Manual QA: drop folder, move pointer out before folder icon finishes, verify full stays until icon ends, then collapses; verify no folder/cat overlap.
