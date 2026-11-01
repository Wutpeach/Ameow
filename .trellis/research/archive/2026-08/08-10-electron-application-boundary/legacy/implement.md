# Implementation plan

## 0. Audit and baseline

- [x] Map `electron/main.mts` responsibilities and retain/migrate decisions.
- [x] Map `service.ts` by use case/lifecycle and classify findings.
- [x] Trace current transport -> runtime -> orchestrator -> engine dependency direction.
- [x] Record P0/P1 invariant anchors and P3/deferred inputs in `research/current-electron-runtime-audit.md`.
- [x] Run focused baseline: 3 files / 72 tests pass.
- [ ] Re-run `git status --short` before implementation and preserve the unrelated `.trellis/.template-hashes.json` modification.

## 1. Establish the ordinary Job application service

- [ ] Add one generic, Electron-neutral `DownloadJobService` using the existing `DownloadOrchestrator<TExecutionContext>`; do not add a DI container or parallel engine abstraction.
- [ ] Define only the function-shaped inputs needed for one Job context, attempt-context construction, pre-download hook, typed auth recovery, and execution metadata.
- [ ] Guarantee one `prepare()`, one opaque Job context, at-most-one auth recovery, and reuse of the same prepared plan/Job context across fallback and auth retry.
- [ ] Preserve typed error classification and cancellation behavior without parsing raw Infrastructure messages.
- [ ] Add focused tests for success/progress, fallback, stable plan/context identity, auth-cookie refresh, recovery refusal/second failure, cancellation, and typed failure.
- [ ] Add the application directory to `src/architecture/import-guard.test.ts` and add a representative guard assertion if needed.

Rollback point: the new service/tests can be removed before production wiring changes.

## 2. Delegate the existing runtime Job slice

- [ ] Instantiate/inject the Job service from the existing runtime composition without hidden engine construction or generic casts.
- [ ] Replace only the ordinary `runTask()` prepare/context/execute/auth slice; keep queue, output reservation, protocol events, telemetry, filesystem settlement, advanced quality, transcode, and runtime gate behavior in place.
- [ ] Ensure route resolution remains in the outer adapter and occurs once per Job before attempt execution; pass the same opaque Job context to fallback/auth attempts.
- [ ] Keep attempt cookies refreshed through attempt-context reconstruction only; never mutate/recreate `ResolvedDownloadPlan`.
- [ ] Preserve exactly one completion event and queue cleanup on success, typed failure, pending cancel, and active cancel.
- [ ] Update existing runtime tests only where the new injection seam makes them clearer; keep P0/P1 compatibility tests.

Focused gate:

```text
npm test -- src/application/download-job-service.test.ts src/orchestration/download-orchestrator.test.ts src/electron-runtime/service.test.ts src/architecture/import-guard.test.ts
npm run type-check
```

Rollback point: restore the previous internal execution slice while leaving the independently tested service unused.

## 3. Remove download policy bodies from Electron Main

- [ ] Extract the existing download-specific site-session refresh/cookie/recovery hook implementation into one Electron-side integration module with injected registry/manager/scheduler/extension/log dependencies.
- [ ] Keep the at-most-one retry decision in Application; the integration only refreshes/reads attempt auth and reports recovery eligibility.
- [ ] Make `main.mts` construct the integration and pass its hooks into `createElectronDownloadRuntime()` alongside concrete engines, network resolver, runtime bootstrap, event sink, and OS paths.
- [ ] Do not move or reorder BrowserWindow, tray, updater, WS server, IPC registration, or process lifecycle code.
- [ ] Add focused tests for refresh eligibility, attempt-cookie replacement without plan mutation, and auth recovery hook wiring. Preserve existing site-session tests.

Rollback point: restore the inline hook callbacks without touching the application Job service or protocol surface.

## 4. Boundary and regression review

- [ ] Prove Application imports no Electron/runtime/protocol/infrastructure modules.
- [ ] Prove `main.mts` has no ordinary download fallback/retry/plan/network business flow and its download responsibilities are composition/transport/platform adapter wiring.
- [ ] Prove the runtime compatibility facade still exposes the same commands, events, queue/transcode payloads, and terminal behavior.
- [ ] Review strict object identity for NetworkRoute/Job context and `ResolvedDownloadPlan` across fallback/auth retry and fresh identity on the next Job.
- [ ] Confirm the exact `DownloadEngine<TExecutionContext>` port remains unchanged and Architecture Guard is not weakened.
- [ ] Record protocol DTO issues only as P3 input; do not implement P3.

## 5. Full validation and handoff

```text
npm test
npm run type-check
npm run lint
npm run build
npm run runtime:smoke:downloaders
git diff --check
```

- [ ] Run Trellis quality check against PRD/design/implementation and applicable specs.
- [ ] If no user-facing behavior changed, record why public docs were not changed; otherwise update both locales in `site/` and run `npm run docs:build`.
- [ ] Produce the requested A-J implementation report, including exact test/gate results and follow-up debt.
- [ ] Keep task status `in_progress` and wait for Lead Architecture Review. Do not commit/archive or begin P3.

## Risk controls

- No route resolver call inside Application or per-attempt context reconstruction.
- No second Site resolution or second Engine port.
- No protocol DTO migration beyond a minimal mapper compatibility edit required to compile.
- No queue/transcode/advanced-quality universalization.
- No Electron startup-order change; top-level composition must obey the ESM initialization-order contract.
- No edits to the unrelated `.trellis/.template-hashes.json` change.
