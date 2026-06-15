# Main Floating Window Motion Phase 2 Design Draft

## Design Principle

The main floating window should be treated as a shell system with five owners:

1. shell decision
2. geometry
3. native bounds
4. visual motion
5. interaction / hit testing

Phase 2 should make these owners explicit. Smoothness should come from consistency between owners, not from forcing longer or more decorative animation.

The first Phase 2 milestone must preserve current behavior and should not intentionally change the visible motion. This is a safety constraint because the current shadow, click-through, bounds animation, and platform-specific handling are the result of prior bug fixes.

Although a single animation framework is desirable, Phase 2 should distinguish between a single logical motion model and a single physical runtime. The renderer visual shell can use Motion for React, but the native Electron window bounds cannot be safely treated as a DOM layout animation. The recommended architecture is one shared geometry/timing contract consumed by two executors:

- renderer Motion for visual shell
- Electron main `animateBounds` adapter for native bounds

## Proposed Ownership Model

### 1. Shell Decision Owner

Existing module:

```text
src/utils/mainWindowShellMachine.ts
```

Responsibility:

- decide shell phase
- track pointer/drop/task/startup locks
- produce high-level effects such as request expand/collapse

Phase 2 stance:

- keep this module
- extend tests before changing behavior
- avoid moving platform geometry into this module

### 2. Geometry Owner

Proposed module:

```text
src/utils/mainWindowShellGeometry.ts
```

Responsibility:

Given platform, shell mode, current position, monitor, startup/native mode facts, and current native size when needed, produce a single spatial plan:

```ts
type MainWindowShellGeometryPlan = {
  mode: "compact" | "full";
  nativeBounds: { x: number; y: number; width: number; height: number };
  viewportSize: number;
  visualShell: {
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
    clipPath: string;
  };
  shadowShell: {
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
  };
  hotspot: {
    frameSize: number;
    centerX: number;
    centerY: number;
    enterRadius: number;
    exitRadius: number;
  };
};
```

Geometry should stay pure and spatial. Transition tokens and executor lifecycle data belong outside geometry. Timing belongs in a separate transition plan that references the geometry:

```ts
type MainWindowShellTransitionPlan = {
  token: number;
  targetMode: "compact" | "full";
  geometry: MainWindowShellGeometryPlan;
  timing: {
    native: {
      durationMs: number;
      easing: "currentBoundsEase" | "instant";
    };
    visual:
      | { kind: "instant" }
      | { kind: "tween"; durationMs: number; easing: "compact" | "initial" }
      | { kind: "spring"; stiffness: number; damping: number };
    icon:
      | { kind: "hidden" }
      | { kind: "currentMinimizedIconHandoff" };
  };
};
```

This separation keeps geometry testable while still giving native bounds and renderer visual motion one shared transition contract. The timing shape must preserve that renderer visual motion currently mixes spring and tween descriptors; it should not flatten the visual executor into a duration-only model.

Notes:

- This should be a pure module with unit tests.
- It should encode macOS shadow gutter and compact outer-size differences in one place.
- It should consume or reuse existing helpers such as `resolveMainWindowCompactVisibilityBounds(...)`.
- It should describe spatial geometry only, not token lifecycle or executor completion state.
- It should not decide whether the hotspot is active. Hotspot activation belongs to the shell decision / interaction layer.
- A separate transition plan should carry timing so native bounds and renderer visual motion do not silently drift through different duration/easing assumptions.
- It should distinguish native outer bounds, visual shell bounds, shadow shell bounds, hotspot bounds, and compact reachable/clamp bounds. These are related but not interchangeable.

### Current Baseline Constraints

Before implementation starts, the refactor must preserve these current-code observations:

- Normal main-window startup currently resolves to a full native outer window.
- Compact native startup handling exists but appears dormant in the normal startup mode path.
- Hover `requestExpand` currently advances a `full` token and switches renderer visual state, but does not directly call native `animateBounds(...)`.
- Hover `requestCollapse` currently advances a `compact` token, starts compact visibility clamping, switches renderer visual state, and enables compact passthrough only after collapse completion.
- Compact visibility clamping moves position only when needed and uses `ICON_SIZE` as the visible/reachable compact frame.
- Foreground task restore and shortcut show are shell restore/synchronization paths that must remain distinct from hover expand/collapse.
- Existing visual timing includes initial tween, compact tween, full spring, minimized icon handoff, instant collapse-complete handoff, and CSS-owned shadow transitions.

