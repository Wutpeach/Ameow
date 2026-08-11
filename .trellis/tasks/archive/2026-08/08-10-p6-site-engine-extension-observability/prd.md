# P6 Site / Engine Extension Model + Observability

## Lead Architecture Review Decision

Lead Architecture Review approved the split on 2026-08-10:

```text
P6A = Site / Engine Extension Model
P6B = Observability / Diagnosability
```

P6A is Lead-approved and committed at `6f2f31a`. This existing task is now the
implementation target for **P6B only**. Earlier planning-only and P6A-only
language below records completed gates; where it conflicts with this decision,
this section is authoritative. Do not redesign P0-P6A.

## Current implementation goal

Make one download Job reliably, safely, and cheaply diagnosable from prepare
through attempts, fallback/auth recovery, cancellation, and exactly one
terminal outcome. Use one stable Job `traceId`, Application-owned monotonic
attempt identity, a closed event union, a best-effort diagnostic sink, bounded
in-memory attempt history, structured failure categories, and allowlisted
redacted summaries. Observability failure must never change download
correctness, and diagnostics must never leak sensitive data.

## Original planning goal

Produce an evidence-backed architecture audit and implementation-ready Trellis plan that reduces unrelated changes when adding a Site or Engine and makes one download diagnosable across resolve, plan, route, attempts, fallback or authentication recovery, and terminal outcome.

This task is planning-only. It must remain in `planning` until Lead Architecture Review explicitly approves an implementation scope.

## Background

P0 through P5 are complete and form the baseline. P6 must preserve their established ownership and invariants, including one immutable `NetworkRoute` per job, resolve-once immutable `ResolvedDownloadPlan`, attempt-specific cookies, `DownloadJobService` lifecycle authority, the existing protocol boundary, and renderer and browser-extension lifecycle ownership.

## Requirements

### R1. Independent audit tracks

- Audit Track A, Site / Engine Extension Model, independently from Track B, Observability / Diagnosability.
- Determine only after both audits whether implementation should be one P6 or split into P6A and P6B.
- Identify the genuine shared contracts and the concerns that do not depend on each other.

### R2. Site extension audit

- Inventory every current modification point for adding a Site across registry, identifiers and unions, domain and application policy, capture/session mapping, protocol, renderer, browser extension, configuration, engine selection, and tests.
- Classify site-name branches as legitimate registry/composition logic or leaked site policy.
- Evaluate the current `SiteProvider` responsibilities without expanding the contract unless repository evidence shows real pressure.

### R3. Engine extension audit

- Inventory every current modification point for adding an Engine across `EngineId`, registries, switches, runtime binary composition, probe ownership, orchestration, application policy, protocol, renderer, and tests.
- Identify real engine-name-driven capability assumptions and introduce no capability abstraction without an existing behavioral consumer.
- Distinguish selection, priority, unsupported decisions, execution, and fallback ownership.

### R4. Site / Engine boundary

- Preserve the direction `SiteProvider -> ResolvedDownloadPlan -> engine selection -> EngineRegistry -> DownloadEngine -> infrastructure adapter`.
- Identify any infrastructure CLI details in Site policy or site-specific business policy in Engine adapters and classify whether each is a P6 blocker.

### R5. Observability audit

- Trace diagnostics from renderer or browser-extension intent through protocol, application, site resolution, plan, route, engine attempt, runtime process, fallback or authentication recovery, and terminal outcome.
- At every layer record identities, events and logs, error structure, correlation, context loss or duplication, raw strings, user-visible information, and test coverage.
- Audit trace, job, attempt, request/correlation, engine, and site identities without collapsing them into one identifier.

### R6. Failure and diagnostic semantics

- Audit `DownloadRuntimeError` and every remaining raw-string/regex policy dependency.
- Propose only failure categories with a real consumer such as fallback, retry, user messaging, diagnostics, or tests.
- Separate structured application diagnostics from developer logs and keep download correctness independent of diagnostic sink failures.

### R7. Sensitive data

- Identify every path where cookies, authorization, proxy credentials, signed URLs, session tokens, browser auth material, raw environment values, or filesystem secrets could enter logs or diagnostics.
- Define a minimal safe-metadata and redaction contract; raw sensitive material must never be persisted or logged.

### R8. Scope and debt classification

