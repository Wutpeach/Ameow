# P3 current download protocol audit

## Scope and baseline

Audited the real download-related Renderer IPC and Browser Extension WebSocket paths, DTO ownership, command/query responsibility, progress/result/error flow, validation, compatibility, and Architecture Guard. Product code was not changed.

Focused baseline on 2026-08-10:

```text
npm test -- src/application/download-job-service.test.ts src/electron-runtime/protocolMappers.test.ts src/electron-runtime/commandRouter.test.ts electron/videoDownloadCommands.test.mts electron/extensionRequestBridge.test.mts src/electron-runtime/service.test.ts src/architecture/import-guard.test.ts browser-extension/video-selection-routing.test.js browser-extension/site-session-cookie-sync.test.js

9 files passed, 126 tests passed

npm run type-check
passed
```

## A. Protocol inventory

### Renderer / Electron IPC

All renderer commands currently use one generic IPC channel:

```text
desktopCommands.invoke(command, payload)
  -> preload: ameow:command:invoke { command, payload }
  -> Main handleCommand(command, payload)
  -> ordered renderer controller registry
```

| Use case | IPC command / event | Request DTO | Response/event DTO | Current handler |
| --- | --- | --- | --- | --- |
| Start normal download | `queue_video_download` | `QueuedVideoDownloadRequest` from `src/types/videoRuntime.ts`: URL/page/video hints, selected variant, candidates, title/cookies, selection scope, clip range, quality, site hint, advanced flag, extension data, diagnostics | `QueuedVideoDownloadAck { accepted, traceId }` | `electron/videoDownloadCommands.mts` -> `src/electron-runtime/commandRouter.ts` -> runtime `queueVideoDownload()` |
| Start pasted download | `queue_pasted_video_download` | `{ url, ...optional hints }` generic payload | same ack | `videoDownloadCommands.queuePastedVideoDownload()` optionally calls `ExtensionRequestBridge`, then normal queue path |
| Cancel/dismiss | `cancel_download` | `{ traceId }` (also accepts `trace_id` in lower router) | `boolean` | bridge/runtime; advanced task means UI dismissal, pending task emits cancellation completion, active task aborts and settles through Job path |
| Advanced-quality probe | no separate probe command; `queue_video_download` with `advancedQualityRequest: true` | normal queue request + flag | ack; later queue-detail phases `probing_quality` / `selecting_quality` with public options | runtime compatibility facade owns dedupe/probe state |
| Select advanced quality | `select_advanced_quality_option` | `{ traceId, optionId }`, snake_case aliases in lower router | `boolean` | bridge -> runtime; runtime converts option ID to internal selector and resumes same trace |
| Download progress | event `video-download-progress` | n/a | `DownloadProgressPayload { traceId, percent, stage, speed, eta }` | runtime mapper -> Main `emitAppEvent()` -> event-specific IPC channel |
| Download terminal result | event `video-download-complete` | n/a | `DownloadResultPayload { traceId, success, file_path?, title?, error?, failure? }` | runtime success mapper or manual failure/cancel/probe branches -> Main event transport |
| Queue status/detail | events `video-queue-count`, `video-queue-detail` | n/a | queue counts/tasks; task phases and public advanced-quality options | runtime facade emits; Main can also emit live snapshot for UI Lab |
| Runtime dependency queries | `get_runtime_dependency_status`, `get_runtime_dependency_gate_state`, `refresh_runtime_dependency_gate_state`, `start_runtime_dependency_bootstrap` | none or `{ reason? }` | runtime dependency payloads; event `runtime-dependency-gate-state` | video download bridge/runtime gate |
| Downloader info | `check_ytdlp_version`, `get_gallery_dl_info` | none | version/runtime info | video download bridge delegates Main-composed functions |
| Transcode operations | `cancel_transcode`, `retry_transcode`, `remove_transcode` | `{ traceId }` | `boolean` | video download bridge -> runtime transcode queue |
| Transcode status/results | `video-transcode-*` events | n/a | transcode queue/task/progress/complete DTOs | runtime facade -> Main event transport |
| Download auth/session settings | `get_site_session_registry`, `get_site_session_state`, `get_site_session_diagnostics`, `sync_site_session_from_extension`, `clear_site_session`; Douyin aliases | usually `{ siteId }` | site-session state/diagnostic DTOs; `site-session-state-changed` event | `electron/siteSessionCommands.mts` controller |

