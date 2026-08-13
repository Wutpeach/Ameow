# MR3 Progress Field

## Goal

Let the MR1 Expanded Dot Field carry real Download progress presentation semantics through a one-way, reconstructible path:

```text
Download feature authority
  -> pure Presentation Projection
  -> Dot Field progress target
  -> renderer-local visual execution
```

MR3 is successful when the field communicates idle, active determinate, and active indeterminate Download progress without becoming Download, task, cancellation, terminal, or Main Window lifecycle authority.

## Baseline and confirmed facts

- The authoritative integration baseline is clean commit `d85c629` in `D:/Ameow/.cindy-worktrees/mr1-dot-field`. Root `main` is later and dirty, so it is not MR3 code evidence.
- Download queue membership, progress, cancel intent, and terminal tombstones are owned by the Download feature state/reducer. The primary task and its progress are selector-derived.
- Missing progress for an active primary task and the probing/selecting phases already project as indeterminate preparation (`percent: -1`).
- The existing App-level `primaryTask` can fall back to Transcode, but MR3 is deliberately narrower: it projects only the primary Download selectors. A transcode-only state does not become Download Progress Field authority.
- Terminal facts remove the trace and its progress atomically; late progress and stale queue detail cannot revive it. The next selector result is therefore the next active primary task or idle.
- MR1 Dot Field is an `aria-hidden`, non-interactive, Presentation-local Canvas consumer. It wakes only for settled Expanded/full presentation, owns at most one rAF, sleeps at zero frames, and reconstructs from current inputs.
- MR1 automated, performance, and Windows Electron smoke evidence passed. Human visual validation remains incomplete for both-theme raster quality, context acknowledgement, exclusions, live Reduced Motion, active replacement, and mixed-DPR monitors.
- The frozen `auto-o3p8cr` M3 is an uncommitted experiment on an older baseline. It is evidence only.

## Requirements

### R1. Unique authority and dependency direction

- Download/Product facts remain the only source of task identity, membership, progress, cancel intent, and terminal outcome.
- A pure Presentation Projection derives one current Dot Field target from the current primary Download selector result and Reduced Motion preference.
- The projection must not generalize the App's Download/Transcode aggregate into a new cross-product progress authority; Transcode presentation remains unchanged and outside MR3.
- The projection and renderer must not retain a competing Download snapshot or feed progress, completion, cancellation, or lifecycle events back upstream.
- No Main, preload, IPC, BrowserWindow, or native side channel may carry per-frame progress visuals.

### R2. Projected semantic states

The projection must represent only these MR3 states:

| State | Authoritative condition | Required information |
| --- | --- | --- |
| idle | no primary Download | dormant field; no active progress work |
| active indeterminate | primary Download exists but percent is absent/negative or its phase is probing/selecting | active Download is visible, but no numeric completion is implied |
| active determinate | primary Download exists with a finite percent | trace generation and a clamped `0..1` target |

- Invalid/non-finite determinate values must resolve conservatively to indeterminate; finite percent is clamped only for presentation safety.
- The trace identity scopes visual monotonicity. A new primary trace is replacement, not continuation of the previous trace.
- Cancellation request alone does not synthesize a terminal or idle target. The field continues to consume the current authoritative primary Download until terminal/removal/replacement changes the selector result.

### R3. Determinate semantics

- Determinate progress uses stable spatial ordering/occupancy in the existing Dot Field so more authoritative progress never looks like less progress for the same trace.
- Renderer interpolation may lag an increasing target but must not visually exceed the latest authoritative target.
- High-frequency updates coalesce to the latest target and retarget from the current rendered condition; they do not reset/replay or form a FIFO.
- If the authoritative target moves below the current rendered value, information correctness wins: clamp/reconstruct at or below the new target rather than animating through an overstated value.

### R4. Indeterminate semantics

- Indeterminate is visibly active but non-quantitative. It must not encode a fabricated percentage or repeatedly fill from zero to one.
- Normal motion may use a bounded, renderer-local travelling/accent treatment over the dormant grid.
- Reduced Motion must use a stable, non-travelling active treatment. Existing textual/ring progress remains the accessible information carrier; the Canvas remains supplemental and `aria-hidden`.

### R5. Terminal boundary and replacement

