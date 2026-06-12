# Subtle Main Window Elastic Motion Design

## Context

This task extends the completed main floating-window motion Phase 2 work. The current architecture already separates:

- shell decision: `src/utils/mainWindowShellMachine.ts`
- geometry and transition planning: `src/utils/mainWindowShellGeometry.ts`
- renderer-side native bounds orchestration: `src/utils/mainWindowNativeBoundsOrchestrator.ts`
- renderer visual timing constants: `src/utils/mainWindowMotionBaseline.ts`

The user wants a small amount of elastic feel during full/icon transitions. The request is explicitly constrained by a prior issue: adding elasticity previously caused the icon window outline/border to look wrong.

## Local Code Facts

Current Windows compact/icon outline is drawn by the panel shell, not the icon layer:

- `src/App.tsx` computes `minimizedContainerBoxShadow` for Windows compact mode.
- `containerBoxShadow` uses that value when `visualIsMinimized && !isMacOS`.
- `getPanelShellStyle(...)` applies this as `boxShadow` on the main `motion.div`.
- The standalone minimized icon wrapper has `boxShadow: "none"`.

The animated panel shell currently owns:

- `scale`
- `borderRadius`
- `clipPath`
- `x`
- `y`
- `width`
- `height`

The shell also has:

- `overflow: "hidden"`
- continuous corner styling
- `clipPath: inset(0 round ...)`
- `box-shadow 0.18s` CSS transition when not in instant mode

The compact geometry is small:

- compact visual shell: `60x60`
- Windows compact outer frame: `80x80`
- compact panel radius: `100`
- compact shell inset: `10`

These facts make the compact outline sensitive to overshoot. A tiny scale or geometry overshoot can visually change a 1px inset outline more noticeably than it would on the full `200x200` shell.

## Risk Assessment

### High-Risk Elastic Targets

Do not apply overshooting spring/keyframe motion to these compact shell properties:

- `width`
- `height`
- `x`
- `y`
- `borderRadius`
- `clipPath`

Reason:

These properties define the clipped panel shell that also draws the Windows compact outline through inset `boxShadow`. If they overshoot, the outline can shimmer, thicken, drift, or briefly appear elliptical during the compact settle.

Avoid changing `MAIN_WINDOW_PANEL_COMPACT_TWEEN_TRANSITION` into a spring unless a dedicated visual proof shows the outline remains stable.

### Medium-Risk Elastic Targets

Panel shell `scale` is less risky than width/height/radius but still affects the inset outline because it scales the same layer that draws `boxShadow`. If used, keep any overshoot extremely small.

Recommended maximum:

- `scale` overshoot no larger than `1.006` to `1.012`
- no negative undershoot on compact settle that visibly shrinks the outline after it reaches icon mode

### Lower-Risk Elastic Targets

The safest elastic feel should come from layers that do not draw the compact outline:

- standalone minimized icon wrapper scale / opacity handoff
- inner icon visual scale, if introduced carefully
- full-mode panel expansion spring tuning, because the full `200x200` shell is less sensitive than the compact `60x60` outline

Even here, keep the motion restrained. Ameow is a compact utility, not a playful bounce surface.

Claude review note:

- Current full expansion is already a subtly underdamped spring: `stiffness: 460`, `damping: 38`, estimated damping ratio about `0.886`.
- Any additional elasticity should use a concrete numeric target. Do not tune by vague feel alone.
- If damping is reduced, keep the settle time short enough that `onAnimationComplete` does not leave the shell in `expanding` for too long.

## Recommended Plan

### Preferred Approach

1. Keep compact shell geometry settling as tween.
   - Preserve `MAIN_WINDOW_PANEL_COMPACT_TWEEN_TRANSITION` as an eased tween.
   - Do not add compact shell spring overshoot to `width/height/x/y/radius/clipPath`.

2. First implementation pass: add elastic feel in full expansion only through the existing full spring.
   - Tune `MAIN_WINDOW_PANEL_FULL_SPRING_TRANSITION` slightly if needed.
   - Keep damping high enough that the full shell does not visibly bounce.
   - Suggested first exploration range after Claude review: keep `stiffness: 460`, do not lower damping below roughly `34-36`.

3. Defer icon handoff elasticity.
   - It should not affect the panel shell outline.
   - Keep the effect around `1.006` to `1.012`.
   - Keep reduced-motion path unchanged or simplified.
   - Verify the actual `AnimatePresence` path first. Icon leave elasticity likely belongs in the `exit` contract, not the `visualIsMinimized === false` branch of `minimizedIconAnimate`.
   - Do not implement this in the first pass.

4. If any compact shell scale elasticity is considered, gate it behind Windows visual validation.
   - Prefer not to do this in the first elastic pass.

## Rejected Approaches

- Replacing compact collapse tween with spring.
- Adding bounce/elastic easing curves to shell geometry properties.
- Animating native bounds during hover expand/collapse to create elastic feel.
- Moving compact outline drawing to another layer as part of this tuning task.

## Verification Plan

Automated:

- Update `mainWindowMotionBaseline.test.ts` for any timing/keyframe contract changes.
- Update `mainWindowShellGeometry.test.ts` only if transition plan descriptors change.
- Run:
  - `npm run test -- mainWindowMotionBaseline mainWindowShellGeometry mainWindowNativeBoundsOrchestrator mainWindowCompactBounds mainWindowTransitionToken`
  - `npm run type-check`
  - `npm run lint`
  - `npm run test`

Manual Windows:

- Collapse to icon and inspect outline at normal scale and high-DPI scale if available.
- Repeated full -> icon -> full cycles.
- Fast enter/leave stress.
- Drag full shell, then collapse near monitor edge.
- Drag/drop into compact icon.
- Confirm compact transparent gutter click-through still behaves correctly.

Manual macOS:

- Compact/full morph does not drift.
- Custom shadow remains stable.
- No post-collapse flash.

Reduced motion:

- Confirm elastic additions are disabled or reduced to existing minimal durations.

## Open Review Questions For Claude

1. Is the risk model correct that Windows compact outline artifacts are most likely caused by applying overshoot to the same panel shell layer that draws inset `boxShadow`?
2. Is the recommended first pass conservative enough?
3. Are there hidden Motion / CSS interaction risks with mixing Motion transform keyframes and CSS `box-shadow` transitions on nearby layers?
4. Should icon handoff elasticity live in existing `minimizedIconAnimate`, or should it be represented as a named contract in `mainWindowMotionBaseline.ts` first?
