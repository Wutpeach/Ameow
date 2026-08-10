# P4 Renderer feature-oriented frontend

## Goal

Give the Renderer's primary Download and Download Queue lifecycle one explicit feature owner behind the P3 desktop protocol boundary. The first P4 slice must make queue acceptance, progress, advanced-quality selection, terminal success, typed failure, and cancellation predictable and independently testable without starting Electron.

P4 is an ownership and dependency-boundary change. It is not a React rewrite, state-library migration, route replacement, design-system project, or whole-Renderer directory move.

## Background

- P0 established one effective network route per Job.
- P1 established stable Site, Resolved Download Plan, Orchestrator, and Engine boundaries.
- P2 established Application-owned ordinary Job lifecycle behavior.
- P3 established protocol-neutral Application commands and transport-specific IPC/WS adapters with typed terminal semantics.
- The Renderer still concentrates Download, Queue, Advanced Quality, Paste/Drag intake, Transcode, Runtime Dependency, Update, Diagnostics, and window-shell behavior in `App.tsx`. It stores several overlapping protocol snapshots and lets event handlers participate in UI policy.
- The audit identified a concrete stale-event race: a progress callback awaits foreground-window preparation, a terminal event removes the trace, and the delayed progress continuation can recreate the completed task.

## Requirements

- Keep all P0-P3 contracts and public IPC command/event behavior unchanged.
- Implement only the smallest independently mergeable slice: Download plus Download Queue lifecycle, including the Advanced Quality transition required by that lifecycle.
- Keep ordinary, pasted, and drag download entry points behavior-compatible while routing their queue/cancel/select operations through one narrow Download client.
- Introduce a Renderer-owned Download model. Protocol DTOs may be decoded at the client boundary but must not be retained as the feature's long-lived state model.
- Give queue membership, progress, cancellation intent, quality-selection intent, and terminal transitions one pure reducer/state owner.
- Derive task counts, primary-task display, badge visibility, and presentation rows from that state instead of storing competing count/detail/progress totals.
- Prevent delayed progress, stale queue detail, and duplicate terminal events from reviving or corrupting a terminal trace. Terminal state must be authoritative and idempotent.
- Let the typed terminal payload win over optimistic local cancellation state. Raw `cancelled`/`canceled` text parsing may remain only as a bounded compatibility fallback for old payloads without typed failure.
- Keep Application decisions out of the Renderer. The UI must not decide engine availability/selection, fallback, auth recovery, retry, or terminal failure classification.
- Register Download subscriptions through one lifecycle-safe owner. Disposal must remain correct if an asynchronous listener-registration promise resolves after unmount.
- Keep App shell policy outside the feature reducer. Window expansion, overlay visibility, notification, dialog, and view-specific presentation consume feature transitions rather than delaying or defining protocol state reduction.
- Do not make Download import Transcode, Site Session, Settings, Runtime Dependency internals, or another feature's private state/components. Cross-feature coordination belongs in app-level composition or an explicit public surface.
- Extend the existing Vitest static import guard; do not add a dependency-analysis package.
- Keep focused feature model, reducer, client, and subscription tests runnable in the existing Node-only Vitest environment without Electron or a new UI test framework.

## Acceptance Criteria

- [ ] Download and Download Queue lifecycle have one explicit feature state owner.
- [ ] Download components and App composition do not invoke raw generic protocol command strings or subscribe to raw Download events directly.
- [ ] Renderer Download state uses feature-owned models rather than P3 IPC DTOs as its long-lived business state.
- [ ] Queue acceptance, progress, Advanced Quality, success, typed failure, and cancellation pass through one documented reducer transition model.
- [ ] A completion followed by delayed progress or stale queue detail cannot resurrect the terminal trace.
- [ ] Duplicate terminal events are idempotent, and multiple concurrent jobs remain isolated by trace ID.
- [ ] Typed success/failure/cancel payloads override optimistic cancellation intent; raw text guessing is not used for new payloads.
- [ ] Subscription setup and cleanup are safe across rerender, unmount, deferred registration, and Strict Effects-style setup/cleanup ordering.
- [ ] Task count, primary task, badge, and quality-selection view state are selector-derived from one lifecycle state.
- [ ] Renderer does not reproduce engine availability, fallback, auth retry, engine selection, or terminal error-classification policy.
- [ ] App-global shell state, feature state, protocol-derived snapshots, and component-local UI state have documented owners.
- [ ] Download does not mutate or import another feature's internal state/components.
- [ ] Focused Download lifecycle tests run without starting Electron and cover queue accepted, progress, terminal outcomes, concurrent jobs, stale events, quality-selection re-entry, and listener cleanup.
- [ ] Architecture Guard blocks feature imports from Electron/Main/electron-runtime/Domain/Engine/raw transport modules, blocks protocol imports from Download model/reducer/selectors, and blocks cross-feature internal imports.
- [ ] Existing visible Download, Queue, Paste/Drag, Advanced Quality, overlay, and notification behavior remains compatible.
- [ ] Transcode, Site Session, Runtime Dependency, Update, Settings, routes, CSS, and design-system architecture are not rewritten in this slice.
- [ ] `npm test` for focused Renderer suites, `npm run type-check`, `npm run lint`, and `git diff --check` pass before implementation handoff.

## Out of Scope

- React, Redux, Zustand, Signals, routing, Tailwind, CSS, or design-system migrations.
- A whole-Renderer feature-folder move or broad component/hook rewrite.
- Transcode lifecycle extraction, even though it currently shares the queue popover and foreground overlay.
- Site Session subscription repair, Runtime Dependency ownership consolidation, Update snapshot consolidation, or Settings decomposition.
- Reworking all paste/drag site-resolution and image/file intake behavior.
- New Repository, Manager, Controller, ViewModel, command-bus, event-bus, or generalized frontend clean-architecture layers.
- P0-P3 backend contract changes or Electron/WS protocol redesign.

## Planning Baseline

Recorded on 2026-08-10:

```text
npm test -- src/utils/downloadEventReducers.test.ts src/utils/downloadViewHelpers.test.ts src/protocol/download/ipcMappers.test.ts src/architecture/import-guard.test.ts src/utils/centerOverlayState.test.ts src/utils/runtimeDependencyGate.test.ts

6 files passed
91 tests passed

npm run type-check
passed

npm run lint
passed
```

The task must remain `planning` until Lead Architecture Review explicitly approves implementation.

## Risks and Deferred Items

- Transcode has the same delayed-progress versus terminal race. It is follow-up debt unless implementation can reuse the generic subscription primitive without migrating Transcode ownership.
- Site Session has deferred-listener cleanup and stale async reload risks. It remains a separate follow-up slice.
- Update state is mirrored independently in App and Settings.
- Runtime Dependency exposes adjacent operational-policy coupling and duplicate hydration work; it is not part of the first Download slice.
- Advanced Quality currently selects the first matching trace and lacks per-trace in-flight protection. P4 must fix only the Download-owned per-trace transition without redesigning the product flow.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
