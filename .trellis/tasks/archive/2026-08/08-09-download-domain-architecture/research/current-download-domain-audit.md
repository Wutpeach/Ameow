# Current Download Domain dependency audit

Date: 2026-08-09

## Method and baseline

Read-only audit covered `DownloadOrchestrator`, all SiteProviders, Site/Engine registries, engine port and concrete adapters, download-capabilities, Electron runtime service/runners, protocol result types, quality plans, error/fallback policy, and P0 `DownloadExecutionContext` / `NetworkRoute` integration. Project `fff` MCP was unavailable, so repository search used the permitted `rg` fallback.

Focused baseline:

```text
npm test -- src/orchestration/download-orchestrator.test.ts src/sites/providers.test.ts src/core/errors/download-runtime-error.test.ts src/electron-runtime/service.test.ts
4 files passed, 100 tests passed.
```

## Actual dependency and call graph

```text
electron/main.mts
  -> createElectronDownloadRuntime(options)
     src/electron-runtime/service.ts
       -> loadBuiltinProviders()
          -> src/sites/index.ts concrete providers
       -> createSiteRegistry(SiteProvider[])
       -> builtinEngines()
          src/engines/index.ts
            -> new YtDlpEngine()
               -> src/electron-runtime/ytDlpDownload.ts
            -> new GalleryDlEngine()
               -> src/electron-runtime/galleryDlDownload.ts
       -> createEngineRegistry(DownloadEngine[])
       -> new DownloadOrchestrator(siteRegistry, engineRegistry)

queued request / auth retry
  -> DownloadOrchestrator.execute(RawDownloadInput, buildContext)
     -> rawDownloadInputSchema.parse
     -> SiteRegistry.resolve
        -> provider.matches
        -> provider.resolvePlan
        -> ResolvedDownloadPlan { intent, engines[] }
     -> validate intent/engine plans
     -> sort candidates by priority
     -> EngineRegistry.get(engine id)
     -> DownloadEngine.validateIntent
     -> buildContext(plan, enginePlan)
        -> reuse Job DownloadExecutionContext/network resolution
     -> DownloadEngine.execute
        -> infrastructure runner / command plan / process runner
     -> DownloadResultPayload
```

Important current type directions:

```text
src/core/types/engine.ts
  -> src/types/videoRuntime.ts              # result/progress protocol DTO leak
  -> src/config/networkRoute.ts             # P0 application/runtime context leak
  -> RuntimeBinaryPaths/callbacks/fetch     # infrastructure concerns in core port

src/orchestration/download-orchestrator.ts
  -> src/types/videoRuntime.ts              # application returns protocol DTO

src/engines/{yt-dlp,gallery-dl}.ts
  -> src/electron-runtime/*Download.ts       # concrete adapter points inward

src/electron-runtime/service.ts
  -> src/engines/index.ts -> concrete engines
  -> DownloadOrchestrator                   # hidden composition plus dependency cycle
```

## Confirmed violations

1. Core `DownloadEngine` / `EngineExecutionContext` imports renderer/runtime payload types and owns binary paths, fetch, filesystem output, network callbacks and progress DTOs. The port is not domain-neutral.
2. `DownloadOrchestrator` returns `DownloadResultPayload` from a mixed protocol/UI module rather than a core-owned result.
3. Concrete `src/engines` classes directly call `src/electron-runtime` runners; meanwhile the runtime service creates those concrete classes, producing a practical bidirectional dependency and hiding composition.
4. `DownloadRuntimeError` currently derives auth/network/fallback decisions from message/context regex in core. Raw CLI evidence is sometimes classified before redaction, but the generic core classifier still lets summary wording influence business fallback.
5. `RawDownloadInput` and protocol `QueuedVideoDownloadRequest` duplicate request contracts with drift (`selectedVideoVariant`, extension evidence and legacy quality aliases differ). Structural compatibility, not an explicit mapper, currently bridges them.
6. Capability data is not one runtime selection model. Some providers use `runtime-site-strategies`, Bilibili/Twitter/gallery-dl-supported hand-build plans, and `resolveProviderStrategy` is test-only. Alignment tests do not fully check order/count/fallback semantics.
7. Several contract fields overstate real behavior: `DownloadIntent.priority`, `EnginePlan.when`, and `EnginePlan.options` are not decision inputs; all built-in providers currently produce video intent although the union includes image/segment/batch.
8. Advanced-quality selector is engine-specific data carried through core intent; advanced probing itself bypasses the normal Orchestrator and is runtime-owned.
9. Concrete engine registration is not at the outer Electron composition root: main injects many dependencies but the service defaults to `builtinEngines()`.
10. No automated architecture/import guard or focused EngineRegistry test exists.

