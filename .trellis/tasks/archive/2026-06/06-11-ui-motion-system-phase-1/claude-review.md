# Claude Review

## Summary

Claude reviewed the Phase 1 motion-system plan and found it technically sound and appropriately scoped. The review agreed that the main floating-window morph, Electron `animateBounds(...)`, hover-collapse logic, and platform-specific compact shell behavior should remain out of Phase 1.

## Must-Fix Items Incorporated

- Rename the CSS transition helper from ambiguous `compactTransition(...)` to a CSS-explicit name such as `compactCssTransition(...)`.
- Clarify the relationship between the existing CSS-string `COMPACT_EASE` in `shared-styles.ts` and the proposed Motion tuple `MOTION_EASE.compact`.
- Keep `motion.ts` as a leaf module to avoid circular imports, especially if it is barrel-exported from `src/components/ui/index.ts`.
- Make settings page transition direction explicit in shared helper design so forward/back slide direction is preserved.
- When touching `ForegroundOutcomeOverlay`, replace repeated easing tuple literals with shared easing tokens while keeping component-specific ring/icon choreography local.
- Decide explicitly whether `NeonDropdownField` adds reduced-motion support in Phase 1 or preserves the current behavior and documents the gap.

## Optional Items Deferred

- Pure constant substitution inside `src/App.tsx` can help Phase 2 but should remain optional in Phase 1.
- `MOTION_SPRING.panelMorph` can be defined for future use, but must not be applied to the main floating-window morph in Phase 1.

## Validation Additions

- Check dropdown reveal still feels behavior-equivalent.
- Check settings forward/back navigation preserves opposite slide directions.
- Check reduced-motion behavior for migrated surfaces.
- Confirm type-check catches no circular imports.
- Confirm motion guidelines document the shared module and Phase 1 / Phase 2 boundary.
