# MR7 Repository-Grounded Planning Report

## 1. Baseline and scope

- Authoritative implementation baseline:
  `motion/presentation-integration@710fe5e113731e783b80b4bb8a4ebdfb755f6181`.
- Authoritative worktree:
  `D:/Ameow/.cindy-worktrees/motion-integration` (clean at audit time).
- Root `main@ff286b3` is the Trellis planning/task-record line, not the MR0-MR6
  production implementation baseline.
- This report plans replacement and retirement only. It does not authorize
  product-code edits, task activation, commit, archive, or final visual tuning.

## 2. Current authority and dependency map

```text
Download protocol events
  -> Download client classification
  -> DownloadQueueController
       terminalReceived is reduced synchronously before listeners run
  -> Download reducer/model/selectors                       PRODUCT AUTHORITY
       membership, primary task, percent, typed terminal, tombstones
  -> App current-state Presentation projections            PRESENTATION POLICY
       progress: idle | indeterminate(trace) | determinate(trace, 0..1)
       terminal: none | terminal(success | failure | cancelled)
       retention/requestId + current-primary invalidation
       task / centerOutcome lock facts
  -> MainWindowPresentationSurface                         WIRING BOUNDARY
       settled-full eligibility, geometry, theme, Reduced Motion
       one decorative graphics host under accessible DOM children
  -> DotFieldCanvas -> dotFieldRuntime -> dotFieldRecipe    LOCAL EXECUTION
       Canvas 2D, DPR/backing store, grid, local rAF, interpolation, pixels

Main Window lifecycle reducer -> full/compact/transition/locks/epochs
Renderer callback             -X-> Download, retention, lifecycle, native state
```

### Authority evidence

- Download owns long-lived queue/progress/terminal truth in
  `src/features/download/model.ts:3-10,25-31,49-80`.
- `terminalReceived` prunes the active trace and records a bounded tombstone in
  `src/features/download/reducer.ts:195-208`.
- The controller classifies and reduces a terminal before publishing its exact
  post-reduction state in `src/features/download/useDownloadQueue.ts:24-42,200-220`.
- Primary Download selection and synthetic pre-progress indeterminate facts are
  selector-derived in `src/features/download/selectors.ts:8-12,23-51`.
- Main Window lifecycle state and its complete event vocabulary live in
  `src/presentation/main-window/lifecycle.ts:3-48`; the reducer is the only
  writer at `:189-370`.
- Pure visual mode projection is derived from lifecycle state in
  `src/presentation/main-window/projections.ts:37-55,57-136`.

## 3. Current Dot Field production responsibility map

