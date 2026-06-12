# Plan subtle main window elastic motion

## Goal

Plan a subtle elastic feel for the main floating window full/icon transitions while avoiding the prior Windows compact-icon outline artifact risk.

The goal is not to make the window playful or bouncy. The goal is a small amount of liveliness during expand/collapse that still feels like Ameow's compact desktop utility surface.

## Requirements

- Analyze whether adding elastic motion can reintroduce the old Windows icon outline/border artifact.
- First implementation pass is conservative:
  - tune only the full expansion spring
  - do not add icon handoff elasticity yet
  - keep compact collapse tween unchanged
- Second implementation pass responds to Windows visual feedback:
  - add a tiny full-expansion-only panel scale keyframe so the whole full window, not only the corners, reads as elastic
  - keep compact collapse tween unchanged
  - keep icon handoff elasticity deferred
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
- Defer icon-layer elasticity to a later pass after the full-expansion-only change is validated.

## Acceptance Criteria

- [ ] `design.md` documents the current icon outline drawing stack and why elastic motion can affect it.
- [ ] The proposal clearly distinguishes safe elastic targets from risky ones.
- [ ] The proposal names properties that must not receive overshooting spring animation.
- [ ] The proposal includes a focused verification plan for Windows compact outline stability, fast enter/leave, drag, drop, and reduced motion.
- [ ] Claude review is captured or summarized in this task before implementation starts.
- [ ] First implementation pass changes only the full expansion spring contract.
- [ ] Second implementation pass adds only full-expansion scale elasticity and does not affect compact collapse.
- [ ] No compact shell or icon handoff elasticity is introduced in the first pass.
- [ ] No code implementation starts until the reviewed plan is accepted.

## Notes

- Parent task: `.trellis/tasks/06-11-main-floating-window-motion-phase-2`.
- Phase 2F baseline already passed Windows manual visual validation after `9ff1a0d`.
- User approved the first implementation pass on 2026-06-12: tune only full expansion elasticity and keep icon elasticity deferred.
- User feedback after first pass: full expansion corner elasticity is visible but the whole window does not read as elastic enough. Second pass may add a tiny full-expansion-only scale keyframe while keeping compact/icon paths unchanged.
