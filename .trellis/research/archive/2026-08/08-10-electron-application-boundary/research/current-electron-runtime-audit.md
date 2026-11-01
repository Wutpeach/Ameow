# P2 Electron application boundary audit

## Scope and baseline

Audited `electron/main.mts`, `src/electron-runtime/service.ts`, `src/electron-runtime/**`, the current command bridge/router, `DownloadOrchestrator`, concrete engine adapters, architecture guard, and the archived P1 design. This audit treats file size only as a navigation signal; findings are based on responsibility and dependency ownership.

Focused baseline on 2026-08-10:

```text
npm test -- src/orchestration/download-orchestrator.test.ts src/electron-runtime/service.test.ts src/architecture/import-guard.test.ts
3 files passed, 72 tests passed
```

## A. `electron/main.mts` current responsibilities

| Category | Current responsibility and evidence | P2 disposition |
| --- | --- | --- |
| Composition | Runtime/controller singletons (`214-247`), config/update/tray/log wiring (`237-425`), image/file dependencies (`1386-1403`), runtime environment and concrete engine construction (`1431-1590`), renderer controller registry (`1943-2018`) | Keep dependency selection, construction, injection, startup, and shutdown in Electron composition. Move download policy bodies out of `main.mts`. |
| Electron / OS shell | BrowserWindow creation and bounds lifecycle (`617-932`), Electron session/system proxy/fetch (`934-1133`), tray/window/shortcut/dialog/shell/clipboard/updater lifecycle (`2413-2922`, `3630-3821`, `3873-3998`) | Keep. These are shell/platform adapters, not P2 application logic. Do not split them merely to shorten the file. |
| IPC transport | Event/WS broadcast and request correlation (`2221-2388`), WS action dispatcher (`2948-3344`), IPC registration (`3617-3821`), WS server lifecycle (`3823-3871`) | Keep transport registration. Existing broad action routing is follow-up/P3 input except for the minimal download hook wiring changed by P2. |
| Application coordination | Download-start/advanced-quality session refresh eligibility and timing (`1739-1913`), attempt cookie enrichment and auth recovery callback wiring (`1551-1587`), download preference merge before queueing (`1332-1366`, `3289-3335`) | The normal Job timing/retry policy moves behind the application API. Extract the download-specific site-session hook implementation from `main.mts` so Main only composes it. Preference/protocol normalization stays compatible and is recorded for P3. |
| Infrastructure execution | Runtime paths/bootstrap and concrete engine creation (`1425-1549`), Electron network resolver and proxy feedback (`934-1133`, `1519-1548`), direct image/file/Xiaohongshu implementations in non-download command families (`3033-3084`, `3413-3574`) | Concrete download adapters and Electron network implementation remain supplied by composition. Unrelated direct image/file execution is follow-up debt, not a P2 blocker. |
| Misc / unclear | Diagnostics/docs screenshot/UI Lab/log helpers (`431-617`, `2038-2259`) and numerous protocol summary/normalization helpers (`1135-1367`) | Leave unchanged unless compilation requires a tiny compatibility edit. Dev tooling cleanup is optional. |

### Main findings by scope

- **Blocker:** `main.mts` still contains download-specific site-session refresh policy and constructs attempt-cookie/auth-recovery callbacks inline (`1551-1587`, `1739-1913`). Main is not the fallback/queue owner, but it still participates in the application use case rather than only composing adapters.
- **Follow-up debt:** The WS and renderer command switches still contain many non-download workflows; P2 must not turn this into a general controller extraction.
- **Follow-up debt / P3 input:** Raw WS/renderer payload aliases are normalized in multiple layers (`main.mts`, `electron/videoDownloadCommands.mts`, `src/electron-runtime/commandRouter.ts`).
- **Optional cleanup:** `@ts-nocheck`, unused-looking helpers/imports, docs screenshot/UI Lab organization, and generic normalization cleanup are not P2 implementation scope.

## B. `src/electron-runtime/service.ts` current responsibilities

