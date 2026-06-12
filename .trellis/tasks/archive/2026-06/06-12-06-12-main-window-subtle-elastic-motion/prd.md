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
- Third implementation pass responds to Windows visual feedback after the scale keyframe:
  - Windows full expansion shows clipped corner/shadow artifacts, especially near the bottom corners
  - unify Windows full outer viewport/native size with macOS at `228x228`
  - keep the visible full panel body at `200x200`
  - use the extra `14px` per-side gutter as shadow/elastic overshoot buffer
  - keep compact/icon outer size and compact collapse behavior unchanged
- Fourth implementation pass adds compact icon handoff elasticity:
  - apply a subtle post-collapse scale settle only to the visible inner compact icon wrapper
  - keep the outer minimized `AnimatePresence` container stable during the shell collapse
  - keep the compact panel shell geometry tween unchanged
  - keep compact outline ownership unchanged
  - keep icon exit-to-full behavior conservative unless separately validated
- Keep the current Phase 2 architecture boundaries:
  - renderer visual timing stays centralized in `src/utils/mainWindowMotionBaseline.ts`
  - geometry stays in `src/utils/mainWindowShellGeometry.ts`
  - native bounds orchestration stays in `src/utils/mainWindowNativeBoundsOrchestrator.ts`
  - shell decision / hover / passthrough timing stays in the shell interaction layer
- Do not add native bounds animation or timing changes beyond changing the steady full outer size target to `228x228` on Windows.
- Do not animate compact native size, compact passthrough, or transparent hit-test behavior.
- Prefer renderer-only visual tuning except for the approved full outer viewport gutter correction.
- Respect reduced-motion behavior.
- Treat Windows compact icon outline stability as a hard regression gate.
- Ask Claude Code for a second-opinion review before implementation starts.
- Defer icon-layer elasticity to a later pass after the full-expansion-only change is validated.

## Acceptance Criteria

- [x] `design.md` documents the current icon outline drawing stack and why elastic motion can affect it.
- [x] The proposal clearly distinguishes safe elastic targets from risky ones.
- [x] The proposal names properties that must not receive overshooting spring animation.
- [x] The proposal includes a focused verification plan for Windows compact outline stability, fast enter/leave, drag, drop, and reduced motion.
- [x] Claude review is captured or summarized in this task before implementation starts.
- [x] First implementation pass changes only the full expansion spring contract.
- [x] Second implementation pass adds only full-expansion scale elasticity and does not affect compact collapse.
- [x] Third implementation pass makes Windows full outer size match macOS `228x228` while preserving the `200x200` visual panel body.
- [x] Windows compact/icon outer size, hotspot behavior, passthrough behavior, and collapse tween remain unchanged.
- [x] Windows full shadow and scale overshoot no longer show clipped straight-corner artifacts in manual visual inspection.
- [x] Compact icon gains post-collapse inner-wrapper elasticity without applying overshoot to the compact panel shell outline layer.
- [x] No compact shell or icon handoff elasticity is introduced in the first pass.
- [x] No third-pass Windows full viewport gutter implementation starts until this updated plan is accepted.

## Notes

- Parent task: `.trellis/tasks/06-11-main-floating-window-motion-phase-2`.
- Phase 2F baseline already passed Windows manual visual validation after `9ff1a0d`.
- User approved the first implementation pass on 2026-06-12: tune only full expansion elasticity and keep icon elasticity deferred.
- User feedback after first pass: full expansion corner elasticity is visible but the whole window does not read as elastic enough. Second pass may add a tiny full-expansion-only scale keyframe while keeping compact/icon paths unchanged.
- User feedback after second pass: Windows full expansion shows signs of clipping; bottom corner shadows can turn into straight-corner artifacts. User approved unifying Windows full outer size with macOS at `228x228` before continuing implementation.
- User feedback after third pass: Windows full `228x228` buffer works. User approved starting compact icon elasticity.
- Claude review found the first compact icon enter attempt was hidden by shell morph timing and sub-pixel scale; the approved revision is a post-collapse inner icon wrapper pulse.
