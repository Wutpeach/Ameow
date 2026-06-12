# Claude Review: Subtle Main Window Elastic Motion

Review date: 2026-06-12

## Summary

Claude agreed that the risk model is broadly correct:

- Compact shell geometry spring is high risk and should be avoided.
- Panel shell scale overshoot is medium risk because it scales the layer that draws the inset outline.
- Minimized icon layer scale is lower risk because that layer has `boxShadow: "none"`.
- Keeping compact settle as tween and avoiding native bounds changes is the correct baseline.

## Must-Fix Before Implementation

1. Current full expansion spring is already subtly underdamped.
   - Current: `stiffness: 460`, `damping: 38`.
   - Estimated damping ratio: about `0.886`.
   - This can already produce a small overshoot.
   - Any further tuning should define a concrete numeric target rather than "add elasticity" vaguely.

2. Existing minimized icon non-minimized animate keyframes may not be the correct implementation hook.
   - The `visualIsMinimized === false` branch in `minimizedIconAnimate` is likely not the path that controls the actual leave animation under `AnimatePresence`.
   - If icon handoff elasticity is added, it should be explicitly placed in the `exit` path or represented by named exit/enter contracts.

3. `clipPath` and `borderRadius` are animated separately.
   - Existing full spring already animates both.
   - Risk is low because current behavior validated on Windows, but extra spring tuning could increase corner/clip mismatch risk.

## Optional Concerns

- Shadow backdrop follows the same panel transition. This is probably safe because it does not draw the compact inset outline.
- CSS `box-shadow 0.18s` transition runs alongside Motion spring during mode switches. This is existing behavior, but visible stutter should be checked if full spring timing changes.
- Longer spring settle time can delay `onAnimationComplete` and keep shell phase in `expanding` longer. Keep settle time short.

## Recommended Adjustment

Before implementation, choose a concrete target, for example:

- keep `stiffness: 460`
- consider damping no lower than roughly `34-36`
- target only a just-perceptible full expansion overshoot
- keep compact shell tween unchanged
- place icon elasticity in the actual icon `exit` or `enter` contract, not in a dead animate branch

## Verification Additions

Manual Windows must include:

- expand from compact repeatedly
- rapid hover enter/leave
- drag-drop into compact icon
- reduced-motion comparison
- transparent gutter click-through
- compact outline at final settle frame

Manual macOS should include:

- full expansion shadow stability
- compact/full morph drift
- post-collapse flash

## Codex Follow-Up Decision

Adopt the review. Update the plan so implementation starts with numeric full spring target selection and treats icon handoff elasticity as an `exit`/`enter` contract only if the actual `AnimatePresence` path is verified.
