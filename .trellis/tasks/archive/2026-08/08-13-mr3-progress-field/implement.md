# MR3 Progress Field - Implementation Entry Plan

## Review gate

This plan is not implementation approval. Do not run `task.py start`, edit production code, commit, archive, or enter MR4 until GPT Architecture Lead approves the MR3 planning artifacts and Cindy receives a later explicit implementation instruction.

## Minimal implementation direction

### 1. Pin the pure projection contract

- Express idle, determinate, and indeterminate targets directly from the current primary Download selector result.
- Cover invalid percent, clamping, probing/selecting phases, primary replacement, terminal removal, next-primary selection, and a transcode-only state that must not become Download progress.
- Prove the projection contains no terminal outcome, lifecycle command, animation state, or per-frame data.

Review gate: the projection can be recomputed from one current Download state snapshot and has no historical dependency.

### 2. Extend the existing Dot Field input boundary

- Publish the progress target alongside existing coarse eligibility/theme/Reduced Motion inputs.
- Keep current central progress text/ring/cancel controls unchanged.
- Preserve the non-interactive, `aria-hidden` Canvas boundary and settled-full eligibility.

Review gate: deleting the field still leaves correct and accessible Product behavior.

### 3. Add persistent progress execution to the MR1 substrate

- Reuse the current grid, drawing surface, one-frame scheduler, wake/sleep/dispose lifecycle, and generation invalidation.
- Add only the state needed to render/converge to the current target.
- Coalesce high-frequency changes and stop frames at settlement.
- Compose existing click/context acknowledgements additively over the latest progress baseline, then reconverge to that baseline.

Review gate: no second Canvas, shared runtime, FIFO, historical target list, React frame loop, or completion callback is introduced.

### 4. Enforce interruption and reconstruction semantics

- Test same-trace upward retarget, downward authoritative revision, determinate/indeterminate changes, immediate new-trace rebase with no old-task carryover, cancellation-in-flight, terminal/removal, next-primary replacement, sleep/wake, unmount/dispose, and stale callbacks.
- Apply Reduced Motion initially and mid-flight without fake completion.

Review gate: every state after replacement/re-entry is derivable from the latest projection alone.

### 5. Prove performance and architecture boundaries

- Extend deterministic recipe/runtime and fake-scheduler coverage.
- Extend the existing MR0/MR1 architecture guard so progress execution stays renderer-local and cannot import or write Download/lifecycle/native authority.
- Measure high-frequency determinate updates and normal-motion indeterminate activity: pending frames never exceed one, determinate settles to zero, and all ineligible/disposed states remain zero.

Review gate: standard type-check, lint, tests, build, and diff hygiene pass; focused instrumentation demonstrates the frame lifecycle rather than inferring it.

### 6. Run combined visual validation

- Validate black/white theme contrast for dormant, determinate frontier, indeterminate activity, and existing acknowledgement overlay.
- Validate 0%, mid-range, near-complete, rapid updates, primary replacement, cancel request, terminal-to-next/idle, compact/expand transitions, live Reduced Motion, reload/replacement, and mixed DPR.
- Verify indeterminate never resembles a percentage loop and Reduced Motion retains a distinct active state.
- Carry forward the unverified MR1 cases in the same pass instead of blocking entry on them wholesale. Entry requires the clean approved baseline and Architecture approval; implementation signoff requires refreshed automated/performance evidence, Windows execution evidence, and the combined manual regression report.
- Report Windows evidence and mark macOS `NOT VERIFIED` unless actually exercised.

## Validation commands for the later implementation phase

Use the repository's existing focused Presentation/Download test suites plus the standard gates:

```powershell
npm test
npm run type-check
npm run lint
npm run build
git diff --check
```

The implementation phase should first run focused projection/recipe/runtime/surface/architecture tests, then the full commands above. Exact new test filenames and local module split are intentionally not prescribed by planning.

## Rollback point

The change must remain removable as a renderer-local projection and Dot Field extension. Rollback returns the field to MR1 dormant/transient behavior and requires no Download, lifecycle, protocol, persisted-state, native, or documentation migration.

## Scope audit before completion

- no Success / Failure / Cancelled Reveal
- no Folder Confirmation Reveal
- no terminal hold or terminal-not-compact repair
- no intake origin/reconciliation/bootstrap
- no Transcode/general-purpose progress expansion
- no central progress UI rewrite
- no shared Motion framework, generic scheduler, universal runtime, or new graphics dependency
- no old M3 implementation migration
