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

- Confirm which `AnimatePresence` path actually controls minimized icon enter/exit.
- Choose concrete numeric targets before editing:
  - full spring damping range should stay conservative, likely no lower than `34-36` with current `stiffness: 460`
  - compact shell tween remains unchanged
  - icon handoff overshoot, if used, stays around `1.006-1.012`
- Decide whether the first implementation pass should tune full spring only, icon handoff only, or both. Prefer one visible change at a time if Windows outline risk is uncertain.

Allowed:

- Adjust named visual timing constants in `src/utils/mainWindowMotionBaseline.ts`.
- Add a very small icon handoff scale keyframe if represented through named enter/exit constants and verified against the actual `AnimatePresence` path.
- Tune existing full expansion spring only within restrained values.
- Update tests that lock the motion contract.

Not allowed:

- No native bounds changes.
- No hover expand/collapse shell-state changes.
- No compact passthrough timing changes.
- No spring overshoot on compact shell `width`, `height`, `x`, `y`, `borderRadius`, or `clipPath`.
- No moving outline drawing ownership in this task.

## Phase 3: Validation

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
