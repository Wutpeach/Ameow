# P3 Protocol Boundary unification

## Goal

Establish one explicit download Application API behind the existing Renderer/Electron IPC and Browser Extension/WebSocket transports. Each transport may retain its own wire format, action names, envelopes, and capabilities, but must validate and map untrusted input before invoking protocol-neutral Application commands and must map Application results, progress, and typed failures back to its own contract.

This phase is an architecture closure over P0-P2, not a new downloader architecture or a product protocol redesign.

## Background

- P0 established one effective `NetworkRoute` per Job; fallback, retry, and auth recovery reuse it.
- P1 established `Site -> ResolvedDownloadPlan -> DownloadOrchestrator -> DownloadEngine<TExecutionContext>` with stable plan identity and engine-port contracts.
- P2 established the Electron-neutral `DownloadJobService` for the ordinary Job lifecycle while retaining queue, advanced-quality, transcode, output settlement, and protocol compatibility in `src/electron-runtime/service.ts`.
- The current IPC and WS paths still share renderer command vocabulary and payload builders rather than a protocol-neutral Application command. DTO aliases, validation, preference policy, correlation, and response mapping are spread across Main, `videoDownloadCommands`, `commandRouter`, `service.ts`, and extension background code.

## Requirements

- Preserve all P0/P1/P2 invariants and keep `DownloadJobService` as the ordinary Job lifecycle owner.
- Keep existing public Renderer command names, Electron event names, WS action names, response envelope shape, request correlation behavior, and observable product behavior unless an explicit compatibility mapper is included.
- Create a narrow protocol-neutral download Application API used by both IPC and WS adapters. It must not import Electron, IPC/WS action names, request IDs, renderer DTOs, extension DTOs, or wire casing conventions.
- Give Application commands/results/events, IPC DTOs, WS DTOs/envelopes, and runtime/infrastructure types separate ownership even where their current structures happen to match.
- Validate untrusted IPC and WS download input at the transport boundary before producing typed protocol DTOs and Application commands. Reuse the installed Zod dependency or small existing guards; do not add a schema framework.
- Centralize download result/progress/error mapping. Preserve compatibility fields such as `file_path` and user-visible `error`, while providing stable typed failure code/classification so Renderer cancellation/error handling does not depend on raw-message parsing for new payloads.
- Preserve the Extension's current queue-ack-only capability. P3 must not invent WS progress/result streaming merely to make transports symmetrical.
- Preserve legacy WS aliases needed by independently released extension clients, including snake_case correlation aliases and documented historical quality fields. Unknown actions must remain an explicit failed acknowledgement.
- Correct mapping loss at the boundary, including `selectedVideoVariant` being preserved by `buildVideoSelectedV2QueuePayload()` but currently dropped by `normalizeQueueVideoDownloadRequest()`.
- Remove transport-specific `extensionData`/legacy quality aliases from the internal Application input. Map supported capture evidence into a transport-neutral Application field and explicitly ignore or retire unsupported compatibility fields.
- Keep advanced-quality selectors runtime-owned. Renderer/Extension DTOs may carry the request flag and public option IDs/labels, but must not expose or accept raw selectors as public input.
- Extend the Architecture Guard so Domain/Application layers cannot import the new protocol modules, `src/types/videoRuntime`, Electron, or WS/IPC adapters. Existing guards must not be weakened.
- Add focused mapper, IPC adapter, WS adapter/extension, compatibility, and boundary tests. Do not duplicate `DownloadJobService` business tests.

## Acceptance Criteria

- [ ] Renderer IPC and Extension WS invoke the same protocol-neutral download Application API through separate adapters.
- [ ] Application commands/results/events contain no IPC channel names, WS actions, request IDs, Electron types, renderer/extension DTOs, wire casing aliases, or correlation implementation.
- [ ] `selectedVideoVariant`, clip ranges, selection scope, candidates, capture evidence, site hint, title, quality, and advanced-quality intent survive each supported transport mapping with focused tests.
- [ ] Runtime validation rejects malformed primary URLs and required IDs before Application invocation; optional/legacy fields have explicit compatibility behavior.
- [ ] `videoRuntime.ts` no longer mixes Application/runtime models with Renderer protocol DTOs; protocol DTOs and internal models have explicit owners.
- [ ] Ordinary download progress/result/typed error mapping has one owner and preserves existing Renderer wire keys/events.
- [ ] Renderer cancellation/error classification uses typed code/classification for new payloads, with raw-message parsing only as an old-payload compatibility fallback.
- [ ] Extension `video_selected_v2` remains a queue acknowledgement and does not gain a fabricated terminal/progress stream.
- [ ] Current and documented legacy Extension quality aliases are accepted at one compatibility mapper; unknown actions and request correlation remain compatible.
- [ ] No protocol version/schema-registry/RPC framework is introduced; the absence of negotiation is documented and covered by compatibility tests.
- [ ] P0 one-Job/one-route, P1 plan/engine identity, and P2 ordinary Job ownership remain covered by existing focused tests.
- [ ] Architecture Guard blocks `src/core`, `src/application`, `src/orchestration`, `src/engines`, and `src/sites` from importing protocol adapters/DTOs.
- [ ] `npm test`, `npm run type-check`, `npm run lint`, task-relevant build checks, and `git diff --check` pass before implementation handoff.

## Out of Scope

- Renderer P4 feature/state/component architecture.
- Browser Extension P5 UI/background architecture beyond the minimal WS protocol adapter/client extraction.
- A universal request/message type, generalized RPC framework, schema registry, protobuf, event sourcing, plugin protocol, or command bus.
- Adding WS progress/result/cancel capabilities that do not exist today.
- Physical queue/transcode split, transcode lifecycle redesign, or advanced-quality product redesign.
- Updater, diagnostics, docs screenshot, UI Lab, generic image/filesystem commands, and unrelated IPC families.
- Authentication-token/handshake design for the loopback WS server; record this as follow-up security debt unless Lead explicitly expands scope.
- Version negotiation until a concrete incompatible client capability requires it.

## Risks and Deferred Items

- The loopback WS server has no client authentication or capability handshake. P3 must validate and allowlist download actions, but adding an authentication handshake would be a separate compatibility/security decision.
- Existing specs for `ytdlpQualityPreference` are stale relative to current `videoQuality` wire output. P3 should accept both rather than silently break older extensions.
- Site-session registry/settings protocol and Xiaohongshu mixed image/video resolution are adjacent; only the download-auth correlation and mapping needed by the ordinary download flow are blockers.
- Existing unrelated `.trellis/.template-hashes.json` changes belong to the user and must be preserved.
