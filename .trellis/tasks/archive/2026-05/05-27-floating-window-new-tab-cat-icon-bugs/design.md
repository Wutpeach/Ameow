# Design: Floating Window Collapse and Browser Cat Icon Flash

## Local Evidence

- Main window state is coordinated in `src/App.tsx` through `reduceMainWindowShell()` from `src/utils/mainWindowShellMachine.ts`.
- Download completion removes trace progress and calls `showForegroundTaskOutcome()` from the `video-download-complete` listener.
- `showForegroundTaskOutcome()` sets `isProcessing(true)`, opens/prepares full mode, shows the outcome, then clears `isForegroundTaskOutcomeVisible` and `isProcessing` after the outcome timer.
- `src/App.tsx` mirrors `hasOngoingTask || isProcessing` into the shell machine `task` lock, and mirrors outcome visibility into the `centerOutcome` lock.
- `reduceMainWindowShell()` already collapses after a lock is released while `phase === "full"` and `pointerInside === false`.
- There is a separate `shouldReturnToCompactAfterForegroundTaskRef` effect that dispatches `startupSettle` after foreground work ends, but `showForegroundTaskOutcome()` does not set that flag. That effect also appears to be a legacy bridge around the newer shell machine.
- Pointer leave enters the shell machine through `scheduleMainWindowPointerLeaveCollapse()`, window `mouseout`, `desktopCurrentWindow.onPointerBoundaryChanged`, and panel `onMouseLeave`. If no fresh leave/boundary event fires after the task/outcome locks clear, collapse can be skipped until the next pointer enter/leave cycle.
- Browser-extension cat injection uses `browser-extension/injected-cat-icon.svg` as a CSS mask via `.ameow-injected-cat-icon` in `browser-extension/ameow-shared.css`.
- The injected cat element is created in `twitter-detector.js` and `xiaohongshu-detector.js`; its generic shared style is `width: 100%; height: 100%`.
- Site-specific CSS later constrains the icon to `20px` or `24px`, but the content script can create DOM before the site CSS or shared CSS is fully applied. During that gap, the mask element can temporarily size from an unconstrained or host-controlled parent, producing a one-frame oversized cat.
- `floating-launcher.js` has a better pattern: it appends a shadow-root stylesheet and keeps transitions disabled with `data-mounting="true"` until stylesheet load/fallback settles.

## Probable Root Causes

### Bug 1: Full window does not collapse after download completion

The state machine has the right primitive for this behavior: releasing a lock outside the panel should enter `collapsePending`. The sharper root cause is in the compact-to-full path: `reduceMainWindowShell()` handles `forceFull` from compact by calling `beginExpand({ ...state, pointerInside: true })`. A download can programmatically expand the compact window while the mouse is not actually inside it. That forced `pointerInside: true` survives through progress and outcome locks, so when `task` and `centerOutcome` locks are released, the existing lock-release collapse check refuses to collapse. A later real mouse enter/leave corrects the pointer state, which matches the reported workaround.

### Bug 2: Huge cat icon flashes on new browser tab

The oversized icon is most likely the extension-injected SVG mask, not the desktop `CatIcon`. The shared class sets the mask element to 100% of its parent, relying on site-specific CSS to bound the parent and child. On a freshly opened tab or route transition, content scripts and mutation observers can insert icon DOM while CSS files are not yet applied or while host player/control layout is still unstable. A masked `span` with `width: 100%; height: 100%` can briefly resolve against an unexpectedly large host box and flash before the final CSS or page content settles.

## Proposed Fix

### Fix 1: Preserve pointer truth when programmatically forcing full mode

Preferred approach:

1. Change the `forceFull` branch in `src/utils/mainWindowShellMachine.ts` so programmatic expansion from compact does not force `pointerInside: true`.
2. Preserve the existing `pointerInside` value. For compact startup/idle state this is normally false; if the user really entered the compact hotspot first, the pointer-enter event should already have set it true before any click-driven force-full path.
3. Keep the existing lock-release behavior as the collapse trigger. When `task` and `centerOutcome` clear and `pointerInside` is false, the reducer should enter the normal `collapsePending` path.
4. Avoid adding a one-off `setIsMinimized(true)` or direct bounds resize from `src/App.tsx`; that would bypass shell-machine guards and native interaction-mode transitions.

Implementation shape:

- Remove the `pointerInside: true` override in the `forceFull` fallback path.
- Add state-machine tests for:
  - `forceFull` from compact preserves `pointerInside: false`.
  - task/outcome lock release after programmatic force-full from compact enters `collapsePending`.
  - pointer-inside force-full still remains full when locks clear.
- Consider `src/App.tsx` settle changes only if tests show a separate stale-event path remains after the reducer fix.

### Fix 2: Size-guard injected cat icons before stylesheet-dependent layout

Preferred approach:

1. Extract the duplicated `createCatIconElement()` logic in `twitter-detector.js` and `xiaohongshu-detector.js` into a small browser-extension helper if compatible with the existing manifest/content-script loading model; otherwise apply the same helper body in both files in one patch.
2. Add inline, minimal sizing to the created element so the raw DOM is safe before CSS loads:
   - `display: block`
   - `width: 20px` or `24px`
   - `height: 20px` or `24px`
   - matching `max-width` / `max-height`
   - `flex: 0 0 auto`
3. Continue setting `--ameow-injected-cat-icon-url` inline, but leave the actual `mask` / `-webkit-mask` declarations in CSS. The race is about first-frame dimensions, not mask availability.
4. Keep site CSS as the final visual owner. Site-specific CSS can still override to `20px` for Twitter or `24px` for Xiaohongshu.
5. Optionally add an `ameow-icon-mounted`/`data-ameow-icon-ready` class after `requestAnimationFrame` if hiding until styles settle is needed. Start with size guard because it is less invasive and preserves immediate affordance.
6. Avoid changing `mascot.svg` or desktop `CatIcon`; those are not the likely source of the browser-tab flash.

## Tradeoffs

- Querying desktop pointer boundary on completion would be most robust for general event drift, but it is not necessary for the confirmed compact-to-forceFull bug and may add bridge/API complexity.
- Inline icon sizing duplicates some CSS values, but it prevents first-frame CSS race conditions across all pages and is contained to extension DOM creation.
- Hiding injected icons until CSS loads would avoid any flash but could make controls appear a frame later. Size-guarding is the lower-risk first fix.

## Validation

- Run focused unit tests for `src/utils/mainWindowShellMachine.test.ts` and `src/utils/mainWindowMode.test.ts`.
- Add or update extension unit tests if a helper is introduced for cat icon styling.
- Manually verify:
  - Start a browser/extension download while pointer is outside the main window.
  - Let completion feedback display and clear.
  - Confirm the full window returns to icon mode without moving the mouse.
  - Open/reload new tabs on pages where extension content scripts run, especially Twitter/X and Xiaohongshu, and confirm no oversized cat flash.