There is no dedicated typed IPC download channel. The generic outer request is not runtime-validated at `ipcMain.handle()`; command-specific validation occurs later and unevenly.

### Browser Extension / WebSocket

The extension connects to `ws://127.0.0.1:39527`. Requests use `{ action, data }`; `sendRequestToApp()` injects `data.requestId`. Desktop responses use `{ success, message, data }`.

| Use case | WS action | Request DTO | Response/event DTO | Current handler |
| --- | --- | --- | --- | --- |
| Queue selected video | `video_selected_v2` | `data`: URL/page URL, site hint, title, video URL, selected variant, candidates, scope, clip range, `advancedQualityRequest`, `videoQuality`, `extensionData`, request ID | immediate queue ack only: success/message plus `data.requestId`, optional `code`, and `traceId` | `electron/main.mts:3101-3147` builds an IPC-shaped queue payload and invokes `getVideoDownloadCommandBridge()` |
| Sync download quality | `sync_download_preferences` | current extension sends `{ videoQuality, requestId }`; legacy AE flag may appear | stored `quality`, legacy AE value, request ID/code | Main reads/writes config directly in `syncIncomingDownloadPreferences()` |
| Desktop-assisted pasted resolution | desktop -> extension `resolve_pasted_video_selection` | `{ requestId, url, pageUrl, siteHint }` | extension -> desktop `pasted_video_selection_result` with `correlationRequestId`, success, resolved URL/hints/candidates/title/scope/clip/quality/extension data/code/error | `ExtensionRequestBridge` owns pending correlation; Main WS switch hands the result to it |
| Download auth cookie sync | desktop -> extension `site_session_cookie_sync_request` | `{ requestId, siteId, cookieDomains }` | extension -> desktop `site_session_cookie_sync_result` with correlation ID, success, site/source/cookies/code/error | `ExtensionRequestBridge`; download-site-session integration consumes the resolution |
| Session activation/query | `site_session_enable_current_tab`, `site_session_sync_request`, `site_session_synced_summary` | action-specific data + request ID | generic ack with state/entry/summary or code | Main WS switch and site-session managers |
| Xiaohongshu drag resolution | desktop -> extension `resolve_xiaohongshu_drag`; extension -> desktop `xiaohongshu_drag_resolution_result` | correlation plus mixed page/image/video evidence | generic correlated ack/result | Main owns separate pending map; adjacent mixed image/video debt |
| Download progress/result/cancel | none | n/a | none | Extension only knows queue acceptance/failure; it does not receive terminal Job events |
| Unknown action | any unsupported action | any | `success: false`, `message: "Unknown action: ..."`, `data.code: "unknown_action"`, correlated when request ID exists | Main default switch branch |

The Extension's download capability is intentionally narrower than Renderer IPC. P3 should share Application commands, not force equal wire capabilities.

## B. DTO ownership audit

### Correct current/target owners

| Type/model | Current location/use | Correct owner |
| --- | --- | --- |
| `DownloadJobService` inputs/outcome/auth context | `src/application/download-job-service.ts` | Application |
| `DownloadResult`, `DownloadProgress`, `DownloadRuntimeError` | `src/core/**` | Domain/Application semantic result/progress/typed error |
| Canonical queue/start/cancel/select command and accepted-trace result | split between `RawDownloadInput`, `QueuedVideoDownloadRequest`, and runtime contract | Application API; canonical fields only |
| `DownloadResultPayload`, `DownloadProgressPayload`, queue/transcode event payloads | `src/types/videoRuntime.ts` | Renderer IPC protocol |
| `{ command, payload }`, `{ payload }` event wrapper, channel names | preload/Main | Electron transport only |
| WS `{ action, data }`, `{ success, message, data }`, request IDs/correlation | Main/background/extension bridge | WS protocol/transport only |
| `NetworkRouteResolution`, execution context, binaries, selectors, process/telemetry types | runtime/config/engine modules | Infrastructure/runtime |
| Runtime dependency status/gate payloads | `src/types/runtimeDependencies.ts` | operational protocol/runtime compatibility; not ordinary download Application model |

### Ownership violations

