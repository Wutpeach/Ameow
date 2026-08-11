# Motion Guidelines

> How `motion/react` is used in FlowSelect.

---

## Overview

FlowSelect uses Motion for React for UI states that need mount/unmount choreography, panel transforms, or multi-step state transitions.

This document defines when to use `motion/react`, when to stay with CSS transitions, and how motion should behave on compact floating desktop surfaces.

FlowSelect motion should feel:

- Compact
- Intentional
- Fast to read
- Slightly polished, not theatrical

For broader visual principles, also read `./design-system.md`.

---

## Library Contract

### Import Rule

Use Motion for React from `motion/react`.

```tsx
import { motion, AnimatePresence } from "motion/react";
```

Do not introduce new imports from `framer-motion`.

### Shared Motion Tokens

Reusable UI motion values live in:

```text
src/components/ui/motion.ts
```

Use this module for shared easing tuples, duration tokens, compact presence presets, and small motion helper functions. Keep it as a leaf module: it must not import from `shared-styles.ts` or other UI components.

`MOTION_EASE.compact` and `COMPACT_EASE` intentionally represent the same curve in different formats:

- `MOTION_EASE.compact`: Motion tuple, for `motion/react`
- `COMPACT_EASE`: CSS cubic-bezier string, for CSS transitions in `shared-styles.ts`

Do not parse CSS strings into Motion tuples or force CSS consumers to use Motion tuple values.

CSS transition helpers exported from `motion.ts` must include `Css` in the name, such as `compactCssTransition(...)`, so they are not confused with Motion transition objects.

### Property Rule

Prefer animating:

- `transform`
- `opacity`
- `filter` only when the blur/fade is part of a compact overlay reveal

Avoid animating layout-affecting properties for core floating surfaces unless there is a strong reason:

- `width`
- `height`
- `top`
- `left`
- `margin`
- `padding`

### Tool Choice Rule

Use CSS transitions for:

- Hover
- Focus
- Pressed states
- Quiet color/border/shadow changes
- Simple progress width changes

Use `motion/react` for:

- Mount/unmount transitions
- Overlay and popover reveals
- Switching between mutually exclusive UI states
- Panel scale/position transforms
- Stateful transitions that need `AnimatePresence`

Do not animate the same property with both CSS and Motion at the same time.

### Phase Boundary Rule

Shared motion tokens may be used by low-risk UI consumers such as dropdowns, settings page transitions, and center overlays. The main floating-window compact/full morph is a separate high-risk motion area. Do not tune or refactor its lifecycle epoch handling, hover-collapse timing, or platform-specific compact shell behavior as part of generic motion-token cleanup.

Main floating-window presentation is owned by the `src/presentation/main-window/` module. The lifecycle reducer (`lifecycle.ts`) is the only writable full/compact/transition authority; `projections.ts` derives visual/interaction/native facts; `geometry.ts` is spatial only; `motionRecipes.ts` owns renderer choreography (spring/tween/icon-handoff values); `pointerField.ts` is the one continuous pointer coordinate authority (viewport-local MotionValues measured from the stable presentation root); `magnetic.ts` is the full-mode-only Magnetic visual consumer of the Pointer Field (renderer-local displacement, zero in compact/reduced-motion/drag states, no lifecycle or native involvement). Normal full↔compact morphs are renderer-visual-only and never change native width/height or call a renderer-facing bounds animation API. The Magnetic outer layer and the shell morph nodes own transforms on different DOM nodes; no transform is merged, mirrored, or written by two owners.

Native Main Window surface policy lives in `electron/mainWindowSurfacePolicy.mts` (compact reachability correction, monitor clamp, position-only interpolation). The renderer never requests arbitrary native width/height, target bounds, easing, or duration.

---

## Scenario: Choosing CSS vs Motion

### 1. Scope / Trigger

- Trigger: You are adding or modifying UI motion on a React surface.

### 2. Signatures

Motion import:

```tsx
import { motion, AnimatePresence } from "motion/react";
```

