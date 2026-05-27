# Design

## Current Evidence

- Main window shell locking is handled by `src/utils/mainWindowShellMachine.ts`.
- Existing locks include `foregroundOutcome`, and `src/App.tsx` sets it from `isForegroundTaskOutcomeVisible`.
- Download success uses `showForegroundTaskOutcome(...)`, which sets `isProcessing = true` until the outcome timer completes. This indirectly keeps full mode locked via task/processing state.
- Folder-drop success intentionally avoids `isProcessing`, because setting an output folder is not a download/copy task.
- The current folder-drop implementation renders `ForegroundOutcomeOverlay` while `folderDropOutcome !== null`, but it does not lock the shell while that outcome is visible.
- When the pointer leaves during the folder outcome, the full shell can collapse to icon mode while the center folder icon is still visible, causing overlap with the compact cat icon.

## Proposed Fix

1. Introduce a reusable center outcome visibility state.
   - Prefer a small discriminated union such as `centerOutcome: { kind: "folder-success" | "folder-error" | ... } | null`.
   - Keep visual rendering through `ForegroundOutcomeOverlay` so position, color, icon frame, and motion remain consistent.
   - Folder success maps to `FolderCheckIcon`, success color, no visible text.

2. Bind shell lock to center outcome visibility.
   - Rename/generalize the existing `foregroundOutcome` shell lock to `centerOutcome`.
   - The lock should be active while any center outcome is visible, including folder outcomes.
   - Do not use `isProcessing` for folder outcomes.
   - Audit adjacent helper names that still use `isForegroundTaskOutcomeVisible`; either keep them narrowly scoped to download paths or rename them if they now represent the generic center outcome lock.

3. Release lock through the same timer that hides the center outcome.
   - When the outcome timer completes, clear `centerOutcome`.
   - The existing shell machine should then start collapse delay if the pointer is already outside.
   - Do not abruptly clear outcome in `requestCollapse`.

4. Keep current download behavior stable.
   - Download success/error may stay on the existing `isProcessing` + foreground outcome path during this task.
   - Avoid dual center overlays. If a new center outcome starts, it must replace/clear any previous center outcome of the same generic channel.
   - If unifying download outcomes into `centerOutcome` is too broad, defer it. The immediate contract is that the shell lock semantics are shared and future-ready.

## Claude Review Notes

- The plan is technically sound because the shell machine already collapses after a lock releases while the pointer is outside.
- Rename `foregroundOutcome` to `centerOutcome` now. The lock name appears in a small number of places, and keeping the old name becomes misleading once folder outcomes use it.
- Must handle dual-overlay stacking: a folder outcome and download outcome can otherwise render at the same center position.
- Must not let generic reset/download helpers accidentally clear unrelated center outcomes unless replacement semantics are intentional.
- Must clean up the center outcome timer on component unmount.
- Folder-drop does not need to share `foregroundOutcomeRequestIdRef`; a simple center-outcome timer is enough unless full unification requires request identity.

## Risks

- Reusing `foregroundOutcome` lock name for non-download center outcomes may be semantically imperfect, but it is lower churn than adding a new shell lock and updating tests.
- A full rename to `centerOutcome` lock is cleaner but touches more files and tests.
- If both a download outcome and folder outcome can be visible concurrently, one must replace the other or explicit priority must be defined.

## Recommended Direction

Use a general `centerOutcome` state in `App.tsx`, rename the shell lock to `centerOutcome`, and drive that lock from `Boolean(centerOutcome) || isForegroundTaskOutcomeVisible`.

This keeps download behavior stable while giving folder and future non-download outcomes a real full-window lock and a single center overlay channel.
