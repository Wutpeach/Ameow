# P5 Browser Extension Architecture

## Goal

Establish clear, testable ownership inside the Browser Extension for Desktop connectivity, extension feature/application policy, browser/content adapters, and extension-local state without rewriting the extension or reopening the approved P3 protocol boundary.

User value:

- a browser action cannot accidentally use media or capture evidence from the wrong frame, tab, navigation, or stale request;
- Desktop connection and request failures are deterministic and diagnosable;
- adding or changing a site capture path does not require editing Desktop socket lifecycle or popup state policy;
- the extension's core decisions can be tested without a real browser UI or Desktop implementation.

## Background and confirmed facts

- P0 Runtime / Network, P1 Download Domain, P2 Electron Application Boundary, P3 Protocol Boundary, and P4 Renderer Feature-oriented Frontend are complete and remain authoritative.
- The extension is Manifest V3. `background.js` is a service-worker composition root and the only current owner of a raw WebSocket, while content scripts are injected into all frames and popup/options communicate through `chrome.runtime` messages.
- P3 owns Desktop WS runtime validation and canonical mapping. `extensionData.ameowCapture` continues to map to canonical `captureEvidence`; `selectedVideoVariant` remains end-to-end; the extension remains queue-ack-only; IPC and WS capabilities need not be symmetric.
- Existing positive seams must be retained: pure capture/selection/cache helpers, allowed-domain cookie filtering, current-socket callback guards, bounded media caches, and UI that does not open a WebSocket or construct a raw WS envelope.
- The audit confirmed correctness pressure in frame/resolver ownership, socket/pending ownership, navigation identity, concurrent state writes, drag token authority, and MV3 worker restart behavior. Evidence is recorded in `research/current-extension-architecture-audit.md`.

## Requirements

### R1. Desktop protocol client ownership

- One extension boundary must own connect, reconnect, disconnect, socket replacement, connection status, stale callback rejection, inbound decoding, outbound encoding, request IDs, pending requests, timeout, response matching, duplicate/stale response handling, and pending reset.
- Feature/application code must depend on a narrow Desktop port and must not access the raw WebSocket or P3 envelopes.
- The existing public WS actions, field aliases, acknowledgement shape, queue-ack-only behavior, and loopback endpoint must remain compatible.

### R2. Content and browser adapter ownership

- Content code owns page observation, DOM/media extraction, immutable capture evidence creation, site-specific parsing, and frame-local facts.
- Browser adapters own `chrome.runtime`, tabs/frames/documents, storage, cookies, downloads, alarms, and `webRequest` calls.
- A request that expects one content response must have one explicit resolver owner and one explicit frame/document target.
- Popup-initiated current-page actions default to the main frame; frame-originated actions retain their originating tab/frame/document identity.

### R3. Extension application boundary

- Download submission, media discovery, site-session coordination, paste resolution, drag resolution, and selection policy must be callable as feature/application operations independent of popup DOM and raw Desktop transport.
- `background.js` may remain the service-worker composition root, but it must not remain the implementation owner of every feature.
- Do not create generalized RPC, event-bus, dependency-injection, state-framework, or site-plugin infrastructure.

### R4. State authority and lifecycle

- Connection, pending request, site session, capture, selection, tab/frame/page, UI, persistent setting, browser-download, and ephemeral command state must each have one documented authority, identity key, lifetime, reset condition, and persistence policy.
- Page-scoped evidence must be invalidated on navigation/document replacement or tab removal.
- Concurrent cache/config writes must not lose unrelated updates, and older async responses must not overwrite newer state.
- State required across normal MV3 service-worker suspension must either be persisted/reconstructed or fail explicitly; accidental in-memory survival is not a contract.

### R5. Request and operation identity

- Request ID, Desktop correlation ID, tab/frame/document identity, site/session identity, capture identity, selection generation, drag token, and Desktop download trace identity must remain distinct concepts.
- Runtime callback interactions do not need UUIDs when the callback channel and page generation are sufficient.
- Retry must not create duplicate download effects. P5 must preserve the existing wire contract and must not invent a new wire-level idempotency field; any required P3 wire change is a recorded blocker for a separate review.