| Use case / lifecycle | Evidence | Ownership assessment |
| --- | --- | --- |
| Runtime composition/dependency gate | Provider/orchestrator/telemetry/resolver construction (`258-289`), gate API (`292-310`) | Concrete telemetry/dependency discovery is Infrastructure. Default provider loading is P1-compatible glue. Temporarily retain outside the extracted normal Job service. |
| Download queue | Queue state/detail (`312-354`), enqueue (`356-367`, `436-447`), pending/active cancellation (`390-434`), pump (`1098-1112`) | Application operational lifecycle currently hosted by the compatibility runtime facade. Retain in P2 to avoid a universal queue rewrite; keep existing tests. |
| Advanced quality | Dedupe, probe, selection, queue continuation (`449-703`) | Separate application/infrastructure use case. Temporarily retain. |
| Transcode | Cancel/retry/remove, serial scheduling, compatibility follow-up (`705-1009`) | Separate lifecycle with direct infrastructure execution. Temporarily retain. |
| Output/file settlement | Stem reservation and rename (`1011-1095`), gallery-dl metadata rename/cleanup (`1311-1343`) | Infrastructure implementation. Keep in the runtime adapter around the new application Job service. |
| Principal normal download Job | Config/output/binary setup (`1133-1138`), one `prepare()` (`1142-1147`), pre-download auth refresh (`1154-1165`), one stable Job/network context (`1179-1205`), `executePrepared()` (`1206-1261`), auth recovery (`1262-1273`, `1475-1519`), result/failure/final cleanup (`1274-1417`) | **Application Service blocker.** Extract `prepare -> one opaque Job context -> executePrepared -> auth recovery -> terminal outcome` behind a framework-light API. |
| Error classification/telemetry | Runtime error normalization (`1420-1473`), telemetry (`1521-1537`) | Raw evidence classification and telemetry sink are Infrastructure. Application consumes stable typed classification only. |
| Protocol compatibility | Protocol DTO imports (`33-46`), queue DTO returns (`312-354`), result/progress mappers and renderer event names (`1250-1275`, `1345-1406`) | Compatibility/transport glue. Keep at the runtime boundary for P2; broader DTO cleanup is P3 input. |

### Service findings by scope

- **Blocker:** The principal Job application flow is not independently owned; it is nested inside config/filesystem/binary/network/telemetry/protocol behavior in `runTask()`.
- **Blocker:** Auth recovery policy is a private method of the mixed runtime (`1475-1519`), so its one-retry/stable-plan/stable-route contract is only testable through the whole runtime facade.
- **Blocker:** A new application directory would not be covered by the Architecture Guard, whose guarded directories are currently `core`, `orchestration`, `engines`, and `sites` (`src/architecture/import-guard.test.ts:22-28`, `151-187`).
- **Blocker:** Terminal completion is split across pending cancel and `runTask()` success/catch/finally (`399-425`, `1345-1417`); adaptation must preserve exactly one terminal completion for each accepted/started Job.
- **Follow-up debt:** Queue, advanced-quality, transcode, dependency gate, output settlement, and telemetry remain crowded in the compatibility facade after P2.
- **Optional cleanup:** Barrel/export/file naming and line-count-driven splits.

## C. Current dependency direction

```text
Renderer IPC / Extension WS protocol DTOs
        |
        v
electron/main.mts transport handlers
        |
        v
electron/videoDownloadCommands.mts
        |
        v
src/electron-runtime/commandRouter.ts
        |
        v
src/electron-runtime/service.ts
  |     |         |          |
  |     |         |          +--> protocol DTOs / renderer event names
  |     |         +-------------> fs, runtime paths, transcode, telemetry
  |     +-----------------------> SiteRegistry / DownloadOrchestrator
  +-----------------------------> concrete Job/network/auth lifecycle
                                  |
                                  v
                     DownloadEngine<TExecutionContext>
                                  ^
                                  |
                     yt-dlp / gallery-dl adapters

electron/main.mts additionally supplies:
Electron session/network + runtime bootstrap + site-session/extension auth adapters
```

