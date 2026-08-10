# P6A / P6B Staged Implementation Plan

## Phase gate

Lead Architecture Review approved the split on 2026-08-10. Start and execute
this existing task for **P6A only**. A Develop Worker may be dispatched. Do not
enter P6B, create child implementation tasks, commit, archive, or mark PASS.
After validation, keep the task `in_progress / awaiting Lead Architecture
Review`.

Recommended execution order:

```text
P6A Extension Model
  -> Lead/check gate
  -> P6B Observability / Diagnosability
  -> Lead/check gate
```

The Lead explicitly chose to reuse the existing task and planning artifacts for P6A. P6B remains a later, independently reviewed implementation phase.

## P6A — Site / Engine Extension Model

### Slice A1. Remove unrelated Site onboarding obligations

- Make shared Site hint handling preserve a safe normalized opaque ID or fall back to generic behavior; provider matching remains authoritative.
- Make interaction diagnostics return generic/unknown when no Site-specific entry exists instead of rejecting command decode.
- Allow the Browser Extension generic transport to preserve explicit Site hints without adding every Site to alias/URL switches; keep dedicated detectors and pasted-resolution eligibility feature-owned.
- Remove or decouple the “every builtin provider must have a migration target” production/test obligation. Keep historical reporting only where still consumed.
- Replace the Orchestrator's Weibo-name branch with generic selected-variant context derived from the plan/intent.
- Do not change the `SiteProvider` interface.

Acceptance checks:

- an opaque fake Site resolves through implementation + explicit registry registration;
- no core hint, protocol, Renderer, Extension, session, or migration-ledger edit is required for that desktop-only fake Site;
- unknown/default Site still resolves through the generic provider;
- existing dedicated Site behavior and provider precedence remain unchanged.

Risk / rollback:

- risk is changed hint normalization or provider precedence;
- keep current provider order and add compatibility tests before deleting any aliases;
- roll back opaque-hint transport independently from migration-ledger cleanup.

### Slice A2. Open Engine identity at Domain/Application boundaries

- Replace the closed Domain `EngineId` and engine-plan schema enum with one canonical validated non-blank Engine ID.
- Make `EngineRegistry` existence/duplicate checks authoritative.
- Remove the duplicate closed `CapabilityEngineId` requirement from plan/telemetry paths that need to accept registered engines.
- Keep existing yt-dlp/gallery-dl string values and plan compatibility.
- Ensure unknown/unregistered engines produce structured engine-unavailable/rejected outcomes, never an implicit yt-dlp default.

Acceptance checks:

- an opaque fake Engine compiles, registers, is selected, executes, and appears in safe diagnostic/telemetry types without editing a central union;
- duplicate and missing IDs remain explicit failures;
- registry execution-context generic typing and variance tests still reject unsafe widening.

Risk / rollback:

- schema widening must not weaken non-blank validation or duplicate detection;
- keep runtime composition closed/explicit while opening only Domain/Application identity;
- revert telemetry/schema adaptation separately if serialization compatibility fails.

### Slice A3. Localize Engine runtime dependencies and composition

- Remove engine-specific executable fields from the global core `RuntimeBinaryPaths` shape.
- Inject yt-dlp/gallery-dl executables and genuinely shared tools through adapter-specific constructor dependencies.
- Introduce the smallest explicit composition binding for adapter registration, readiness, and network application facts.
- Replace `main.mts` engine ternaries/defaults with explicit lookup and fail-closed behavior.
- Keep managed Python/bootstrap/version work explicit for the engines that use it; do not build runtime discovery.
- Preserve P0 one-route-per-Job and adapter argument/environment authority.

Acceptance checks:

- fake non-managed Engine composition does not modify managed-runtime status/package types;
- yt-dlp/gallery-dl bootstrap and smoke behavior are unchanged;
- every registered production Engine has an explicit readiness/network binding;
- no unknown Engine maps to yt-dlp consumer/layer behavior.

Risk / rollback:

- packaging/runtime path regression is the highest P6A risk;
- land adapter constructor/path changes independently per Engine;
- keep current runtime resolver functions until both adapters and smoke tests use the new ownership.

### Slice A4. Make capability/probe ownership honest

