# Implementation plan

## 0. Reconfirm baseline and scope

- [ ] Re-run `git status --short`; preserve the unrelated `.trellis/.template-hashes.json` modification.
- [ ] Re-read this task's PRD/design and the P0/P1/P2 invariant tests before product edits.
- [ ] Keep the task focused on download protocol boundary; do not move unrelated Main/Renderer/Extension features.

Baseline recorded during planning on 2026-08-10:

```text
npm test -- src/application/download-job-service.test.ts src/electron-runtime/protocolMappers.test.ts src/electron-runtime/commandRouter.test.ts electron/videoDownloadCommands.test.mts electron/extensionRequestBridge.test.mts src/electron-runtime/service.test.ts src/architecture/import-guard.test.ts browser-extension/video-selection-routing.test.js browser-extension/site-session-cookie-sync.test.js

9 files passed, 126 tests passed

npm run type-check
passed
```

## 1. Define canonical Application download API and models

- [ ] Add a narrow `src/application/download-api.ts` (or equivalently scoped file) containing canonical queue/cancel/advanced-selection inputs, accepted-trace result, and protocol-neutral download event models.
- [ ] Adapt the existing electron-runtime compatibility service to implement that API without duplicating queue, `DownloadJobService`, `DownloadOrchestrator`, auth recovery, route, or engine behavior.
- [ ] Move the queue acknowledgement and public advanced-quality option model out of `src/types/videoRuntime.ts` into Application/runtime-neutral ownership.
- [ ] Map `extensionData.ameowCapture` to canonical `captureEvidence`; remove transport container/unknown catchall data from internal input.
- [ ] Consume legacy quality aliases before Application invocation and keep only canonical `videoQuality` internally.
- [ ] Keep `advancedQualitySelector`/label and attempt cookies runtime-owned; do not accept them as public protocol fields.
- [ ] Preserve `RawDownloadInput`/plan identity semantics and the generic engine port.

Focused tests:

```text
npm test -- src/application/download-job-service.test.ts src/application/download-api.test.ts src/orchestration/download-orchestrator.test.ts src/sites/providers.test.ts
```

Rollback point: remove the new API adapter and return callers to the compatibility service; no wire changes exist yet.

## 2. Establish Renderer IPC protocol ownership

- [ ] Move stable Renderer download DTOs from the mixed `src/types/videoRuntime.ts` bucket into a protocol-owned module such as `src/protocol/download/ipcTypes.ts`.
- [ ] Move ordinary result/progress/error and queue mapping into `src/protocol/download/ipcMappers.ts`.
- [ ] Add `electron/downloadIpcAdapter.mts` (or refactor `videoDownloadCommands.mts` into that role) with command-specific decode/validate/invoke/encode behavior.
- [ ] Preserve `ameow:command:invoke`, existing command names, Boolean/ack results, and renderer event names.
- [ ] Preserve all supported fields, with an explicit regression test for `selectedVideoVariant` across the full IPC/WS-shared Application mapping rather than only the first builder hop.
- [ ] Move config quality precedence and pasted-resolution fallback out of the transport switch into the Application service/injected ports.
- [ ] Leave non-download commands on the existing controller/switch path.

Required adapter tests:

- valid queue request;
- invalid/missing/non-HTTP(S) URL;
- pasted queue assisted resolution and fallback;
- cancel with valid/invalid trace;
- advanced-quality request flag and selection option;
- selected variant, clip range, candidates, capture evidence, and compatibility aliases;
- Application invocation error mapped without reclassifying raw text.

Rollback point: restore the download controller registration to `videoDownloadCommands` while leaving Application models/mappers unused.

## 3. Establish Extension WS download adapter and compatibility mapper

- [ ] Extract download-related cases from `handleWsMessage()` into `electron/downloadWsAdapter.mts`; keep ping/theme/language/image/unrelated actions in Main.
- [ ] Validate object root, string action, action-specific data, required URL/correlation IDs, candidate shapes, quality, clip ranges, and optional fields before Application invocation.
- [ ] Preserve the existing `{ success, message, data }` envelope and `requestId` correlation.
- [ ] Preserve and test current actions: `video_selected_v2`, `sync_download_preferences`, `pasted_video_selection_result`, and the download-auth `site_session_cookie_sync_result` correlation path.
- [ ] Preserve desktop-to-extension requests `resolve_pasted_video_selection` and `site_session_cookie_sync_request` through the existing `ExtensionRequestBridge` port; do not expose correlation implementation to Application.
- [ ] Accept current camelCase plus documented legacy aliases (`request_id`, snake_case fields, `ytdlpQualityPreference`, `ytdlpQuality`, `defaultVideoDownloadQuality`).
- [ ] Keep `aeFriendlyConversionEnabled` accepted as inactive legacy compatibility data.
- [ ] Keep unknown action behavior as `success: false` + `unknown_action`.
- [ ] Do not add protocol version/capability negotiation or WS progress/result streaming.

