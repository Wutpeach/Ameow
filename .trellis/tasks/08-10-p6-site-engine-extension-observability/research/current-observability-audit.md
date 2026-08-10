# P6 Track B — Current Observability / Diagnosability Audit

## Scope and baseline

This audit traces the current download diagnostic path without redesigning P0 network routing, P2 lifecycle ownership, P3 transports, or P4/P5 UI and Extension state. It distinguishes download trace identity from IPC/WS request correlation and distinguishes structured application semantics from developer logging.

No product code was changed.

## 1. Current end-to-end diagnostics path

| Layer / transition | Identity currently present | Events / logs / structured facts | Context lost or duplicated | Current tests |
| --- | --- | --- | --- | --- |
| Renderer intent | IPC promise plus later Desktop `traceId` acknowledgement | queue command; Renderer consumes queue/progress/terminal events | no request ID is needed for IPC promise; no attempt/site/engine history | Application/client/reducer tests cover acknowledgement and stale queue state |
| Browser Extension intent | Extension-owned `requestId` + connection generation | Desktop port sends queue-ack-only `video_selected_v2`; response includes Desktop `traceId` | Extension receives no terminal result; transport ID and trace are correctly separate | Desktop protocol client tests cover generation, timeout, duplicate/stale response, and trace payload preservation |
| Protocol decode | WS/IPC transport correlation only | typed canonical queue command after P3 mapping | no download trace exists for malformed/rejected commands; this is a protocol diagnostic, not an attempt | mapper/adapter tests |
| Queue/Application entry | `nextDownloadTraceId()` creates the Desktop download trace | pending/active queue states and logs | `traceId` doubles as public Job identity; private `download-ctx-${traceId}` adds no independent semantic identity | queue/service tests |
| Site resolve / prepare | same trace exists in outer closure; plan has `providerId` and intent `siteId` | `onPrepared` timing log contains provider and engine candidates | no structured `site.resolved`/`download.prepared`; reason/source facts are only in the in-memory plan | provider/orchestrator/Job identity tests |
| Network route | private execution-context identity plus same trace; resolved route has its own resolution facts | safe `NetworkDiagnosticSnapshot` strips target to origin and records route/application result | one mutable snapshot is overwritten by later engine application, so prior fallback attempts are lost | P0 network and engine adapter tests |
| Engine selection/dispatch | trace + engine name | dispatch/timing logs; registry and support errors are typed | no selection event, candidate rejection record, attempt index, or durable attempt history | orchestrator tests cover fallback behavior, not diagnostics |
| Engine process attempt | trace + yt-dlp-local label (`primary`, section retry, transient retry) | progress, timing logs, exit/stderr classification, network facts | local labels are not global attempt identities; gallery-dl has no equivalent ID; subprocess retries and Application engine attempts are conflated | runner tests cover retry behavior and redaction fragments |
| Fallback | same immutable plan and Job context | Orchestrator silently advances to next plan after typed failure | failed candidate is overwritten by `lastError`; no `fallback.started` fact or history survives success | Job tests prove same plan/context and success, not trace events |
| Auth recovery | same trace/plan/Job context | typed first failure is passed to the injected recovery | no recovery start/result event; a successful retry erases the first auth failure from terminal diagnostics | Job tests prove at-most-once recovery and identity reuse |
| Terminal outcome | trace + last/chosen engine | one Renderer terminal event; terminal-only JSONL telemetry; runtime logs | terminal telemetry has only final chosen engine, not attempts/fallback/recovery; Renderer gets raw context but no safe attempt summary | Job/Service/P3 tests prove ordinary exactly-once terminal mapping |

## 2. Trace and correlation identity audit

### 2.1 Existing identities

| Identity | Creator | Lifetime / propagation | Finding |
| --- | --- | --- | --- |
| Download `traceId` | Electron runtime when queueing (`nextDownloadTraceId`) | queue ack, pending/active state, progress, engine context, logs, terminal event, outcome telemetry | correct Job-level identity |
| Job identity | effectively the same `traceId`; private `DownloadExecutionContext.identity` is derived from it | one ordinary Job and one stable route/context | no need for another UUID unless a separate persisted Job entity appears |
| Application engine attempt | none | only current `enginePlan` and mutable `chosenEngine` | **missing** |
| Engine-internal subprocess attempt | yt-dlp local label only; gallery-dl none | runner-local logs | useful subordinate fact but not a cross-engine attempt identity |
| Site identity | `providerId` plus `intent.siteId` | plan and terminal telemetry | both are meaningful and must remain distinct (`gallery-dl-supported` provider may resolve `instagram`/host Site IDs) |
| Engine identity | engine plan / chosen engine | selection/execution and terminal telemetry | only final engine survives |
| Extension request ID | Browser Extension Desktop protocol client | one WS request on one connection generation | correctly separate from download trace |
| Desktop-to-Extension correlation ID | Desktop inbound command ID returned as `correlationRequestId` under a new Extension request ID | resolver/session operation only | correctly separate from download trace and Extension transport ID |
| IPC correlation | Electron invoke Promise | one command response | no extra UUID needed |

