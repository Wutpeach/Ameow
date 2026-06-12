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

Superseded constraint:

- Earlier planning preferred renderer-only tuning and forbade native bounds changes. Windows visual feedback after the second pass showed clipped full-mode corner/shadow artifacts, so a narrow native geometry correction is now approved for full mode only.

Deferred:

- Add a very small icon handoff scale keyframe if represented through named enter/exit constants and verified against the actual `AnimatePresence` path. This is now approved for the standalone minimized icon enter path only.

Not allowed:

- No native bounds animation or timing changes beyond the approved steady full-mode outer size correction.
- No hover expand/collapse shell-state changes.
- No compact passthrough timing changes.
- No icon handoff elasticity in the first pass.
- No spring overshoot on compact shell `width`, `height`, `x`, `y`, `borderRadius`, or `clipPath`.
- No full-expansion scale keyframe during compact collapse, initial mount, instant transition, or reduced motion.
- No moving outline drawing ownership in this task.

## Phase 3: Windows Full Viewport Gutter Correction

Goal:

- Make Windows full outer viewport/native size match macOS at `228x228`.
- Keep the visible full panel body at `200x200`.
- Use the `14px` per-side gutter as shadow and elastic overshoot buffer.
- Preserve Windows compact outer size, compact hotspot behavior, compact passthrough behavior, and collapse tween.

Implementation targets:

1. Update the full shadow gutter contract.
   - Prefer a named shared full gutter constant over platform-local literals.
   - `getMainWindowFullShadowGutter("win32")` should return `14`.
   - `getMainWindowFullOuterSize("win32")` should return `228`.
   - `getMainWindowFullOuterSize("darwin")` remains `228`.

2. Keep compact metrics unchanged.
   - `getMainWindowCompactOuterSize("win32")` remains `80`.
   - `MAIN_WINDOW_COMPACT_SHELL_SIZE` remains `60`.
   - Do not change `MAIN_WINDOW_PANEL_COMPACT_TWEEN_TRANSITION`.

3. Update geometry expectations.
   - Windows full visual shell should be `{ x: 14, y: 14, width: 200, height: 200 }`.
   - Windows full shadow shell should match the visual shell unless a separate shadow frame already exists.
   - Windows compact visual shell remains `{ x: 10, y: 10, width: 60, height: 60 }`.

4. Keep motion scope unchanged.
   - Preserve the current full-expansion scale gating.
   - Do not add icon handoff elasticity in this phase.
   - Do not add native bounds overshoot animation.

Tests to update or add:

- `src/utils/mainWindowShellGeometry.test.ts`
  - Windows full outer size is `228`.
  - Windows full shell is inset by `14`.
  - Windows compact shell remains `80` outer / `60` visual / `10` inset.
- `src/utils/mainWindowNativeBoundsOrchestrator.test.ts`
  - Update assertions if full target bounds still expect `200x200`.
- `src/utils/mainWindowMotionBaseline.test.ts`
  - Should not need new expectations unless motion constants change.

## Phase 4: Compact Icon Handoff Elasticity

Goal:

- Add subtle elasticity after the compact icon finishes entering minimized state.
- Keep the compact panel shell and Windows outline path stable.
- Do not add icon exit bounce yet.

Implementation targets:

1. Replace the ineffective minimized-icon enter keyframes with named compact-icon settle pulse constants in `src/utils/mainWindowMotionBaseline.ts`.
   - Pulse the visible inner icon wrapper after collapse completion.
   - Use `scale: [1, 1.025, 1]`.
   - Keep the pulse around `0.28s` with the peak around `0.7`.

2. Keep the outer minimized `AnimatePresence` container stable during collapse.
   - Use `{ opacity: 1, scale: 1 }` for minimized enter.
   - Do not animate it from `opacity: 0` / `scale: 0.88` during the shell morph.
   - Keep `minimizedIconExit` unchanged.

3. Trigger the inner wrapper pulse only after shell collapse completes.
   - Add a `compactIconSettlePulseKey` or equivalent local state.
   - Increment it where `handleAnimationComplete` transitions `collapsing -> compact`.
   - Do not increment on initial mount, expand, or reduced-motion paths.

4. Update focused motion contract tests.
   - Assert the new keyframe and timing constants.
   - Confirm existing compact shell transition constants stay unchanged.

Manual Windows:

- Collapse from full to icon and inspect the compact outline.
- Repeat fast full -> icon -> full cycles.
- Confirm icon enter feels elastic while outline does not shimmer or thicken.

## Phase 5: Validation

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
- Third pass planned from user visual feedback:
  - unify Windows full outer viewport/native size with macOS at `228x228`
  - keep visible full panel body at `200x200`
  - preserve Windows compact/icon behavior
- Fourth pass planned from user visual feedback:
  - add standalone minimized icon enter scale settle
  - keep compact shell geometry and outline path unchanged

Automated:

- `npm run test -- mainWindowMotionBaseline mainWindowShellGeometry mainWindowNativeBoundsOrchestrator mainWindowCompactBounds mainWindowTransitionToken`
- `npm run type-check`
- `npm run lint`
- `npm run test`

Manual Windows:

- full-mode shadow/corner no longer shows straight-corner clipping artifacts
- full panel remains visually aligned after the new `14px` gutter
- compact outline stability during collapse
- repeated full/icon cycles
- fast enter/leave
- full drag then collapse
- drop hover from compact icon
- transparent gutter click-through
- compact icon enter elasticity without outline artifacts

Manual macOS:

- custom shadow stability
- compact/full morph drift
- post-collapse flash

## Rollback

If the compact outline shows shimmer, thickening, drift, or clipped corners on Windows:

1. Revert icon/panel elastic timing changes.
2. Keep prior `9ff1a0d` Phase 2F timing contract.
3. Reassess whether elasticity must be isolated to a child layer that does not own outline/clip.