### R6. Session, capture, and selection separation

- Site session is keyed by site identity and owns supported cookie acquisition/sync lifecycle; it is not capture or selection state.
- Capture is an immutable snapshot of page evidence created in content context and forwarded through the existing P3 mapping.
- Selection is an ephemeral choice over a page-scoped candidate snapshot and selected variant; it becomes invalid when its page context or candidate generation is superseded.
- Generic video download payloads must not acquire session cookies in the extension.

### R7. UI ownership

- Popup/options render state and emit user intent through semantic extension messages.
- UI must not open sockets, construct raw Desktop protocol messages, or become the authority for Desktop connection, session, or cross-tab state.
- Existing popup candidate grouping/presentation may stay, but application decisions and mutable submission DTO construction must move behind a feature command boundary where required for correctness and testing.

### R8. Diagnostics and failures

- P5 must preserve distinguishable failure categories for browser/content availability, capture, session, selection/stale context, Desktop transport, protocol decode, Desktop application rejection, and request timeout.
- P5 may add stable local reason codes and bounded structured diagnostics at the owning boundary, but must not build a telemetry platform.

### R9. Architecture and regression guards

- Add focused guards that prove dependency direction for the real plain-JavaScript/manifest architecture.
- Add behavioral tests for connection/request lifecycle, frame/document identity, stale state, concurrent writes, content/background adapters, UI intent routing, and P3 compatibility.
- Prefer existing Vitest VM/source-scan/manifest-test infrastructure; do not add a dependency-analysis or fake-browser framework.

## Acceptance criteria

- [ ] Raw WebSocket creation, connection lifecycle, envelope encoding/decoding, and pending correlation have one independently testable owner.
- [ ] Forced socket replacement cannot leave unrelated pending requests orphaned, and stale callbacks/responses cannot mutate the current generation.
- [ ] A content request has one resolver owner and explicit frame/document semantics; main-frame popup actions cannot be won by an iframe or competing listener.
- [ ] Capture, selection, session, page context, and request identities are distinct in code and tests.
- [ ] Navigation, tab removal, reconnect, worker restart, duplicate messages, timeouts, and out-of-order responses have explicit reset/failure behavior.
- [ ] Media/cache/config state has a single-writer or serialized-update path that prevents lost updates and old-page contamination.
- [ ] Drag tokens are bounded, page-context-bound, immutable for authority-bearing fields, and single-consume where the operation is one-shot.
- [ ] Popup/options/content code uses semantic feature commands and does not reference raw WebSocket/P3 transport details.
- [ ] `extensionData.ameowCapture -> captureEvidence`, `selectedVideoVariant`, queue-ack-only behavior, current WS actions/envelopes, and P0-P4 architecture guards remain compatible.
- [ ] Focused Browser Extension tests, `npm test`, `npm run type-check`, `npm run lint`, `npm run build`, extension packaging/manifest checks, and `git diff --check` pass before P5 implementation can be completed.
- [ ] Public behavior and documentation remain unchanged unless implementation discovers a user-visible correction; any such correction updates the public docs site in the same implementation task.

## Explicit non-goals

- Splitting `background.js` merely to reduce file length or performing a full extension rewrite.
- Replacing the extension framework or introducing Redux, Zustand, MobX, an event bus, DI, generalized RPC, or a protocol registry/version platform.
- Redesigning P3, changing WS compatibility, adding progress/result/cancel symmetry, or forcing IPC/WS capability symmetry.
- Refactoring Desktop Renderer, Electron Main, Download Domain, provider routing, engine policy, auth recovery, or queue ownership.
- Entering P6 site/engine extension-model work or building a generalized site plugin system.
- Implementing native messaging/custom-protocol Desktop launch, broader observability, settings redesign, or unrelated UI cleanup.
- Directory normalization, file renaming, helper merging, or shortening `background.js` unless a reviewed ownership move requires it.

## Review gate

This task remains `planning`. Lead Architecture Review must approve the boundary, blocker classification, implementation slices, and P3 compatibility constraints before any `task.py start` or product-code change.
