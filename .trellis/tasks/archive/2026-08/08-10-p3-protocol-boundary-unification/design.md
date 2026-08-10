# Technical design

## Design intent

Close the download protocol boundary with the smallest transport-specific adapters that can share one Application API. Preserve wire compatibility and P0-P2 ownership. Do not force IPC and WS into one DTO or add capabilities the Extension does not currently have.

## Current flow

```text
Renderer
  -> desktopCommands.invoke(command, payload)
  -> preload generic ameow:command:invoke
  -> Main handleCommand
  -> videoDownloadCommands (preference + pasted-resolution policy)
  -> electron-runtime commandRouter (manual decode/map)
  -> electron-runtime service queue
  -> DownloadJobService

Extension
  -> background sendRequestToApp(action, data + requestId)
  -> Main handleWsMessage switch
  -> buildVideoSelectedV2QueuePayload (IPC-shaped payload)
  -> videoDownloadCommands.invoke("queue_video_download")
  -> same commandRouter/runtime path
```

The shared point is currently the Renderer command vocabulary, not an Application command.

## Target flow

```text
Renderer IPC DTO                     Extension WS DTO/envelope
       |                                      |
       v                                      v
Electron download IPC adapter        Download WS adapter
 decode/validate/map/encode           decode/validate/correlate/encode
       |                                      |
       +--------------+  +--------------------+
                      v  v
               DownloadApplicationApi
       queue/cancel/select/query semantics and pasted fallback
                      |
                      v
         electron-runtime compatibility implementation
       queue + advanced quality + retained transcode/runtime gate
                      |
                      v
               DownloadJobService
                      |
                      v
        DownloadOrchestrator / existing ports
```

## Application ownership

Add one narrow Application API under `src/application/` rather than a manager hierarchy or command bus. It owns only the use-case vocabulary needed by both transports:

- queue a normalized download command and return an accepted trace;
- queue a pasted URL with optional injected selection-resolution port and fallback policy;
- cancel a download;
- select a public advanced-quality option;
- expose protocol-neutral progress, terminal outcome/failure, and queue state models needed by adapters.

The existing `src/electron-runtime/service.ts` remains the compatibility implementation for queue scheduling and retained advanced-quality/transcode/runtime responsibilities. `DownloadJobService` remains the ordinary Job lifecycle owner. The new API must not duplicate prepare/fallback/auth/route logic.

Application input should use canonical fields only. In particular:

- `videoQuality`, not wire aliases such as `ytdlpQualityPreference`, `ytdlpQuality`, or `defaultVideoDownloadQuality`;
- `captureEvidence`, not the Extension container `extensionData.ameowCapture`;
- public `advancedQualityRequested`, never `advancedQualitySelector`;
- canonical `MediaCandidate` for both passive candidates and explicit selected variant;
- no request ID or action/channel name.

Attempt cookies and the chosen advanced-quality selector stay runtime/infrastructure-owned and are added after Application command decoding. This does not change `ResolvedDownloadPlan` or `DownloadEngine<TExecutionContext>`.

## Protocol ownership

Use small modules by transport/capability, not one universal schema file:

- `src/protocol/download/ipcTypes.ts`: stable Renderer request/result/progress/queue/transcode DTOs and event payloads.
- `src/protocol/download/ipcMappers.ts`: IPC DTO -> Application command and Application progress/result/error -> Renderer DTO.
- `electron/downloadIpcAdapter.mts`: command allowlist, outer-envelope validation, Application invocation, IPC response/error behavior.
- `electron/downloadWsAdapter.mts`: download-related WS action allowlist, JSON/data validation, Application invocation, queue ack/error envelope, and delegation of correlated pasted/session results.
- `browser-extension/desktop-download-protocol.js`: current sender/response correlation helpers and compatibility normalization extracted from `background.js`; no UI/state rewrite.

Names may be adjusted to local conventions during implementation, but ownership must remain separated. `src/types/videoRuntime.ts` should cease being a mixed shared-model bucket. A temporary re-export is acceptable only if it is protocol-only and has an explicit removal in the same task; runtime/Application code must not depend on it.

## Validation boundary

### IPC