- Use only current capability pressure.
- Remove generic runtime Site-name checks where plan requirements already express advanced-quality eligibility.
- Decide, in the approved child design, whether advanced-quality probing remains an explicitly composed yt-dlp feature or gains a separate small probe port because a second implementation is actually committed.
- Do not add speculative video/gallery/cookies/capture/network capability booleans.
- Keep selection, execution, and fallback ownership distinct.

Acceptance checks:

- adding a Site with existing advanced-quality plan semantics does not edit a generic Site allowlist;
- the advertised capability cannot claim support that the probe path cannot execute;
- unsupported capability is typed and follows Application fallback policy;
- raw engine output never becomes capability/selection policy.

Risk / rollback:

- avoid changing quality-selection UX or protocol fields;
- if a separate probe port is not justified, document the yt-dlp-specific feature explicitly and stop there.

### Slice A5. P6A guards and extension regression suite

- Extend the existing import guard; do not add a dependency analyzer.
- Guard Site/Application from concrete adapters/Electron/protocol UI.
- Guard adapters/runners from Site and Renderer feature imports.
- Add representative fake Site and fake Engine fixtures.
- Retain all P0-P5 guard and lifecycle tests.

Focused P6A checks should cover:

- Site registry resolution, unknown/default Site, Site policy isolation, stable plan identity;
- fake Site onboarding delta;
- Engine registry, selection, structured unsupported result, fallback, fake Engine onboarding delta;
- generic variance/runtime-context type safety;
- runtime bootstrap/network binding fail-closed behavior.

## P6B — Observability / Diagnosability

### Slice B1. Add Application trace/attempt semantics behind a no-op sink

- Define a closed download-only diagnostic event union and `DownloadDiagnosticSink` port in Application-neutral code.
- Add a default no-op sink so behavior and protocol output remain unchanged initially.
- Create one monotonically increasing attempt index per Job immediately before each Engine execution dispatch.
- Carry trace/attempt/engine/provider/site/cycle facts through fallback and auth recovery.
- Keep optional runner subattempt labels subordinate to the Application attempt.
- Record exactly one diagnostic terminal event for ordinary success/failure/cancellation.

Acceptance checks:

- one trace across fallback and auth recovery;
- distinct attempt IDs including repeated same-engine execution after recovery;
- failed attempt history survives later success;
- plan, Job context, and NetworkRoute identities remain stable;
- cancellation is not failure and success after cancel intent remains success.

Risk / rollback:

- observer calls must not change control flow;
- land event collection with a no-op sink before connecting logging/telemetry;
- preserve existing Renderer terminal mapper exactly in this slice.

### Slice B2. Produce typed safe Infrastructure facts and failure category

- Keep raw process/network parsing inside Infrastructure.
- Add only a proven diagnostic category field to the existing error model; do not add error subclasses.
- Keep control-policy classification separate.
- Attach safe route application facts to the owning attempt rather than overwriting one latest snapshot.
- Bound stdout/stderr evidence and convert it to an allowlisted safe summary before it leaves the adapter.
- Remove raw `sourceUrl` and open stdout/stderr bags from protocol-facing error context.

Acceptance checks:

- fallback/retry decisions still use typed classification, never raw message;
- user category has a real consumer and remains distinct from fallback policy;
- network failure remains identifiable without changing P0 resolution;
- unsupported, engine unavailable, engine execution, auth, cancellation, input/site, output, and current user-relevant categories map deterministically.

Risk / rollback:

- retain legacy classification refinement only as a bounded Infrastructure compatibility path;
- additive diagnostic category first, Renderer migration later.

### Slice B3. Centralize safe metadata and redaction

- Define one allowlist-based diagnostic serialization/redaction helper.
- Reduce URLs to origin-only plus safe metadata; strip query, fragment, userinfo, and signed path material.
- Remove cookies, authorization, proxy credentials, session tokens, browser auth, cookie paths, raw environment, secret filesystem paths, and raw CLI args.
- Apply the helper to structured event log rendering, engine debug/timing logs, terminal diagnostic mapping, clipboard diagnostic copy, and terminal telemetry.
- Replace the diagnostic-copy `preservedOriginalUrl` promise with the safe URL summary.

Acceptance checks:

- signed XHS/other tokenized URLs are scrubbed;
- common and uncommon query-token names cannot leak;
- raw cookie/environment/path fixtures cannot appear in any diagnostic output;
- redaction preserves enough identity/category/route facts to diagnose the layer and attempt.

Risk / rollback:

- this slice intentionally reduces log detail but must never alter execution input/args;
- keep execution objects separate from diagnostic snapshots to prevent accidental mutation.

### Slice B4. Compose isolated sinks without a new event store

- Render structured events to the existing session runtime log.
- Keep existing `download_outcomes` telemetry terminal-only; add safe aggregate/attempt counts only if the schema migration is explicitly approved.
- Keep bounded attempt history in the active Job context and terminal safe snapshot.
- Wrap logger, telemetry, and diagnostic sink calls so synchronous throw, rejection, and serialization failure cannot change download execution or suppress a required terminal event.
- Report sink failure through a guarded fallback path without recursion.
- Add no database, lifecycle JSONL, analytics SDK, or remote service.

Acceptance checks:

- logger fails, telemetry fails, sink rejects, and serializer fails: download outcome and terminal event remain correct;
- pending cancellation emits its terminal event even when telemetry fails;
- observability failure is identifiable in fallback logs where possible;
- no unbounded in-memory attempt history.

Risk / rollback:

- keep product event emission separate from optional diagnostics;
- do not silently swallow actual engine/application correctness errors.

### Slice B5. Additive terminal/presentation integration

- Add the safe structured category and bounded attempt summary to the existing terminal mapping only if needed by current diagnostics.
- Update Renderer category selection to prefer structured fields and retain regex fallback for legacy payloads.
- Keep raw stderr internal and keep Browser Extension queue-ack-only.
- Update the public troubleshooting docs under `site/src/content/docs/` only if user-visible error wording/diagnostic-copy behavior changes.

Acceptance checks:

- Renderer does not need yt-dlp/gallery-dl parsing for new payloads;
- full stderr is not exposed;
- existing command/event names and Extension protocol remain unchanged;
- copied diagnostics are safe and still useful.

Risk / rollback:

- additive protocol fields allow independent Renderer rollback;
- no Renderer or Extension redesign.

### Slice B6. P6B guards and observability regression suite

- Extend the existing import guard for Domain/Application diagnostic directions.
- Prove generic diagnostics cannot import engine-specific raw parsers.
- Add trace, attempt, terminal, redaction, and sink-isolation tests described in the research audit.
- Retain P0-P5 guards and compatibility suites.

## Cross-phase integration review

After P6A and P6B independently pass:

- add the fake Engine to the diagnostic test only through registry/composition and verify its open ID appears in attempt events;
- add the fake Site through provider/registry and verify provider/site identity appears without protocol/UI enumeration;
- confirm fallback/auth recovery reuse one trace and immutable plan/route after P6A identity changes;
- confirm no P6B diagnostic contract has become a Site/Engine registration framework;
- confirm neither phase moved lifecycle policy out of `DownloadJobService`/Application.

## Required implementation validation gate

Run the full gate after each child and again after integration:

```text
npm test
npm run type-check
npm run lint
npm run build
npm run runtime:smoke:downloaders
git diff --check
```

Additionally run focused suites for:

- P0 network route and adapter args/env authority;
- P1 Site/Engine registry, immutable plan, fallback, and engine contract;
- P2 `DownloadJobService` lifecycle/terminal behavior;
- P3 IPC/WS mapper and compatibility boundaries;
- P4 Renderer download feature reducer/client lifecycle;
- P5 Browser Extension Desktop client, correlation, session/capture/selection boundaries;
- P6 fake Site/Engine, import guards, attempt trace continuity, exactly-one terminal, failure taxonomy, sensitive redaction, and sink isolation.

If user-visible diagnostics change, also run:

```text
npm run docs:build
```

## Stop / review conditions

Return to planning and request Lead review if implementation evidence would require any of the following:

- dynamic plugin loading, runtime discovery, plugin SDK/manifest, DI framework, Event Bus, or generalized capability registry;
- a protocol-breaking change or Extension terminal lifecycle;
- a persistent diagnostic database/event store;
- a P0-P5 ownership reversal;
- a new error category without a real consumer;
- SiteProvider growth beyond identification and plan resolution;
- a second probe abstraction without a committed second implementation.
