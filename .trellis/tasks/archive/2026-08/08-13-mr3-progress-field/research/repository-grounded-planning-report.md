# MR3 Progress Field - Cindy Lead Planning Report

## Recommendation

Proceed in a later implementation phase by directly evolving the MR1 Expanded Dot Field with one pure, current-state Download progress target. No local responsibility adjustment beyond that consumer boundary is presently justified.

```text
Download queue reducer/selectors
  -> current primary Download progress projection
  -> existing settled-full Dot Field consumer
  -> local bounded render/retarget/settle
```

## Architecture answers for Lead review

### Dependency direction

Clear and one-way. Download progress is owned by the feature reducer and selected in App today. MR3 adds a pure presentation target and does not store business progress. Main Window lifecycle supplies eligibility only. The renderer owns pixels and disposable interpolation only.

### State boundaries

- `idle`: no primary Download; dormant field and zero progress frames.
- `active indeterminate`: primary exists but no numeric percent; active non-quantitative material.
- `active determinate`: primary exists with finite percent; stable ordered `0..1` target.
- `transcode only`: idle for MR3; existing Transcode progress remains on its current Product presentation path.
- `cancel requested`: no synthetic visual terminal; current primary remains projected.
- `terminal/removal`: immediate next-primary projection or idle. MR3 has no terminal state.

This avoids duplicate determinate, indeterminate, and terminal authority. Success/failure/cancelled visuals remain MR4.

### Retarget and reconstruction

Same-trace upward updates coalesce and retarget from the current condition. The visual may lag but cannot exceed the latest target. Downward authoritative changes clamp to a safe condition because information accuracy outranks continuity. A new trace is a semantic discontinuity: it invalidates old work and rebases immediately to the new trace's current target, with no interpolation from old-task progress. Sleep, dispose, reload, and re-entry reconstruct from the latest projection, never history.

### Renderer/runtime authority

The existing MR1 consumer already meets the needed ownership model: one local Canvas/rAF runtime, no lifecycle/Product/native writes, one pending frame, zero frames at rest, generation invalidation, wake/sleep/dispose. Progress adds a persistent baseline target; existing click/context acknowledgement stays a bounded additive transient and returns to the latest progress baseline.

### Reduced Motion and accessibility

Determinate information remains as a static spatial target. Indeterminate becomes a static visibly-active, non-quantitative treatment. The Canvas remains `aria-hidden`; existing central progress text/ring and cancellation remain the accessible source. Motion is not required to understand progress.

### Performance

Reuse MR1's 400-dot and 2x-DPR bounds. React publishes semantic target changes only. Determinate frames exist only while converging; rapid inputs coalesce. Indeterminate normal motion is bounded to eligible visibility and stops for Reduced Motion/ineligibility/dispose. Idle, settled, sleep, and dispose are zero-frame states.

### MR1 validation debt

Not a blanket implementation entry gate. Automated/fake-scheduler coverage and a real Windows Electron smoke already proved bounded topology, one pending frame, and zero-frame settlement. Entry requires the clean approved baseline and Architecture approval; implementation signoff must refresh automated/performance and Windows execution evidence and carry the human visual debt into MR3's combined manual regression pass. Promote only a narrow contrast/readability uncertainty to an earlier blocker if implementation cannot define the progress material responsibly. macOS remains `NOT VERIFIED` unless actually exercised.

### Frozen old M3

Useful only for general disciplines: selector-derived correctness, latest replacement, local generation invalidation, Reduced Motion convergence, and completion-free correctness. Its ordered queue bootstrap was evidence for intake acceptance/provenance correlation, not for progress authority. Reject that bootstrap plus intake-origin/trace reconciliation, central Progress extraction, radial mask/noise/wave choreography, and mixed foreground-intake model from MR3. None is needed for a current-state progress projection and several conflict with MR0-MR2 boundaries.

### Scope control

No MR4 Reveal, outcome material, terminal hold, folder confirmation, terminal-not-compact repair, Transcode generalization, central progress rewrite, shared Motion framework, new dependency, or native/protocol work is included.

## Evidence anchors at `d85c629`

- Download ownership: `src/features/download/model.ts:60-80`
- queue membership before local acknowledgement: `src/electron-runtime/service.ts:484-493,582-593,956-959`
- renderer event mapping: `src/features/download/client.ts:145-166`
- progress/terminal reduction: `src/features/download/reducer.ts:129-149,195-208`
- primary/indeterminate selection: `src/features/download/selectors.ts:23-56`
- current App projection: `src/App.tsx:478-528`
- central progress priority and live controls: `src/utils/centerOverlayState.ts:174-227`, `src/App.tsx:3562-3654`
- lifecycle lock input: `src/App.tsx:550-555`
- Dot Field eligibility: `src/presentation/main-window/MainWindowPresentationSurface.tsx:647-652`
- Canvas host lifetime: `src/presentation/main-window/DotFieldCanvas.tsx:43-142`
- local retarget/sleep/dispose: `src/presentation/main-window/dotFieldRuntime.ts:186-228,230-370`
- MR0/MR1 normative contract: `.trellis/spec/frontend/motion-guidelines.md:589-665,683-743`
- MR1 validation evidence: `.trellis/tasks/archive/2026-08/08-13-mr1-expanded-dot-field-substrate/research/dot-field-windows-validation.md`

## Planning status

- `prd.md`: complete and converged
- `design.md`: complete
- `implement.md`: complete, responsibility-based and intentionally file-agnostic
- blocking questions: none
- task status: `planning`
- production code changes: none
- `task.py start`: not run
- archive / MR4: not entered

Stop here for GPT Architecture Lead MR3 Planning Architecture Review.
