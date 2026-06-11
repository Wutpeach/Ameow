# Main Floating Window Motion Phase 2 Research

## Local Architecture Snapshot

### Current Size Model

Source: `src/constants/windowMetrics.ts`

- Full panel content: `MAIN_WINDOW_PANEL_SIZE = 200`
- Compact visual shell: `MAIN_WINDOW_COMPACT_SHELL_SIZE = 60`
- Windows compact outer frame: `MAIN_WINDOW_DEFAULT_COMPACT_OUTER_SIZE = 80`
- macOS compact outer frame: `MAIN_WINDOW_MACOS_COMPACT_OUTER_SIZE = 88`
- macOS full shadow gutter: `MAIN_WINDOW_MACOS_FULL_SHADOW_GUTTER = 14`

Implication:

- Full mode and icon mode are not only two visual states; they are different native window sizes.
- macOS has extra outer-space requirements for renderer-owned shadow that Windows does not.

### Current Decision Layer

Source: `src/utils/mainWindowShellMachine.ts`

Existing phases:

- `compact`
- `expanding`
- `full`
- `collapsePending`
- `collapsing`

Existing locks:

- `drag`
- `contextMenu`
- `task`
- `drop`
- `startup`
- `centerOutcome`
- `uiLab`
- `appUpdate`

The state machine is valuable and should not be discarded lightly. It already handles:

- pointer enter expands immediately
- pointer leave starts a short collapse timer
- pointer leave during expand waits for expand completion
- locks block collapse
- drop hover keeps full mode until the drop lock clears

### Current Native Bounds Layer

Source: `electron/main.mts`

The app exposes `ameow:current-window:animate-bounds`. Electron main calls a custom `animateBrowserWindowBounds(...)` loop:

- stops any active bounds animation for the window
- reads `win.getBounds()`
- interpolates `x`, `y`, `width`, and `height`
- calls `win.setBounds(..., false)` around 60 times per second
- finishes by setting exact final bounds

Renderer callers attach transition tokens so stale completions cannot mutate renderer state.

Implication:

- Cross-platform native motion is already app-owned, not Electron-native.
- Phase 2 should preserve token ownership and avoid adding a second animation owner.
- Phase 2 must first baseline when native bounds are actually changed today. Current native bounds changes are not automatically equivalent to every renderer full/icon visual morph; they also cover startup normalization and compact visibility clamping.

### Current Native Bounds Call-Site Baseline

Sources: `src/App.tsx`, `electron/main.mts`, `src/constants/windowMetrics.ts`

Current-code baseline before Phase 2 implementation:

| Path | Current native bounds behavior | Phase 2 implication |
|---|---|---|
| Main window creation | Electron creates the main `BrowserWindow` with `getMainWindowOuterSize(platform, startupWindowMode)`. `resolveMainWindowStartupMode(...)` currently returns `full`, so normal startup creates a full outer window. | Do not assume compact native startup is active unless the code path is re-enabled. Preserve the dormant startup path but baseline against current behavior. |
| Compact startup normalization | If renderer detects native compact startup, `resizeMainWindowPreservingPosition(INTERMEDIATE_EXPAND_SIZE, INTERMEDIATE_EXPAND_SIZE)` calls `animateBounds(..., { durationMs: 0 })`. | Treat this as startup normalization, not the normal hover expand path. |
| `requestExpand` shell effect | Advances the bounds transition token to `full`, clears pending compact clamp token, switches renderer visual state, but does not directly call `animateBounds(...)`. | Do not add a new native resize to hover expand unless a later baseline proves it is required. |
| `requestCollapse` shell effect | Advances the bounds transition token to `compact`, starts `ensureMainWindowCompactTargetVisible(...)`, switches renderer visual state, and waits for Motion completion before compact passthrough. | Separate compact visibility movement from visual collapse. Do not treat it as native size shrink. |
| Compact visibility clamp | Reads current outer position/size, clamps `x/y` using `ICON_SIZE` as the visible/reachable frame, and calls `animateBounds(...)` only when position must move. Width/height remain the current native size. | Geometry must model the difference between native outer bounds and the user-reachable compact frame used for monitor clamping. |
| Foreground task restore | `prepareMainWindowForForegroundTask()` dispatches `forceFull`, and only calls `ensureMainWindowFullMode(...)` when renderer state is minimized. The current helper primarily restores renderer full-mode state and focus behavior. | Include task/outcome restore in the baseline, but avoid assuming it always performs a native full resize. |
| Shortcut show | Electron may reposition the window, then renderer refreshes cached outer position before forcing full mode. | Geometry/native orchestration must keep position cache refresh as a separate invariant. |

