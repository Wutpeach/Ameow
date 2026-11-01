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

Full-mode geometry currently differs by platform:

- visible full panel body: `200x200`
- macOS full outer viewport/native size: `228x228` (`14px` gutter per side)
- Windows full outer viewport/native size: `200x200` (`0px` gutter)

The full-mode shadow backdrop and panel shell are both rendered inside the native BrowserWindow viewport. On Windows, any full-mode shadow or elastic scale overshoot that tries to draw beyond `200x200` is clipped by the native transparent-window boundary. This explains the observed straight-corner artifacts near the bottom corners after adding full-expansion scale elasticity.

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

Second pass decision:

- Use a full-expansion-only scale keyframe on the panel and shadow shell.
- Gate it on the existing `shellPhase === "expanding"` direction signal.
- Target `scale: [1, 1.01, 1]`.
- Do not apply this keyframe when `visualIsMinimized` is true, when `panelTransitionMode` is instant, during initial mount, or when reduced motion is enabled.
- Do not add scale elasticity to compact collapse.

### Medium-Risk Native Geometry Target

The approved native geometry change is limited to the steady full-mode outer viewport size on Windows:

- Windows full outer size should match macOS at `228x228`.
- The visible full panel body remains `200x200`.
- The full visual shell is inset by the same `14px` gutter used on macOS.
- The shadow shell uses the same full frame so full-mode shadow and scale overshoot have transparent-window buffer space.

This is not an animation timing change. It changes the full-mode target rectangle so the renderer has room to draw the existing full panel, shadow, and tiny elastic overshoot without native clipping.

Risk:

- Full native bounds become larger on Windows during full mode.
- Pointer coordinate handling, edge glow math, drag/drop hit testing, and compact collapse handoff must still target the visible `200x200` panel body, not accidentally treat the transparent gutter as visible content.
- Compact mode must stay `80x80` on Windows so the previously validated compact icon outline and transparent hotspot behavior remain stable.

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

3. Second implementation pass: add full-expansion-only panel scale keyframes.
   - Use the existing renderer visual motion owner.
   - Keep keyframes small enough to avoid outline shimmer.
   - Apply to the panel/shadow shell during expansion only.

4. Third implementation pass: unify Windows full outer viewport with macOS.
   - Add a platform-independent full shadow/overshoot gutter of `14px`, or otherwise make `getMainWindowFullShadowGutter("win32")` return `14`.
   - Keep `MAIN_WINDOW_PANEL_SIZE` at `200`.
   - Keep Windows compact outer size at `80`.
   - Ensure full visual shell and shadow shell are inset by `14px` on Windows.
   - Ensure native full target bounds become `228x228` on Windows.
   - Do not introduce native overshoot animation; the target is a stable full-mode viewport.

5. Defer icon handoff elasticity.
   - It should not affect the panel shell outline.
   - Keep the effect around `1.006` to `1.012`.
   - Keep reduced-motion path unchanged or simplified.
   - Verify the actual `AnimatePresence` path first. Icon leave elasticity likely belongs in the `exit` contract, not the `visualIsMinimized === false` branch of `minimizedIconAnimate`.
   - Do not implement this in the first pass.

Icon handoff implementation update:

- After the Windows full gutter fix was visually validated, add elasticity only to the standalone minimized icon handoff layer.
- Keep the compact panel shell tween, outline, `width`, `height`, `x`, `y`, `borderRadius`, and `clipPath` unchanged.
- Claude review found the first icon-enter attempt ineffective because the outer `inset: 0` minimized container is visually empty, the peak was sub-pixel on the `38px` icon, and the enter animation overlapped with the panel shell collapse/clip morph.
- Revised approach:
  - keep the minimized `AnimatePresence` container stable during collapse with `opacity: 1` and `scale: 1`
  - trigger the elastic effect only after `handleAnimationComplete` moves the shell into `compact`
  - pulse the visible inner icon wrapper, not the panel shell or outer overlay
  - use a very restrained pulse such as `1 -> 1.025 -> 1`
  - pace the pulse softly with a later peak around `0.7`
  - keep reduced-motion path at `scale: 1`
  - keep icon exit-to-full behavior unchanged

6. If any compact shell scale elasticity is considered, gate it behind Windows visual validation.
   - Prefer not to do this in the first elastic pass.

## Rejected Approaches

- Replacing compact collapse tween with spring.
- Adding bounce/elastic easing curves to shell geometry properties.
- Animating native bounds overshoot during hover expand/collapse to create elastic feel.
- Moving compact outline drawing to another layer as part of this tuning task.

## Verification Plan

Automated:

- Update `mainWindowMotionBaseline.test.ts` for any timing/keyframe contract changes.
- Update `mainWindowShellGeometry.test.ts` for Windows full outer size, full visual shell inset, and compact geometry invariants.
- Update native bounds/orchestrator tests if full target bounds assertions currently expect Windows `200x200`.
- Run:
  - `npm run test -- mainWindowMotionBaseline mainWindowShellGeometry mainWindowNativeBoundsOrchestrator mainWindowCompactBounds mainWindowTransitionToken`
  - `npm run type-check`
  - `npm run lint`
  - `npm run test`

Manual Windows:

- Confirm full mode native/viewport buffer removes clipped straight-corner shadow artifacts.
- Confirm the visible full panel body remains visually `200x200` and aligned.
- Collapse to icon and inspect outline at normal scale and high-DPI scale if available.
- Repeated full -> icon -> full cycles.
- Fast enter/leave stress.
- Drag full shell, then collapse near monitor edge.
- Drag/drop into compact icon.
- Confirm compact transparent gutter click-through still behaves correctly.
- Confirm compact icon enter has a subtle settle without outline shimmer, thickening, drift, or clipped corners.

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
