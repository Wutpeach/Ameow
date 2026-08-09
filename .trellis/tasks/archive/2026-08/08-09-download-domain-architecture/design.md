# Technical design

## Design intent

Correct dependency ownership with the smallest compatible migration. Reuse the current provider/planning/runners and preserve P0 network behavior; do not replace the whole download stack or rearrange `src/` for aesthetics.

## Logical boundaries

```text
Protocol / Electron adapters
  -> normalize request DTO
Application
  SiteRegistry -> SiteProvider -> ResolvedDownloadPlan
                                 |
                                 v
                         DownloadOrchestrator
                    plan requirements + EngineRegistry
                                 |
                                 v
                         DownloadEngine port
                                 ^
                                 |
Infrastructure      YtDlpEngineAdapter / GalleryDlEngineAdapter
                    command plan -> network mapping -> process -> evidence classifier
```

`DownloadExecutionContext` is created once at the queued Job boundary in the runtime service. The same identity/network resolution is passed into the application execution attempt and every adapter attempt across internal retry, cross-engine fallback, and auth recovery. Orchestrator consumes it but never constructs or refreshes NetworkRoute.

## Ownership model

### Domain

- `DownloadIntent`: canonical user download intent and media/quality/auth semantics. Remove protocol-only aliases, arbitrary diagnostics/extension bags and engine-specific command selectors from the stable contract.
- `ResolvedDownloadPlan`: provider, canonical target/intent, ordered engine candidates, capability requirements and fallback hints.
- `EnginePlan`: preferred/required engine id plus priority and structured fallback policy; no CLI args/env.
- `DownloadCapability` / requirements: a small set proved by current selection behavior. Do not create a speculative capability catalog.
- `DownloadResult`: core success/failure value using domain naming (`filePath`, not protocol `file_path`) and no renderer queue fields.
- `DownloadError`: existing typed error code/classification/context/cause, with stable recoverability/fallback semantics.

### Application

- Normalized `RawDownloadInput` / download request after protocol mapping.
- `SiteRegistry`, `EngineRegistry`, `DownloadEngine` port, support result and attempt execution context.
- `DownloadOrchestrator`, eligibility filtering, priority ordering and fallback sequencing.
- Job/attempt context coordination and core progress callback. Operational values may be carried here, but no Electron API, CLI args, child process or concrete engine types.

### Protocol / Renderer

- `QueuedVideoDownloadRequest`, `DownloadResultPayload`, `DownloadProgressPayload`, queue/transcode payloads and legacy JSON keys.
- Explicit boundary mapper normalizes protocol request aliases into application input and maps core result/progress/error to existing payloads.

### Infrastructure

- yt-dlp/gallery-dl adapters, binary/runtime resolution, command manifests/plans, CLI arguments, cookies temp files, filesystem/process lifecycle, stderr/stdout parsing, ffmpeg details and NetworkRoute mapping.
- Electron runtime service remains queue/lifecycle owner and an outer adapter. `electron/main.mts` (or a narrow Electron composition helper called only by it) supplies concrete adapters.

## Engine contract

Use one stable port rather than a second parallel abstraction. Exact field placement may adapt to existing tests, but the final contract must have these semantics:

```ts
interface DownloadEngine {
  readonly id: EngineId;
  readonly capabilities: EngineCapabilities;
  supports(plan: ResolvedDownloadPlan, context: EngineSupportContext): EngineSupportResult;
  execute(plan: EnginePlan, context: EngineExecutionContext): Promise<DownloadResult>;
}
```

- `EngineSupportResult` is structured (`supported` plus a stable reason/error when false), so unsupported capability is not a thrown raw string.
- `EngineExecutionContext` is application-owned and carries the already-created Job context, output target, cancellation/progress and safe execution values. Binary paths, CLI config and process callbacks are supplied to concrete adapters through infrastructure dependencies, not declared by Domain.
- Temporary compatibility wrappers are allowed while existing runners still accept their legacy context; the wrapper must point from Infrastructure toward Application, never the reverse.

## Capability and selection design

- Represent capabilities as data rather than scattered `engine === ...` conditions.
- Start only with requirements currently used by plans/selection, such as media semantics, advanced quality selection, authentication/cookies, HTTP/SOCKS route support and live/segment behavior where current code proves a distinction.
- Provider plans may still name `preferredEngineId` / required engine candidates for genuine extractor-specific site behavior. Capabilities filter candidates; they do not erase site policy.
- Selection flow:

```text
provider candidate order
  -> plan capability requirements
  -> EngineRegistry lookup + static eligibility
  -> adapter supports(plan, support context)
  -> first executable candidate
```

- Missing/unsupported engines produce stable errors and obey the plan fallback policy. Duplicate registry ids must be rejected or explicitly defined, never silently overwritten.

## Site contract

Providers may know stable engine ids and capability requirements. They may canonicalize URLs only under current documented compatibility rules, preserve selected quality intent, and define fallback candidates. They may not import runners, manifests, CLI types, binary/process code or Electron.

Existing first-match order, generic-last behavior, Weibo/Xiaohongshu exceptions and downloader-owned redirects remain unchanged. Strategy helper adoption is limited to removing confirmed duplicate plan policy; dynamic provider plugin work is deferred.

## Error and fallback flow

```text
CLI/process/raw exception + redacted stdout/stderr evidence
  -> infrastructure engine classifier
  -> DownloadRuntimeError { code, category/classification, recoverability, context, cause }
  -> Orchestrator fallback policy
  -> fallback or stop
```

- Move CLI message regex/patterns out of Domain/Application. Core may map stable codes/classification to recoverability without examining raw strings.
- Preserve network classification produced by P0 adapters and preserve redacted evidence in error context/cause.
- Orchestrator does not inspect `message`, `stderrTail`, engine id or site name to decide fallback. A small fallback helper may remain in Application.
- Internal yt-dlp retry remains inside the adapter; auth recovery remains a runtime lifecycle action that reruns the same plan/context; cross-engine fallback remains Orchestrator-owned.

## Protocol compatibility

- Keep command names, event names, queue ownership, `QueuedVideoDownloadAck`, and renderer JSON keys unchanged.
- Map `DownloadResult.filePath` to `DownloadResultPayload.file_path` at runtime/protocol boundary.
- Map core progress to `DownloadProgressPayload` while preserving `traceId`, stage/activity tokens, percent/speed/eta behavior.
- Normalize legacy `ytdlpQuality` once at the protocol/application boundary; providers consume one canonical quality field.
- Keep extension capture evidence available to application Site resolution, but do not retain arbitrary extension/diagnostic bags in stable Domain intent after they have served resolution.
- Keep advanced quality selector as application/infrastructure execution data rather than a Domain CLI contract; preserve existing protocol compatibility through a mapper/compatibility seam.

## Composition and registry

- Preserve the existing registry classes; add only missing registration/eligibility behavior.
- Remove hidden `builtinEngines()` construction from the application-facing path. Electron composition explicitly creates/registers `YtDlpEngineAdapter` and `GalleryDlEngineAdapter` with existing runtime dependencies.
- Providers may continue to default through `loadBuiltinProviders()` in the runtime service if this does not invert dependencies; concrete downloader implementations may not.
- No global mutable registry, DI container or plugin discovery.

## Architecture guard

Prefer the existing ESLint toolchain. Add a scoped `no-restricted-imports` rule (or a small Vitest architecture test if relative-pattern coverage is insufficient) so Domain/Application files cannot import:

- `electron` / `electron/*`
- `electron/` project modules
- `src/electron-runtime` implementation modules
- renderer/protocol payload modules such as `types/videoRuntime` from core/application contracts

The guard must allow Infrastructure to import Domain/Application and must run under existing `npm run lint` or `npm test`.

## Migration and rollback

1. Introduce core-owned types/mappers and tests while old payload behavior remains available.
2. Narrow the port and registry, adapting fake engines/tests first.
3. Move/wrap concrete adapters and change composition; retain runner implementations.
4. Migrate Orchestrator to core result/capability/error policy.
5. Migrate runtime boundary and providers, then remove obsolete reverse imports.
6. Add architecture guard and run full validation.

Each step must compile and keep focused tests green. If runtime integration regresses, rollback the newest compatibility mapper/adapter step without reverting P0 network modules or unrelated worktree changes.

## Deliberate non-goals / deferred debt

- No full split of `service.ts` or `electron/main.mts`.
- No unification of image download, transcode, or advanced-quality probe into a universal orchestration framework.
- No complete dynamic capability registry or external engine plugin API.
- No cleanup of every provider host-matching inconsistency unless a changed contract exposes a concrete regression.
- No broad removal/rename of currently unused intent/plan fields unless required for ownership correctness.
