# Fix Windows mixed-monitor shortcut reveal position jump

## Goal
Eliminate main-window position jumping on Windows mixed-monitor layouts (left landscape + right portrait), and restore deterministic shortcut reveal anchor behavior (cursor lower-left contract).

## Problem Statement
In current Windows multi-monitor setups (especially mixed orientation and mixed DPI), users observe:
- Main window occasionally jumping to the bottom area of the right portrait monitor.
- Shortcut-triggered reveal not appearing at the intended cursor lower-left anchor.

## Requirements
- Define and enforce a single coordinate-space contract across layers for window position updates (`Rust` command handlers, `Tauri` APIs, and frontend calls).
- Keep shortcut reveal order deterministic: position resolution -> optional set position -> show/focus.
- Ensure shortcut reveal anchor matches product contract:
  - Primary behavior: place main window at cursor lower-left side.
  - Boundary fallback: clamp inside the monitor containing cursor.
- Prevent secondary repositioning in frontend listeners from overriding backend shortcut position.
- Keep existing behavior intact for:
  - Shortcut hide when already visible and focused (inside-window cursor case).
  - Idle minimize and expand flows.
  - Drag/drop and download-progress flows.

## Scope
- Backend: `src-tauri/src/lib.rs`
  - Shortcut position resolver
  - Window show/reveal path
  - Position command semantics
- Frontend: `src/App.tsx`
  - `shortcut-show` listener side effects
  - Any indirect calls that re-apply position after shortcut reveal
- Spec update:
  - Add Windows multi-monitor coordinate contract to `.trellis/spec/guides/cross-platform-thinking-guide.md`

## Non-Goals
- No redesign of window UI/animations.
- No behavior change for macOS hover activation logic.
- No changes to settings-window visual layout.

## Root-Cause Hypotheses to Validate
1. Mixed coordinate-space usage (physical vs logical) between frontend `outerPosition()` consumers and backend `set_window_position` command semantics.
2. Shortcut reveal backend positioning may be overridden by frontend `shortcut-show` listener calling size/position restore logic.
3. In mixed orientation + mixed DPI, monitor bounds and cursor anchor are clamped with inconsistent units.

## Proposed Fix Strategy
1. Establish explicit coordinate contract:
   - Pick one position unit at command boundary and enforce it for all callers.
   - Keep resolver, clamping, and setter in the same unit system.
2. Refactor shortcut reveal pipeline:
   - Compute position once in backend.
   - Apply position before show/focus.
   - Ensure frontend shortcut listener does not perform conflicting repositioning.
3. Anchor contract implementation:
   - Cursor lower-left preferred placement.
   - If out-of-bounds, clamp within cursor monitor while preserving direction priority.
4. Add structured logs for verification (Windows only):
   - cursor position
   - selected monitor bounds + scale
   - resolved x/y before and after clamp

## Acceptance Criteria
- [ ] On Windows left-landscape/right-portrait dual-monitor layout, shortcut reveal no longer jumps to right-monitor bottom unexpectedly.
- [ ] Shortcut reveal appears at cursor lower-left (or nearest clamped equivalent) consistently.
- [ ] No visible second-jump after reveal.
- [ ] Existing hide-on-shortcut behavior still works when window is focused and cursor inside window.
- [ ] Idle minimize/expand behavior remains unchanged.
- [ ] Typecheck/lint pass.

## Validation Matrix
- Good:
  - Cursor in monitor center: exact lower-left anchor behavior.
  - Shortcut press repeatedly: deterministic show/hide without relocation drift.
- Base:
  - Cursor near monitor edges: clamped position stays inside correct monitor.
  - Mixed DPI (e.g., 100% + 150%): no cross-screen jump.
- Bad (must not happen):
  - Window appears at stale cached location then jumps.
  - Window lands on wrong monitor edge/bottom when cursor is on another monitor.
  - Shortcut reveal position differs between first and second press under same cursor location.

## Risks & Mitigations
- Risk: Changing command position semantics may affect non-shortcut flows.
  - Mitigation: Audit all `set_window_position` call sites and adapt together in one atomic change.
- Risk: Removing frontend reposition may affect icon-mode restore.
  - Mitigation: Keep size restore behavior, but gate position restore by trigger source.
- Risk: Monitor detection fallback path differences across GPU/driver setups.
  - Mitigation: Keep layered monitor fallback but log selected source and bounds.

## Deliverables
- Code changes in `src-tauri/src/lib.rs` and `src/App.tsx`.
- Spec amendment in `.trellis/spec/guides/cross-platform-thinking-guide.md`.
- Manual verification notes for dual-monitor mixed-orientation scenario.
