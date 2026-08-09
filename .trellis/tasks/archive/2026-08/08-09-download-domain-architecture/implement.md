# Implementation plan

## 0. Audit and baseline gate (complete before product edits)

- [x] Trace the actual request → SiteRegistry → Provider → Orchestrator → EngineRegistry → adapter → runtime runner path.
- [x] Record real violations, disproved suspicions, current provider policy, fallback layers and reusable abstractions in `research/current-download-domain-audit.md`.
- [x] Verify focused baseline: 4 files / 100 tests pass.
- [ ] Re-run `git status --short` before editing and preserve unrelated `.trellis/.template-hashes.json` changes.

## 1. Stabilize core-owned model and boundary mappers

- [ ] Add/refine core `DownloadResult`, progress, capability requirement/support and structured error ownership types using current names where practical.
- [ ] Remove `types/videoRuntime` imports from Domain/Application contracts and Orchestrator.
- [ ] Add explicit runtime/protocol mappers for result/progress and request aliases; preserve existing `file_path`, event names and payload shapes.
- [ ] Normalize legacy quality aliases at the entry boundary and keep extension/advanced-selector details out of stable Domain intent where they are not business concepts.
- [ ] Add focused mapper/model tests before changing runtime call sites.

## 2. Formalize the DownloadEngine port and registry eligibility

- [ ] Narrow `DownloadEngine` to stable id/capabilities/support/execute semantics with application-owned contexts and core result/error types.
- [ ] Remove binary paths, protocol payload types and implementation-specific dependencies from the core-facing port; use the smallest compatibility adapter needed by existing runners.
- [ ] Extend the existing EngineRegistry rather than replacing it: explicit registration/lookup/list, defined duplicate handling and capability eligibility.
- [ ] Add EngineRegistry tests for registration, lookup, missing engine, duplicate id and capability filtering.
- [ ] Update Orchestrator fake-engine tests to the new port without importing Electron/runtime implementation.

## 3. Convert yt-dlp/gallery-dl wrappers into Infrastructure adapters

- [ ] Place or clearly own `YtDlpEngineAdapter` and `GalleryDlEngineAdapter` in Infrastructure; do not rewrite `*Download.ts` runners.
- [ ] Inject/use existing `engineManifest`, command plans, NetworkRoute adapters, process runner, binary/runtime resolution, progress and error classifiers.
- [ ] Keep CLI args, env, temp files, stdout/stderr parsing, retry and FFmpeg details inside Infrastructure.
- [ ] Move concrete engine construction out of application/core paths into Electron composition (main or a narrow composition helper called from main).
- [ ] Preserve custom `ElectronDownloadRuntimeOptions.engines` injection used by tests/hosts.

## 4. Make Orchestrator selection and fallback purely application-owned

- [ ] Validate normalized input, resolve SiteProvider once per application attempt, preserve stable plan identity during candidate execution, and order candidates by existing priority.
- [ ] Filter via plan requirements + registry capabilities + structured supports result before execute.
- [ ] Return core `DownloadResult`; remove UI payload formatting and infrastructure responsibility.
- [ ] Keep fallback based only on stable code/classification/recoverability; no message/stderr parsing or site/engine string conditions in Orchestrator.
- [ ] Preserve selected Weibo variant wording through a structured application error decorator without changing fallback behavior.
- [ ] Cover first success, capability skip, fallback success, terminal stop, missing engine, context forwarding and plan identity.

## 5. Move raw error evidence classification to Infrastructure

- [ ] Split message/stderr pattern recognition from pure stable code/recoverability mapping.
- [ ] Make both engine adapters convert raw/CLI evidence into `DownloadRuntimeError` classification before it reaches Application, reusing P0 network classification/redaction.
- [ ] Preserve existing error context/cause and ensure wrappers do not discard stderr/stdout/network evidence.
- [ ] Add tests for network, auth, extractor/site, filesystem/output, unsupported capability and unknown raw error paths.

## 6. Align SiteProvider plans without erasing real special cases

- [ ] Add minimal capability requirements to existing plans and use current strategy helpers where they remove confirmed duplicated policy.
- [ ] Keep explicit provider engine requirements for Pinterest, Weibo, Instagram, YouTube/Bilibili advanced quality and downloader compatibility exceptions.
- [ ] Do not make capability registry dynamic or plugin-based; do not alter provider order or downloader-owned URL extraction.
- [ ] Strengthen SiteRegistry/provider-alignment tests for match/no-match/resolve failure, exact candidate order/count, `when`/priority and fallback semantics.

## 7. Preserve runtime lifecycle and P0 execution context

- [ ] Adapt `service.ts` only at request/result/progress/composition seams; do not split queue/transcode ownership.
- [ ] Prove the exact Job context identity/network object reaches every eligible engine and remains stable across fallback/auth recovery; next Job resolves a fresh route.
- [ ] Preserve engine runtime readiness, output-stem reservation, session refresh, telemetry and terminal events.
- [ ] Keep advanced quality behavior compatible; do not make it a new universal domain subsystem.

## 8. Add architecture regression guard

- [ ] Add scoped ESLint import restrictions or a focused architecture test using existing tools.
- [ ] Guard core/application against `electron`, project `electron/`, `electron-runtime` implementations and `types/videoRuntime` payload reuse.
- [ ] Add a regression fixture/assertion that fails if a forbidden import is reintroduced.

## 9. Verification and review handoff

Focused during migration:

```text
npm test -- src/orchestration/download-orchestrator.test.ts src/sites/providers.test.ts src/download-capabilities/provider-alignment.test.ts src/core/errors/download-runtime-error.test.ts src/electron-runtime/service.test.ts src/electron-runtime/engineNetworkAdapters.test.ts src/electron-runtime/ytDlpDownload.test.ts src/electron-runtime/galleryDlDownload.test.ts
npm run type-check
```

Final gate:

```text
npm test
npm run type-check
npm run lint
npm run build
npm run runtime:smoke:downloaders
git diff --check
```

- [ ] Run Trellis check and simplify changed files without broadening scope.
- [ ] Inspect final imports to prove Domain/Application run without Electron implementation.
- [ ] If user-facing behavior changed, update relevant Chinese/English public docs and run `npm run docs:build`; otherwise state why docs were unchanged.
- [ ] Produce the requested 13-section P1 report, explicitly answer CLI reuse/new Engine/no Electron tests, and list all skipped/blocked verification honestly.
- [ ] Keep task status `in_progress`; do not commit, finish or archive before architecture review.

## Risk / rollback points

- Core type migration: keep protocol mapper compatibility until all callers move; remove old reverse imports last.
- Port/context narrowing: adapt fake engines and runners incrementally; avoid simultaneous command-plan rewrites.
- `service.ts`: change only boundary wiring/mapping and preserve queue state machine.
- `electron/main.mts`: composition-only edit; no unrelated controller or startup reorder.
- Error classifier: lock existing auth/retry/fallback behavior before relocating patterns.
- P0 network: never move `NetworkRoute` mapping or introduce a second resolver.

## Develop worker handoff

After the user approves this final plan, activate the task and send the worker: the approved intent/decisions/boundaries, all task artifacts, the audit report, applicable specs, baseline status, ownership constraints, and instruction not to revert unrelated edits. The worker must leave the task `in_progress`, avoid commits, and return exact changed files and command results for lead review.