1. `src/types/videoRuntime.ts` is a mixed bucket. It contains Renderer wire events, queue command/ack types, internal-looking diagnostics, an unused `PinterestRuntimePayload`, and a public request type that includes runtime-only `advancedQualitySelector`/label.
2. `src/electron-runtime/contracts.ts` derives runtime event names from `AmeowAppEvent` and exposes Renderer queue/transcode payloads, so runtime contracts are coupled to Renderer protocol vocabulary.
3. `src/electron-runtime/service.ts` imports Renderer protocol types for queue, terminal result, advanced options, and transcode state; it also manually constructs several failure/cancel payloads.
4. `src/electron-runtime/advancedQualityProbe.ts` extends `AdvancedQualityOptionPayload` with the internal yt-dlp selector. A wire DTO is the base of an Infrastructure model.
5. `src/electron-runtime/ytDlpProgress.ts` returns `DownloadProgressPayload` instead of core `DownloadProgress`, even though the engine parser is Infrastructure.
6. `QueuedVideoDownloadAck` is a use-case result but is owned by the Renderer DTO file and imported by runtime contracts and Electron bridge.
7. `RawDownloadInput`/schema carry protocol compatibility and transport identity: legacy `ytdlpQuality`, `extensionData`/YouTube source, and catchall extension payload. `src/sites/extension-capture.ts` reads `input.extensionData.ameowCapture`, so Site planning knows the Extension container shape.
8. The public `QueuedVideoDownloadRequest` type exposes `advancedQualitySelector` and `advancedQualityLabel`, despite the spec requiring raw selectors to stay runtime-owned.
9. `PinterestDragDiagnostic` is separately defined in `src/utils/pinterest.ts` and `src/types/videoRuntime.ts`; structural compatibility hides ownership. `PinterestRuntimePayload` has no consumer and is optional cleanup.
10. `RuntimeFailureDiagnostic.context` is passed to Renderer as an open record. Infrastructure is responsible for redaction, but the protocol mapper does not constrain its serialized shape.

### Compatibility fields needing explicit ownership

- `requestId` / `request_id`: WS transport only.
- camelCase / snake_case payload aliases: protocol decoder only.
- `ytdlpQualityPreference`, `ytdlpQuality`, `defaultVideoDownloadQuality`: legacy WS/IPC aliases, decoded to canonical `videoQuality` before Application.
- `aeFriendlyConversionEnabled`: legacy preference compatibility only; not active download/transcode policy.
- `extensionData.youtube` retired fields: accepted/ignored compatibility, not Application semantics.
- `extensionData.ameowCapture`: map to canonical capture evidence; do not preserve its transport container.
- pasted-result `cookies`: current Extension can send it, but desktop resolution drops it and P2 requires generic downloads to use stored site sessions; treat as accepted-but-not-forwarded legacy input.

## C. Current dependency flow and responsibilities

```text
Renderer DTO / command string
  -> preload generic IPC transport
  -> Main generic handler (no envelope validation)
  -> videoDownloadCommands
       preference precedence
       pasted-extension eligibility/fallback
       logging + command dispatch
  -> electron-runtime commandRouter
       manual aliases/validation
       protocol -> RawDownloadInput mapping
       diagnostic enrichment
  -> electron-runtime service
       queue + advanced quality + retained transcode/runtime gate
       protocol DTO/event mapping
  -> DownloadJobService
       prepare once + Job context + typed auth recovery + terminal outcome
  -> DownloadOrchestrator / Engines

Extension WS DTO/action
  -> Main handleWsMessage switch
       JSON parsing + partial validation
       config/session/correlation policy
       WS response mapping
  -> IPC-shaped buildVideoSelectedV2QueuePayload
  -> videoDownloadCommands / commandRouter / same runtime path
```