- Classify each finding as P6 blocker, follow-up debt, or optional cleanup.
- Explicitly classify `RawDownloadInput` physical ownership, `RuntimeBinaryPaths` physical ownership, probe ownership, `service.ts` co-location, `main.mts @ts-nocheck`, and closed `EngineId` as required, follow-up, or unrelated.
- Do not make optional cleanup an implementation prerequisite.

### R9. Minimal target and staged plan

- Define the smallest target architecture, guard strategy, extension tests, observability tests, and ordered implementation slices supported by repository evidence.
- Recommend combined P6 or split P6A/P6B with reasons tied to surface area, dependency, and review risk.
- Plan validation with `npm test`, `npm run type-check`, `npm run lint`, `npm run build`, `npm run runtime:smoke:downloaders`, `git diff --check`, P0-P5 guards, P6 guards, representative fake Site/Engine tests, trace continuity tests, and redaction tests.

## Acceptance Criteria

- [x] A current Site extension inventory names concrete modification points and distinguishes composition branches from leaked policy.
- [x] A current Engine extension inventory names concrete modification points and identifies only real capability pressure.
- [x] The Site / Engine boundary and ownership of identification, resolution, selection, execution, fallback, authentication recovery, and unsupported decisions are explicit.
- [x] A complete current diagnostics path records identity propagation, events/logging, structured and raw errors, lost context, user-visible output, and tests.
- [x] The trace model explains continuity across fallback and authentication recovery, distinct attempt identity, request correlation, and exactly-one terminal outcome.
- [x] Failure categories each identify at least one real consumer; speculative error-class proliferation is rejected.
- [x] Sensitive fields, URL redaction, diagnostic sink isolation, and storage/persistence decisions are explicit.
- [x] Architecture guards and representative fake Site/Engine extension tests can prove the extension contracts without a plugin platform.
- [x] Findings are classified as blocker, follow-up debt, or optional cleanup, including all named existing debt.
- [x] `design.md` contains the evidence-backed target architecture and a P6 versus P6A/P6B recommendation.
- [x] `implement.md` contains staged slices and the required validation gates without entering implementation.
- [x] Product code remains unchanged, no Develop Worker is dispatched, and task status remains `planning / awaiting Lead Architecture Review`.

### P6A implementation acceptance

- [x] Lead Architecture Review approved the P6A implementation checkpoint at `6f2f31a`.

### P6B implementation acceptance

- [x] One Job keeps one stable trace across initial execution, fallback, auth recovery, cancellation intent, and terminal outcome.
- [x] Application creates distinct monotonic attempt identities for every real Engine execution and retains a bounded sanitized history.
- [x] A closed download diagnostic event union flows through a narrow best-effort sink whose synchronous, asynchronous, serialization, and logger failures cannot change lifecycle correctness.
- [x] Structured diagnostic categories serve terminal diagnostics/presentation while existing fallback/auth policy classification remains authoritative.
- [x] Central allowlist serialization/redaction removes signed URL query/fragment/userinfo, cookies, authorization, proxy credentials, session/browser tokens, raw environment, secret paths, requests/plans, and unbounded process output.
- [x] Terminal diagnostic semantics are exactly once; cancel intent is not terminal cancellation and typed success after cancel intent still wins.
- [x] Renderer prefers structured category/summary for new payloads and keeps regex only as legacy compatibility fallback; Browser Extension remains queue-ack-only.
- [x] Existing runtime log and terminal telemetry receive only bounded safe structured data; no persistent event store or remote telemetry is added.
- [x] P0-P6A guards remain passing and focused P6B trace, recovery, fallback, terminal, privacy, sink-isolation, presentation, and architecture regressions pass.
- [x] Full validation passed and Lead Architecture Review approved P6B and final P6 completion on 2026-08-11.

## Out of Scope

- P0-P6A redesign, including Engine identity/runtime binding, SiteProvider, provider migration, advanced-quality capability/probe ownership, and Browser Extension lifecycle authority.
- Dynamic plugins, plugin marketplace or SDK, runtime discovery, extension manifests, a DI framework, generalized capability registry, or Event Bus.
- CQRS, Event Sourcing, generalized RPC, protocol-version platform, telemetry SaaS, analytics platform, remote crash reporting, or a database-backed diagnostic event store.
- Renderer, browser-extension, Electron, network, protocol, or P0-P5 architecture redesign.
- Full user-interface redesign or exposing raw downloader stderr to users.

## Blocking Open Questions

None. The Lead decision on combined versus split implementation is the intended output of this audit, not a prerequisite to planning.
