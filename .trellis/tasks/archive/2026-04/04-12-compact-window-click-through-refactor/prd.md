# Compact Window Click-Through Refactor

## Goal
Refactor the main window compact/full transition so FlowSelect uses a single main shell morph, removes the renderer-side expand overlay morph, and enables compact-mode transparent-area click-through on Windows and macOS without regressing full-window interactivity.

## Current Follow-Up
Eliminate the remaining main-window -> compact-icon end-frame flash by removing the renderer-side collapse handoff that still happens after the fixed-stage refactor. Native compact resize has already been removed from the collapse path; the remaining artifact now points to renderer motion ownership split across shell, compact icon, and transition-mode cleanup. The follow-up work keeps the fixed full-size stage, preserves the already-good compact -> main expand motion, and further converges collapse onto a single shell-owned visual timeline.

## Requirements
- Replace the current expand overlay morph with a single-shell animation path driven by the existing main shell `motion.div`.
- Keep using the existing main `BrowserWindow`; do not introduce any transition overlay window.
- Keep the main `BrowserWindow` at the full floating-window size during both compact and full modes; compact mode must no longer depend on native bounds shrink to `80/88`.
- Preserve a single-shell visual morph:
  - collapse: the main shell visually shrinks/rounds/repositions inside a fixed full-size renderer stage
  - expand: the same shell visually expands back to the full panel inside that same stage
- Remove collapse-path native compact resize from the renderer flow so no `BrowserWindow` resize happens on the final collapse frame.
- Remove expand-path native “restore from compact bounds” work that only existed to compensate for the old native compact window size.
- Add an Electron bridge API for window interaction mode management so compact passthrough can atomically control:
  - `setIgnoreMouseEvents(...)`
  - focusability / blur behavior
- In compact mode on Windows and macOS, default the window to click-through passthrough mode using `setIgnoreMouseEvents(true, { forward: true })`.
- Detect entry into the compact icon hotspot using forwarded `mousemove` plus circle hit-testing instead of relying on DOM hover alone.
- Use hotspot hysteresis so pointer jitter near the compact icon edge does not repeatedly toggle passthrough/interactivity.
- On compact passthrough entry, ensure keyboard focus is not retained by the app window.
- When leaving compact mode, restore normal interactivity and focusability before full-mode interaction resumes.
- Linux is not a shipping platform for this app. Explicitly gate the new compact passthrough behavior to Windows and macOS and keep Linux on the current fallback behavior.
- Keep transition-token guards for any remaining async native full-bounds handoffs and interaction-mode transitions so stale callbacks cannot reapply old state.
- Keep the existing pointer-leave delay, DOM hover reconciliation, drag guards, and foreground-task locks unless a replacement is proven equivalent.
- Preserve the current expand path look and feel; the fixed-stage architecture should improve collapse without regressing expand smoothness.
- The renderer must use a fixed full-size coordinate system in both full and compact modes:
  - root stage size must stay at the full floating-window size
  - compact shell coordinates, icon placement, and shadow ownership must derive from `isMinimized` / `shellPhase`, not from native compact bounds
- `windowResized` or any successor native-bounds flag must not drive renderer visuals such as:
  - root viewport size
  - compact icon coordinates
  - shadow preset ownership
  - compact shell background ownership
- Keep the shell as the single visual owner throughout the full -> compact -> full cycle; do not reintroduce a compact plate/overlay ownership handoff at settle time.
- Compact passthrough should remain a second-stage interaction change after collapse motion completes, using double-RAF plus stale-transition protection if needed.
- Treat the remaining collapse flicker as a renderer-side handoff problem, not a native/compositor problem:
  - do not restore or reintroduce collapse-path native compact resize
  - do not use `windowResized`-style native flags to gate renderer visual ownership
- Remove collapse-path transition mode forcing that creates a last-frame style handoff:
  - do not run `setPanelTransitionMode("instant")` on collapse completion
  - do not immediately re-enable animated panel transitions on the next frame as part of collapse settle
- Keep the compact icon visual mounted within the shell timeline so compact entry does not depend on an independent `AnimatePresence` mount on the last frames of collapse.
- If collapse still shows an end-frame artifact after the transition-mode cleanup and persistent compact visual change, consolidate backdrop ownership into the shell so collapse no longer finishes with two independently animated surfaces.