Extension client scope:

- [ ] Extract only sender/correlation/response normalization needed by the WS contract into `browser-extension/desktop-download-protocol.js` (name may follow local conventions).
- [ ] Keep popup/content/background state management and UI unchanged.
- [ ] Preserve connection retry/timeout behavior and flexible incoming action wrapper compatibility.

Required WS/extension tests:

- valid `video_selected_v2` and returned trace;
- invalid JSON/root/data/URL;
- selected variant survives to Application;
- current and legacy quality fields;
- request correlation success, timeout, unknown correlation, snake_case alias;
- immediate Application error mapping;
- unknown action;
- no fabricated progress/terminal event capability.

Rollback point: delegate the action cases back to Main while retaining the tested compatibility decoder.

## 4. Centralize progress/result/error mapping

- [ ] Make `src/electron-runtime/service.ts` publish protocol-neutral download progress, terminal result, and typed failure to its outer adapter.
- [ ] Map core `DownloadProgress`/`DownloadResult` and `DownloadRuntimeError` to Renderer payloads in one protocol mapper.
- [ ] Use the same terminal mapper for ordinary success/failure, pending cancellation, and real advanced-quality probe failure while preserving advanced-quality dismissal semantics.
- [ ] Preserve `file_path`, `error`, `failure`, queue event names, and event wrapper.
- [ ] Update Renderer cancellation detection to prefer typed code/classification; retain raw-message parsing only for old payload compatibility.
- [ ] Keep transcode lifecycle/physical ownership unchanged; only migrate DTO imports if needed for protocol ownership.

Required tests:

- core result -> Renderer success payload;
- typed error -> Renderer failure payload including code/classification;
- cancellation mapping and legacy raw-error fallback;
- progress stage mapping;
- exactly one terminal event for ordinary success/failure/active cancel/pending cancel;
- advanced probe failure vs dismissal behavior.

## 5. Enforce ownership and remove mixed DTO leakage

- [ ] Remove `src/electron-runtime/commandRouter.ts`, `contracts.ts`, `service.ts`, `advancedQualityProbe.ts`, and `ytDlpProgress.ts` dependencies on renderer DTOs where the value is Application/core/runtime-owned.
- [ ] Retire or reduce `src/types/videoRuntime.ts` to a protocol-only compatibility re-export, then remove that re-export in the same task if all in-scope imports are migrated.
- [ ] Remove unused `PinterestRuntimePayload`; keep any truly renderer-only Pinterest DTO under the renderer protocol owner.
- [ ] Add `src/protocol` to the forbidden import targets in `src/architecture/import-guard.test.ts` and add representative assertions.
- [ ] Prove `src/core`, `src/application`, `src/orchestration`, `src/engines`, and `src/sites` import no protocol/transport modules or wire DTOs.

Focused boundary gate:

```text
npm test -- src/architecture/import-guard.test.ts src/electron-runtime/protocolMappers.test.ts src/electron-runtime/commandRouter.test.ts electron/videoDownloadCommands.test.mts electron/extensionRequestBridge.test.mts
npm run type-check
```

## 6. Compatibility and architecture review

- [ ] Compare every command/action/event in `research/current-protocol-audit.md` against the implemented adapters.
- [ ] Prove unchanged IPC/WS names and envelopes with contract tests.
- [ ] Prove Extension current and legacy alias behavior without a version framework.
- [ ] Prove Application has no request IDs, action/channel names, Electron/WS types, or wire casing.
- [ ] Prove P0 route identity, P1 plan/engine identity, and P2 one-recovery/one-terminal ordinary Job behavior.
- [ ] Record loopback WS authentication as follow-up unless Lead separately approves that compatibility change.

## 7. Full validation and handoff

```text
npm test
npm run type-check
npm run lint
npm run build
git diff --check
```

- [ ] Run task-relevant Extension packaging tests if `browser-extension/` protocol files changed.
- [ ] Update public docs only if user-visible behavior or extension workflow changes; pure compatible architecture movement requires no docs-site change.
- [ ] Run Trellis quality check against PRD/design/implementation and applicable specs.
- [ ] Keep the task `in_progress` after implementation and wait for Lead Architecture Review; do not begin P4/P5.

## Stop conditions

Return to planning instead of expanding scope if implementation requires:

- a breaking IPC/WS schema;
- WS authentication/handshake or capability negotiation;
- a second plan/route resolution or engine port change;
- queue/transcode/advanced-quality product redesign;
- generalized RPC/schema infrastructure;
- broad Renderer or Extension architecture changes.