This baseline also exposes a documentation risk: older backend spec text still describes short icon-mode native morphs as `80x80 <-> 200x200`. Phase 2 should not implement from that historical description blindly. The first implementation step must reconcile current code, tests, and specs before changing call sites.

### Current Visual Layer

Source: `src/App.tsx`

The rendered shell uses two synchronized `motion.div` layers:

- a shadow backdrop layer
- the actual panel shell layer

Both animate derived values such as:

- `scale`
- `borderRadius`
- `x`
- `y`
- `width`
- `height`

The panel also changes CSS box shadow through CSS transition.

The current visual transition shape includes:

- initial mount tween
- compact/minimized tween
- full-panel spring
- minimized icon opacity/scale handoff
- instant panel transition mode during collapse completion
- CSS-owned box-shadow changes for panel/shadow intensity

Implication:

- Shadow and panel can drift if they do not share one geometry plan.
- Motion currently owns some layout-like properties because the real native window size is also changing.
- The behavior-preserving milestone must name and preserve these existing timing/ownership choices before any visual tuning.

### Current Interaction Layer

Sources:

- `src/utils/compactPointerHotspot.ts`
- `electron/main.mts`
- `.trellis/spec/backend/electron-runtime-contracts.md`

Compact hotspot uses enter/exit radius hysteresis:

- enter radius applies while pointer was outside
- exit radius applies while pointer was inside

Compact passthrough is implemented through Electron:

- allowed: `win.setIgnoreMouseEvents(true, { forward: true })`
- allowed: `win.setFocusable(false)`
- forbidden: `win.blur()`

Implication:

- Transparent region behavior must be treated as native interaction state, not CSS.
- Hit testing must be part of the shell architecture.

## External Electron Constraints

### Transparent Window Limits

Electron's official custom-window-styles guide says transparent windows have important limits:

- users cannot click through the transparent area by default
- transparent windows are not resizable
- macOS does not show native window shadow on transparent windows

Source: https://electronjs.org/docs/latest/tutorial/custom-window-styles

Implication for Ameow:

- The app must keep explicit click-through / passthrough handling.
- The app's custom shadow strategy is not optional on macOS transparent windows.
- Native resizing must be treated carefully because transparent windows have platform caveats.

### Mouse Event Passthrough

Electron's `BrowserWindow.setIgnoreMouseEvents(ignore, options)` supports `forward` on macOS and Windows. With forwarding enabled while ignoring mouse events, mouse movement can still reach Chromium so events such as `mouseleave` can be emitted.

Source: https://electronjs.org/docs/latest/api/browser-window

Electron's custom-window-interactions guide demonstrates toggling `setIgnoreMouseEvents(true, { forward: true })` for click-through regions.

Source: https://electronjs.org/docs/latest/tutorial/custom-window-interactions

Implication for Ameow:

- Compact passthrough must remain explicit.
- Forwarded movement is useful but should not be the only source of truth; the existing pointer-boundary / hotspot logic still matters.

### Bounds Animation

Electron's `BrowserWindow.setBounds(bounds[, animate])` has an `animate` parameter only on macOS. The same is true for `setSize`, `setPosition`, and `setContentBounds` animation parameters.

Source: https://www.electronjs.org/docs/latest/api/browser-window

Implication for Ameow:

- Cross-platform full/icon motion cannot rely on native animated `setBounds(..., true)`.
- The existing custom `animateBounds` loop is consistent with the app's cross-platform requirement.

## Current Risk Hypothesis

The highest-risk part of Phase 2 is not the animation curve. The risk is ownership overlap:

- state machine decides phase
- `App.tsx` effect runner mutates renderer visual state and refs
- Electron main animates native bounds
- Motion animates visual shell
- CSS transitions animate shadow
- passthrough changes native hit testing

Phase 2 should reduce the number of places that derive geometry and interaction state.

## Hidden Risk Areas To Carry Into Design

1. Native bounds path inflation.
   - The refactor may accidentally convert visual-only hover expand/collapse into native resize work.
   - Mitigation: current-code call-site inventory must be checked before every replacement.

2. Timing type mismatch.
   - Current renderer visual motion mixes tween and spring transitions, while native bounds use duration-based interpolation.
   - Mitigation: `TransitionPlan` must support both native duration/easing and renderer transition descriptors instead of flattening everything into one duration.

