# UI Motion System Phase 1

## Goal

Create the first reusable motion-system milestone for Ameow's product UI: shared motion tokens, compact presence presets, and lightweight motion wrappers for low-risk UI surfaces. This phase intentionally defers the main floating-window morph / native bounds animation work to a later Phase 2.

The business value is to make future animation tuning more consistent, safer to review, and easier to apply across settings, dropdowns, overlays, and later the main floating window.

## Confirmed Facts

- The app uses Motion for React via `motion/react`, not `framer-motion`.
- `src/components/ui/shared-styles.ts` already centralizes visual surface recipes and `COMPACT_EASE`.
- CSS transitions are currently appropriate for hover, focus, pressed, color, border, shadow, and simple progress feedback.
- Motion is currently used for mount/unmount choreography, settings page switches, foreground overlays, dropdown menus, and main floating-window panel state transitions.
- The project already has `.trellis/spec/frontend/motion-guidelines.md`, which defines when to use CSS transitions versus Motion and explicitly warns against mixed ownership of the same animated property.
- The main floating-window animation is higher risk because it combines React state, Motion transforms, Electron `animateBounds(...)`, transition tokens, hover/drag ownership, and platform-specific compact shell behavior.

## Requirements

- Add a shared motion entry point for reusable timing, easing, transition, and presence presets.
- Keep imports aligned with the existing contract: `motion/react` only.
- Preserve reduced-motion behavior for every migrated Motion surface.
- Keep CSS transitions for simple hover/focus/pressed interactions; do not convert ordinary control feedback into Motion.
- Migrate only low-risk consumers in Phase 1, such as dropdown reveal, settings page transitions, and foreground outcome overlay presence.
- Avoid behavior changes to main floating-window compact/full morph, Electron native bounds animation, hover-collapse ownership, and platform-specific compact shell handling.
- Update frontend motion guidance so future work uses the new shared motion entry point.
- Maintain the current Ameow motion feel: compact, intentional, quick to read, polished but not theatrical.

## Phase 1 Actual Scope

Phase 1 is a foundation milestone, not a visual redesign milestone. The goal is to make existing low-risk animations reusable and easier to tune without changing the main floating-window animation feel yet.

### Deliverable 1: Shared Motion Foundation

Create `src/components/ui/motion.ts` as the shared entry point for UI motion. It should include:

- reusable easing tokens, including the existing compact ease curve
- duration tokens for micro, fast, base, and slow UI motion
- named Motion transition objects for compact tweens and overlay fades
- named presence presets for compact popovers, settings page transitions, and center overlays
- explicitly named CSS transition helper(s), such as `compactCssTransition(...)`, for existing hover/focus micro-interactions

`src/components/ui/shared-styles.ts` may continue to export the CSS-string `COMPACT_EASE`. `src/components/ui/motion.ts` should define the same curve as a Motion tuple for Motion consumers. The relationship must be documented so future work does not parse CSS strings into Motion tuples or accidentally create competing curve definitions.

### Deliverable 2: Low-Risk Migration

Migrate a small set of existing consumers to prove the shared module works:

- `NeonDropdownField`: dropdown reveal should use the shared compact popover preset
- `SettingsPage`: page switching should use a shared page-switch preset while preserving reduced-motion behavior
- `ForegroundOutcomeOverlay` / `foregroundOverlayShared`: overlay presence should use a shared center-overlay preset
- `ForegroundOutcomeOverlay`: local ring/icon choreography can remain component-specific, but repeated easing tuple literals should use shared easing tokens when the file is already being touched

These migrations should be behavior-equivalent unless a tiny naming/typing adjustment is required by the shared preset.

### Deliverable 3: Rules And Documentation

Update `.trellis/spec/frontend/motion-guidelines.md` so future work knows:

- where shared motion tokens live
- when to use CSS transitions versus Motion
- which Phase 1 presets are available
- why main floating-window morph animation remains deferred to Phase 2

### Deliverable 4: Guardrails For Phase 2

Phase 1 should leave a clear runway for Phase 2 by defining reusable names and boundaries, but it should not tune or refactor:

- main floating-window compact/full morph
- Electron native bounds animation
- hover-collapse timing
- platform-specific compact shell behavior

## Acceptance Criteria

- [ ] A shared UI motion module exists with named compact easing, duration, transition, and presence presets.
- [ ] At least two existing low-risk Motion consumers use the shared module instead of local hardcoded transition objects.
- [ ] Existing CSS-transition based hover/focus/pressed behavior remains CSS-based.
- [ ] All migrated consumers still respect reduced-motion behavior.
- [ ] Settings page forward/back navigation keeps the existing directional slide behavior.
- [ ] `NeonDropdownField` reduced-motion behavior is explicitly decided: either preserve current behavior and document the gap, or add reduced-motion support as a behavior-equivalent accessibility improvement.
- [ ] No circular UI imports are introduced by `src/components/ui/motion.ts` or optional barrel exports.
- [ ] The main floating-window native bounds / morph path is not behaviorally changed in Phase 1.
- [ ] `.trellis/spec/frontend/motion-guidelines.md` documents the new shared motion entry point and the Phase 1 / Phase 2 boundary.
- [ ] `npm run type-check` and `npm run lint` pass.

## Out of Scope

- Reworking the main floating-window compact/full animation.
- Changing Electron `animateBounds(...)` timing, transition-token logic, or native window sizing behavior.
- Introducing page-level decorative animation.
- Replacing CSS transitions on buttons, fields, and settings rows with Motion.
- Adding a new animation library.

## Phase 2 Note

Phase 2 should focus on the main floating-window animation quality. It should start from the Phase 1 motion tokens but needs a separate design discussion because it is the highest-risk and highest-impact motion area.

## Notes

- This is a complex frontend architecture/design-system task, so `design.md` and `implement.md` are required before implementation starts.
