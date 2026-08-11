# P6 Site / Engine Extension Model + Observability — Target Design

> Lead Architecture Review approved Option B and the P6A checkpoint on
> 2026-08-10. The current implementation scope is P6B only, using commit
> `6f2f31a` as the P6A baseline. P0-P6A must not be redesigned.

## 1. Decision summary

Recommend **Option B**:

```text
P6A = Site / Engine Extension Model
P6B = Observability / Diagnosability
```

Implement and review P6A first, then P6B.

Reasons:

1. The implementation surfaces are materially different. P6A changes identity/schema/composition/runtime binding and removes leaked name branches; P6B changes lifecycle observation, failure metadata, redaction, and terminal diagnostics.
2. P6A has compile-time and packaging/runtime risks; P6B has correctness-isolation and privacy risks. Separate review gates make regressions easier to localize.
3. The concerns are not strongly coupled. P6B can observe the current registries, while P6A can succeed without telemetry.
4. The shared pressure is small and explicit: stable provider/site/engine identity, immutable plan facts, and a clear Application engine-attempt boundary.
5. Combining them would make rollback and architecture review harder without reducing meaningful implementation work.

The approved implementation reuses this existing task and its planning artifacts rather than creating child tasks. Keep the task `in_progress` after P6A validation for the next Lead Architecture Review.

## 2. Shared contracts and independent concerns

### Shared

- `providerId` identifies the provider implementation that resolved the request.
- `siteId` identifies the content/site semantics and may differ from `providerId`.
- an open non-blank `engineId` identifies a registered engine.
- `ResolvedDownloadPlan` remains immutable and contains ordered candidates and only proven requirements.
- Application owns a monotonically increasing attempt index for every actual `DownloadEngine.execute()` dispatch.
- fallback and auth recovery reuse one `traceId`, plan, Job context, and NetworkRoute.

### P6A-only

- Site hint/name enumeration and provider registration pressure;
- open Engine identity and runtime binding;
- binary/readiness/probe ownership;
- removal of Site/Engine policy from unrelated modules;
- fake Site/Engine extension regressions.

### P6B-only

- structured lifecycle events and attempt history;
- control classification versus user diagnostic category;
- sink isolation;
- redaction and safe terminal diagnostics;
- logging/telemetry/persistence behavior.

No unified “extension + telemetry framework” is proposed.

## 3. P6A target architecture

```text
Raw Download Intent
        |
        v
explicit SiteRegistry
        |
        v
existing SiteProvider (unchanged)
        |
        v
immutable ResolvedDownloadPlan
  providerId / siteId / ordered engine IDs / proven requirements
        |
        v
Application selection + fallback
        |
        v
open EngineRegistry
        |
        v
DownloadEngine<TExecutionContext>
        |
        v
explicitly composed Infrastructure adapter + runtime dependencies
```

### 3.1 Site design

Keep `SiteProvider` unchanged:

```ts
interface SiteProvider {
  readonly id: string;
  matches(input: RawDownloadInput): boolean;
  resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan | null;
}
```

Rules:

- a desktop-only Site needs implementation, explicit provider registration/order, and focused tests;
- shared transports preserve a safe normalized opaque hint or fall back to generic behavior; they do not enumerate every Site;
- Site matching remains provider-owned;
- interaction/session/browser/presentation metadata is added only when that feature is requested;
- the generic interaction diagnostic returns generic/unknown rather than throwing for a new Site;
- remove the mandatory provider-migration-ledger edit from builtin-provider onboarding;
- derive selected-variant error context generically from intent/plan fields, not `providerId === "weibo"`.

The runtime strategy helper may remain for Sites that share it. P6A should not require all providers to use it and should not introduce dynamic registration.

### 3.2 Engine identity and registry

Make the Domain/Application Engine identifier open and runtime-validatable as a non-blank string. `EngineRegistry` remains the authority for existence and duplicate registration.

Do not expose Engine identities to Renderer or Browser Extension protocols. Telemetry schemas accept the same canonical Engine identifier instead of maintaining a second closed union.

An unknown/missing Engine produces a structured engine-unavailable failure. It must never silently use yt-dlp readiness, network consumer, or failure-layer defaults.

### 3.3 Runtime composition

Composition stays explicit. A minimal binding may colocate only facts that already must move together:

```text
engine ID
-> concrete DownloadEngine adapter
-> ensure-runtime-ready operation
-> network consumer/application adapter
```

This may be an explicit typed map/array in composition, not a plugin manifest, runtime loader, DI container, or `registerEverything(plugin)` API.

