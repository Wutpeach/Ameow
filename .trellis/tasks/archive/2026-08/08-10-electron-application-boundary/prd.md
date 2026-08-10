# Refactor Electron application boundary

## Goal

Make Electron Main a composition root and OS/platform adapter instead of the owner of the main download business flow. Establish an application boundary that coordinates the existing download request, queue/job, authentication recovery, cancellation, progress, result, and failure lifecycle without importing Electron APIs or rediscovering infrastructure dependencies.

This phase must preserve the P0 network invariants and the P1 Site/Plan/Engine contracts while producing a small, independently mergeable boundary extraction rather than a parallel architecture or broad directory rewrite.

## Background

- P1 is completed and archived. The accepted flow is `Site -> ResolvedDownloadPlan -> DownloadOrchestrator -> DownloadEngine<TExecutionContext> -> infrastructure adapter`.
- `electron/main.mts` and `src/electron-runtime/service.ts` still combine Electron/composition concerns with parts of application-level download coordination.
- The first P2 deliverable is an evidence-backed Architecture Audit and implementation plan. Product code must not change before the plan is reviewed and explicitly approved.

## Requirements

- Audit `electron/main.mts`, `src/electron-runtime/service.ts`, `src/electron-runtime/**`, and directly called application/runtime coordination code. Classify responsibilities by ownership and cite concrete file/line evidence.
- Classify every finding as `Blocker`, `Follow-up debt`, or `Optional cleanup`; only P2 boundary blockers are implementation scope by default.
- Keep Electron ownership limited to process/window/tray/menu lifecycle, OS integration, IPC/WebSocket transport adaptation, and dependency composition.
- Move the principal download use-case coordination behind a framework-light application API that can be exercised without Electron, `BrowserWindow`, or Electron global state.
- Inject concrete downloader/runtime infrastructure at composition time. Application code must not discover binaries, process runners, filesystem/network implementations, persistence/telemetry sinks, or Electron APIs.
- Preserve existing public commands, events, payload shapes, renderer behavior, browser-extension behavior, and product-visible download behavior. Protocol redesign is deferred to P3.
- Prefer extracting ownership and defining one or a few real use-case services. Do not introduce speculative Manager/Factory/Provider/Coordinator/Facade/EventBus/CQRS/Command Bus/DI-container abstractions.
- Preserve `service.ts` responsibilities that would require disproportionate scope to move, provided the retained ownership is explicit and recorded as debt where appropriate.
- Add application-boundary tests for the use cases actually extracted, prioritizing request/job lifecycle, fallback, auth recovery, cancellation, progress/result propagation, and failure completion. Tests must not start Electron.
- Keep the Architecture Guard in place and strengthen it only when needed to enforce the new boundary.

## Required invariants

- One queued Job creates one effective `NetworkRoute`; fallback, retry, and auth recovery reuse the same route object. Electron Main or the new application service must not re-resolve proxy per attempt.
- `prepare()` produces one stable `ResolvedDownloadPlan`; `executePrepared()` reuses it across fallback and auth recovery without repeating Site resolution.
- Auth recovery refreshes attempt-specific cookies only.
- Keep the generic `DownloadEngine<TExecutionContext>` port and do not reintroduce hidden runtime casts.
- Binaries, process, filesystem, network implementation, and other infrastructure details must not flow into Domain ports.
- Existing Architecture Guard coverage must not be deleted or weakened.

## Acceptance Criteria

- [x] The Architecture Audit maps current `main.mts` responsibilities as Composition, Electron/OS shell, IPC transport, Application coordination, Infrastructure execution, and Misc/unclear, with retain/migrate recommendations.
- [x] The Audit maps `service.ts` by concrete use case/lifecycle and identifies Application Service, Infrastructure, compatibility/orchestration glue, and temporarily retained responsibilities.
- [x] The Audit shows current dependency direction, Electron leakage, inverted dependencies, direct infrastructure calls, and protocol DTO use, with scope classification for each finding.
- [ ] The approved implementation establishes a small, independently mergeable application boundary; no `architecture-v2` parallel implementation or mechanical file-length split is created.
- [ ] Electron Main is no longer the primary owner of the download business flow, and its download IPC/extension entry points behave as transport adapters.
- [ ] The principal download use case is callable through a non-Electron application API and is covered by Vitest without starting Electron.
- [ ] Application coordination imports no Electron API and receives infrastructure adapters through composition.
- [ ] Existing renderer/extension command names, event names, DTO shapes, and observable download behavior remain compatible.
- [ ] Tests prove the relevant queue/job, fallback, auth recovery, cancellation, progress/result, and failure-completion behavior for the extracted boundary.
- [ ] Regression review explicitly proves NetworkRoute identity, ResolvedDownloadPlan identity, attempt-only cookie refresh, `DownloadEngine<TExecutionContext>` stability, and Architecture Guard preservation.
- [ ] `npm test`, `npm run type-check`, `npm run lint`, `npm run build`, `npm run runtime:smoke:downloaders`, and `git diff --check` pass before implementation handoff.
- [ ] The task remains `in_progress` after implementation and waits for Lead Architecture Review; P3 does not begin.

## Out of scope

- Redesigning the Download Domain, Site/provider planning, `ResolvedDownloadPlan`, `DownloadOrchestrator`, or `DownloadEngine<TExecutionContext>`.
- Re-resolving network route, Site/provider, or plan during fallback, retry, or auth recovery.
- IPC/WebSocket/browser-extension protocol unification, broad schema changes, or large migration of `src/types/videoRuntime.ts` (P3 input only).
- React feature architecture, renderer state, browser-extension architecture, or unrelated Electron window/controller cleanup.
- Universal queue/event/manager frameworks, dynamic DI/plugin systems, or directory reorganization for aesthetic reasons.
- Broad image-download, transcode, advanced-quality, updater, diagnostics, or site-session redesign unless a minimal compatibility adjustment is required by the approved boundary extraction.

## Deferred inputs

- Protocol DTO leakage that can be removed only by broad schema migration will be recorded for P3.
- Non-download Electron Main ownership issues and low-value file organization cleanup will be recorded without implementation.
- Existing unrelated modification to `.trellis/.template-hashes.json` must be preserved and excluded from P2 ownership.
