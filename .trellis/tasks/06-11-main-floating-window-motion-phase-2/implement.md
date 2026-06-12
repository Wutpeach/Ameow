# Main Floating Window Motion Phase 2 Implementation Plan Draft

This is a draft. Do not start implementation until the user reviews `prd.md`, `research.md`, and `design.md`.

## Development Phase Breakdown

Phase 2 should be split into small gates. Each gate must be independently reviewable and should leave the app in a working state.

### Phase 2A: Baseline And Spec Reconciliation

Goal:

- prove what the current implementation actually does before refactoring
- capture native bounds call sites, visual timing descriptors, and shell invariants
- reconcile stale spec wording before it influences implementation

Allowed changes:

- tests
- documentation/spec notes
- named constants or tiny pure helpers only when they preserve behavior exactly

Not allowed:

- changing hover expand/collapse behavior
- changing native bounds timing
- moving renderer shell rendering
- visual tuning

Exit gate:

- current behavior inventory is documented
- baseline tests cover transition tokens, hotspot, compact clamp, and shell machine edge cases
- any code/spec mismatch has a written decision

### Phase 2B: Pure Geometry And Transition Contract

Goal:

- introduce pure `MainWindowShellGeometryPlan`
- introduce separate `MainWindowShellTransitionPlan`
- encode platform geometry, shadow gutter, hotspot frame, and compact reachable frame without touching behavior

Allowed changes:

- new pure utility modules under `src/utils`
- unit tests for Windows/macOS geometry and reduced-motion transition decisions
- type-only contract improvements

Not allowed:

- changing `App.tsx` rendering structure
- changing Electron main animation logic
- replacing visual timing values

Exit gate:

- geometry is pure and spatial
- timing/token data is outside geometry
- tests prove native, visual, shadow, hotspot, and clamp frames are intentionally distinct

### Phase 2C: Renderer Wiring Without Visual Extraction

Goal:

- make `App.tsx` consume the shared geometry/transition plan for existing calculations
- reduce duplicated geometry derivation while preserving the current render tree

Allowed changes:

- replace scattered calculations with plan outputs
- keep the same Motion transition descriptors and CSS shadow behavior
- keep visual shell inside `App.tsx`

Not allowed:

- extracting `MainWindowShell.tsx` yet
- adding new native resize paths
- changing icon handoff, panel spring, compact tween, or instant collapse handoff

Exit gate:

- tests/type-check/lint pass
- Windows manual check confirms no visual or interaction regression
- diff shows geometry source consolidation without behavior tuning

### Phase 2D: Native Bounds Orchestration Wrapper

Goal:

- centralize renderer-side native bounds request orchestration
- preserve Electron main as the native adapter
- protect stale compact clamp and stale transition completions

Allowed changes:

- a small renderer helper/hook around transition token, `animateBounds(...)`, compact clamp, and position cache updates
- focused tests for stale token rejection and compact clamp cancellation

Not allowed:

- per-frame renderer-to-main IPC animation
- native `setBounds(..., true)` reliance
- new native bounds changes in visual-only paths

Exit gate:

- stale compact clamp cannot overwrite a newer full target
- shortcut position refresh remains preserved
- native bounds calls match the Phase 2A baseline unless explicitly documented

### Phase 2E: Visual Shell Consumption

Goal:

- make shadow layer and panel layer consume the same plan
- clarify visual ownership without tuning the motion yet

Allowed changes:

- extract or introduce `MainWindowShell` only if Phase 2C/2D are stable
- route visual shell dimensions/radius/clip/shadow frame from the shared plan
- keep existing CSS `box-shadow` behavior unless ownership is explicitly moved as a no-op equivalent

Not allowed:

- changing perceived animation quality
- changing shadow intensity/radius timing
- changing compact/full timing values

Exit gate:

- panel and shadow geometry use the same plan
- current visual timings are preserved
- Windows manual check passes; macOS validation remains required before considering the milestone fully release-ready

### Phase 2F: Motion Tuning

Goal:

- tune the user-visible full/icon morph only after architecture is stable

Allowed changes:

- adjust durations, spring parameters, icon handoff, shadow intensity, and radius/clip behavior
- use Phase 1 motion tokens where appropriate

Not allowed:

- starting before Phase 2A-2E pass
- mixing tuning with geometry or native orchestration refactors

Exit gate:

- Windows and macOS visual/manual verification pass
- reduced-motion behavior is verified
- no regression in passthrough, drag, drop, task lock, or monitor-edge behavior

## Proposed Sequence

Progress:

- Phase 2A completed in `d9a461a`: baseline constants, native bounds path classification, focused tests, and stale native morph spec reconciliation.
- Phase 2B completed in `9aecd91`: pure geometry plan and separate transition plan under `src/utils/mainWindowShellGeometry.ts`, with Windows/macOS geometry and reduced-motion timing tests.
- Phase 2C completed in `9aecd91`: `App.tsx` consumes the shared geometry/transition plan for compact visibility clamping and panel/shadow visual frame derivation without extracting the render tree or changing motion values.
- Phase 2D completed in current work: renderer-side native bounds orchestration moved to `src/utils/mainWindowNativeBoundsOrchestrator.ts`, preserving startup normalization, compact visibility clamp timing, transition-token stale checks, and position-cache behavior without adding native resize paths.

0. Reconcile current behavior before refactoring.
   - Confirm normal main-window startup native size.
   - Confirm whether compact native startup is active or dormant.
   - Confirm hover expand/collapse native bounds behavior from current code.
   - Confirm foreground task restore and shortcut show behavior.
   - Compare findings with existing specs and record any spec drift.

1. Add baseline tests before refactoring.
   - `mainWindowShellMachine`
   - `compactPointerHotspot`
   - `mainWindowCompactBounds`
   - `mainWindowTransitionToken`
   - native bounds call-site classification: startup normalization, compact visibility clamping, mode transition, or no native resize
   - reduced-motion transition plan expectations
   - existing visual timing descriptors captured without changing values

2. Extract `mainWindowShellGeometry.ts`.
   - Encode platform-specific outer size and shadow gutter.
   - Produce native, visual, shadow, and hotspot frames from one input.
   - Produce or reference compact reachable/clamp frame separately from native outer bounds.
   - Keep geometry pure and spatial.
   - Keep hotspot active/inactive decisions outside geometry.
   - Unit test Windows and macOS plans.

3. Introduce a transition plan wrapper.
   - Reference the geometry plan.
   - Carry transition token and timing.
   - Preserve existing durations/easing and spring/tween/icon handoff choices.
   - Represent renderer spring/tween timing explicitly; do not force renderer timing into a duration-only shape.
   - Represent reduced-motion native and visual timing explicitly.
   - Keep visual-only renderer morphs visual-only unless current baseline requires native bounds.

4. Replace scattered geometry calculations in `App.tsx`.
   - Keep behavior equivalent.
   - Keep visual timings equivalent.
   - Do not move rendering yet.

5. Extract native bounds orchestration.
   - Preserve transition token behavior.
   - Preserve compact visibility clamp.
   - Preserve position cache refresh behavior after shortcut show.
   - Ensure stale compact clamp cannot write cached position after a newer full token.
   - Keep Electron main as native adapter.

6. Make visual shell consume the shared geometry plan.
   - Keep shadow and panel synchronized.
   - Keep `motion.div` ownership clear.
   - Decide box-shadow ownership before visual tuning.
   - Preserve CSS `box-shadow` transitions unless this step explicitly moves that same property under Motion ownership.

7. Only then tune visual motion.
   - Use Phase 1 shared motion tokens.
   - Validate macOS and Windows.

## Required Validation

- `npm run test -- mainWindowShellMachine compactPointerHotspot mainWindowCompactBounds mainWindowTransitionToken`
- `npm run type-check`
- `npm run lint`
- Manual Windows check:
  - compact transparent gutter click-through
  - icon hover expands
  - fast enter/leave does not flash
  - full drag remains stable
- Manual macOS check:
  - custom shadow remains stable
  - compact/full morph does not drift
  - no post-collapse flash

## Additional Guard Tests From Architecture Review

- Geometry inset symmetry: native bounds, visual shell, and shadow shell stay spatially consistent for Windows and macOS plans.
- Compact reachable frame: monitor clamp uses the compact reachable/icon frame intentionally and does not accidentally clamp using full native outer bounds.
- Transition-token stale completion: stale native completion and stale visual completion cannot commit a previous target.
- Timing contract: renderer visual motion and native bounds executor receive the same duration/easing for a transition.
- Timing descriptor preservation: current compact tween, full spring, minimized icon handoff, instant collapse-complete handoff, and reduced-motion descriptors remain equivalent in the behavior-preserving milestone.
- Compact visibility cancellation: compact clamp/visibility move cannot fight a newer expand request.
- Hotspot lifecycle: geometry describes hotspot space, while shell phase controls whether hotspot is evaluated.
- Native resize baseline: implementation does not introduce new native bounds changes into paths that are visual-only today.
- Spec drift check: update specs only when current code evidence proves the existing contract text is stale.

## Stop Conditions

Stop and reassess if:

- native bounds and visual shell cannot be derived from one geometry plan without behavior changes
- separating geometry from timing/token orchestration introduces more complexity than it removes
- the refactor requires adding a new native resize to hover expand/collapse before the current baseline proves it exists today
- compact passthrough requires new native calls beyond the existing allowed set
- macOS and Windows require materially different state machines
- a refactor causes any regression before motion tuning begins
- existing specs and current code conflict in a way that cannot be resolved by a behavior-preserving interpretation