### 2.2 Continuity findings

- Fallback and auth recovery already reuse the same trace because they reuse the same prepared plan and Job context.
- The trace is not technically broken; its **history is unobservable**.
- There is no stable attempt index, so two executions of the same engine before/after auth recovery cannot be distinguished.
- A terminal outcome cannot be correlated to the full attempt history because only the final `chosenEngine` and final error remain.
- Extension/Desktop request correlation and the download trace are not currently conflated and must not be merged.

### 2.3 Minimal target identity model

```text
traceId              one queued download Job
  attemptIndex       monotonically increasing per Application engine execution
  attemptId          deterministic from trace + index, or an explicit local value
    engineId         candidate executed
    cycle            initial | auth_recovery (small enum, not another UUID)
    subAttempt        optional Infrastructure-local label/index for process retries
```

The Application owns `attemptIndex` because it owns selection/fallback/recovery. The adapter may report bounded `subAttempt` facts, but must not invent global fallback identity. One UUID for all concepts is explicitly rejected.

## 3. Current event and diagnostic model

### What exists

- product events: progress, queue state/detail, and one terminal Renderer event;
- developer logs: free-form and JSON fragments from runtime/engines/Main;
- terminal telemetry: `download_outcome` JSONL with trace/site/provider/engine chain/chosen engine/outcome/error/profile/network;
- typed runtime error: code, policy classification, context, and cause;
- user diagnostic copy: typed failure plus recent runtime-log excerpt.

### What is missing

- no Application-owned lifecycle observer;
- no closed structured facts for prepare, selection, attempt start/end, fallback, auth recovery, or terminal;
- no attempt history snapshot;
- no way to distinguish an Engine candidate rejection from a spawned process failure without parsing logs/context;
- no exactly-once diagnostic terminal assertion independent from the Renderer event;
- no safe failure of the observer path.

### Smallest useful event vocabulary

P6B should define a closed, download-only discriminated union. The names below are a target, not an Event Bus API:

```text
download.prepared
network.resolved
attempt.started
attempt.failed
attempt.succeeded
fallback.started
auth_recovery.started
auth_recovery.failed | auth_recovery.succeeded | auth_recovery.declined
download.cancelled | download.failed | download.succeeded
```

`site.resolved` and `engine.selected` need not be separate events if `download.prepared` and `attempt.started` already carry the facts. Fewer semantic events are preferable when they answer the same diagnostic question.

Use an explicit `DownloadDiagnosticSink.record(DownloadDiagnosticEvent)` port with a closed union and an internal best-effort wrapper. This is not `emit("download-event", arbitraryObject)` and must not become a generalized Event Bus.

## 4. Failure taxonomy audit

### 4.1 Current control-policy taxonomy

`DownloadRuntimeError` has stable codes and a `DownloadFailureClassification` used by real behavior:

```text
retry_same_engine
fallback_to_other_engine
terminal_for_site
input_invalid
auth_required
cancelled
```

This classification answers **what Application policy may do**. It should remain separate from a diagnostic category.

Infrastructure adapters classify raw CLI/stderr evidence before Application fallback. This is the correct dependency direction. The remaining generic refinement in `service.ts` is a legacy safety net for unstamped `E_EXECUTION_FAILED`, not a license for Application to parse stderr.

### 4.2 Current diagnostic taxonomy

Renderer utility `errorDiagnosticCategories.ts` maps typed fields plus `rawMessage`, open context, and fallback message through regexes into user categories. This means Renderer still guesses auth/network/content/output/format/runtime meaning from engine text. Gallery-dl attaches raw-ish stdout/stderr tails and a full `sourceUrl` to error context; the protocol passes the open context to Renderer.

### 4.3 Target separation

Keep one error class and add at most one optional structured diagnostic field/category. Do not create a class per category.

Candidate diagnostic categories justified by current consumers:

| Category | Evidence and consumer |
| --- | --- |
| `site_resolution` / `input_invalid` | provider miss and invalid canonical input; user message + tests |
| `authentication_required` | auth recovery, user login guidance, diagnostics |
| `network` | P0 route facts, retry guidance, user proxy message, diagnostics |
| `content_unavailable` | current UI category and engine evidence; user message |
| `format_unavailable` | current advanced-quality/user category |
| `engine_unavailable` | runtime gate/registry miss; user dependency guidance |
| `engine_execution` | fallback/default technical failure |
| `output` | current output-write user guidance |
| `cancelled` | terminal semantics and UI suppression |