CSS transition pattern:

```tsx
const style: React.CSSProperties = {
  transition: "background-color 0.18s ease, border-color 0.18s ease",
};
```

Motion pattern:

```tsx
<AnimatePresence>
  {open ? (
    <motion.div
      initial={{ opacity: 0, scale: 0.965, y: -2 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.985, y: 2 }}
      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
    />
  ) : null}
</AnimatePresence>
```

### 3. Contracts

- Use CSS for single-state visual response.
- Use Motion when the element enters, exits, or switches state identity.
- Prefer `AnimatePresence` only at the boundary where presence actually changes.
- Keep transition ownership on a single wrapper layer; do not stack multiple entry animations on shell and content unless the effect is intentional.

### 4. Validation & Error Matrix

| Condition | Expected Behavior | Action |
|-----------|-------------------|--------|
| Hover/focus only | Immediate, quiet response | Use CSS transition |
| Overlay appears/disappears | Controlled mount/unmount animation | Use Motion + `AnimatePresence` |
| Shell and content both animate in on first paint | Motion feels doubled or delayed | Collapse to one animated layer |
| Same property animated by CSS and Motion | Jitter or uneven timing | Give one system sole ownership |

### 5. Good / Base / Bad Cases

- Good:
  - Button hover uses CSS.
  - Popover reveal uses one `motion.div`.
  - View switching uses `AnimatePresence mode="wait"` when needed.
- Base:
  - A small overlay only animates `opacity` and `y`.
- Bad:
  - A menu shell fades in while its children separately scale in.
  - A hover color transition is rewritten as Motion without a real need.

### 6. Tests Required

- Hover state still responds instantly.
- Mount/unmount surfaces animate once, not in layered phases.
- No visible jitter from mixed CSS/Motion ownership.

### 7. Wrong vs Correct

#### Wrong

```tsx
<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
  <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}>
    {content}
  </motion.div>
</motion.div>
```

#### Correct

```tsx
<motion.div
  initial={{ opacity: 0, scale: 0.965, y: -2 }}
  animate={{ opacity: 1, scale: 1, y: 0 }}
  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
>
  {content}
</motion.div>
```

---

## Scenario: Compact Floating Surface Motion

### 1. Scope / Trigger

- Trigger: You are animating the main floating window, a settings window, a context menu, or another compact floating surface.

### 2. Signatures

Typical reveal transition:

```tsx
transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
```

Typical compact reveal shape:

```tsx
initial={{ scale: 0.965, y: -2 }}
animate={{ scale: 1, y: 0 }}
```

Anchor rule:

```tsx
style={{ transformOrigin: "top left" }}
```

### 3. Contracts

- Compact menus and popovers should usually use eased tween transitions, not springs.
- Reserve springs for persistent state transitions where physical feedback is part of the product behavior, such as the main panel minimize/expand flow.
- Cursor-anchored surfaces must align `transformOrigin` with the actual spawn anchor.
- For menus opened from a cursor position, default to `top left` unless placement logic explicitly flips the anchor.
- Keep entry motion small. The element should feel placed, not thrown.

Recommended ranges for compact overlays:

- `duration`: `0.14` to `0.20`
- `scale` start: `0.96` to `0.985`
- `y` start: `-4` to `2`

### 4. Validation & Error Matrix

| Condition | Expected Behavior | Action |
|-----------|-------------------|--------|
| Small menu uses spring | Tail bounce reads as sloppy | Use eased tween |
| Transform origin does not match spawn point | Motion feels detached from click location | Align `transformOrigin` to anchor |
| Initial offset is too large | Menu feels theatrical or laggy | Reduce `scale`/`y` delta |
| Entry animation is applied to both shell and items | Container appears first, children lag behind | Animate the panel as one layer |

### 5. Good / Base / Bad Cases

- Good:
  - Context menu reveals as one surface from its actual anchor.
  - Menu hover states stay CSS-only while the panel reveal uses Motion.
- Base:
  - Panel uses only a slight `opacity + y` tween.