These constraints should be treated as Phase 2's behavior snapshot. If implementation discovers a different behavior, update this document before continuing.

### 3. Native Bounds Owner

Existing layer:

```text
electron/main.mts
src/desktop/runtime.ts
src/types/electronBridge.ts
```

Responsibility:

- perform native window bounds changes
- stop prior native bounds animations
- return transition token to renderer

Phase 2 stance:

- keep one native bounds owner
- preserve transition tokens
- do not use native `setBounds(..., true)` for cross-platform animation
- consume shared plan timing instead of relying on implicit defaults
- cancel or ignore stale compact visibility adjustment when a newer expand transition starts
- avoid adding native bounds changes to visual-only renderer morphs unless the baseline proves the current behavior already does so
- consider moving renderer-side request orchestration into a small hook after geometry is extracted

### 4. Visual Motion Owner

Current location:

```text
src/App.tsx
```

Future shape:

```text
src/components/main-window/MainWindowShell.tsx
```

Responsibility:

- render shadow layer and panel shell
- animate from previous geometry plan to next geometry plan
- use shared Phase 1 motion tokens where appropriate
- keep shadow and panel synchronized through the same plan
- avoid splitting geometry and shadow into separate timing owners

Phase 2 stance:

- do not extract this first
- extract only after the geometry owner exists
- avoid changing visual behavior until native and visual plans are aligned
- before visual tuning, resolve whether panel `box-shadow` remains CSS-transitioned or moves under the visual motion owner

### 5. Interaction / Hit-Test Owner

Existing pieces:

- `src/utils/compactPointerHotspot.ts`
- `electron/main.mts` interaction mode IPC
- `src/App.tsx` pointer refs and `setInteractionMode(...)`

Responsibility:

- decide when compact passthrough is enabled
- decide which compact region wakes the app back to full mode
- keep transparent regions click-through when compact
- keep interactive regions clickable when full

Phase 2 stance:

- keep `setIgnoreMouseEvents(true, { forward: true })` and `setFocusable(false)` as the supported compact passthrough path
- never reintroduce `blur()`
- keep hotspot hysteresis explicit and tested
- evaluate hotspot only when the shell phase/interaction mode allows it; do not infer active state from geometry target mode alone

## Suggested Milestones

### Milestone 1: Baseline And Guard Tests

Add or review tests for:

- shell machine fast enter/leave
- drop lock lifecycle
- task / center outcome lock lifecycle
- compact hotspot hysteresis
- compact bounds clamping
- transition token stale completion
- shell-related native bounds call sites and whether they are startup normalization, compact visibility clamping, or true mode transition work
- current renderer visual timing descriptors and minimized icon handoff, recorded as named constants or plan outputs without changing values
- spec/code reconciliation for any stale `80x80 <-> 200x200` native morph wording

No behavior changes.

### Milestone 2: Geometry Plan Extraction

Create `mainWindowShellGeometry.ts` and tests.

No renderer behavior changes except replacing scattered calculations with the pure plan.

The first implementation can introduce both `GeometryPlan` and `TransitionPlan`, but geometry itself should not carry tokens, timing, reduced-motion decisions, or executor lifecycle fields.

### Milestone 3: Native Bounds Request Wrapper

Create a small renderer helper/hook that accepts a geometry plan and owns:

- `beginMainWindowBoundsTransition(...)`
- native `animateBounds(...)`
- stale token rejection
- compact visibility clamping

No visual behavior tuning yet.

### Milestone 4: Visual Shell Plan Consumption

Make shadow layer and panel layer consume the same geometry plan.

Goal:

- eliminate shadow/panel drift
- reduce duplicated x/y/width/height/radius derivation
- preserve current visual timings
- clarify box-shadow ownership before any visible tuning
- keep CSS `box-shadow` behavior equivalent unless this milestone explicitly moves the same property under Motion ownership with a dedicated visual regression check