- Success, failure, and cancelled Reveal are MR4 and are not projected by MR3.
- On authoritative terminal/removal, the MR3 projection changes immediately to the next primary Download target or idle. It does not synthesize 100%, terminal hold, outcome color, or completion callback.
- Replacement discards old trace identity and immediately rebases to the new trace's current projected target. It must not interpolate from the old task's progress, even when doing so would look continuous, because that would attribute old-task progress to the new task. Stale work from the old generation becomes a no-op.
- Renderer settlement or animation completion never drives Download cleanup, cancellation, terminal correctness, window collapse, or lifecycle progression.

### R6. Lifecycle, visibility, and reconstruction

- Progress Field is eligible only in settled Expanded/full presentation, preserving the MR1 visibility boundary.
- Compact mode and lifecycle transitions put the local field to sleep and cancel scheduled work; MR3 does not request expansion or block collapse.
- Re-entry, remount, surface replacement, and reload reconstruct directly from the current projection, never from pre-collapse/pre-dispose animation history.
- A still-mounted ineligible field is sleeping and wakeable; unmount/dispose is permanent and makes late callbacks no-op.

### R7. Performance discipline

- Preserve MR1 hard bounds: bounded dot population/backing DPR and at most one pending local frame.
- Idle, settled determinate, sleeping, and disposed states hold zero scheduled frames.
- Active determinate frames run only while converging to the latest target. High-frequency updates are coalesced.
- Indeterminate motion may run only while visible and eligible; it must be low duty/bounded and stop immediately on idle, eligibility exit, Reduced Motion, replacement, or dispose.
- React publishes semantic targets, never per-dot or per-frame geometry; no React per-frame state loop is permitted.

### R8. MR1 substrate and validation debt

- MR3 should directly evolve the MR1 Dot Field consumer through a local responsibility extension. No evidence currently justifies a second Canvas, shared Motion framework, generic scheduler, or universal animation runtime.
- MR1 human visual debt is not a blanket MR3 implementation entry gate because automated bounds and executable Windows behavior are established.
- The debt is carried into a combined MR3 manual validation matrix. Only a narrowly demonstrated inability to distinguish dormant/progress material or to assess contrast may block implementation tuning.

### R9. Frozen old M3 usage

- Retain only conceptual evidence: selector-derived correctness, current-condition/latest replacement, local epoch/generation invalidation, Reduced Motion convergence, and completion-free correctness.
- Do not inherit intake origins, trace reconciliation/bootstrap, Main/protocol/IPC expansion, radial mask/noise/wave recipes, the central `DownloadProgressSurface`, foreground-intake mixing, or Reveal choreography.

## Acceptance criteria

- [ ] The dependency direction is explicit and enforced: Download authority -> pure projection -> Dot Field target -> renderer-local pixels.
- [ ] Idle, determinate, indeterminate, cancel-in-flight, replacement, terminal/removal, compact/transition, Reduced Motion, and dispose/rebuild outcomes are specified without duplicate authority.
- [ ] Same-trace determinate updates are current-condition retargets, coalesced, bounded, and never visually overstate the latest authoritative value.
- [ ] Trace replacement and terminal/removal rebuild from current selector facts; no historical replay or renderer-owned task identity survives.
- [ ] Indeterminate and Reduced Motion preserve active-progress information without inventing a percent or requiring continuous travel.
- [ ] Settled/idle/sleep/dispose have zero pending frames; active work is renderer-local and bounded.
- [ ] Existing cancellation, terminal, lifecycle, central accessible progress, and native paths remain correct if Progress Field execution is deleted or fails.
- [ ] MR1 substrate reuse is the default and any local responsibility adjustment is justified by a concrete contract/test need.
- [ ] Frozen old M3 is cited only as evidence and no MR4 Reveal, terminal hold, terminal-not-compact repair, or shared Motion infrastructure enters scope.

## Out of scope

- Success / Failure / Cancelled Reveal
- Folder Confirmation Reveal
- terminal hold redesign
- terminal-not-compact repair
- Download reducer/model/protocol authority changes
- lifecycle phase/event/effect changes
- central progress/cancel UX replacement
- Transcode progress projection or a generic multi-product Progress Field
- intake origin, intake acknowledgement, or trace provenance work
- shared Motion infrastructure, generic scheduler, universal runtime, or new graphics dependency
- migration of the old M3 implementation

## Open questions

None block planning. Exact dot ordering, material constants, and renderer-local code shape are implementation-level choices to be proven against these contracts rather than fixed in planning.