| Component | Parsing/validation | Session/auth | Mapping | App invocation | Business policy | Error/response | Broadcasting |
| --- | --- | --- | --- | --- | --- | --- | --- |
| preload | wraps/unpacks only | none | generic channel/event wrapper | none | none | Electron promise rejection | listener registration |
| `ipcMain.handle` | none for generic request | none | none | `handleCommand` | none | raw thrown errors | event emit handler accepts arbitrary typed name from Renderer union |
| `videoDownloadCommands` | light string normalization | calls extension resolver for pasted flows | WS/IPC-shaped payload to router; config quality merge | router/runtime | pasted-site allowlist, fallback, quality precedence | throws raw errors/returns bool/ack | none |
| `commandRouter` | strongest current download validation, manual | none | aliases -> `RawDownloadInput`, diagnostic enrichment | runtime queue/cancel/select | some interaction capability enrichment | throws `Error` strings | none |
| WS switch in Main | JSON + per-case manual checks | direct session manager/bridge calls | WS -> IPC builder, generic ack envelope | bridge/runtime | preference persistence and session action policy | repeated codes/messages | server sends one response per request |
| extension background | URL/field normalization, JSON parse | browser cookie collection | page/internal message -> WS DTO | WS only | connection retry, routing/preparation | request timeout/correlation codes | Chrome runtime messages |
| runtime service | core schema later revalidates start input | injected P2 hooks | core -> Renderer DTO, manual typed-error diagnostic | `DownloadJobService` | retained queue/probe/transcode/output policy | terminal event construction | protocol event names via event sink |
| `DownloadJobService` | receives `RawDownloadInput`; orchestrator Zod validates | typed injected recovery | none | orchestrator/ports | one prepare/context, at-most-one recovery | typed error/outcome | none |

The main policy violations for P3 are WS invoking an IPC command contract, preference/pasted fallback living in the transport bridge, and protocol result/error/event construction remaining inside the runtime compatibility service.

## D. Boundary violations

### Blockers

1. **WS is coupled to IPC vocabulary.** `handleWsMessage()` maps `video_selected_v2` to `buildVideoSelectedV2QueuePayload()` and calls `invoke("queue_video_download")` rather than producing a shared Application command.
2. **Real mapping loss exists.** `buildVideoSelectedV2QueuePayload()` preserves `selectedVideoVariant`, but `normalizeQueueVideoDownloadRequest()` does not return it. The Extension/IPC field can be silently dropped before `RawDownloadInput`; existing tests cover only the first hop.
3. **Application/internal input carries transport containers and legacy aliases.** `RawDownloadInput` includes `extensionData` and `ytdlpQuality`; Sites read `extensionData.ameowCapture` directly.
4. **Protocol DTOs are runtime model bases.** Runtime contracts/service/progress parser/advanced probe import `src/types/videoRuntime.ts`; advanced selector is layered on a public option DTO.
5. **Validation is late and inconsistent.** IPC outer envelopes are unchecked; WS uses manual per-case checks; Zod validation occurs again inside Orchestrator after transport mapping. Invalid optional fields can be silently dropped while required fields produce unrelated raw errors.
6. **Result/error mapping has multiple owners.** Success uses `protocolMappers`; ordinary failure, pending cancel, and advanced probe failure build payloads in separate branches. Typed cancellation exists internally but pending cancel does not serialize it.
7. **Renderer reclassifies cancellation from raw error text.** `isCancelledDownloadError()` searches for `cancelled/canceled`, instead of relying on stable code/classification.
8. **Extension compatibility is informal and currently incomplete.** Current sender uses `videoQuality`; existing specs document `ytdlpQualityPreference`, but Main does not accept that historical field. Older independently installed extensions can lose quality semantics.
9. **No focused WS adapter tests exist.** `handleWsMessage()` is embedded in Main; unknown action, malformed data, validation, and download ack mapping are not unit-tested as a boundary.

### Follow-up debt

1. Loopback WS has no client authentication/origin/token handshake. P3 should validate actions/input; authentication requires a separate compatibility/security decision.
2. Site-session settings/registry commands are a broader protocol family. P3 should cover only the download-auth correlation path needed by Application.
3. Xiaohongshu drag resolution mixes image/video preparation and owns a separate correlation map in Main.
4. Queue, advanced-quality, transcode, output settlement, and telemetry remain physically co-located in `service.ts` per the P2 compatibility decision.
5. Runtime dependency commands and downloader version/info are operational download-adjacent commands but not ordinary Job semantics.
6. Extension background owns many UI/content-routing concerns beyond WS protocol; defer to P5.

### Optional cleanup

1. Remove unused `PinterestRuntimePayload`.
2. Consolidate duplicate Pinterest diagnostic type declarations after owner selection.
3. Rename old `ElectronRuntimeCommandRouter` once its IPC-adapter ownership is explicit.
4. Refresh stale Tauri-era wording in type-safety specs separately from product code.

