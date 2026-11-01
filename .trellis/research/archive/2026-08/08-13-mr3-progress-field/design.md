# MR3 Progress Field - Architecture Design

## Decision summary

MR3 is a local semantic extension of the MR1 Expanded Dot Field, not a new Progress system. Add one pure presentation target at the existing Download-to-Presentation composition boundary, then let the existing Dot Field consumer execute that target locally. Keep the central progress UI and cancellation controls unchanged.

## Authority map

```text
Download protocol events
  -> Download queue controller/reducer (membership, percent, cancel, terminal)
  -> primary Download selectors
  -> MR3 pure Presentation Projection
       idle
       active.indeterminate(trace)
       active.determinate(trace, target 0..1)
  -> settled-full eligibility + theme + Reduced Motion
  -> MR1 Dot Field consumer
       current rendered condition
       local generation / frame handle
       renderer-local interpolation
  -> Canvas pixels

Main Window lifecycle projection -> eligibility only
Renderer completion              -X-> lifecycle / Download / terminal
```

The field can be removed without changing queueing, progress facts, cancellation, terminal outcomes, accessible progress UI, collapse, or native behavior.

## Repository-grounded data path

- `src/features/download/model.ts:60-80` defines the single renderer Download state owner, including `progressByTrace`, cancellation, and tombstones.
- `src/features/download/reducer.ts:129-149` accepts progress only for current non-terminal members; `:195-208` makes terminal authoritative and prunes progress.
- `src/features/download/selectors.ts:23-52` chooses the first active task and derives synthetic indeterminate preparation when no numeric progress exists.
- `src/App.tsx:478-528` consumes those selectors and already derives `kind`, `percent`, and `indeterminate` without a mirrored progress copy.
- `src/electron-runtime/service.ts:484-493,582-593,956-959` shows queue membership is emitted before the local queue acknowledgement returns. This ordering justified old M3 intake-correlation work, but it creates no MR3 authority gap because MR3 consumes the already-reduced current selector state rather than trying to identify intake provenance.
- `src/features/download/client.ts:145-166` maps progress, terminal, queue count, and queue detail into the renderer feature boundary before reduction.
- `src/utils/centerOverlayState.ts:174-227` selects the existing central progress branch with primary-task priority; `src/App.tsx:3562-3654` renders its live ring/text/cancel controls. MR3 leaves this accessible/product surface intact.
- `src/App.tsx:550-555` projects task activity into an existing lifecycle lock; MR3 consumes the result and does not change it.
- `src/presentation/main-window/MainWindowPresentationSurface.tsx:579-652` resolves lifecycle projections and makes Dot Field eligible only when full and settled.
- `src/presentation/main-window/DotFieldCanvas.tsx:43-46,64-142` is the coarse-input host with local runtime construction, wake/sleep, and exactly-once intent consumption.
- `src/presentation/main-window/dotFieldRuntime.ts:186-228,230-370` owns bounded scheduling, current-condition folding, sleep generation invalidation, and disposal.
- `.trellis/spec/frontend/motion-guidelines.md:589-665` is the approved MR0 authority/interpolation/performance contract; `:683-743` pins the MR1 consumer contract.

## Presentation projection contract

The projection is a pure current-state value, not a state machine and not a second store.

| Selector result | Projected target | Renderer meaning |
| --- | --- | --- |
| no primary Download | idle | dormant grid, no progress scheduling |
| primary + phase probing/selecting | indeterminate(trace) | active, explicitly non-quantitative |
| primary + missing/negative/non-finite percent | indeterminate(trace) | active, explicitly non-quantitative |
| primary + finite percent | determinate(trace, clamp(percent / 100)) | stable ordered progress target |

The projection does not include terminal kind. Terminal/removal is observed only as a change in the current primary selector result.

The input is specifically `primaryDownloadTask + primaryDownloadProgress`, not the App-level aggregate that can fall back to Transcode. A transcode-only state is idle for this Download Progress Field; MR3 does not invent a generic cross-product progress model.

## Visual semantic direction

### Dormant

MR1 dormant material remains the baseline. No progress execution is active.

### Determinate

Use the existing stable dot topology as an ordered information surface: a completed cohort and a remaining cohort separated by a readable frontier. The exact ordering and shader/material recipe are deliberately left to implementation, but it must be deterministic, theme-safe, and monotonically legible for one trace.

The numeric invariant is more important than motion continuity:

- upward same-trace updates retarget from the current rendered condition;
- rapid updates replace/coalesce to the latest target;
- visual occupancy never exceeds the current target;
- a lower same-trace authoritative revision clamps immediately to a safe condition before any further interpolation;
- a new trace never uses the same-trace interpolation path and instead rebases directly to its own current target.

### Indeterminate

Indeterminate uses the same grid and accent vocabulary but never maps motion phase to numeric completion. Normal motion may run a bounded travelling band or equivalent low-duty active treatment. Reduced Motion uses a static active material. It must remain visibly distinct from idle without implying a percentage.