Treat Renderer input as semi-trusted but validate it in Main before Application invocation. Validate the outer `{ command, payload }` envelope and each in-scope command payload. Required URL/trace/option fields must reject invalid types and non-HTTP(S) primary URLs. TypeScript renderer types remain developer ergonomics, not security validation.

### WS

Treat every local WebSocket client as untrusted. Parse JSON, require an object root and string action, decode the action-specific data, and return the existing failure envelope for malformed input. Use Zod already installed on the desktop side or small existing normalization helpers. The plain-JS extension keeps compact guards for payload construction and response handling.

Do not add a new dependency or generalized schema registry.

## Mapping and compatibility

Preserve current wire contracts:

- IPC channel `ameow:command:invoke`, command names, event channel names, and `{ payload }` event wrapper.
- WS action names and `{ success, message, data }` acknowledgement envelope.
- `requestId` request correlation plus accepted `request_id` response/input aliases.
- Renderer result key `file_path` and existing error text.
- Extension queue acknowledgement semantics for `video_selected_v2`.

Centralize alias handling at decoders:

```text
videoQuality | ytdlpQualityPreference | ytdlpQuality |
defaultVideoDownloadQuality
                -> canonical videoQuality

extensionData | extension_data
                -> supported captureEvidence + explicitly ignored legacy fields

requestId | request_id
                -> transport correlation only
```

Accept `aeFriendlyConversionEnabled` as a legacy preference field while keeping it outside active download/transcode policy. Preserve legacy `cookies` in pasted-selection responses as accepted-but-not-forwarded compatibility input; generic extension downloads use the dedicated site-session flow.

No protocol version field or capability negotiation is added in P3. Current compatibility requirements are satisfied by stable actions/envelopes, alias decoding, optional fields, unknown-action errors, and contract tests. Revisit negotiation only when two supported clients require incompatible semantics.

## Progress, result, and error flow

Target Renderer flow:

```text
DownloadJobService/core DownloadProgress/DownloadResult/DownloadRuntimeError
  -> protocol-neutral runtime/Application event
  -> IPC mapper
  -> video-download-progress / video-download-complete DTO
  -> Main event transport
  -> preload
  -> Renderer
```

The terminal mapper owns success, typed failure, pending cancellation, and advanced-probe failure conversion. Preserve existing special semantics: advanced-quality dismissal removes the queue row without emitting completion; a genuine probe failure emits one failure completion.

Renderer cancellation classification should prefer `failure.classification === "cancelled"` or `failure.code === "E_ABORTED"`. Retain raw `error` message parsing only for payloads from older app versions.

Target Extension flow remains:

```text
WS video_selected_v2
  -> validated Application queue command
  -> accepted trace or immediate validation/invocation failure
  -> existing WS ack envelope
```

No Application progress/result event is sent to the Extension because that capability does not exist today.

## Boundary guard

Extend `src/architecture/import-guard.test.ts` so `src/protocol` is forbidden from `src/core`, `src/application`, `src/orchestration`, `src/engines`, and `src/sites`. Keep existing bans on Electron, project `electron/`, `src/electron-runtime`, and `src/types` for those layers. Add representative assertions for both relative `.js` protocol imports and project Electron adapters.

The allowed direction is:

```text
protocol adapter -> Application/core
electron-runtime -> Application/core
Application/core -X-> protocol/Electron/electron-runtime
```

## Rollout and rollback

1. Add canonical Application API/models and tests while adapting the existing runtime behind them; public wire unchanged.
2. Add IPC DTO mapper/adapter and route only download commands through it; generic non-download command handling stays in Main.
3. Add WS download adapter and delegate only download-related actions; non-download WS actions stay in the existing switch.
4. Extract the minimal Extension protocol helper and add compatibility tests without changing UI/state architecture.
5. Move result/progress/error mapping and migrate protocol DTO imports; strengthen guards.

Each step retains the current public actions and can be rolled back without changing Domain plans, engines, or extension UI.

Stop and return to planning if implementation requires a wire breaking change, route/plan re-resolution, `DownloadEngine` contract change, broad queue/transcode redesign, WS authentication handshake, or generalized RPC/schema infrastructure.