- Bad:
  - Bottom menu item appears to "bounce" because the whole menu uses a stiff spring.
  - Cursor-anchored menu scales from center or top-center.

### 6. Tests Required

- Open context menu near the cursor and confirm the reveal feels anchored to the click position.
- Open the same menu repeatedly and confirm no tail bounce appears on the lower item.
- Confirm hover states still feel immediate during and after reveal.

### 7. Wrong vs Correct

#### Wrong

```tsx
<motion.div
  initial={{ scale: 0.94, y: -3 }}
  animate={{ scale: 1, y: 0 }}
  transition={{ type: "spring", stiffness: 700, damping: 30 }}
  style={{ transformOrigin: "top center" }}
/>
```

#### Correct

```tsx
<motion.div
  initial={{ scale: 0.965, y: -2 }}
  animate={{ scale: 1, y: 0 }}
  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
  style={{ transformOrigin: "top left" }}
/>
```

---

## Scenario: Wheel-Driven Deck Motion Inside Scrollable Panels

### 1. Scope / Trigger

- Trigger: A compact card stack or deck inside a scrollable page/panel should switch cards on mouse wheel instead of letting the parent panel scroll.

### 2. Signatures

Use a native wheel listener when scroll prevention must be guaranteed:

```tsx
useEffect(() => {
  const element = deckRef.current;
  if (!element) return;

  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    event.stopPropagation();
    // accumulate delta and switch cards
  };

  element.addEventListener("wheel", handleWheel, { passive: false, capture: true });
  return () => element.removeEventListener("wheel", handleWheel, true);
}, [/* stable deps */]);
```

Visual hover contract when animation spans multiple frames:

```tsx
const isVisuallyHovered = isPointerInside || isAnimating;
const previewOpacity = isVisuallyHovered ? 0.74 : 0.62;
```

### 3. Contracts

- If the deck lives inside a scrollable settings/content panel, do not rely on React `onWheel` alone when parent scroll must be blocked. Use a native `wheel` listener with `passive: false`.
- Keep the wheel handler on the deck root, not on individual animated cards, so the switch gesture survives card re-layering during animation.
- During an in-flight deck animation, freeze hover-derived visual targets from collapsing back to the non-hover state. Pointer exit may happen mid-animation and must not retarget opacity/scale halfway through the transition.
- If reduced motion shortens the visual deck transition, any wheel/input lock timer must shrink to the same effective duration. Do not keep the deck non-interactive after the visible motion has already settled.
- Only the active/front card may receive pointer events; stacked background cards must use `pointerEvents: "none"`.
- Prefer keyed transform/opacity timelines for deck role changes (front -> back, back -> front). Do not mix deck role animation with separate hover animation ownership on the same properties.

### 4. Validation & Error Matrix

| Condition | Expected Behavior | Action |
|-----------|-------------------|--------|
| Mouse wheel over deck | Parent settings panel does not scroll | Use native `wheel` listener with `passive: false` |
| Deck cards reorder during animation | Wheel gesture still works on container | Attach listener to deck root |
| Pointer leaves deck mid-animation | Card opacity/scale does not jump or flicker | Freeze visual hover while `isAnimating` |
| Reduced motion is enabled | Wheel navigation unlocks when the shorter motion finishes | Keep timers/locks aligned with reduced-motion duration |
| Background card remains interactive | Clicks hit hidden/back card | Set `pointerEvents: "none"` on non-active cards |
| Hover styles and motion both drive opacity | Flicker or retargeting mid-transition | Give motion sole ownership of animated opacity |

### 5. Good / Base / Bad Cases

- Good:
  - Settings card deck captures wheel locally and the page stays still.
  - Pointer leaves during animation but the deck finishes on the original visual path.
  - Only the front card is clickable.
- Base:
  - Deck uses a small accumulated wheel threshold to avoid overly sensitive trackpad switching.
- Bad:
  - Parent panel scrolls even though the deck is supposed to own the gesture.
  - Preview card flickers because hover opacity changes while the card is moving to the back layer.
  - Both front and back cards accept clicks during animation.

