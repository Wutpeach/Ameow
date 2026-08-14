# MR7 Expanded Presentation Replacement - Architecture Design

## Decision summary

Replace Dot Field with one concrete fullscreen Expanded Presentation graphics
consumer. Preserve MR3/MR4 semantics above the renderer, keep lifecycle and
Download authorities unchanged, and delete Dot Field atomically at the Surface
composition boundary.

No independent renderer abstraction is approved. A private consumer-local
execution helper is allowed only for one concrete host's frame, graphics
resource, context-loss, and stale-generation lifecycle.

## Ownership

```text
Download/Application facts
  -> pure Presentation projections and bounded Presentation state
  -> MainWindowPresentationSurface (one exclusive expanded graphics slot)
  -> ExpandedPresentationSurface (concrete host)
  -> private local execution helper (optional, concrete, disposable)
  -> pixels

lifecycle reducer -> full / compact / transition / lock authority
center overlay     -> retention / accessible identity / message / action
graphics runtime  -X-> Product / retention / lifecycle / native authority
```

### Product and Application

- Download model/reducer/controller/selectors remain the sole source of
  progress, current-primary identity, typed terminal outcome, cancellation, and
  terminal tombstones.
- App/center-overlay state remains the owner of terminal visibility opportunity,
  requestId generation, retention timers, diagnostic action, and the
  `centerOutcome` lock projection.

### Presentation projection

- Progress remains `idle | indeterminate(traceId) |
  determinate(traceId, target)`.
- Terminal remains `none | terminal(success | failure | cancelled)` and is
  emitted only for typed Download-terminal origin when no current primary
  Download exists.
- Target types move to a neutral Presentation leaf so deleting
  `dotFieldRecipe.ts` cannot delete the cross-boundary contract.
- Projection stays pure current-state data. It stores no renderer state and
  accepts no renderer completion.

### Main Window Surface

- Continues to derive eligibility from
  `visual.mode === "full" && transitionEpoch === null`.
- Owns exactly one non-interactive, `aria-hidden` expanded graphics host under
  the existing accessible DOM children.
- Passes geometry, theme material, Reduced Motion, progress, and terminal
  targets only.
- Does not learn shader uniforms, graphics context details, Product actions, or
  local frame state.

### Concrete graphics host

The new host owns only:

- one DOM graphics element and one concrete browser graphics backend;
- bounded DPR/resize/backing resources;
- local rendered/interpolated values;
- at most one pending frame;
- local generation, wake, sleep, dispose, and context/resource cleanup;
- renderer recipe and pixels.

It must not own:

- current-primary selection, terminal classification, retention, message,
  diagnostics, cancel behavior, lifecycle phase, locks, native interaction, or
  window bounds;
- a generic scene/layer API, scheduler, priority bus, state machine, backend
  interface, or shared runtime.

## Semantic execution invariants

### Progress

- Idle schedules no progress work.
- Indeterminate is active but never quantitative. Reduced Motion is static.
- Determinate never renders above the current authoritative target.
- Same-trace downward revision clamps immediately.
- Trace replacement never carries rendered progress from the previous trace.
- Rapid updates coalesce to the latest target.
- Wake reconstructs from the current projection; sleep/dispose invalidate
  obsolete callbacks and resources.

The visual recipe is not frozen. Dot frontier order, sweep direction, noise,
lens distortion, mask motion, color amplitudes, and timing are not architecture.

### Terminal

- Success, failure, and cancelled remain distinct inputs.
- Any current primary Download wins immediately.
- Retention starts/ends only in Presentation state; the graphics host renders
  while the target exists and has no deadline/completion callback.
- RequestId guards protect Presentation timers; local generation guards protect
  renderer callbacks/resources.
- Reduced Motion exposes the semantic terminal material without travel.
- The accessible center DOM remains the identity/message/action carrier.

Terminal shader/noise/bloom/takeover recipes are not frozen.

## Technology boundary

The frozen visual direction supports a shader-driven fullscreen takeover, so a
single no-dependency WebGL2 implementation is the default implementation-entry
choice. This is not approval for a backend abstraction. If WebGL2 is not viable
under the packaged Electron runtime, stop for Architecture Lead review rather
than adding a second backend, dependency, or Dot Field fallback.

Context creation/loss failure degrades to the existing accessible DOM content.
Correctness does not depend on decorative pixels.

## Retirement contract

The production cutover is one atomic changeset:

1. mount `ExpandedPresentationSurface` in the existing exclusive slot;
2. remove `DotFieldCanvas`, `dotFieldRuntime`, `dotFieldRecipe`, and
   `dotFieldSurface` production files;
3. remove click/context acknowledgement-only wiring and dot-only tokens;
4. remove renderer-specific Dot Field tests and replace only durable semantic,
   local lifecycle, and performance proofs;
5. update architecture guards/specs so Dot Field cannot remain or return as a
   second production substrate.

No feature flag, compatibility adapter, hidden old canvas, runtime fallback, or
dual write is allowed. Rollback means reverting the whole cutover commit.

## Later Intake/Folder capability

The stable capability is the dependency and lifecycle boundary, not a generic
reveal API:

- one exclusive fullscreen host;
- plain current-state typed Presentation target in;
- local replace/reconstruct/dispose execution;
- no semantic callback out;
- accessible DOM remains authoritative.

Later Intake or Folder work must define a feature-specific projection and
priority/retention contract before extending the host. MR7 adds no placeholder
variant, layer array, queue, command bus, or shader callback for those features.

## Compatibility and rollback

- No protocol, persistence, Download feature, central controls, lifecycle
  reducer, Electron main/preload/native policy, or Compact Character change.
- No user-documentation page currently names Dot Field or Expanded
  Presentation; public docs need no content change unless implementation adds a
  documented behavior beyond visual replacement.
- Source-control rollback restores the old single host. Runtime coexistence is
  intentionally unsupported.

## Review gates

Return to GPT Architecture Lead if implementation needs Product/lifecycle/native
changes, more than one graphics backend/host, a dependency, a shared runtime, a
renderer completion authority, or a speculative Intake/Folder contract.

