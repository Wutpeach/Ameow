# Implementation plan

Implementation is not authorized yet. Keep this task in `planning` until Lead Architecture Review explicitly approves it.

## 0. Reconfirm approved scope and baseline

- [ ] Re-read PRD, design, and `research/current-renderer-audit.md` after approval.
- [ ] Re-run `git status --short` and preserve the unrelated `.trellis/.template-hashes.json` modification.
- [ ] Confirm no P0-P3 contract or public command/event change is required.
- [ ] Keep Transcode, Site Session, Runtime Dependency, Update, Settings, routes, CSS, and complete paste/drag intake out of this slice.

Planning baseline recorded on 2026-08-10:

```text
npm test -- src/utils/downloadEventReducers.test.ts src/utils/downloadViewHelpers.test.ts src/protocol/download/ipcMappers.test.ts src/architecture/import-guard.test.ts src/utils/centerOverlayState.test.ts src/utils/runtimeDependencyGate.test.ts

6 files passed
91 tests passed

npm run type-check
passed

npm run lint
passed
```

## 1. Add the pure Download feature model and reducer

- [ ] Add `src/features/download/model.ts` with Renderer-owned task, progress, terminal, interaction, and queue state types.
- [ ] Add `src/features/download/reducer.ts` as the only Download lifecycle transition owner.
- [ ] Represent terminal trace tombstones or explicit generations so delayed progress and stale detail cannot revive finished tasks.
- [ ] Make typed terminal payloads authoritative over local cancel intent.
- [ ] Reconcile queue detail/count without storing competing visible totals.
- [ ] Add per-trace quality-selection and cancellation in-flight state.
- [ ] Do not import P3 protocol DTOs, Electron, desktop runtime, Transcode, or Application internals from the model/reducer.

Required tests:

- queue accepted and snapshot reconciliation;
- progress update;
- success, typed failure, cancelled;
- multiple concurrent traces;
- terminal then delayed progress;
- terminal then stale queue detail;
- duplicate terminal idempotency;
- typed success racing with cancel rejection/false response;
- Advanced Quality double-click/in-flight behavior.

## 2. Add selectors for current visual behavior

- [ ] Add `src/features/download/selectors.ts` for visible count, primary task, queue rows, badge visibility, progress display, and quality prompt.
- [ ] Preserve current ordering and single-task/multi-task visual rules.
- [ ] Derive all duplicated values from the reducer state.
- [ ] Keep localization/view text mapping separate from lifecycle classification.

Required tests:

- count/detail/progress disagreements produce one consistent view;
- concurrent task ordering and primary selection;
- quality prompt is trace-specific;
- terminal traces are absent from active selectors;
- current badge visibility behavior is preserved.

## 3. Add a narrow P3-backed Download client

- [ ] Add `src/features/download/client.ts` with a small injected interface for queue, pasted queue, cancel, quality selection, and subscriptions.
- [ ] Put command/event names and IPC DTO imports only in the concrete adapter.
- [ ] Decode P3 DTOs into feature actions/models at the client boundary.
- [ ] Prefer typed failure code/classification. Keep raw cancellation text parsing only as old-payload compatibility in the adapter.
- [ ] Remove Renderer-side Pinterest/gallery-dl engine rejection from the migrated queue path; consume Application typed outcomes.
- [ ] Preserve existing ordinary, paste, and drag video commands and returned acknowledgement behavior.

Required tests:

- each public method invokes the expected existing protocol command through a fake desktop facade;
- each Download event decodes to the correct feature action;
- malformed/legacy terminal payload behavior is bounded and explicit;
- protocol DTO objects are not exposed as feature state.

## 4. Add lifecycle-safe subscription ownership

- [ ] Add `src/features/download/useDownloadQueue.ts` or an equivalent feature controller with one reducer instance and one subscription lifecycle.
- [ ] Reduce events synchronously before running shell presentation effects.
- [ ] Handle a registration promise that resolves after disposal by immediately invoking its disposer.
- [ ] Ignore callbacks after disposal and prevent duplicate listeners on rerender/client replacement.
- [ ] Expose state, selectors, queue/cancel/select actions, and small transition facts to App composition.