3. Compact clamp cancellation.
   - A stale compact visibility move can resolve after a newer full transition.
   - Mitigation: compact clamp must keep transition-token or epoch guards and must not commit cached position after the token is stale.

4. Shadow ownership overlap.
   - Motion controls geometry while CSS controls `box-shadow`.
   - Mitigation: first milestone preserves the existing ownership; later tuning must choose one owner for any property being tuned.

5. Hotspot frame vs native frame.
   - Compact monitor clamping currently uses the reachable icon frame, not necessarily the native outer bounds.
   - Mitigation: geometry must expose native bounds, visual shell, shadow shell, and hotspot/reachable frames separately.

6. Spec drift.
   - Existing specs may contain historical contracts that are wider than current code.
   - Mitigation: Phase 2 should update specs only after current behavior is verified and intentionally preserved.

## Animation Framework Feasibility

The user prefers one animation framework if possible, because one framework sounds easier to manage.

Motion for React can cover renderer-side visual morphs:

- `motion.div` can animate explicit `x`, `y`, `width`, `height`, `scale`, `borderRadius`, and opacity.
- Motion layout animations can animate an element's size and position when React layout changes.
- `LayoutGroup` can coordinate related layout animations.

However, Electron `BrowserWindow` bounds are not DOM layout. Motion components cannot directly animate the native window rectangle. Any single-framework approach would still need a bridge from the animation runtime to Electron main.

Potential approaches:

1. Use Motion only for visual shell, keep native bounds in Electron main.
   - This is the current architectural shape.
   - Phase 2 can make it safer by sharing one geometry plan and shared timing tokens.

2. Use Motion imperative values in the renderer and send per-frame bounds updates to Electron.
   - This would look like a single animation framework.
   - It would move native-window animation timing across renderer-to-main IPC every frame.
   - This is likely riskier for jank, stale callbacks, and platform timing than the current main-process `animateBounds` adapter.

3. Keep native bounds animation in Electron main but make it consume the same geometry and timing tokens as Motion.
   - This is not one physical runtime, but it is one logical motion contract.
   - Recommended for Phase 2.

Conclusion:

Phase 2 should not attempt to force the native window animation into a React animation component. The safer target is one motion model and geometry plan, with two executors: renderer Motion for visual shell and Electron main for native bounds.

## Research Conclusion

The safe path is not a big-bang rewrite. The safe path is to introduce a single shell geometry plan and route existing owners through it gradually:

1. Keep the existing shell state machine.
2. Extract geometry planning as a pure, tested module.
3. Make native bounds and visual shell consume the same plan.
4. Keep passthrough/hit-test behavior as an explicit state transition.
5. Only after these owners are aligned, tune visual motion.

## Claude Architecture Review

Claude reviewed the Phase 2 motion architecture and agreed with the core direction:

- Do not drive Electron `BrowserWindow` bounds from Motion for React through per-frame renderer-to-main IPC.
- Motion for React can remain the renderer visual executor.
- Electron main should remain the native bounds executor.
- Other animation frameworks such as react-spring, GSAP, or Web Animations API do not remove the native process boundary; they would still need per-frame IPC or a native adapter.

Additional risks identified:

1. Timing drift between executors.
   - Renderer Motion and Electron main bounds animation use different frame loops.
   - Mitigation: shared timing values and transition-token guards must apply to both executors.

2. Compact visibility clamping can fight expand.
   - `ensureMainWindowCompactTargetVisible(...)` starts a native bounds move after collapse.
   - A fast re-enter/expand must cancel or ignore stale compact visibility moves.

3. CSS box-shadow transitions can fight Motion geometry.
   - The panel shell currently uses Motion for geometry and CSS transition for `box-shadow`.
   - Before visual tuning, shadow intensity should either be owned by Motion or derived from the same geometry/timing plan.

4. macOS shadow gutter needs intermediate-state handling.
   - The full shadow gutter is `14`, compact uses different outer sizing.
   - Geometry should eventually model the inset/gutter continuum, not only compact/full endpoints.

5. Hotspot active state is not geometry.
   - Geometry can describe hotspot frame and radii.
   - The shell decision/interaction owner should decide when hotspot evaluation is active.

6. The geometry plan needs timing.
   - Add a timing contract such as `durationMs` and `easing`.
   - Both visual and native executors should consume it before visible motion tuning begins.