## Suspicions disproved or already solved

- No Domain/Application module directly imports the `electron` package or `electron/main.mts`; the leak is through `electron-runtime`, protocol DTOs and infrastructure-shaped context.
- SiteProviders do not execute downloader functions and do not build CLI args. They only match inputs and produce intents/engine plans; explicit engine ids are legitimate preference/requirement, not by themselves an implementation leak.
- SiteRegistry and EngineRegistry already store interfaces and accept constructor injection. They need contract/tests and composition cleanup, not replacement.
- P0 stable network authority is implemented. A Job owns one `DownloadExecutionContext`/`Promise<NetworkRouteResolution>` and service tests prove reuse across engine fallback and auth recovery plus fresh resolution for the next Job.
- Network route → args/env mapping already belongs to `engineNetworkAdapters.ts`; direct/proxy/complex handling and redaction have dedicated tests. P1 must not move or duplicate it.
- auth-required and retry-same-engine errors do not fall through merely because a plan says `fallbackOn: "any"`; existing Orchestrator tests lock that behavior.
- Generic provider is last; Pinterest is gallery-dl only; Douyin/Xiaohongshu no longer have direct-engine fallback; advanced quality is already limited to YouTube/Bilibili with a yt-dlp plan.
- Existing engine runners preserve typed `DownloadRuntimeError` in important cleanup paths and keep internal yt-dlp retry inside Infrastructure.

## Current provider / engine policy

- YouTube, Douyin, Xiaohongshu, Bilibili, Twitter/X, generic: yt-dlp only.
- Pinterest: gallery-dl only.
- Weibo detail: gallery-dl then yt-dlp; tv/show and explicit selected quality: yt-dlp only.
- Instagram: yt-dlp then gallery-dl.
- Other gallery-dl-supported hosts: gallery-dl then yt-dlp.
- SiteRegistry is first-match; candidate engines are descending priority. `when` is descriptive only.

## Current fallback layers

- Application cross-engine fallback: Orchestrator consumes typed `DownloadRuntimeError` classification/code.
- yt-dlp transient network and conservative section-format retry: runner/infrastructure.
- auth/session recovery: runtime service reruns the same Orchestrator with the same Job execution context.
- P0 route-resolution failure fallback: runtime service creates the structured fallback route once.
- unsupported site fallback: generic SiteProvider last in registry.

## Existing abstractions to reuse

- `DownloadIntent`, `ResolvedDownloadPlan`, `EnginePlan` and Zod schemas as migration bases.
- `SiteProvider`, `SiteRegistry`, `EngineRegistry` and their constructor injection.
- `buildEnginePlansFromStrategy*`, runtime site strategies and provider alignment tests.
- `DownloadRuntimeError`, stable codes/classifications and P0 network classification.
- `engineManifest.ts`, `*CommandPlan.ts`, `engineNetworkAdapters.ts`, `processRunner.ts`, progress/error parsers.
- `capture-source.ts`, `extension-capture.ts`, `gallery-dl-support.ts`, quality normalization/profile logic.
- Existing Orchestrator, provider, service, command-plan and runner test suites.

## Minimal migration seams

1. Add core-owned result/progress/capability types and explicit protocol mappers.
2. Move/narrow Engine port and attempt context ownership without rewriting runners.
3. Treat existing yt-dlp/gallery-dl wrappers as Infrastructure adapters and inject them from outer composition.
4. Add eligibility support to the existing registry/orchestrator; preserve explicit provider order and exceptions.
5. Move raw evidence parsing to adapters/classifiers while keeping stable error codes/classification.
6. Add lint/import guard and focused pure-core tests before changing any directory layout further.
