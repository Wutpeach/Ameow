# UI Motion System Phase 1 Design

## Architecture

Phase 1 introduces a shared motion layer for reusable UI animation decisions without changing the main floating-window morph behavior.

Proposed entry point:

```text
src/components/ui/motion.ts
```

This module should own:

- compact easing constants
- named duration tokens
- common CSS transition string helpers
- common Motion transition objects
- compact presence presets for dropdowns, popovers, page switches, and center overlays
- reduced-motion helper functions where a preset needs different values

The module should not own:

- theme colors
- surface styles
- component layout
- Electron native window bounds logic
- business state machines

Import boundary:

- `motion.ts` should be a leaf module.
- It may import types from React or Motion if needed.
- It must not import from `shared-styles.ts` or other `ui/` component files.
- `shared-styles.ts` should not import from `motion.ts` in Phase 1.
- If `motion.ts` is added to `src/components/ui/index.ts`, verify the barrel does not create a circular dependency.

## Concrete Module Shape

The first version of `src/components/ui/motion.ts` should stay intentionally small. It should not become a full animation framework.

Expected export groups:

```ts
export const MOTION_EASE = {
  compact: [0.22, 1, 0.36, 1],
  exit: [0.32, 0.72, 0, 1],
} as const;

export const MOTION_DURATION = {
  micro: 0.08,
  fast: 0.14,
  base: 0.18,
  slow: 0.24,
  overlay: 0.2,
} as const;

export const compactCssTransition = (
  properties: string[],
  options?: { durationSeconds?: number; ease?: string },
) => string;

export const COMPACT_POPOVER_PRESENCE = {
  initial: { opacity: 0, y: -4, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -2, scale: 0.985 },
  transition: { duration: 0.16, ease: MOTION_EASE.compact },
} as const;
```

The exact names can be refined during implementation, but the module should remain token/preset oriented rather than component-state oriented.

`MOTION_EASE.compact` and `COMPACT_EASE` represent the same curve in different formats:

- `MOTION_EASE.compact`: Motion tuple, used by `motion/react`
- `COMPACT_EASE`: CSS cubic-bezier string, currently exported from `shared-styles.ts`

Phase 1 should keep this relationship explicit. It should not force CSS users to consume Motion tuples, and it should not force Motion users to parse CSS strings.

## Layering

### Token Layer

Motion tokens should be small and semantic:

- `MOTION_EASE.compact`
- `MOTION_DURATION.micro`
- `MOTION_DURATION.fast`
- `MOTION_DURATION.base`
- `MOTION_DURATION.slow`
- `MOTION_SPRING.panelMorph` (defined for future use, but Phase 1 should avoid applying it to the main shell)

### Preset Layer

Presets should describe product UI behavior:

- `compactPopoverPresence`
- `settingsPageSwitchMotion`
- `centerOverlayPresenceMotion`

Each preset should include only the properties it owns. For example, dropdown reveal can own `opacity`, `y`, and `scale`; hover color remains CSS.

For reduced motion, prefer small helper functions over duplicating full preset objects in every component. Example shape:

```ts
getSettingsPageSwitchMotion(shouldReduceMotion: boolean, direction: "forward" | "back")
```

This keeps component code readable while preserving the existing reduced-motion branches. Direction must remain explicit because the current settings page uses opposite x offsets for forward and back navigation.

### Helper Layer

CSS transition helpers can reduce repeated strings while keeping CSS as the right tool for micro-interactions:

```ts
compactCssTransition(["background", "border-color", "box-shadow", "color"])
```

This should produce the same timing language currently used by primitives.

The CSS helper name should include `Css` so it is not confused with Motion transition objects. Phase 1 can use this helper in touched files, but should not sweep through `shared-styles.ts` to migrate every CSS transition at once.

## Practical Componentization Boundary

Phase 1 should componentize only where the UI structure is reusable. It should not force every animation into a React wrapper.

Good Phase 1 componentization:

- shared preset constants used by `motion.div`
- helper functions returning initial/animate/exit/transition objects
- CSS transition string helpers used by existing Neon primitives
- shared easing tuple tokens used inside component-specific choreography, where this is a pure constant substitution

Avoid in Phase 1:

- a generic animated wrapper around every control
- converting button hover and field hover into `motion.button`
- abstracting the main floating-window shell into a new component
- moving business state into the motion module
- broad migration of CSS transition strings inside `shared-styles.ts`

## Initial Migration Targets

Low-risk targets:

- `src/components/ui/neon-dropdown-field.tsx`
- `src/pages/SettingsPage.tsx`
- `src/components/ForegroundOutcomeOverlay.tsx`
- `src/components/foregroundOverlayShared.ts`

`NeonDropdownField` currently does not use `useReducedMotion()`. Phase 1 must decide this explicitly during implementation:

- conservative option: preserve existing behavior and document the current gap
- preferred option if low-risk: add reduced-motion support to the reveal preset usage without changing normal-motion behavior

Possible but optional Phase 1 target:

- small non-morph overlay/presence fragments in `src/App.tsx`, only if they do not touch compact/full window morph, Electron bounds animation, or hover-collapse ownership.

## Explicit Phase Boundary

Do not change these in Phase 1:

- `currentWindow.animateBounds(...)` timings or call flow
- compact/full transition-token ownership
- panel shell morph behavior
- minimized icon handoff behavior
- main-window hover enter/leave collapse timing
- platform-specific macOS/Windows compact shell handling

Phase 1 may define tokens that Phase 2 later uses, but should not apply them to the main floating-window morph until Phase 2 has its own plan.

## Expected File-Level Changes

Likely changed files:

- `src/components/ui/motion.ts` (new)
- `src/components/ui/index.ts` (export shared motion helpers only if useful; avoid forcing consumers through the barrel if it creates cycles)
- `src/components/ui/neon-dropdown-field.tsx`
- `src/pages/SettingsPage.tsx`
- `src/components/ForegroundOutcomeOverlay.tsx`
- `src/components/foregroundOverlayShared.ts`
- `.trellis/spec/frontend/motion-guidelines.md`

Files that should not receive behavioral changes in Phase 1:

- `src/desktop/*`
- `src/types/electronBridge.ts`
- Electron main/preload window animation code
- main floating-window compact/full morph logic in `src/App.tsx`

## Compatibility

- Continue importing Motion from `motion/react`.
- Keep TypeScript literal tuple types for easing arrays where Motion requires them.
- Preserve `useReducedMotion()` decisions in migrated components.
- Avoid changing DOM structure where it could affect layout, focus, keyboard navigation, or accessible labels.

## Validation Strategy

- Type-check and lint.
- Manually inspect settings page transitions and dropdown reveal.
- Verify reduced-motion branches remain present in migrated consumers.
- Confirm no Phase 1 diff changes Electron native window animation behavior.