### 6. Tests Required

- Hover the deck and scroll: confirm the parent panel does not move.
- Start a card switch and move the pointer out before the animation ends: confirm no flicker or sudden opacity jump appears.
- Enable reduced motion and switch cards: confirm wheel/input unlocks as soon as the shorter motion completes.
- Click the preview/background card area: confirm only the active card can receive input.
- Use a small trackpad wheel gesture: confirm the deck does not over-switch from a tiny delta burst.

### 7. Wrong vs Correct

#### Wrong

```tsx
<div onWheel={(event) => event.preventDefault()}>
  <motion.div animate={{ opacity: isHovered ? 0.74 : 0.62 }} />
</div>
```

Why wrong:
- React `onWheel` may not be sufficient to suppress parent scrolling in a nested scroll region.
- Hover state can retarget opacity while the motion transition is still running.

#### Correct

```tsx
useEffect(() => {
  const element = deckRef.current;
  if (!element) return;

  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  element.addEventListener("wheel", handleWheel, { passive: false, capture: true });
  return () => element.removeEventListener("wheel", handleWheel, true);
}, []);

const isVisuallyHovered = isPointerInside || isAnimating;
```

---

## Scenario: Transparent Child Window First Paint

### 1. Scope / Trigger

- Trigger: A transparent desktop child window such as `/settings` or `/context-menu` is being rendered.

### 2. Signatures

Window creation:

Current implementation detail may vary by Electron window creation helpers; the motion contract is about first paint and panel animation behavior, not a specific framework constructor.

Theme hydration:

```tsx
<ThemeProvider initialTheme={initialTheme}>
  <BrowserRouter>{children}</BrowserRouter>
</ThemeProvider>
```

### 3. Contracts

- Resolve persisted theme before first React render for transparent child windows.
- Do not render the whole window shell from `opacity: 0` if that creates a visible first-frame flash.
- The transparent outer root may stay stable while the visible panel surface animates.
- If the window contains a single compact panel, animate that panel as a unit instead of staggering shell and content.

### 4. Validation & Error Matrix

| Condition | Expected Behavior | Action |
|-----------|-------------------|--------|
| Theme defaults to black before white config loads | One-frame flash on white theme | Preload theme before render |
| Entire transparent wrapper fades from 0 | Window appears to flicker | Keep wrapper stable and animate visible panel |
| Panel and children animate separately | Shell/content mismatch | Use one animated panel surface |

### 5. Good / Base / Bad Cases

- Good:
  - Settings window opens directly in the persisted theme.
  - Context menu appears without a transparent flicker.
- Base:
  - Transparent wrapper is static and only the panel animates.
- Bad:
  - Transparent child window renders black first and corrects on the next frame.

### 6. Tests Required

- Open settings in white theme and verify there is no black-frame flash.
- Open the context menu repeatedly and verify no first-frame transparent flicker appears.

### 7. Wrong vs Correct

#### Wrong

```tsx
<ThemeProvider>
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
    <Panel />
  </motion.div>
</ThemeProvider>
```

#### Correct

```tsx
<ThemeProvider initialTheme={initialTheme}>
  <div style={{ background: "transparent" }}>
    <motion.div
      initial={{ scale: 0.965, y: -2 }}
      animate={{ scale: 1, y: 0 }}
    >
      <Panel />
    </motion.div>
  </div>
</ThemeProvider>
```

---

## Scenario: Compact Main Window Hover / Expand / Collapse Handoff

### 1. Scope / Trigger

- Trigger: The 200x200 main window expands from icon mode on pointer enter and collapses back on pointer leave or idle.

### 2. Signatures

Lifecycle intent from application code:

```tsx
presentation.dispatch({ type: "requestFull", reason: "task", recipe: "instant" });
```

Pointer/drop facts and visual completion flow into the same reducer:

```tsx
presentation.dispatch({ type: "pointerEnter" });
presentation.dispatch({ type: "pointerLeave" });
presentation.dispatch({ type: "dropEnter" });
// Surface Motion completion reports its transition epoch:
presentation.dispatch({ type: "visualTransitionCompleted", target: "compact", epoch });
```

### 3. Contracts

- The lifecycle reducer (`src/presentation/main-window/lifecycle.ts`) is the only writable compact/full/transition authority. `App.tsx` issues intent-level facts and requests only; it never owns collapse timers, completion handoff, native sequencing, hotspot evaluation, or Motion recipe assembly.
- Do not treat `onMouseLeave` as the sole source of truth for compact-window collapse. Leave is one signal; the reducer gates it against phase and pointer truth, and the native pointer-boundary subscription (with a listener-generation guard) supplies the same fact channel during transparent-window morphs.
- If pointer exit happens while the expand morph is still running, the reducer records pointer-outside without interrupting the expand; the matching expand completion starts normal collapse pending. Do not land on a steady full window for one frame and then collapse.
- Pointer enter/leave is the primary compact/full contract: entering the compact icon expands immediately, and leaving an unlocked full shell must collapse through the short leave grace window (80 ms) without waiting for a longer idle path. First launch is not exempt from this rule.
- There is no normal 3-second idle collapse contract for compact/full switching.
- The compact transition has exactly one acknowledgement: the matching Renderer Motion collapse completion, checked against the lifecycle epoch. Stale completions after reversal are ignored. Native compact reachability correction is independent, cancellable OS work; it never completes or gates the lifecycle or passthrough. There is no `nativeSettled` state.
- Windows compact passthrough activates only after the matching collapse completion (one edge-triggered `native.setInteraction` effect) and never flips during collapse; the pure interaction projection independently reports `compact-passthrough` for settled compact.
- Before the main window settles into compact/icon mode, the native surface policy (`electron/mainWindowSurfacePolicy.mts`) clamps the compact frame into the current monitor work area with position-only interpolation. Returning to interactive mode cancels any active correction.
- Normal full↔compact morphs keep one stable BrowserWindow viewport and never send per-frame native bounds updates from the renderer. The renderer cannot request arbitrary native width/height, target bounds, easing, or duration.
- Keep the minimized `AnimatePresence` container visually stable during the shell collapse, then trigger a small pulse on the visible inner icon wrapper only after the lifecycle reaches `compact` (keyed by the settle epoch). This avoids racing the icon animation against the panel shell `clipPath` / radius morph.
- Pointer-leave collapse must be guarded while pointer-down, drag-threshold pending, or active drag state exists (the `drag` lock). Do not allow leave handling to cancel window dragging.
- The leave-delay grace window is one cancelable 80 ms timer owned by the effect executor; re-entry cancels it. Do not scatter independent leave timers across handlers.
- Hover response may stay immediate on enter, but leave grace for this compact surface should remain short and intentional. Keep the `80 ms` timer value in the lifecycle effect contract.

### 4. Validation & Error Matrix