Required Node-only tests:

- normal setup/event/cleanup;
- dispose before async registration resolves;
- callback after dispose ignored;
- repeated setup does not duplicate a live listener;
- completion during a delayed shell effect remains terminal.

If React hook behavior cannot be tested without adding jsdom/Testing Library, extract the subscription controller as a pure TypeScript unit and keep the hook as a thin adapter. Do not add a test framework dependency for this slice.

## 5. Recompose App without a directory sweep

- [ ] Replace App-owned Download count/detail/progress/cancelling writers with the feature owner.
- [ ] Route ordinary, pasted, and drag video queueing through the feature public actions while leaving non-video image/file intake in App.
- [ ] Render existing center progress/outcome, badge, queue rows, and Advanced Quality views from selectors.
- [ ] Keep app-window expansion, overlay coordination, notifications, and dialog behavior in App and trigger them from post-reduction transition facts.
- [ ] Keep legacy Transcode rows/state in App and compose them with Download presentation at the shell boundary.
- [ ] Move only components/helpers whose direct protocol/state ownership must change; do not relocate unrelated UI.
- [ ] Remove obsolete Download-specific App state and helpers after the migrated path is covered.

Behavior checks:

- ordinary and pasted video queueing looks unchanged;
- one and multiple active task displays look unchanged;
- Advanced Quality popover/inline selection looks unchanged;
- cancel feedback, success, failure, and cancellation overlays/notices look unchanged;
- Transcode and non-video paste/drop flows remain unaffected.

## 6. Add architecture guards

- [ ] Extend the existing Vitest static import scanner for `src/features/**`.
- [ ] Ban Electron, repository `electron/`, `src/electron-runtime`, Domain/Engine infrastructure, and raw preload implementation imports from features.
- [ ] Ban `src/protocol` and desktop runtime imports from Download model/reducer/selectors.
- [ ] Ban cross-feature internal imports; permit app composition through explicit public surfaces.
- [ ] Keep all P0-P3 guard assertions intact and add representative failing examples.
- [ ] Do not add a dependency analyzer or create barrel files solely for the guard.

Focused gate:

```text
npm test -- src/features/download src/architecture/import-guard.test.ts src/protocol/download/ipcMappers.test.ts
npm run type-check
```

## 7. Architecture and compatibility review

- [ ] Compare the implementation with every Blocker in `research/current-renderer-audit.md`.
- [ ] Prove protocol DTOs stop at the client adapter and do not become long-lived feature state.
- [ ] Prove Application policy is not reproduced in App/client/reducer.
- [ ] Prove Download has no imports from another feature's internals.
- [ ] Prove subscription ownership and terminal ordering under deferred callbacks.
- [ ] Confirm deferred Transcode/Site Session/Runtime/Update findings were not silently expanded into this change.

## 8. Full validation and handoff

```text
npm test
npm run type-check
npm run lint
npm run build
git diff --check
```

- [ ] Run task-relevant UI/build checks if App/component files changed.
- [ ] Update the public docs site only if visible behavior changes; a compatible architecture-only refactor should not need user-guide changes.
- [ ] Run Trellis quality verification against PRD/design/specs.
- [ ] Keep the task `in_progress` after approved implementation and wait for Lead Architecture Review before any later Renderer feature slice.

## Stop conditions

Return to planning rather than expanding scope if implementation requires:

- changing P0-P3 backend/application/protocol contracts;
- breaking command/event names or payloads;
- migrating routes, state libraries, CSS, or the design system;
- extracting Transcode, Site Session, Runtime Dependency, Update, or Settings;
- redesigning paste/drag intake broadly;
- adding generalized Manager/Controller/Repository/ViewModel/frontend-framework layers;
- adding a dependency-analysis or UI-test-framework dependency.
