# MR7 Expanded Presentation Replacement - Implementation Plan

Implementation is not authorized by this document. After Planning Architecture
Review, a later explicit approval must activate the task before product-code
work begins.

## Phase 1: detach durable Presentation contracts from Dot Field

- [ ] Confirm the implementation baseline is the clean
  `motion/presentation-integration` line at or descended from `710fe5e`.
- [ ] Add one pure neutral target leaf in `src/presentation/main-window/` for
  the existing progress and terminal discriminated unions only.
- [ ] Make the current progress/terminal projection modules consume and return
  those neutral target types.
- [ ] Rename Dot Field-specific terminal projection and Surface prop names to
  Expanded/Download Presentation vocabulary without behavior changes.
- [ ] Keep Dot Field as the only mounted graphics host in this phase; do not add
  the replacement host yet.
- [ ] Port projection tests and import guards so semantics no longer depend on
  `dotFieldRecipe.ts`.
- [ ] Review gate: no visual change, no Product/lifecycle/native change, and no
  second substrate exists.

## Phase 2: atomic fullscreen host replacement and retirement

- [ ] Use one concrete no-dependency graphics backend. Default to WebGL2 for the
  frozen shader direction; stop for Architecture Lead review if this is not
  viable instead of adding a backend abstraction or fallback renderer.
- [ ] Add one concrete `ExpandedPresentationSurface` and, only if needed for
  deterministic testing, one private consumer-local execution helper.
- [ ] Pass only geometry, settled-full eligibility, Reduced Motion, theme
  material, progress target, and terminal target.
- [ ] Implement durable progress execution: idle/determinate/indeterminate,
  latest coalescing, trace replacement, immediate downward clamp, current
  projection reconstruction, and static Reduced Motion semantics.
- [ ] Implement durable terminal execution: typed three-way target,
  current-primary supersede, no local retention, stale-generation safety, and
  static Reduced Motion semantics.
- [ ] Keep the graphics layer non-interactive and `aria-hidden`; leave existing
  central progress/cancel/outcome/message/diagnostic DOM unchanged.
- [ ] Swap the single Surface mount to the new host and in the same changeset
  delete:
  - [ ] `DotFieldCanvas.tsx`;
  - [ ] `dotFieldRuntime.ts`;
  - [ ] `dotFieldRecipe.ts`;
  - [ ] `dotFieldSurface.ts`;
  - [ ] Dot Field-only click/context origin, pending-click, and intent wiring;
  - [ ] dot-only theme tokens or aliases not used by the new concrete recipe;
  - [ ] Dot Field-only host/recipe/runtime/performance tests.
- [ ] Add no feature flag, compatibility adapter, hidden second canvas, runtime
  old/new switch, or Dot Field fallback.
- [ ] Review gate: production Surface imports exactly one expanded graphics host
  and repository search finds no production Dot Field reference.

## Phase 3: validation and specification closure

### Semantic and authority tests

- [ ] Keep/rename `downloadProgressProjection.test.ts` coverage for idle,
  determinate clamp, indeterminate, trace identity, current-primary-only, and
  pure current-state recomputation.
- [ ] Add executor tests for same-trace upward coalescing, authoritative
  downward clamp, direct trace replacement, indeterminate transitions, and
  current-projection wake reconstruction.
- [ ] Keep/rename `downloadTerminalProjection.test.ts` coverage for typed
  three-way mapping, typed origin, loading/visible phases, background-terminal
  suppression, and current-primary invalidation.
- [ ] Keep `centerOverlayState.test.ts` and
  `windows-terminal-retention.test.ts` coverage for bounded retention,
  requestId stale no-ops, new-primary invalidation, and `centerOutcome` lock
  release/collapse handoff.
- [ ] Keep lifecycle reducer/projection/completion tests unchanged.

### Local execution and performance tests

- [ ] Prove one pending frame maximum and zero frames for idle/settled/sleep/
  dispose/Reduced-Motion-static states.
- [ ] Prove sleep and dispose invalidate queued callbacks and graphics resources.
- [ ] Prove context loss/creation failure does not dispatch authority work and
  leaves the accessible DOM usable.
- [ ] Prove terminal target removal is driven only by Presentation input and
  renderer completion has no callback path.

### Architecture and retirement tests

- [ ] Update `src/architecture/import-guard.test.ts` for the new concrete host
  and helper: no Product, lifecycle writer, desktop, Electron, IPC, or Pointer
  Field authority imports.
- [ ] Add an exclusive-host retirement guard: Surface mounts the new host and no
  Dot Field production module/reference remains.
- [ ] Keep `presentationCompositionContract.test.ts` as the generic normative
  contract; do not turn it into a production runtime abstraction.
- [ ] Update `.trellis/spec/frontend/directory-structure.md`,
  `component-guidelines.md`, `motion-guidelines.md`, and `state-management.md`
  to make the new host the single Expanded Presentation consumer and Dot Field
  a retired implementation.

### Commands and runtime evidence

- [ ] Run focused semantic/architecture suites:

  ```text
  npm test -- src/features/download src/utils/centerOverlayState.test.ts src/presentation/main-window/downloadProgressProjection.test.ts src/presentation/main-window/downloadTerminalProjection.test.ts src/presentation/main-window/presentationCompositionContract.test.ts src/presentation/main-window/lifecycle.test.ts src/architecture/import-guard.test.ts src/architecture/windows-terminal-retention.test.ts
  ```

- [ ] Run the new Expanded Presentation executor/resource/performance tests.
- [ ] Run `npm run type-check`.
- [ ] Run `npm run lint`.
- [ ] Run the full relevant Vitest suite if focused checks pass.
- [ ] Validate on Windows Electron: full/compact transitions, DPR/monitor-scale
  change, determinate downward revision, trace replacement, indeterminate,
  all terminal kinds, new-primary interruption, Reduced Motion, context loss/
  recovery behavior, and unchanged accessible controls.
- [ ] Do not claim macOS verification without separate evidence.

## Rollback points

- Phase 1 is independently revertible because Dot Field remains the sole host.
- Phase 2 is atomic: revert the entire cutover. Do not partially restore Dot
  Field beside the new host.
- Any request for a second backend/host, dependency, shared runtime/scheduler,
  lifecycle/Product/native change, or Intake/Folder placeholder API stops the
  task for Architecture Lead review.

