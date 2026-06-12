# Subtle Main Window Elastic Motion Implementation Plan

Do not implement until the plan has been reviewed and accepted.

## Phase 1: Review Gate

- Send `prd.md` and `design.md` to Claude Code for second-opinion review.
- Capture review feedback in this task.
- Resolve any must-fix risks before implementation.

Exit gate:

- Claude review completed.
- User accepts the implementation direction.

## Phase 2: Conservative Renderer-Only Tuning

Pre-coding checks:

- First pass scope confirmed by user on 2026-06-12:
  - tune full expansion spring only
  - do not add icon handoff elasticity
  - keep compact shell tween unchanged
- Confirming the `AnimatePresence` icon enter/exit path is deferred until the icon elasticity pass.
- Choose concrete numeric targets before editing:
  - full spring damping range should stay conservative, likely no lower than `34-36` with current `stiffness: 460`
  - compact shell tween remains unchanged
  - first pass target: keep `stiffness: 460`, lower `damping` slightly but not below `36`

Allowed:

- Adjust named visual timing constants in `src/utils/mainWindowMotionBaseline.ts`.
- First pass: tune existing full expansion spring only within restrained values.
- Second pass: add a tiny full-expansion-only scale keyframe contract and consume it in `App.tsx` when `shellPhase === "expanding"`.
- Update tests that lock the motion contract.

Deferred:

- Add a very small icon handoff scale keyframe if represented through named enter/exit constants and verified against the actual `AnimatePresence` path.

Not allowed:

- No native bounds changes.
- No hover expand/collapse shell-state changes.
- No compact passthrough timing changes.
- No icon handoff elasticity in the first pass.
- No spring overshoot on compact shell `width`, `height`, `x`, `y`, `borderRadius`, or `clipPath`.
- No full-expansion scale keyframe during compact collapse, initial mount, instant transition, or reduced motion.
- No moving outline drawing ownership in this task.

## Phase 3: Validation

Implementation status:

- First pass implemented in current work:
  - `MAIN_WINDOW_PANEL_FULL_SPRING_TRANSITION.damping`: `38` -> `36`
  - `MAIN_WINDOW_PANEL_FULL_SPRING_TRANSITION.stiffness`: unchanged at `460`
  - compact shell tween unchanged
  - icon handoff unchanged
- Second pass implemented in current work from user visual feedback:
  - add full-expansion-only shell scale keyframes: `[1, 1.01, 1]`
  - gate the keyframes on `shellPhase === "expanding"`
  - apply the same scale keyframes to panel and shadow shell
  - keep compact shell tween unchanged
  - keep icon handoff unchanged

Automated:

- `npm run test -- mainWindowMotionBaseline mainWindowShellGeometry mainWindowNativeBoundsOrchestrator mainWindowCompactBounds mainWindowTransitionToken`
- `npm run type-check`
- `npm run lint`
- `npm run test`

Manual Windows:

- compact outline stability during collapse
- repeated full/icon cycles
- fast enter/leave
- full drag then collapse
- drop hover from compact icon
- transparent gutter click-through

Manual macOS:

- custom shadow stability
- compact/full morph drift
- post-collapse flash

## Rollback

If the compact outline shows shimmer, thickening, drift, or clipped corners on Windows:

1. Revert icon/panel elastic timing changes.
2. Keep prior `9ff1a0d` Phase 2F timing contract.
3. Reassess whether elasticity must be isolated to a child layer that does not own outline/clip.
