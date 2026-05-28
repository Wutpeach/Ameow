# Implementation Plan

Do not execute until the user approves implementation.

## Checklist

1. Reproduce/confirm the window collapse state path with tests.
   - Add a focused state-machine test for `forceFull` from compact preserving `pointerInside: false`.
   - Add a focused state-machine test for foreground task/outcome locks clearing after programmatic `forceFull` while pointer is outside.
   - Add a focused state-machine test confirming pointer-inside force-full remains full after locks clear.
   - Confirm existing `setLock` behavior is preserved.

2. Implement the window state-machine fix.
   - Keep shell machine as the source of truth.
   - Remove the `pointerInside: true` override from the `forceFull` compact fallback path.
   - Do not bypass guards for pointer-inside, drag, drop, context menu, runtime, app update, or UI lab locks.

3. Harden injected cat icon initial sizing.
   - Extract or consistently update `createCatIconElement()` in `browser-extension/twitter-detector.js` and `browser-extension/xiaohongshu-detector.js`.
   - Add inline fallback dimensions, but keep mask declarations in CSS.
   - Keep CSS-owned final visuals intact.
   - Ensure first-frame raw DOM is bounded before `ameow-shared.css` / site CSS applies.

4. Validation.
   - `npm run type-check`
   - `npm run lint`
   - Focused tests for changed frontend/window utilities.
   - Focused browser-extension tests if helper logic is extracted.

## Risk Areas

- `src/App.tsx` window state logic is high-sensitivity; avoid direct `setIsMinimized(true)` shortcuts that bypass native bounds/interaction-mode transitions.
- The browser extension runs on arbitrary pages; inline fallback styles should be minimal and namespaced.
- Do not change packaged extension version strings manually.

## Rollback

- Window change can be reverted independently from extension icon sizing.
- Extension icon sizing change should be safe to revert if it affects site-specific visual alignment.