Engine-specific binary paths move out of the global core `RuntimeBinaryPaths`. Each adapter receives its own constructor dependencies. Shared ffmpeg/ffprobe/deno values remain shared only where current consumers prove they are shared.

Managed runtime package/bootstrap/version work remains explicit Infrastructure work for an Engine that actually needs it; a non-managed or test Engine must not edit those modules.

### 3.4 Capability and probe design

No generalized capability model is added.

- Retain only capability pressure proven by current behavior.
- Normal engine eligibility may keep a minimal requirement object.
- Resolve the `advancedQuality` inconsistency: either declare it as the explicitly composed yt-dlp probe feature it is today, or add a separate probe port only if Lead commits to more than one probe implementation.
- The ordinary `DownloadEngine` adapter does not gain cookies/capture/network/video/gallery booleans; those values are already represented by plan/context/support behavior.
- Site-specific strategy/capability seed data must not become a second authority over explicit provider plans.

## 4. P6B target architecture

```text
Application lifecycle authority
  DownloadJobService + DownloadOrchestrator
        |
        v
closed DownloadDiagnosticEvent semantics
        |
        v
best-effort DownloadDiagnosticSink port
        ^
        |
Composition / Infrastructure renderers
  - structured runtime log
  - existing terminal telemetry aggregate
  - safe terminal snapshot mapping
```

Infrastructure facts flow upward without reversing dependencies:

```text
Engine adapter / process / route application
        |
        v
typed safe execution outcome or DownloadRuntimeError
        |
        v
Application fallback/recovery policy
```

Forbidden directions:

```text
Domain -> logger implementation
Engine -> UI
Telemetry -> fallback/retry correctness
Renderer -> raw engine stderr policy
```

### 4.1 Attempt semantics

Application creates `attemptIndex` immediately before every engine execution context is built. It increments across candidate fallback and a repeated chain after auth recovery.

Minimum attempt facts:

- `traceId`, `attemptIndex`, stable `attemptId`;
- `providerId`, `siteId`, `engineId`;
- phase/cycle (`initial` or `auth_recovery`);
- start/end time or duration;
- outcome, error code, policy classification, diagnostic category;
- safe network application metadata;
- optional bounded engine-local subattempt label/index.

Do not add UUIDs for site, route, fallback, or recovery when trace + attempt index + closed phase already identifies the event.

### 4.2 Structured lifecycle semantics

Use the smallest event set that answers the audit questions:

- `download.prepared` includes provider/site/candidate engine IDs and safe plan facts;
- `network.resolved` includes safe one-per-Job route metadata;
- `attempt.started` / `attempt.failed` / `attempt.succeeded`;
- `fallback.started` only when Application actually moves to another candidate;
- auth recovery start and result;
- one terminal success/failure/cancelled event.

`site.resolved` and `engine.selected` remain fields on the above events unless a real consumer needs separate timing. This avoids ceremony.

`DownloadDiagnosticSink.record(event)` accepts only the closed union. A safe wrapper catches synchronous throws, promise rejections, and serialization failures. Diagnostic failure never changes the download outcome.

### 4.3 Error semantics

Keep `DownloadRuntimeError`; do not create many subclasses.

- `code`: stable technical condition.
- `classification`: control-policy decision (`fallback_to_other_engine`, `auth_required`, `cancelled`, etc.).
- optional `diagnosticCategory`: stable user/support meaning with a proven UI/diagnostic/test consumer.
- Infrastructure classifies raw stderr/network evidence and returns typed fields.
- Renderer prefers `diagnosticCategory`; regex mapping stays compatibility-only for legacy payloads.

No new category is added merely because it sounds complete. Protocol/capture/selection failures remain in their owning boundaries until a real consumer needs them in a download trace.

### 4.4 Safe diagnostic data

Introduce one shared safe-field/redaction contract at the composition/Infrastructure boundary:

- serialize allowlisted metadata only;
- URL diagnostics default to origin-only plus safe booleans/counts;
- never serialize request/plan/error context/environment/CLI args wholesale;
- redact query, hash, userinfo, authorization/cookies/tokens/proxy credentials and secret paths;
- bound stdout/stderr summaries before classification/output;
- use the same scrubber for structured runtime log rendering, terminal diagnostic mapping, clipboard copy, and terminal telemetry.

NetworkRoute authority and resolution stay unchanged; P6B only consumes its existing safe snapshot per Job/attempt.

### 4.5 Terminal and user-facing diagnostics

`DownloadJobService` still decides the ordinary terminal outcome. The outer protocol mapper still emits exactly one Renderer terminal event.