### Milestone 5: Motion Tuning

Only after owner alignment:

- tune expand/collapse durations
- tune shell radius/clip transition
- tune icon handoff
- tune shadow intensity during morph

This is where the user-facing "smoother" effect should happen.

## Regression Matrix

| Area | Must Preserve |
|---|---|
| macOS shadow | no native-shadow assumption on transparent window; custom shadow stays stable |
| Windows passthrough | compact transparent gutter does not steal clicks |
| Full/icon sync | native bounds and visual shell reach the same target mode |
| Fast pointer movement | no flash when pointer enters then leaves during expand |
| Drop hover | window expands and stays full through drop lifecycle |
| Drag | pointer leave does not interrupt window dragging |
| Task/outcome lock | foreground work can force full and later return compact if appropriate |
| Monitor edge | compact frame remains visible after collapse |
| Reduced motion | native/visual motion shortens or snaps consistently |
| Timing drift | native bounds and visual shell consume the same duration/easing contract |
| Compact visibility move | stale compact clamping cannot fight a newer expand transition |
| Spec drift | implementation follows current verified behavior, not stale historical wording |
| Visual timing preservation | first milestone does not alter existing spring/tween/icon/shadow timing |

## Ambiguities And Required Decisions Before Implementation

1. Spec reconciliation.
   - Ambiguity: backend spec text still references short native `80x80 <-> 200x200` morphs, while current renderer call sites do not show a direct hover expand native resize.
   - Required action: document the current behavior with tests or code comments before refactoring. If the spec is stale, update it after the behavior-preserving milestone.

2. Geometry inputs.
   - Ambiguity: geometry needs current position, platform, monitor, reduced-motion preference, startup mode, shell target, and possibly current native size.
   - Required action: define the geometry input type before writing plan output types so the module stays pure and testable.

3. Transition completion ownership.
   - Ambiguity: native completion, visual Motion completion, and shell phase completion can all be asynchronous.
   - Required action: define which completion is allowed to commit shell phase, interaction mode, cached window position, and visual flags.

4. Reduced motion.
   - Ambiguity: native duration may snap to `0`, while renderer visual states may still use tiny nonzero durations for opacity handoff.
   - Required action: encode reduced-motion decisions in `TransitionPlan` and test native/visual consistency.

5. macOS verification.
   - Ambiguity: Windows can be verified locally, but macOS shadow gutter and native transparency behavior are platform-sensitive.
   - Required action: mark macOS manual verification as a release gate for the milestone or arrange a separate macOS validation pass.

## Key Open Design Question

Should Phase 2 first be behavior-preserving architecture only, or should it include visible motion tuning in the same implementation sequence after geometry extraction?

Recommended answer:

Start with behavior-preserving architecture. Add visible tuning only after the geometry/native/visual owners share the same plan and tests pass.

User decision:

Phase 2 starts with behavior-preserving architecture only. Do not pursue visual polish until a later milestone.

Claude review update:

The plan should be adjusted so hotspot active/inactive state is not part of geometry. Geometry remains spatial; shell phase/interaction owns whether hotspot evaluation is active. The plan should also include timing so renderer Motion and Electron native bounds consume a shared duration/easing contract.

## Addendum: Center Overlay State Model

Discovery on 2026-06-15 found a separate but related motion-state issue in the center overlay region of the main floating window.

Current center visuals are driven by several parallel sources in `src/App.tsx`:

- primary task progress from `primaryTask`
- foreground task outcome through `isProcessing` and `isForegroundTaskOutcomeVisible`
- folder outcome through `centerOutcome`
- minimized icon state through `visualIsMinimized`

This allows stale short-lived outcomes, such as a completed-download checkmark, to remain mounted while a new download progress state appears. `ForegroundOutcomeOverlay` also uses a fixed internal key, so Motion can reuse animation state across logically different outcome events. Folder outcomes have a timer but no request/epoch guard, so rapid folder-drop feedback has the same class of lifecycle risk.

Phase 2 should treat the center overlay as a single-owner visual state machine. The state model should be systematic rather than event-specific patching.

### Center Overlay Owner

Proposed pure state module:

```text
src/utils/centerOverlayState.ts
```

Responsibility:

- model transient center outcomes and processing phases
- issue request ids / epochs for every transient outcome
- select one center visual owner from task progress, transient outcome, and minimized icon facts
- expose whether the center overlay should hold the main shell in full mode

This module should not own:

- queue truth
- download/transcode progress maps
- Electron bridge calls
- timers
- Motion transition objects
- shell geometry

Progress remains derived from existing queue and progress data. The center overlay reducer owns only transient processing/outcome lifecycle.

### Required State Shape

The model must distinguish these states:

- `idle`
- `task-processing`: long-running foreground work such as image/clipboard save, shown as an indeterminate center spinner
- `task-outcome-loading`: short preparation/ring phase before success/error icon reveal
- `task-outcome-visible`: visible success/error/cancelled outcome
- `folder-outcome-visible`: visible folder success/error outcome

Each transient state must carry a `requestId`. Timer callbacks must validate the request id before mutating state.

### Single Visual Selector

The render path should compute a single discriminated union, for example:

```ts
type CenterOverlayVisual =
  | { kind: "task-progress"; key: string }
  | { kind: "task-processing"; key: string }
  | { kind: "task-outcome"; key: string; requestId: number }
  | { kind: "folder-outcome"; key: string; requestId: number }
  | { kind: "minimized"; key: string }
  | { kind: "none" };
```

Priority should be explicit:

1. active task progress
2. active task processing/outcome
3. folder outcome
4. minimized icon
5. none

New download or transcode progress must preempt stale task or folder outcomes. The compact UI should show the current work truthfully instead of preserving a previous checkmark dwell at the cost of overlap.

### Rendering Contract

The center region should render through one host component / one `AnimatePresence` boundary:

```text
src/components/main-window/CenterOverlayHost.tsx
```

or an equivalent local component if extraction is deferred.

The host should use the selected visual key, such as:

- `progress:<traceId>`
- `task-processing:<requestId>`
- `task-outcome:<requestId>`
- `folder-outcome:<requestId>`
- `minimized`

`ForegroundOutcomeOverlay` should become outcome content rather than a second owner of outer presence. Its ring-to-icon choreography can remain local, but the host should own mount/unmount and identity.

### Shell Lock Contract

The existing `isProcessing` behavior is not just visual state. It also helps hold the shell in full mode while foreground work is being prepared, processed, displayed, and timed out.

The replacement model must provide an equivalent derived lock:

```ts
centerOverlayLockActive =
  state.kind === "task-processing"
  || state.kind === "task-outcome-loading"
  || state.kind === "task-outcome-visible"
  || state.kind === "folder-outcome-visible";
```

Do not derive the lock only from icon visibility. Long-running processing and the short pre-outcome preparation phase must also keep the shell stable.

### Ownership Notes

- Keep `downloadCancelled` / `downloadErrorMessage` ownership for active progress feedback separate from outcome payloads. Cancelling an active download should still affect progress-area text without turning into an outcome overlay.
- `video-download-progress` and `video-transcode-progress` must both cancel stale transient outcomes before showing progress.
- `startForegroundProcessing()` must invalidate pending outcome preparation, not just hide the current outcome boolean.
- Folder success/error outcomes must use the same request-id guard as task outcomes.
- Minimized icon rendering should participate in the same single-owner selector so it cannot overlap with a task or folder outcome.

### Center Overlay Validation Matrix

| Scenario | Expected Behavior |
|---|---|
| download complete followed immediately by new download progress | progress renders; old checkmark is not visible |
| transcode complete followed immediately by new transcode progress | progress renders; old outcome is not visible |
| progress event during outcome preparation | pending outcome is invalidated and never appears |
| double folder drop within one second | second folder outcome remains for its full duration |
| folder drop while task outcome is visible | folder outcome replaces task outcome without overlap |
| new task progress while folder outcome is visible | progress preempts folder outcome |
| image/clipboard save during task body | indeterminate spinner shows and shell remains full |
| active download cancel feedback | progress-area cancellation text remains separate from outcome payload |
| completion while minimized | one center visual owner renders; minimized icon and outcome do not overlap |