## E. Compatibility findings

- No protocol version is sent or negotiated.
- No extension version or capability negotiation exists. Manifest version is packaging metadata only.
- Unknown actions receive an explicit failed acknowledgement with `unknown_action`.
- Optional fields are generally ignored or normalized; many snake_case/camelCase aliases exist in Main, extension bridge, and command router.
- Extension response correlation accepts `requestId` and `request_id`; result payloads use a separate `correlationRequestId`/snake_case alias.
- Extension incoming broadcast handling accepts top-level `action`, top-level `type`, or `data.action`.
- Current `video_selected_v2` is queue-ack-only. There is no Extension progress, completion, terminal error, or cancel contract.
- Current Main accepts `videoQuality` and `defaultVideoDownloadQuality`, but not the documented historical `ytdlpQualityPreference`; compatibility tests should lock all supported aliases at one decoder.
- The current action/envelope model is sufficient for P3. A protocol-version framework is not justified until incompatible client capabilities actually coexist.

Recommended compatibility strategy:

```text
existing wire action/envelope
  -> action-specific compatibility decoder (current + legacy aliases)
  -> canonical Application command
  -> existing wire ack/event mapper
```

No silent breaking schema change is required.

## F. Validation boundary

### Current IPC

- Renderer TypeScript types are compile-time only.
- Preload and `ipcMain.handle("ameow:command:invoke")` do not validate the outer request.
- `videoDownloadCommands` performs partial normalization.
- `commandRouter` manually validates required URL/trace/option fields and normalizes many optional values.
- `DownloadOrchestrator.prepare()` later runs `rawDownloadInputSchema.parse()`.
- Renderer event payloads are not uniformly validated: queue/transcode helpers normalize defensively, while download progress/result are used directly.

### Current WS

- Main catches invalid JSON.
- Root object/action type is not explicitly required before switch dispatch.
- `video_selected_v2` checks only object data and a truthy/trimmed URL before deeper command-router validation.
- Correlated result bridges manually normalize fields and aliases.
- Extension background performs its own URL/field normalization, but another local WS client can bypass it.
- No client authorization exists beyond binding to loopback.

### Target

```text
untrusted IPC/WS input
  -> transport-specific runtime schema/guard
  -> typed protocol DTO
  -> protocol mapper
  -> canonical Application command
```

Reuse installed Zod on the desktop side and small JS guards in the Extension. Do not treat the core `rawDownloadInputSchema` as a wire schema; it should validate canonical Application input only and contain no wire aliases.

## G. P3 minimum implementation plan

1. Define a canonical download Application API and models under `src/application/`, backed by the existing runtime facade and `DownloadJobService`; do not add a command bus or second downloader architecture.
2. Separate Renderer DTO ownership into `src/protocol/download/` and add one IPC mapper/adapter. Preserve generic channel and public command/event names.
3. Extract only download-related WS actions into a testable WS adapter, retaining the generic envelope and `ExtensionRequestBridge` correlation.
4. Add one small Extension-side protocol helper for request construction/correlation compatibility; do not restructure background/UI state.
5. Centralize progress/result/typed-error mapping outside the Application/runtime internals; keep Extension queue-ack semantics distinct.
6. Migrate internal models away from `src/types/videoRuntime.ts`, remove transport `extensionData` and legacy quality aliases from canonical input, and keep selectors/cookies runtime-owned.
7. Extend Architecture Guard to forbid the new protocol modules from Domain/Application layers.
8. Add focused mapper, IPC adapter, WS/extension, error, compatibility, and boundary tests; retain P0/P1/P2 tests.

Detailed file ownership, rollback points, and validation commands are in `design.md` and `implement.md`.

## H. Baseline verification

Passed on the unchanged product code:

- 9 focused test files / 126 tests.
- TypeScript renderer + Electron type-check.
- Architecture Guard currently passes and already covers `src/application`; it must be extended for the future `src/protocol` directory.

Baseline caveat: the focused suite demonstrates current behavior but does not catch the full-hop `selectedVideoVariant` drop or directly exercise Main's WS action switch. Those are P3 test gaps, not baseline failures.