| Condition | Expected Behavior | Action |
|-----------|-------------------|--------|
| Pointer exits during expand morph | Expand finishes cleanly, then collapse continues without a full-window flash | Decide collapse in morph-complete handoff |
| Pointer briefly slips out and back in | Collapse is canceled and window stays expanded | Use one cancelable leave-delay timer |
| Pointer leaves while drag gesture is starting | Window drag continues; leave handling does not interrupt | Guard leave handling on pointer-down / pending drag / active drag |
| Post-task unlock runs after hover state drift | Window uses real hover truth, not stale React state | Reconcile with `matches(":hover")` before collapse |
| External dragover expands the compact shell without firing a real pointer enter | Expand morph stays open through the drop instead of collapsing mid-drag | Hold a dedicated drag-hover ref and treat it as hover ownership until `drop`/`dragleave` |
| A stale compact completion resolves after a newer full request | Passthrough and compact state must not apply to a newer full surface | Epoch-check the Renderer Motion completion in the lifecycle; stale completions after reversal are ignored |
| Full shell is dragged partly outside the display before collapse | Compact icon remains visible and reachable inside the current work area | Native surface policy clamps the compact frame into the monitor work area (position-only) |
| macOS collapse shows icon drift or last-frame flicker | One shell stays visually anchored through the morph | Keep one shell surface active; the icon plate appears only after lifecycle compact (settle epoch pulse), never tied to native bounds |
| Full-mode rounded shadow or scale overshoot clips into straight corners | Native full viewport has no gutter for transparent-window drawing | Restore full-mode shadow gutter through `getMainWindowFullOuterSize(...)` while keeping visible panel `200x200` |
| Compact icon elasticity causes outline shimmer or thickening | Elasticity was applied to the panel shell layer that draws the outline | Move elasticity to a post-collapse inner icon wrapper pulse |
| Center icon flashes during full -> compact collapse | Icon enter keyframes overlap with shell `clipPath` / radius morph | Keep the outer icon container stable during collapse and pulse only after the lifecycle reaches `compact` (settle epoch) |
| Enter feels laggy | Window feels sticky or slow | Keep enter immediate; do not mirror leave delay onto enter |

### 5. Good / Base / Bad Cases

- Good:
  - Rapid icon -> panel -> leave results in one continuous motion path without flashing.
  - An 80ms leave grace absorbs accidental slips while keeping the panel responsive.
  - Dragging the main window across its edge does not collapse the shell.
  - On macOS, the cat icon does not jump at the end of full-window -> icon collapse because the icon pulse only appears after the lifecycle reaches compact (settle epoch), independent of native bounds — the BrowserWindow viewport stays stable full.
- Base:
  - Leave delay exists only on collapse, not on expand.
- Bad:
  - A fix only changes one timer while leaving expand-complete handoff unchanged.
  - Hover is stored in React state only and never reconciled after morphs.
  - Pointer leave fires during drag startup and collapses the panel before drag begins.

### 6. Tests Required

- Rapidly enter and leave from icon mode: verify no one-frame flash of the full panel appears.
- Repeated icon -> panel -> leave cycles: verify collapse remains consistent after many repetitions.
- On macOS, verify the cat icon stays centered through the last collapse frames and no extra inset jump appears when the compact shell settles.
- Drag the full shell against each display edge, then collapse: verify the compact icon remains inside the active monitor work area.
- Trigger compact -> expand -> compact -> expand stress cycles and verify a stale compact completion (epoch mismatch) cannot enable passthrough or collapse a newer full surface.
- Start dragging the main window and cross the panel edge: verify dragging still works and collapse does not interrupt it.
- Drag a web image or video into icon mode: verify the window expands once, does not bounce back to compact during the drag, and does not end stuck in the full window because of a stale collapse decision.
- Leave and re-enter within the leave-delay window: verify collapse is canceled.
- Finish a foreground task while the pointer is already outside the panel: verify collapse resumes promptly without waiting for idle.
- When tuning full-mode elasticity, verify Windows and macOS full rounded shadows are not clipped and the visible panel body remains aligned inside the larger native viewport.
- When tuning compact icon elasticity, verify the Windows compact outline stays stable and the pulse is disabled under reduced motion.
- Capture or inspect rapid full -> compact cycles when changing compact icon handoff timing; no center-icon partial-opacity or partial-scale flicker frame should appear during the shell morph.

### 7. Wrong vs Correct

#### Wrong

```tsx
onMouseLeave={() => {
  setIsPanelHovered(false);
  collapseMainWindowToIcon();
}}
```

Why wrong:
- Leave is treated as authoritative even when the shell is mid-morph or drag preparation is active.
- Fast exit can cause expand and collapse animations to fight each other.

#### Correct

```tsx
// No App-owned leave timer at all: the lifecycle emits collapseTimer.start /
// collapseTimer.cancel effects and the effect executor owns the single
// cancelable 80 ms timer, reporting the timer epoch back. Re-entry cancels
// it; the drag lock gates collapse inside the reducer.
```
