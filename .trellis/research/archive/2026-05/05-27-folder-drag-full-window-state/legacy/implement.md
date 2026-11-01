# Implementation Plan

## Steps

1. Prepare folder-drop success icon semantics.
   - Add `FolderCheckIcon` to `src/components/icons/AppIcons.tsx` by extracting the single Lucide `folder-check` SVG path into the existing local inline SVG style.
   - Do not import or re-add `lucide-react`; the project uses local inline SVG icons for package-size reasons.
   - If accessibility copy is needed, add an aria-only locale key to `locales/en/desktop.json` and `locales/zh-CN/desktop.json`, but do not render visible success text or a native `title` tooltip.
   - Run locale sync only if locale source files are changed.

2. Add a folder-drop confirmation render path in `src/App.tsx`.
   - Introduce short-lived state for folder-setting feedback.
   - Render an icon-only center confirmation while not treating it as `isProcessing`.
   - Reuse the existing `ForegroundOutcomeOverlay` visual language where practical: same center position, same icon frame size, same success color, same scale/fade motion, and same timing. The visible glyph should be `FolderCheckIcon` instead of `CheckIcon`.
   - Do not create a bottom toast, new color, new timing, or new visible text label.
   - Clear/replace prior confirmation on new drop, download, or outcome flow.

3. Change the successful folder-drop branch.
   - Save and emit output path as today.
   - Show the folder-specific confirmation.
   - Do not call `startForegroundProcessing()` for successful folder drops.
   - Keep typed error handling for failed folder validation/save, but route folder-drop errors through the same lightweight folder-drop feedback state instead of `startForegroundProcessing()`.

4. Make drop cleanup pointer-aware.
   - Pick an explicit strategy for the `finally` block in `handleDrop`:
     - preferred: handle consumed folder drops before entering the large media-drop `try/finally`, with folder-specific cleanup;
     - fallback: parameterize `clearPanelDropInteractionState({ preservePointer: true })` for panel `onDrop`.
   - Refactor `clearPanelDropInteractionState` to allow preserving/recomputing pointer hover on panel `onDrop`.
   - Recompute pointer-inside with event coordinates / `document.elementFromPoint(...)` where practical instead of trusting stale refs.
   - Add a guard such as `suppressNextDragLeaveRef` so the native `dragleave` that follows a completed `drop` does not immediately clear preserved hover state.
   - Keep full cleanup for drag leave, blur, and global drop-session end.
   - Ensure shell `drop` lock is released in all consumed-folder paths.

5. Add/update tests.
   - Add a utility test if pointer/drop cleanup logic is extracted.
   - Add or extend `mainWindowShellMachine` regression coverage if state-machine events change.
   - Keep existing folder-drop tests passing.
   - Note that `folderDrop.test.ts` currently covers result classification/mapping only; it does not cover `App.tsx` drop cleanup. Manual QA remains required unless a focused helper is extracted.

## Validation

- `npm run type-check`
- `npm run lint`
- `npm test -- src/utils/folderDrop.test.ts src/utils/mainWindowShellMachine.test.ts src/utils/mainWindowMode.test.ts`
- Manual check: drop a folder onto the full window, verify center folder-check confirmation with no visible text, existing success color/motion, controls visibility, and collapse after pointer leave.