| Current responsibility | Evidence | Disposition |
| --- | --- | --- |
| One decorative fullscreen layer under App content | `MainWindowPresentationSurface.tsx:1140-1207` | Preserve the slot and stacking/accessibility boundary; replace the concrete host. |
| Settled-full eligibility | `MainWindowPresentationSurface.tsx:598-603,666-671` | Preserve exactly as a read-only lifecycle projection. |
| Progress target projection from current primary Download | `App.tsx:487-495`; `downloadProgressProjection.ts:4-49` | Preserve semantics; migrate renderer-named target types out of `dotFieldRecipe.ts`. |
| Terminal target projection and current-primary priority | `App.tsx:551-565`; `downloadTerminalProjection.ts:4-60` | Preserve semantics; rename the Dot Field-specific projection/target vocabulary. |
| Typed terminal selection from exact post-reduction snapshot | `App.tsx:1353-1399`; `useDownloadQueue.ts:200-220` | Preserve unchanged outside the renderer. |
| Bounded terminal retention | `App.tsx:778-815,1366-1394` | Preserve unchanged in Application/Presentation state: success/cancelled 1500 ms, failure 5000 ms. |
| Stale retention no-op and new-primary invalidation | `centerOverlayState.ts:73-150`; `App.tsx:1332-1351` | Preserve unchanged outside the renderer. |
| `centerOutcome` lifecycle lock | `centerOverlayState.ts:179-184`; `App.tsx:542-550,575-590`; `MainWindowPresentationSurface.tsx:673-685` | Preserve unchanged. The substrate receives eligibility; it never owns or releases this lock. |
| Accessible outcome identity/message/action and progress controls | `centerOverlayState.ts:157-244`; Surface children at `MainWindowPresentationSurface.tsx:1207` | Preserve as DOM authority above the decorative layer. |
| Canvas 2D creation, DPR/backing-store revision, draw primitives | `DotFieldCanvas.tsx:41-56,73-163` | Delete with Dot Field. Replace only with the concrete new host's required graphics-resource lifecycle. |
| Grid topology, dot count/DPR bounds, edge fade, dot color mixing | `dotFieldRecipe.ts:1-22,70-145,363-480` | Delete. These are Dot Field renderer recipes, not Presentation semantics. |
| Click/context local acknowledgement wave and normalized origin | `dotFieldRecipe.ts:23-30,112-186,391-418`; `MainWindowPresentationSurface.tsx:563-571,840-869,957-966` | Delete unless a later approved visual specification explicitly reintroduces a local interaction response. It is not required by MR3/MR4 semantics. |
| Surface-click classification used only to seed that wave | `dotFieldSurface.ts:1-39`; `MainWindowPresentationSurface.tsx:350-384,449-472` | Delete with the acknowledgement path; simplify the pending-click-only wiring without changing drag/double-click behavior. |
| One local rAF, generation invalidation, sleep, dispose | `dotFieldRuntime.ts:322-408,410-507,677-709` | Migrate as execution obligations, not by reusing or generalizing the Dot Field runtime. |
| Progress interpolation/replacement correctness | `dotFieldRuntime.ts:527-582` | Migrate the information-correctness rules; delete dot occupancy/frontier implementation. |
| Terminal lane priority, replacement, and absorption | `dotFieldRuntime.ts:584-631` | Preserve only current-primary/typed-terminal correctness and bounded local replacement; delete bloom/frontier material recipes. |
| Dot-specific theme tokens | `ThemeContext.tsx:84,167,240`; use at `MainWindowPresentationSurface.tsx:1184-1185` | Delete or replace only with implementation-proven substrate material tokens. Do not keep aliases for compatibility. |

## 4. Durable semantics versus renderer recipe

### 4.1 Progress semantics that must survive

| Semantic contract | Current evidence | Replacement obligation |
| --- | --- | --- |
| Idle | `downloadProgressProjection.ts:30-32` | No active Download presentation and no progress-driven frame work. |
| Indeterminate | `downloadProgressProjection.ts:33-42` | Remain visibly active but non-quantitative; never map visual phase to percent. |
| Determinate | `downloadProgressProjection.ts:43-48` | Consume a clamped current target without owning the percent. |
| Current-primary only | `selectors.ts:23-24`; projection comment at `downloadProgressProjection.ts:13-15` | Never generalize to Transcode or a cross-product progress bus. |
| Trace replacement | `dotFieldRuntime.ts:527-550,561-578` | New trace must not inherit the old trace's rendered progress. |
| Authoritative downward revision | `dotFieldRuntime.ts:536-541,572-580` | Rendered quantitative state clamps immediately to at/below the new target. |
| Latest target/coalescing | `dotFieldRuntime.ts:343-360,393-408` | At most one pending frame; rapid updates converge only to the latest target. |
| Wake reconstruction | `dotFieldRuntime.ts:410-438` | Re-entry reconstructs from the current projection, never pre-collapse visual history. |
| Reduced Motion | `dotFieldRuntime.ts:509-518,579-580` | Determinate resolves directly; indeterminate is static but active. |

The following are recipes and may change: row-major occupancy, dot frontier,
diagonal sweep, dot amplitudes, convergence constants, grid topology, and color
mixing (`dotFieldRecipe.ts:188-275`).

### 4.2 Terminal semantics that must survive