### Terminal boundary

MR3 has no terminal visual state. Terminal removal either exposes the next primary task projection or idle. No 100% injection, success/failure/cancel material, terminal hold, Reveal, or collapse acknowledgement is allowed.

## Retarget, replacement, settle, and cancellation

| Event | Required local behavior |
| --- | --- |
| increasing target, same trace | retarget from current rendered value; coalesce latest; no replay |
| lower target, same trace | clamp to at/below new target, then settle; never display overstatement |
| determinate -> indeterminate | drop numeric frontier authority and render non-quantitative active target |
| indeterminate -> determinate | seed from a safe condition at/below target and converge to current target |
| trace replacement | invalidate old generation and immediately rebase to the new trace's current projection; never carry or interpolate the old task's progress into the new identity |
| cancel requested | no special completion; keep current primary projection until authoritative removal/terminal/replacement |
| authoritative terminal/removal | next primary or idle immediately; old visual generation cannot survive |
| settled determinate/idle | draw final condition and hold zero frames |
| eligibility exit | cancel frame, invalidate generation, clear transient execution, sleep |
| eligibility re-entry | reconstruct from current projection, not old animation memory |
| unmount/dispose | permanently release local resources; late callbacks no-op |

## MR1 responsibility adjustment

The MR1 substrate already supplies topology, Canvas ownership, bounded DPR/dot count, one-frame scheduling, theme revisions, eligibility, Reduced Motion input, sleep, and dispose. MR3 needs only a local extension from “dormant material plus discrete acknowledgement transient” to “dormant material plus persistent progress target plus the existing bounded transient.”

The composition rule is:

```text
current projected progress baseline
  + existing bounded click/context acknowledgement
  -> pixels
```

An acknowledgement transient must settle back to the latest progress baseline, including progress changes received while it runs. It must not erase/restart progress. No shared composition type is introduced unless a second real consumer later proves the same contract.

## Reduced Motion and accessibility

- Determinate information remains as a static ordered dot target with no travel requirement.
- Indeterminate information remains as a static active field treatment rather than a moving band.
- Switching Reduced Motion on mid-flight resolves immediately/minimally to the current semantic target and cancels obsolete travel.
- Canvas stays `aria-hidden`; current text, percentage/ring, and cancel controls remain the accessible source. MR3 augments presentation rather than replacing accessible content.

## Performance lifecycle

- React updates only the semantic projection.
- Local execution keeps one pending frame maximum and coalesces high-frequency targets.
- Determinate execution stops after convergence; dormant/settled/sleep/dispose stay at zero frames.
- Normal-motion indeterminate work is bounded to visible eligible time. Reduced Motion indeterminate schedules no continuous travel.
- Existing MR1 bounds (400 dots and 2x DPR cap) remain the planning budget unless profiling demonstrates a concrete issue.

## Compatibility and rollback

- No data migration, persisted state, protocol, command, dependency, or native change.
- No change to Download feature authority or lifecycle authority.
- Rollback removes the progress projection/wiring and restores the MR1 dormant/transient-only field; all Product behavior remains correct.

## Frozen old M3 disposition

| Old idea | Decision | Reason |
| --- | --- | --- |
| selector-derived progress/cancel correctness | retain as principle | matches current Download authority |
| latest replacement + local generation cleanup | adapt locally | already supported by MR1 runtime discipline |
| Reduced Motion final-state convergence | retain as principle | matches MR0 contract |
| intake origin and trace reconciliation | reject | intake semantics, not Progress Field |
| queue observation bootstrap / Main-protocol expansion | reject | no authority gap exists for current progress |
| central DownloadProgressSurface extraction | reject for MR3 | field should consume existing projection; central UI remains unchanged |
| radial mask, noise, wave, Impact | reject | MR4/intake Reveal choreography and unnecessary cost |
| completion-controlled coexistence | reject | duplicates authority and risks lifecycle coupling |

## Risks and review points

- Current reducer preserves stage monotonicity but does not guarantee percent monotonicity. The renderer therefore needs the explicit no-overstatement clamp rule; MR3 must not “fix” Product facts by owning a second monotonic percent.
- Trace replacement is a semantic discontinuity, not a retarget within one information stream. Immediate rebase is intentional even if it sacrifices visual continuity.
- Indeterminate motion can accidentally resemble a repeated determinate fill. Manual review must verify it communicates activity without quantity.
- The progress field and existing click/context acknowledgement share pixels. Tests must prove acknowledgement remains additive and settles to the latest progress baseline.
- MR1 human visual debt remains relevant to contrast and DPR confidence, but broad revalidation is not an implementation-entry blocker.

## Architecture stop conditions

Return to Lead review before implementation if evidence appears to require a Download model/reducer/protocol change, lifecycle event/effect change, Main/preload/IPC/native work, queue-observer bootstrap/baseline facts, second Canvas, shared scheduler/framework, new dependency, terminal visual state, Transcode generalization, or replacement of the accessible central progress UI.