## Acceptance Criteria
- [ ] The expand overlay morph implementation is removed and the main shell is the only visual container that morphs between compact and full.
- [ ] The main `BrowserWindow` remains at full floating-window bounds during compact and full modes; no collapse-path native compact resize occurs.
- [ ] In compact mode on Windows and macOS, clicks on the transparent area around the visible icon pass through to the application underneath.
- [ ] In compact mode on Windows and macOS, entering the icon hotspot reliably restores window interactivity and expands the main window without visible jitter.
- [ ] Compact shell edge jitter does not cause rapid compact/full toggling or repeated ignore-mouse IPC churn.
- [ ] Full-mode controls remain fully clickable after expanding from compact mode.
- [ ] The app window does not retain keyboard focus while in compact passthrough mode.
- [ ] Download/transcode/runtime-gate/app-update flows that force full mode still restore interactive full-mode behavior without a renderer crop frame.
- [ ] Windows and macOS manual checks show no compact-shell flash, crop, end-frame drift, transparent-area false trigger regressions, or icon disappear/reappear artifact.
- [ ] Main-window -> compact collapse no longer flashes on the final frame because no native compact resize is performed.
- [ ] Renderer visuals no longer depend on native compact bounds state.
- [ ] The compact -> main expand path remains visually unchanged or improved: no reintroduced flicker, crop, or timing regression.
- [ ] Linux follows the fallback path and retains the previous compact interaction behavior.
- [ ] Collapse completion no longer performs a renderer-side transition-owner handoff that makes the icon disappear and reappear on the last frame.
- [ ] Compact icon rendering is persistent through the shell morph and no longer depends on a last-frame independent mount animation.

## Non-Goals
- Do not introduce a dedicated transition `BrowserWindow`.
- Do not redesign the compact visual style or change the product decision about hover-expand vs click-expand in this refactor.
- Do not broaden Linux support beyond explicit fallback behavior.
- Do not implement a progress-driven native resize sync path unless the fixed-stage architecture fails validation.
- Do not reintroduce the old collapse-path transition-mode handoff as a visual workaround.

## Technical Notes
- Expected files include renderer shell logic in `src/App.tsx`, current-window bridge types/runtime wiring, and Electron preload/main IPC.
- Prefer extracting the compact/full controller into a dedicated hook such as `useCompactWindowController` so `App.tsx` does not absorb more state machine logic.
- Keep hook-exposed React state minimal:
  - `shellPhase`
  - `isMinimizedVisual`
- Keep internal controller state mostly in refs:
  - compact hotspot ownership
  - interaction mode cache
  - transition tokens
  - RAF throttling handles
- Use a two-axis model instead of many flat states:
  - shell phase: `full | collapsing | compact | expanding`
  - compact hotspot mode: `passthrough | hot`
- The fixed-stage renderer should keep:
  - one constant full-size stage/root container
  - one shell `motion.div` as the only surface that morphs
  - one content switch boundary for full content vs compact visual, with compact icon ownership staying inside the shell timeline instead of mounting as an independent end-frame motion owner
- Remove renderer dependencies on native compact bounds. In particular, avoid deriving compact visual state from `windowResized`.
- Collapse path should be:
  - request collapse
  - `setIsMinimized(true)`
  - `updateShellPhase("collapsing")`
  - collapse motion completes
  - `updateShellPhase("compact")`
  - no collapse-path `panelTransitionMode` instant/restore handoff
  - double-RAF / stale guard
  - apply `"compact-passthrough"`
- Expand path should be:
  - request expand
  - apply `"interactive"`
  - `setIsMinimized(false)`
  - `updateShellPhase("expanding")`
  - expand motion completes
  - `updateShellPhase("full")`
- Compact passthrough hit-testing should reuse the fixed full-size coordinate system rather than native compact bounds.
- Gate compact passthrough hotspot behavior to `win32` and `darwin`.
- Keep pending compact settle RAF handles cancelable so collapse/expand interruption cannot apply stale interaction ownership.
- Suspected remaining renderer flicker sources, in priority order:
  - collapse completion forcing `panelTransitionMode` from animated -> instant -> animated
  - compact icon end-state ownership coming from an independent `AnimatePresence` mount/unmount boundary
  - shell backdrop and shell body finishing the same geometry on separate animated surfaces

## Validation Matrix
- Good:
  - Compact transparent gutter click passes through to the underlying app while the visible icon still expands FlowSelect.
  - Foreground task restore returns to full interactive mode without a crop frame.
  - Compact collapse finishes as a single continuous visual settle with no final-frame flash or icon disappear/reappear artifact on Windows or macOS.
- Base:
  - Linux keeps the old compact interaction path without the new passthrough hotspot logic.
- Bad:
  - Full renderer UI appears to be cropped into a native compact window for one frame.
  - Compact passthrough still steals keyboard input.
  - Edge-hover jitter causes repeated expand/collapse loops.
  - Compact visuals still depend on a native-bounds state change and blink on the final frame.
  - Collapse finishes with an icon disappear/reappear artifact caused by renderer-side visual ownership handoff.

## Manual Test Checklist
- Windows:
  - compact transparent-area click-through
  - compact icon hotspot entry
  - compact edge jitter
  - compact collapse final-frame stability with no shadow blink
  - compact collapse final-frame stability with no icon disappear/reappear
  - compact collapse final-frame stability after removing collapse `panelTransitionMode` handoff
  - compact collapse final-frame stability with persistent compact icon ownership inside the shell
  - rapid collapse/expand cycles
  - foreground-task forced full restore
  - keyboard focus behavior in passthrough mode
- macOS:
  - same checks as Windows
  - compact shell end-frame stability and no icon drift
- Linux fallback:
  - fallback path still behaves like the pre-refactor compact interaction model
