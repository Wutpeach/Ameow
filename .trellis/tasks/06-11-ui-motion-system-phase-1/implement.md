# UI Motion System Phase 1 Implementation Plan

## Checklist

1. Baseline the existing motion values.
   - Record current dropdown reveal values.
   - Record current settings page switch values.
   - Record current foreground overlay presence values.
   - Treat the first migration as behavior-equivalent unless there is a clear reason to tune.

2. Create `src/components/ui/motion.ts`.
   - Add easing and duration tokens.
   - Add CSS transition helper named clearly as CSS, such as `compactCssTransition`.
   - Add compact Motion presets.
   - Export types carefully enough for Motion transition objects.
   - Keep `motion.ts` as a leaf module with no import from `shared-styles.ts` or other UI components.

3. Migrate low-risk consumers.
   - Update `NeonDropdownField` to use compact popover preset.
   - Decide and document whether `NeonDropdownField` gets reduced-motion support in this phase or preserves current behavior.
   - Update `SettingsPage` to use shared page-switch preset while preserving reduced-motion behavior and explicit forward/back direction.
   - Update `ForegroundOutcomeOverlay` / `foregroundOverlayShared` to use shared overlay presence preset.
   - Replace repeated easing tuple literals in `ForegroundOutcomeOverlay` with shared easing tokens where this is a pure constant substitution.

4. Keep micro-interactions CSS-based.
   - Optionally replace repeated transition strings in primitives with a helper only if it stays behavior-equivalent.
   - Do not convert hover/focus/pressed controls to Motion.

5. Update specs.
   - Document `src/components/ui/motion.ts` in `.trellis/spec/frontend/motion-guidelines.md`.
   - Add a short Phase 1 / Phase 2 boundary note.

6. Validate.
   - Run `npm run type-check`.
   - Run `npm run lint`.
   - If implementation touches component behavior with tests already nearby, run task-relevant tests.

## Implementation Milestones

### Milestone 1: Token Module Only

Expected result:

- `src/components/ui/motion.ts` exists.
- No UI consumer is changed yet.
- TypeScript can compile the token module.
- The module does not import from existing UI components or `shared-styles.ts`.

This milestone confirms the type shape before changing components.

### Milestone 2: One Consumer Migration

Start with `NeonDropdownField` because it has a contained `AnimatePresence` boundary and a clear compact popover reveal.

Expected result:

- dropdown visual behavior remains equivalent
- local hardcoded reveal values are replaced with shared preset usage
- hover/selected option transitions remain CSS-based
- reduced-motion behavior is explicitly handled or documented as a pre-existing gap

### Milestone 3: Reduced-Motion Consumer Migration

Migrate `SettingsPage` next because it has explicit reduced-motion branching.

Expected result:

- page switch logic remains readable
- reduced-motion branch remains obvious
- `AnimatePresence mode="wait"` behavior is unchanged
- forward and back navigation keep opposite slide directions

### Milestone 4: Overlay Presence Migration

Migrate `ForegroundOutcomeOverlay` / `foregroundOverlayShared`.

Expected result:

- center overlay presence uses shared naming
- outcome icon/ring choreography can remain local because it is component-specific
- repeated easing tuple literals inside local choreography use shared easing tokens
- only generic overlay presence becomes shared

### Milestone 5: Spec Update And Validation

Expected result:

- motion guidelines point to the new shared module
- Phase 1 / Phase 2 boundary is documented
- type-check and lint pass
- visual/manual checks cover dropdown reveal, settings forward/back navigation, and reduced-motion behavior where applicable

## Risk Controls

- Avoid changing `src/App.tsx` main panel morph unless the change is limited to importing a named constant with no behavior change.
- Do not modify Electron bridge or main-process window animation.
- Do not change animation ownership of properties already controlled by CSS transitions.
- Keep each migrated preset visually equivalent before tuning.

## Non-Goals During Implementation

- No new visual animation concept.
- No large-scale component extraction.
- No new `motion.button` replacements for existing Neon controls.
- No change to loading spinner or shimmer keyframes unless needed only to reference a duration token.
- No main floating-window animation tuning.

## Review Gate

Before `task.py start`, review this plan with the user and confirm Phase 1 scope:

- shared motion tokens and low-risk reusable UI motion only
- main floating-window animation deferred to Phase 2
