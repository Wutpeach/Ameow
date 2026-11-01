# Prevent compact window from collapsing off screen

## Goal

Prevent the main app window from ending a `full -> compact` collapse outside the visible desktop area when the user places the full window near a display edge.

## Requirements

- When the main window collapses from full mode to compact/icon mode, the native target bounds must keep the compact window visible inside the current monitor work area.
- The fix must preserve the existing compact/full animation flow, transition-token guard, and Windows compact passthrough behavior.
- The fix must handle left/top edges and right/bottom edges using the active monitor bounds rather than hard-coded primary-screen assumptions.
- If monitor lookup is unavailable, the existing resize behavior may continue as a fallback.

## Acceptance Criteria

- [x] Collapsing near the left or top desktop edge does not leave the compact window off-screen.
- [x] Collapsing near the right or bottom desktop edge does not leave the compact window off-screen.
- [x] Existing compact/full transition tests continue to pass, with focused coverage for compact target clamping.
- [x] `npm run type-check` passes.

## Notes

- This is a lightweight, narrowly scoped bug fix; PRD-only planning is sufficient.