`protocol`, `capture`, and `selection_invalidated` should not automatically become ordinary download error categories. They occur before or beside the Job lifecycle and need a category only when a real protocol/Extension consumer is added. `unsupported-content` can be represented by site/input or content-unavailable until behavior proves a distinct consumer.

Renderer should consume the structured category when present and retain regex fallback only for legacy payload compatibility. Raw stderr must never become Renderer policy.

## 5. Structured diagnostics versus logging

| Keep as structured semantics | Keep as developer logging |
| --- | --- |
| trace/provider/site/attempt/engine identities | human timing lines |
| prepare/attempt/fallback/recovery/terminal state | bounded scrubbed stderr summary |
| typed code, policy classification, diagnostic category | implementation-specific progress detail |
| safe network snapshot and route application result | debug-only command-plan facts after redaction |
| bounded attempt history and exactly-one terminal outcome | telemetry writer/logging failures |

Business decisions must consume typed error fields and plan policy, never `console.log` or a log string. A logger can render structured events, but the log is an output adapter, not the source of correctness.

## 6. Sensitive-data and privacy findings

### Positive baseline

- P0 network snapshots reduce target URL to origin and omit proxy credentials.
- engine network adapters scrub ambient proxy environment and redact common authorization/proxy/cookie patterns.
- cookie file presence is usually logged as a boolean rather than cookie content.
- the Extension session path bounds cookie collection by Desktop-provided domains.

### Current leaks / unsafe surfaces

1. `src/electron-runtime/service.ts` logs raw request `url`, `pageUrl`, and engine-plan `sourceUrl`; signed/tokenized URLs are known current inputs.
2. `ytDlpDownload.ts` timing/injection-debug logs include `sourceUrl`, `originalUrl`, `pageUrl`, command args, binary paths, and cookie-file paths. Credential-pattern redaction does not remove arbitrary signed query parameters.
3. `galleryDlDownload.ts` places raw `sourceUrl` plus stdout/stderr tails in `DownloadRuntimeError.context`; the protocol forwards that open context to Renderer.
4. `electron/errorDiagnosticCopy.mts` deliberately preserves `userUrl` and excludes URL-valued keys from sensitive-key redaction. Its string redactor does not remove query/hash credentials.
5. terminal telemetry persists raw `errorMessage`. Engine messages may contain a signed URL or filesystem path even when common token keys are redacted.
6. user diagnostic copy includes raw message/context and recent free-form logs; it is only as safe as every upstream producer.
7. telemetry serialization accepts a validated schema but there is no central safe-field allowlist for error/context data.

### Required P6B redaction contract

- Diagnostics serialize an allowlist, never `RawDownloadInput`, a whole plan, arbitrary environment, CLI args, or error context wholesale.
- URLs default to origin-only (`scheme://host`) plus safe booleans such as `hasQuery`; query, fragment, userinfo, and signed path material are omitted.
- Cookies, authorization headers, proxy credentials, session tokens, raw browser auth material, cookie-file paths, raw environment, and filesystem secrets are never recorded.
- Stderr/stdout are bounded summaries and pass a stronger URL/query/token scrub before any log, terminal context, clipboard copy, or telemetry output.
- Structured fields may include trace/attempt IDs, provider/site/engine, event type, duration, route mode/source/protocol/application result, error code/classification/category, and safe counts.
- The user-facing diagnostic copy no longer promises `preservedOriginalUrl`; it uses the same safe URL summary.

Redaction is a P6B blocker because current tokenized URLs can reach ordinary logs and diagnostic context.

## 7. Diagnostic ownership target

```text
Domain
  DownloadRuntimeError stable code/policy classification/optional diagnostic category
  no logger implementation

Application
  DownloadJobService + Orchestrator own lifecycle semantics
  attempt identity, fallback/recovery/terminal diagnostic events
  closed DownloadDiagnosticSink port

Infrastructure
  process exit/stderr/network facts -> typed safe execution fact/error
  no Site fallback policy

Composition
  inject best-effort sink(s): structured runtime log, existing outcome telemetry adapter
  isolate sink failure

Presentation
  consume allowed terminal category + bounded safe attempt summary
  never parse yt-dlp/gallery-dl raw output for new payloads
```

Do not add an interface in every layer. One Application diagnostic contract plus existing Infrastructure error adapters and composition wiring is sufficient.

## 8. User-facing diagnostics

Current Renderer can display a user message and copy failure details, but it receives no attempt history and still guesses categories from raw text. Browser Extension receives queue acceptance only and intentionally has no terminal lifecycle.

P6B minimum:

- add a structured user-facing failure category and bounded safe attempt summary to the existing terminal mapping only where needed;
- keep raw stderr internal;
- retain legacy regex fallback for old payloads;
- do not redesign Renderer UI;
- do not add Extension progress/terminal UI. Extension terminal diagnostics remain follow-up unless Lead changes P5 capability scope.

