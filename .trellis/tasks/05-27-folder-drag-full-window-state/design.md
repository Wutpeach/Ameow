# Design

## Current Evidence

- Folder drops are consumed in `src/App.tsx` through `desktopDrop.consumePendingFolderDrop()`.
- Successful folder drops call `saveOutputPath(...)`, update local `outputPath`, then call `startForegroundProcessing()` and clear `isProcessing` after a timeout.
- `startForegroundProcessing()` is shared with actual foreground download/copy work, forces the shell full, and renders `ForegroundOutcomeOverlay`.
- `ForegroundOutcomeOverlay` has a generic spinner/check/error model and no success text, so a folder-settings action looks like a generic download/task completion.
- `clearPanelDropInteractionState()` unconditionally sets `isPointerInsidePanelRef.current = false` and updates `isPanelHovered` from that value.
- Mini controls render only when `shellPhase === "full" && isPanelHovered`, so clearing hover while the shell is still full hides buttons such as settings.

## Proposed Fix

1. Split folder-drop feedback from foreground task feedback.
   - Successful folder drops should not call `startForegroundProcessing()`.
   - Actionable folder-drop failures should also avoid `startForegroundProcessing()` so they do not show the generic task spinner/error overlay or temporarily hide controls through `isProcessing`.
   - Add a folder-setting confirmation state that renders a folder-check success icon only, with no visible text toast.
   - Use the existing local lucide-like icon system in `src/components/icons/AppIcons.tsx`; do not add `lucide-react` back as a runtime dependency.
   - Add a local `FolderCheckIcon` by extracting the single Lucide `folder-check` SVG path into the existing inline SVG component style.
   - Reuse the current center success overlay language as closely as possible: center placement, success color, icon frame size, scale/fade timing, and auto-dismiss behavior should match the existing checkmark success feedback. The folder-drop feedback differs only in icon glyph.

2. Make drop cleanup pointer-aware.
   - Keep a helper for clearing drop-specific state: drag glow, drop hover, and the shell `drop` lock.
   - For React `onDrop` on the panel, preserve or recompute whether the pointer is still inside the panel instead of always setting hover false.
   - For `onDragLeave`, window blur, and truly external drop-session end, continue clearing pointer/hover state.
   - Account for browser post-drop `dragleave`: a `drop` can be followed by a synthetic/native `dragleave` that should not immediately undo pointer-preserving cleanup.
   - Prefer computing panel containment from `document.elementFromPoint(event.clientX, event.clientY)` or the drop event coordinates over trusting stale hover refs.

3. Keep existing media/file drop flows on the foreground task path.
   - Downloads, local file copies, image saves, and video queue actions should keep using their current processing feedback.
   - Only the `droppedFolderResult?.success` branch changes semantic feedback and shell-lock behavior.

## Claude Review Notes

- The initial plan direction is sound, but implementation must explicitly handle the `finally { clearPanelDropInteractionState(); }` path in `handleDrop`; otherwise pointer state will still be cleared after folder branches return.
- The folder-drop error branch has the same controls-hiding risk as the success branch if it keeps using `startForegroundProcessing()`.
- A post-drop `dragleave` can fire after `drop` and defeat pointer-preserving cleanup unless guarded.
- Confirmation UI decision: user wants icon-only, no visible text, and strong consistency with the existing center success feedback. Use a center `FolderCheckIcon` with the same color and motion as the current checkmark success overlay; do not invent a bottom toast, new color, or new motion pattern.

## Tradeoffs

- Extending the existing success overlay renderer to accept a custom success icon is preferable to creating a separate visual system, as long as folder drops do not set `isProcessing` or lock the window like a foreground task.
- Recomputing pointer-inside from the drop event is more accurate than always preserving hover, because it allows normal collapse if the drop ends outside the panel.
- A dedicated helper for drop cleanup reduces the chance of future regressions across `dragenter`, `dragover`, `drop`, `dragleave`, `dragend`, and `blur`.