### Direction review

- **Electron leakage:** No hard `electron` package import was found in Domain/Application modules. Electron `session`, `BrowserWindow`, and OS APIs remain in `electron/`. The leak is responsibility-level: application policy bodies are still embedded in Main callbacks.
- **Application dependency inversion:** `service.ts` is application-like but directly imports Node fs/path, runtime path/status implementations, transcode, metadata cleanup, telemetry construction, and protocol DTOs. The core Job use case therefore depends on its outer adapter instead of receiving narrow functions.
- **Infrastructure callers:** Main correctly constructs concrete engine adapters (`1475-1486`) and injects network/runtime implementations. The mixed runtime directly invokes filesystem/transcode/metadata implementations. P2 extracts only the principal Job use case; unrelated runtime subsystems remain explicit debt.
- **Protocol DTO participation:** `contracts.ts` derives runtime events from `AmeowAppEvent` and exposes queue/transcode DTOs; `service.ts` returns and emits them; `commandRouter.ts` relies on structural compatibility between a transport request and `RawDownloadInput`. P2 keeps compatibility mapping at the boundary and does not redesign schemas.

## P0 / P1 invariant anchors

- One route per Job is declared in `src/electron-runtime/contracts.ts:30-40,163-170`, created once in `service.ts:1179-1193`, then reused by fallback and auth retry through the same execution context (`1206-1273`, `1475-1519`).
- `DownloadOrchestrator.prepare()` validates/resolves once (`src/orchestration/download-orchestrator.ts:113-134`); `executePrepared()` reuses the exact plan across engine eligibility/fallback (`144-227`).
- `DownloadEngine<TExecutionContext>` preserves the exact context type through the registry and adapters; static binaries are constructor-injected into `YtDlpEngineAdapter` / `GalleryDlEngineAdapter`.
- Auth recovery currently reruns the same closure/prepared plan while `buildExecutionContext` may obtain refreshed attempt cookies (`service.ts:1206-1273`, `main.mts:1551-1565`).
- Raw engine evidence is classified in Infrastructure; Orchestrator branches on typed error classification, not stderr/message parsing.

## D. P2 minimum independently mergeable boundary

Add one generic, Electron-neutral `DownloadJobService` for the ordinary single-Job use case:

```text
executeJob(request, cancellation, injected functions)
  -> orchestrator.prepare() exactly once
  -> create one opaque Job context exactly once
       (outer adapter owns output/config/NetworkRoute)
  -> executePrepared(prepared, buildAttemptContext(jobContext))
  -> if typed auth_required: recover attempt auth at most once
  -> retry with the same prepared plan and same Job context
       (buildAttemptContext may read refreshed cookies)
  -> return a core outcome / throw a typed failure
```

Target flow:

```text
electron/main.mts
    -> Electron composition + renderer/WS transport adapters
    -> download site-session/network/runtime adapters
    -> electron-runtime compatibility facade (queue/protocol/settlement)
    -> DownloadJobService (Application)
    -> DownloadOrchestrator / ports
    -> injected DownloadEngine<TExecutionContext> adapters
```

Implementation boundary:

1. Add the generic Job service and focused non-Electron tests for stable plan/context identity, fallback, auth recovery, cancellation, progress/result, and failure.
2. Adapt only the ordinary `runTask()` execution slice to call it. Keep output reservation, filesystem settlement, protocol events, telemetry, queue pump, advanced quality, transcode, and runtime gate in the compatibility facade.
3. Extract the existing download-specific site-session hook policy from `main.mts` into one injected Electron-side integration module; Main constructs it and passes its hooks to the runtime.
4. Add the application directory to the existing Architecture Guard. Do not weaken existing rules.

This is intentionally not architecture-v2: one application service, one bounded Electron integration helper, existing ports/adapters, no manager/facade/event bus/DI container, and no protocol migration.