## 9. Storage and persistence decision

Current storage already exists:

- runtime log file: overwritten at application-session start, with bounded in-memory buffer but session-long file output;
- `telemetry/download-outcomes.jsonl`: persistent terminal outcome records, currently unbounded;
- active queue/trace state: in memory;
- no lifecycle event store.

P6B target decision:

**NO new persistent event store.**

- Keep a bounded attempt history in the active Job context and include a scrubbed summary in the terminal diagnostic where necessary.
- Render structured lifecycle events into the existing runtime log for support correlation.
- Keep the existing outcome telemetry as a separate terminal aggregate; do not append every lifecycle event to it.
- Do not add crash recovery/replay. Retaining the previous crashed session log or bounding/rotating the existing outcome JSONL is follow-up operational debt unless Lead provides a retention requirement.

## 10. Failure isolation audit

### Current risks

1. Injected `logger.log()` calls are not uniformly guarded; a throwing logger can escape before or during `runTask()`.
2. progress event emission is awaited inside engine execution. This is a product event path rather than pure telemetry, but a throwing sink can currently surface as an engine failure.
3. `recordDownloadTelemetry()` is awaited before the pending-cancel terminal event; a custom/validation failure can prevent terminal completion.
4. ordinary failure telemetry is awaited after the terminal event and can reject `runTask()` after visible completion.
5. the JSONL sink catches append failures, but schema parsing occurs before its write-chain catch and injected sinks need not catch anything.
6. diagnostic-copy serialization/read failures are partly handled, but arbitrary context serialization and URL safety are not centrally enforced.

### Target rule

```text
execution failure != observability failure
```

Application diagnostic recording must be best-effort and non-throwing at the call site. Composition may report a sink failure to a fallback logger, but that report must also be guarded and must not recurse through the failed sink. Correctness errors from engines, validation, fallback, cancellation, or terminal emission must not be swallowed as “diagnostic failures.”

The product terminal event remains a product contract, not optional telemetry; its exactly-once mapping must be tested separately from diagnostic sink isolation.

## 11. Findings classification

### P6B blockers

1. No Application attempt identity or history across fallback/auth recovery.
2. Terminal outcome cannot reference failed attempts; only the last/chosen engine survives.
3. No structured lifecycle observer for prepare/attempt/fallback/recovery/terminal semantics.
4. Renderer still depends on raw-message/context regex guessing for user diagnostic category.
5. Raw/tokenized URLs and open error context can reach logs, Renderer diagnostic copy, and persistent telemetry.
6. Logger/telemetry/diagnostic failures are not uniformly isolated; pending cancellation can lose its terminal event if telemetry throws.
7. Network diagnostics keep only the latest application snapshot, not per-attempt route application facts.

### Follow-up debt

- remote telemetry/analytics/crash reporting;
- persistent diagnostic database or event replay;
- Extension progress/terminal diagnostics UI;
- runtime log rotation/crash-session retention;
- bounded retention/migration policy for existing `download-outcomes.jsonl`;
- protocol versioning and wire capability negotiation;
- transcode observability unification;
- full `service.ts` decomposition.

### Optional cleanup

- log message wording/prefix normalization;
- helper consolidation between log and clipboard redactors after the safety contract exists;
- event name bikeshedding where semantics are unchanged;
- moving telemetry files without changing ownership;
- replacing every historical console call.

## 12. Observability regression strategy

Application-level tests:

- one trace across two-engine fallback;
- one trace across auth recovery;
- monotonically distinct attempt identities, including a repeated same-engine attempt after recovery;
- stable plan/route identity retained;
- structured failure category and policy classification remain distinct;
- exactly one terminal diagnostic event for success, failure, and cancellation;
- cancellation is not failure;
- success that wins after a cancel intent remains success;
- diagnostic sink throw/reject/serialization failure does not change execution outcome;
- failed attempt history survives a later success.

Infrastructure/privacy tests:

- route metadata is safe and attached per attempt;
- cookies, authorization, proxy credentials, signed URL query/fragment, browser tokens, cookie paths, raw environment, and secret filesystem paths are absent from structured event, log rendering, clipboard copy, and telemetry;
- bounded stderr is classified in Infrastructure and never controls Application through raw text;
- raw stderr is not sent to Renderer;
- telemetry/logger failure is isolated.

Protocol/presentation compatibility tests:

- terminal mapper carries safe category/attempt summary without exposing process output;
- old payloads may use legacy regex fallback, new payloads prefer structured category;
- Extension request ID/connection generation remains separate from Desktop trace;
- Extension queue ack continues to expose only accepted trace and is not expanded into a terminal protocol.