Add only:

- safe structured failure category;
- bounded attempt summary when useful for diagnostics;
- exactly-one diagnostic terminal event.

Raw stderr is never sent to Renderer. Browser Extension remains queue-ack-only; no Extension UI redesign or terminal protocol is included.

### 4.6 Storage

No new persistent diagnostic store.

- bounded attempt history lives in active Job context;
- safe structured events may be rendered to the existing session runtime log;
- existing `download-outcomes.jsonl` remains a terminal aggregate and must be scrubbed before recording;
- lifecycle events are not appended to a new JSONL/database;
- crash recovery/replay and telemetry retention are follow-up work.

## 5. Architecture guards

Extend the existing import-guard test, not the toolchain:

1. `src/sites` and `src/application` cannot import Electron, protocol/Renderer types, or concrete engine adapters.
2. concrete engine adapters/runners cannot import `src/sites` or Renderer feature code.
3. Application diagnostic contracts cannot import logger, telemetry storage, Electron, or protocol modules.
4. Domain cannot import any logging/diagnostic sink implementation.
5. generic diagnostic modules cannot import yt-dlp/gallery-dl raw parsers.
6. preserve `DownloadEngine<TExecutionContext>` contravariance and registry context typing.

Add representative architecture tests rather than a dependency analyzer:

- opaque fake Site registration/resolution without core/protocol/UI enumeration;
- opaque fake Engine registration/selection/execution without closed-union edits;
- import violation fixtures for Site -> adapter, adapter -> Site, Application diagnostics -> Electron;
- capability and runtime-context compile-time rejection fixtures.

## 6. Compatibility and migration

- existing Site and Engine IDs keep their string values;
- existing provider order, plan identity, engine priorities, fallback conditions, network route, cookies, auth recovery, progress, and terminal wire shapes remain compatible;
- new diagnostic fields are additive and optional at protocol boundaries;
- Renderer keeps legacy category fallback during migration;
- Extension request/correlation IDs and queue-ack trace remain unchanged;
- existing telemetry event can add safe fields/version only through an explicit schema migration; do not silently reinterpret historical records.

## 7. Rollback boundaries

### P6A

- Slice identity/schema openness separately from runtime binding/path changes.
- Preserve old explicit adapter registrations until fake Engine tests pass.
- Do not remove current engines or strategy data in the same slice as opening identity.

### P6B

- Add observer calls behind an injected no-op sink first.
- Keep current progress/terminal event mapping unchanged while diagnostic tests settle.
- Migrate Renderer to structured category only after additive payload tests pass.
- Redaction hardening may reduce logged detail but must not alter execution inputs or engine args.

## 8. Blockers, follow-up debt, optional cleanup

### Blockers accepted into P6A

- closed Engine IDs/schemas and duplicate capability Engine IDs;
- `RuntimeBinaryPaths` cross-engine ownership;
- silent yt-dlp defaults in readiness/network composition;
- Weibo policy in generic Orchestrator;
- advanced-quality Site/Engine hardcoding that contradicts capability claims;
- Site hint/interaction enumeration that can reject a new Site;
- mandatory provider migration ledger edits.

### Blockers accepted into P6B

- missing attempt identity/history;
- no structured fallback/recovery lifecycle facts;
- terminal cannot correlate failed attempts;
- raw-message category guessing;
- signed/tokenized URL and open-context leakage;
- non-isolated logger/telemetry/diagnostic failures;
- latest-only network application snapshot.

### Follow-up debt

- `RawDownloadInput` physical move;
- full `service.ts` decomposition and `main.mts` typing;
- dynamic capability probing/plugin SDK;
- full telemetry backend, analytics, crash reporting, retention/rotation;
- Extension terminal observability UI;
- protocol version/capability negotiation;
- persistent diagnostic database.

### Optional cleanup

- registry/helper/file renaming or movement;
- uniform provider plan helpers;
- log wording and prefix consistency;
- switch-count reduction without extension or diagnostic value;
- type naming normalization.

## 9. Explicit non-goals

- dynamic plugin loader, marketplace, third-party SDK, runtime discovery, or extension manifest platform;
- DI framework, generalized capability registry, Event Bus, manager/factory/provider framework;
- CQRS, Event Sourcing, generalized RPC, protocol-v2 platform;
- telemetry SaaS, analytics platform, remote crash reporting, database event store;
- Renderer, Browser Extension, Electron, network, protocol, or P0-P5 redesign;
- raw stderr in user interfaces;
- big-bang rewrite.
