# Technical design

## Design intent

Establish ownership of the ordinary download Job with the smallest compatible extraction. Keep P0/P1 contracts and all public IPC/WS/event behavior unchanged. Do not split the queue, transcode, advanced-quality, or Electron shell merely because their files are large.

## Target boundaries

```text
Electron Shell / IPC and WS adapters
          |
          v
electron-runtime compatibility facade
  queue scheduling, protocol mapping, output settlement,
  advanced quality, transcode, runtime gate
          |
          v
DownloadJobService (Application)
  prepare once, one Job context, attempt execution,
  auth recovery, cancellation/terminal policy
          |
          v
DownloadOrchestrator / DownloadEngine<TExecutionContext> ports
          ^
          |
Infrastructure adapters
  engine processes, binaries, fs, NetworkRoute, telemetry,
  concrete site-session and OS/network implementations
```

## Application API

Create one generic `DownloadJobService` under a runtime-neutral application directory. It receives the existing typed `DownloadOrchestrator<TExecutionContext>` and a small set of function-shaped dependencies rather than new Manager/Factory abstractions.

The API must support these semantics:

- Accept one normalized/raw application request plus a cancellation signal.
- Call `orchestrator.prepare()` exactly once.
- Call an injected `createJobContext(prepared)` exactly once. The Job context is generic/opaque to Application; the outer adapter may place the already-resolved NetworkRoute, output/config values, and diagnostic callbacks in it.
- Call an injected `buildAttemptContext(jobContext, plan, enginePlan)` for each actual engine attempt. It may read current attempt cookies, but it must receive the same Job context and plan object.
- Run `executePrepared(prepared, ...)` and on a typed `auth_required` failure invoke an injected recovery function at most once.
- If recovery authorizes retry and cancellation has not occurred, rerun `executePrepared()` with the same `prepared` and Job context. Do not call Site resolution or NetworkRoute resolution again.
- Preserve typed errors. Raw stderr/message classification remains Infrastructure-owned.
- Return a core result plus the minimal execution metadata the outer facade already needs (for example prepared plan/chosen engine through callbacks or a compact outcome). Do not return renderer protocol DTOs.

Exact type names may follow repository conventions, but the generic `DownloadEngine<TExecutionContext>` contract must propagate without casts or widening.

## Runtime facade adaptation

`AmeowElectronDownloadRuntime` remains the existing public compatibility facade in P2:

- Keep pending/active queue state, `AbortController` ownership, queue DTO mapping, and queue events.
- Keep config/output directory parsing, output-stem reservation, filesystem rename, metadata cleanup, telemetry, terminal protocol event mapping, and transcode follow-up outside Application.
- Keep advanced-quality probe/selection, transcode queue, and runtime dependency gate unchanged.
- Replace only the principal `prepare -> execution context -> executePrepared -> auth recovery` slice of `runTask()` with a call to `DownloadJobService`.
- Ensure success/catch/finally and pending cancellation still emit exactly one completion and always advance/clean queue state.

This retained facade is explicit compatibility/infrastructure glue, not the owner of fallback/auth policy after extraction.

## Electron composition and site-session integration

Keep concrete engine construction, Electron network/session access, runtime bootstrap, event emission, and OS paths in Electron composition.

Move the current download-specific site-session hook bodies out of `main.mts` into one bounded Electron-side integration module. It may compose the existing site-session registry, manager, refresh scheduler, extension request bridge, and `handleAuthRequiredSiteSessionRecovery`, but it must not start a second download flow or resolve Site/Plan/NetworkRoute.

The integration exposes only the hooks the runtime/application boundary needs:

- best-effort pre-download refresh;
- existing advanced-quality pre-probe refresh (compatibility only);
- attempt-cookie enrichment/read;
- typed auth-required recovery;
- logging/registry notification through injected callbacks.

`main.mts` constructs this integration and passes the hooks into the runtime. The at-most-one retry decision remains in `DownloadJobService`; the integration only reports whether recovery produced usable attempt auth.

## Dependency rules

Extend the existing Architecture Guard to include the new application directory. Application must not import:

- `electron` or project `electron/` modules;
- `src/electron-runtime` implementation modules;
- renderer/protocol DTO modules under `src/types`;
- Node filesystem/process APIs or concrete downloader/runtime implementations.

Application may depend on core types, `DownloadOrchestrator`, and function-shaped ports. Infrastructure and Electron composition may depend inward on Application.

## Compatibility

- Preserve renderer command names, Electron event names, WS actions, response envelopes, queue/transcode payloads, and `src/types/videoRuntime.ts` shapes.
- Keep `createElectronDownloadRuntime()` and current command-router surface as compatibility APIs.
- Do not move or redesign protocol normalization in P2.
- No renderer or extension architecture changes.

## Invariant proof strategy

- Plan identity: fake orchestrator/provider asserts one `prepare()` call and strict object identity on all attempts.
- Network/Job identity: fake `createJobContext` returns one object; fallback and auth-retry contexts must reference it strictly, and the next Job gets a new object.
- Auth: recovery is invoked only for typed `auth_required`, at most once; attempt-context creation may observe new cookies without replacing plan/Job context.
- Cancellation: an aborted signal prevents recovery retry; existing runtime cancellation tests prove pending/active terminal cleanup.
- Engine contract: compile-time tests and existing engine contract tests keep the exact generic context.
- Architecture: existing import guard remains and scans the new application directory.

## Rollout and rollback

1. Add the application service/tests/guard without changing production wiring.
2. Adapt the ordinary Job slice in `service.ts`; existing public APIs and outer settlement stay unchanged.
3. Extract/download-compose the site-session hooks from Main without reordering Electron startup.
4. Run focused tests after each step. Each step can be reverted independently because transport contracts and engine adapters do not change.

Stop and return to planning if implementation requires protocol schema changes, a second engine port, route/plan re-resolution, queue/transcode redesign, or broad Electron lifecycle reordering.

## Deferred debt

- Protocol DTO leakage in runtime contracts/command router (P3 input).
- Queue facade, advanced-quality, transcode, dependency gate, output/metadata and telemetry co-location in `service.ts`.
- Non-download WS/IPC action/controller extraction and direct image/file infrastructure calls in Main.
- `main.mts` `@ts-nocheck`, dev tooling organization, and optional unused-helper cleanup.
