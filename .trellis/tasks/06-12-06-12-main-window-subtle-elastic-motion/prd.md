# Plan subtle main window elastic motion

## Goal

Plan a subtle elastic feel for the main floating window full/icon transitions while avoiding the prior Windows compact-icon outline artifact risk.

The goal is not to make the window playful or bouncy. The goal is a small amount of liveliness during expand/collapse that still feels like Ameow's compact desktop utility surface.

## Requirements

- Analyze whether adding elastic motion can reintroduce the old Windows icon outline/border artifact.
- Keep the current Phase 2 architecture boundaries:
  - renderer visual timing stays centralized in `src/utils/mainWindowMotionBaseline.ts`
  - geometry stays in `src/utils/mainWindowShellGeometry.ts`
  - native bounds orchestration stays in `src/utils/mainWindowNativeBoundsOrchestrator.ts`
  - shell decision / hover / passthrough timing stays in the shell interaction layer
- Do not add native bounds changes to hover expand/collapse paths.
- Do not animate compact native size, compact passthrough, or transparent hit-test behavior.
- Prefer renderer-only visual tuning.
- Respect reduced-motion behavior.
- Treat Windows compact icon outline stability as a hard regression gate.
- Ask Claude Code for a second-opinion review before implementation starts.

## Acceptance Criteria

- [ ] `design.md` documents the current icon outline drawing stack and why elastic motion can affect it.
- [ ] The proposal clearly distinguishes safe elastic targets from risky ones.
- [ ] The proposal names properties that must not receive overshooting spring animation.
- [ ] The proposal includes a focused verification plan for Windows compact outline stability, fast enter/leave, drag, drop, and reduced motion.
- [ ] Claude review is captured or summarized in this task before implementation starts.
- [ ] No code implementation starts until the reviewed plan is accepted.

## Notes

- Parent task: `.trellis/tasks/06-11-main-floating-window-motion-phase-2`.
- Phase 2F baseline already passed Windows manual visual validation after `9ff1a0d`.