| Semantic contract | Current evidence | Replacement obligation |
| --- | --- | --- |
| Three typed outcomes | `model.ts:49-58`; `downloadTerminalProjection.ts:40-60` | Keep success, failure, and cancelled distinct at the Presentation input. |
| Typed origin only | `centerOverlayState.ts:10-17,99-109`; `downloadTerminalProjection.ts:47-59` | Never infer terminal kind from message, missing progress, or animation state. |
| Bounded Presentation retention | `App.tsx:778-815,1366-1394` | Runtime renders only while the projected target exists; no runtime deadline. |
| Current-primary priority | `downloadTerminalProjection.ts:18-29,40-46`; invalidation at `App.tsx:1332-1351` | A current primary Download invalidates terminal Presentation immediately, including before first numeric progress. |
| Background-terminal suppression | `downloadTerminalProjection.ts:62-76`; `App.tsx:1353-1365` | Decide from the exact post-reduction Download snapshot, not a renderer state/ref. |
| Stale generation invalidation | `centerOverlayState.ts:73-150`; runtime scheduling at `dotFieldRuntime.ts:393-408,677-709` | Preserve both layers: requestId guards for Presentation timers and local generation guards for renderer callbacks/resources. |
| `centerOutcome` lock ownership | `centerOverlayState.ts:179-184`; `App.tsx:575-590` | Lock remains derived from Presentation state. No frame, shader, Canvas, WebGL, or Motion completion may release it. |

The following are Dot Field recipes and must not be migrated as architecture:
success row-major fill, failure/cancelled radial blooms, amplitudes, reveal
convergence rate, same-kind visual restart policy, and acknowledgement absorption
details (`dotFieldRecipe.ts:277-361`; `dotFieldRuntime.ts:584-631`). A new
renderer may choose a different visual recipe while preserving typed identity,
priority, bounded lifetime, and stale safety.

## 5. Replacement boundary and abstraction decision

### Decision

Repository evidence does **not** justify an independent generic substrate
abstraction. MR5 already found that adjacent frame loops and renderer consumers
did not justify a shared production abstraction, and MR1-MR4 repeatedly forbid
a shared scheduler/runtime. MR7 therefore adds:

1. one concrete `ExpandedPresentationSurface` component occupying the existing
   exclusive decorative slot; and
2. at most one private, consumer-local execution helper when required to test
   frame/resource/context lifecycle.

There is no renderer interface, backend switch, scene graph, generic layer
model, scheduler, state machine, priority bus, or Motion framework. The selected
graphics backend is concrete. Shader direction favors native WebGL2 with no new
dependency, but backend selection is an implementation-entry check, not a
reason to build an adapter. If the concrete backend is not viable, stop and
return to Architecture Lead; do not keep Dot Field as a fallback.

### Minimum component input

- logical fullscreen geometry from the existing visual shell;
- `eligible`, derived only from settled-full lifecycle projection;
- Reduced Motion preference;
- existing semantic theme/material tokens, adding new paired black/white tokens
  only when a proven renderer need cannot use current tokens;
- neutral progress Presentation target;
- neutral terminal Presentation target.

The component owns only its DOM graphics element, graphics context/resources,
bounded DPR/resize handling, local rendered values, one frame handle, local
generation, sleep/wake/dispose, and pixels. It produces no semantic callback.

## 6. Dot Field retirement and duplicate-authority prevention

The cutover is structural and atomic at the production composition boundary:

- Phase 1 may neutralize type/projection names while Dot Field remains the only
  mounted substrate.
- Phase 2 swaps the single Surface mount to the new concrete host and deletes
  all Dot Field production files, Dot Field-only intent wiring, tokens, and
  renderer-specific tests in the same changeset.
- No feature flag, hidden second canvas, renderer fallback, mirror state,
  compatibility adapter, or dual-write period is allowed.
- Unsupported graphics/context-loss behavior fails closed to the existing
  accessible DOM content; it must not revive Dot Field.
- An architecture guard must prove that production Surface composition imports
  exactly the new host and contains no Dot Field production reference.

This makes rollback a source-control rollback of the entire atomic cutover, not
a runtime old/new switch.

## 7. Stable capability for later Intake and Folder reveals

MR7 exposes an architecture capability, not a speculative API:

- one exclusive fullscreen decorative host;
- plain current-state Presentation targets published from Product/Application
  facts through pure projection;
- local replacement/reconstruction under settled-full eligibility;
- no semantic completion callbacks;
- DOM content remains the accessible/correctness carrier.

