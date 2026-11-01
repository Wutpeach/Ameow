# Main Floating Window Motion Architecture Phase 2

## Goal

Research and plan a safer Phase 2 architecture for the main floating window full/icon motion, geometry, native bounds, shadow, and hit-test behavior without reintroducing prior macOS/Windows bugs.

The user-facing goal is smoother, more predictable full-to-icon and icon-to-full motion. The engineering goal is stronger ownership boundaries so future animation tuning does not destabilize native bounds, transparent hit regions, shadows, hover/drop behavior, or platform-specific behavior.

Phase 2 must start as behavior-preserving architecture work. The first implementation milestone should not intentionally create a noticeable visual change. Visible motion tuning can happen only after geometry, native bounds, visual shell, shadow, and interaction ownership are aligned and verified.

## Background

The main floating window has already gone through several difficult bug cycles:

- macOS and Windows visual/native state could desynchronize.
- Transparent window regions could remain selected or clickable in unexpected ways.
- Native window size changes could fight renderer animation.
- UI shadow layers could clip, drift, or fight the panel shell.
- Full and icon modes could fail to switch smoothly or recover from fast pointer movement.

The current implementation is working, so Phase 2 must treat the existing behavior as a baseline to preserve. The purpose is not to rewrite for novelty. The purpose is to make the architecture safer before tuning the motion quality.

## Confirmed Local Facts

- Full panel content size is `200`.
- Compact visual shell size is `60`.
- Windows compact outer frame is `80`; macOS compact outer frame is `88`.
- macOS full mode includes a shadow gutter of `14`; Windows does not.
- `src/utils/mainWindowShellMachine.ts` already owns high-level shell phases and locks.
- `src/App.tsx` currently executes shell effects and also owns visual animation, native bounds requests, pointer/drop refs, timers, and shadow rendering.
- Shell-related native bounds adjustments use a custom Electron-side `animateBrowserWindowBounds(...)` loop instead of relying on platform-native animated `setBounds(...)`.
- Compact passthrough mode uses `setIgnoreMouseEvents(true, { forward: true })` and `setFocusable(false)`, while `blur()` is explicitly forbidden by the backend contract.
- Existing helpers already cover compact pointer hotspot hysteresis and compact bounds clamping.

## Requirements

- Produce a Phase 2 design before any refactor starts.
- Preserve the currently working behavior while improving maintainability and future tunability.
- Treat "behavior-preserving, no intentional visual change" as the default implementation strategy for the first milestone.
- Treat the main floating window as a cross-layer motion system, not only a React animation.
- Define a single geometry plan that maps shell mode/platform to native bounds, visual shell frame, shadow frame, and interaction/hit-test frame.
- Before replacing any calculations, baseline which shell transitions actually change native bounds today and which are visual-only renderer morphs.
- Treat code-observed behavior as the Phase 2 baseline when existing specs or historical notes appear stale or broader than the current implementation.
- Keep the renderer as the shell decision owner; keep Electron main as a native adapter.
- Keep transition-token protection for native bounds requests.
- Keep compact pointer hotspot behavior explicit and testable.
- Keep compact passthrough behavior explicit and platform-aware.
- Avoid any change that could reintroduce transparent region click bugs, macOS shadow flash, or full/icon desynchronization without a dedicated test plan.
- Build Phase 2 as small milestones with rollback points.

## Acceptance Criteria

- [ ] `research.md` captures relevant local implementation facts and external Electron constraints.
- [ ] `design.md` proposes explicit ownership boundaries for shell decision, geometry, native bounds, visual motion, shadow, and hit testing.
- [ ] The plan identifies which current behaviors are invariants that must not regress.
- [ ] The plan distinguishes visual shell morphs from native bounds adjustments so implementation does not add unnecessary native resizing.
- [ ] The plan includes a current-code native bounds inventory before any refactor changes call sites.
- [ ] The plan includes a validation matrix covering macOS, Windows, fast enter/leave, drag/drop, task locks, shadow behavior, and compact passthrough.
- [ ] The plan includes a staged implementation sequence that avoids a big-bang rewrite.
- [ ] The first implementation milestone has an explicit "no visual tuning" gate: existing durations, springs, tweens, icon handoff, shadow intensity, and passthrough timing are named and preserved.
- [ ] Open questions are limited to product intent or risk tolerance, not facts available from code/docs.
- [ ] No implementation starts until the user reviews and approves the Phase 2 design.

## Non-Goals

- Do not directly tune the main floating window animation in this planning task.
- Do not replace the existing shell state machine unless evidence shows it cannot support the target architecture.
- Do not reintroduce a second transition overlay BrowserWindow.
- Do not rely on platform-native `setBounds(..., true)` animation for cross-platform behavior.
- Do not treat transparent pixels as safe click-through regions without explicit interaction-mode handling.

## Open Question

- Resolved: Phase 2 should begin with behavior-preserving architecture work, not immediate visual polish.

## Notes

- This task is planning/research only until the design is reviewed.