Later Download Intake Reveal or Folder Confirmation Reveal must add its own
typed projection and explicit priority/retention rule at the Presentation
boundary, then feed the same host. MR7 does not add placeholder variants,
generic `reveal()` commands, a queue, a layer array, or feature-owned shader
callbacks. If two implemented reveal consumers later prove an identical data
contract, that later task may propose a narrow shared type to Architecture Lead.

## 8. Minimal implementation phases

### Phase 1: semantic contract detachment (behavior-preserving)

- Move progress/terminal target types into a neutral Presentation target leaf.
- Rename Dot Field-specific terminal projection/Surface prop vocabulary.
- Keep Download, Application retention, lifecycle, DOM content, and the single
  mounted Dot Field unchanged.
- Port projection tests so semantic correctness no longer imports Dot Field.

### Phase 2: atomic host replacement and Dot Field deletion

- Implement one concrete fullscreen graphics host and consumer-local execution
  helper with no shared framework/dependency.
- Consume the neutral progress/terminal targets.
- Swap the sole Surface mount and remove the complete Dot Field production and
  intent/token/test inventory in the same changeset.
- Preserve central progress/cancel/outcome/diagnostic DOM unchanged.

### Phase 3: architecture, semantic, performance, and Windows validation

- Run retained projection, Download, center-overlay, lifecycle, import-guard,
  terminal-retention, and composition-contract suites.
- Replace Dot Field runtime/performance tests with substrate-local tests for
  trace replacement, downward revision, current-primary invalidation,
  Reduced Motion, one-frame budget, sleep/wake/dispose, stale callbacks, and
  graphics resource cleanup/context loss.
- Add a static retirement guard and update Motion/Presentation specs to remove
  Dot Field as a future extension point.
- Validate the Electron Windows surface for resize/DPR/context lifecycle and
  verify accessible DOM controls remain intact. Do not claim macOS validation
  without evidence.

## 9. Validation matrix

| Layer | Keep/add proof |
| --- | --- |
| Download authority | Keep reducer/controller/selectors/client tests; especially exact post-reduction terminal listener coverage. |
| Pure Presentation projection | Keep/rename `downloadProgressProjection.test.ts` and `downloadTerminalProjection.test.ts`. |
| Presentation retention/priority | Keep `centerOverlayState.test.ts`, `windows-terminal-retention.test.ts`, and App source-contract coverage. |
| Lifecycle authority | Keep `lifecycle.test.ts`, projections tests, and epoch-matched completion tests unchanged. |
| Cross-layer composition | Keep `presentationCompositionContract.test.ts`; update vocabulary only where Dot Field-specific. |
| New local executor | Add deterministic fake-scheduler/resource tests; at most one frame, zero when idle/settled/sleep/disposed, stale generation no-op. |
| Architecture | Update `import-guard.test.ts`; add exclusive-host/no-Dot-Field retirement assertion and forbid Product/lifecycle/desktop/Electron imports in the new host/helper. |
| Graphics/performance | Concrete backend resource/context-loss tests plus Windows Electron evidence; no dual renderer fallback. |
| Accessibility | Verify Canvas/WebGL layer is `aria-hidden`/non-interactive and existing progress, cancel, terminal message, and diagnostic action remain DOM-owned. |

Existing semantic regression anchors include:

- `downloadProgressProjection.test.ts:28-90`;
- `dotFieldRuntime.test.ts:645-915` (port semantic cases, not dot pixels);
- `downloadTerminalProjection.test.ts:49-155`;
- `dotFieldRuntime.test.ts:917-1117` (port priority/lifecycle cases only);
- `presentationCompositionContract.test.ts:204-334`;
- `windows-terminal-retention.test.ts:135-175`.

## 10. Architecture escalation triggers

Stop and return to GPT Architecture Lead before implementation continues if the
replacement appears to require any of the following:

- Download model/reducer/protocol/controller changes;
- lifecycle event/effect/reducer or native window-policy changes;
- renderer-driven retention, lock release, terminal classification, or task
  selection;
- a second mounted graphics substrate or Dot Field fallback;
- a shared runtime/scheduler/state machine/priority bus/scene graph;
- a new graphics dependency or multiple interchangeable renderer backends;
- a placeholder Intake/Folder API without an implemented feature contract.

