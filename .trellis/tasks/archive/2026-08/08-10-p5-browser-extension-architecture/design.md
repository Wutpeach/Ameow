# P5 Browser Extension target architecture

## Design intent

Create the smallest ownership boundaries that make Browser Extension behavior deterministic across frames, navigation, reconnect, request correlation, and Manifest V3 service-worker suspension. Preserve the current user experience and P3 wire compatibility.

This design does not prescribe a cosmetic directory tree. A module exists only when it owns a lifecycle, policy, or adapter seam that must be tested independently.

## Current pressure

```text
Popup / Options / Content
          |
          v
background.js
  |- UI message routing
  |- Chrome API calls
  |- capture/selection/session/download policy
  |- caches/tokens/browser-download state
  |- WS lifecycle and Desktop action mapping
  `- pending registry delegated to a separate helper
          |
          v
P3 Desktop WS boundary
```

The existing helpers already prove that plain JavaScript modules and VM tests are enough. The problem is not the lack of layers; it is that transport generation, feature policy, browser context identity, and state lifecycle do not have one owner.

## Target boundary

```text
Popup / Options UI           Content / site adapters
 render + intent             DOM observation + capture
          \                         /
           v                       v
        Browser message / tab-frame adapters
                       |
                       v
          Extension feature/application operations
        download | discovery | session | resolution
                       |
                       v
             Extension Desktop port
                       |
                       v
         Desktop protocol client + P3 WS codec
                       |
                       v
                    WebSocket
```

`background.js` remains the MV3 composition root: it wires adapters, application operations, stores, and the Desktop client; registers browser lifecycle listeners; and forwards messages to one handler. It stops implementing all underlying policies inline.

## Boundary ownership

### 1. Desktop protocol client

One client instance owns:

- raw `WebSocket` creation and the fixed loopback URL;
- connection generation, connect/force-replace/disconnect, reconnect timer/alarm coordination, and connection status;
- current-socket callback guards and stale callback disposal;
- JSON parse, minimal acknowledgement/command envelope validation, outbound encoding, and inbound classification;
- request ID allocation, pending registration, expected reply kind, timeout, matching, duplicate/stale response rejection, and reset of all requests from a replaced generation;
- dispatch of valid Desktop-initiated commands to an injected application handler;
- connection-state subscriptions for browser/UI adapters.

The client is plain JavaScript with injected socket, clock/timer, reconnect scheduling, and diagnostics functions. Chrome alarms can remain a background adapter injected into the client; transport policy must not import popup, content, site detector, cookies, tabs, or DOM code.

Minimal public shape:

```text
connect({ force? }) -> connection result
disconnect(reason)
request(action, data, policy) -> acknowledgement result
sendNotification(action, data) -> boolean
getConnectionState()
subscribeConnection(listener) -> dispose
```

Raw `request(action, ...)` is private to the Desktop adapter layer, not exposed to UI/content. Named feature-facing operations wrap the approved P3 actions, for example queue selection, save image/data URL, sync preferences, site-session requests, and correlated resolver results. This avoids a class hierarchy while preventing feature code from constructing envelopes.

Connection rules:

1. `force` may replace a stale CONNECTING socket.
2. Replacement first marks the old generation closed, rejects every pending request owned by it, detaches callbacks, and then closes the socket.
3. A response matches only a pending request from the current generation with the expected acknowledgement shape.
4. Unknown, duplicate, stale-generation, and malformed messages do not mutate feature state; they receive bounded diagnostics.
5. Normal timeout/close is not proof that a queue command was not accepted. Do not retry `video_selected_v2` after an ambiguous post-send failure.
6. Preserve the current limited safe pre-send/connect retry behavior only where tests prove no command was accepted. Do not add a wire operation ID in P5.

### 2. Extension Desktop port

Feature/application operations depend on named intent methods rather than action strings. This port owns extension-side P3 mapping but not Desktop canonical Application mapping.

Representative operations:

```text
queueVideoSelection(selectionCommand)
saveImage(imageCommand)
saveDataUrl(dataUrlCommand)
syncDownloadPreferences(preferences)
getSiteSessionSummary()
requestSiteSessionSync(siteId)
enableCurrentSiteSession(page)
reportPasteResolution(desktopRequestId, result)
reportDragResolution(desktopRequestId, result)
reportCookieSync(desktopRequestId, result)
```

Keep this as a small object/function set around the client. Do not create repositories, controllers, a command bus, or a generated action registry.

### 3. Extension feature/application operations

Extract only operations with real policy and lifecycle pressure:

- **Download submission:** accept immutable selection intent, load extension quality preference, decide Desktop vs existing browser fallback, call the Desktop port/browser-download adapter, and return stable local reason codes.
- **Media discovery:** coordinate main-frame content scan with network evidence and cache stores, bind results to one page context and scan generation, and reject stale commits.
- **Site session:** project Desktop registry readiness onto the active tab, validate site/domain, acquire cookies through the browser adapter, and call the Desktop port. Desktop remains the stored-session authority.
- **Paste resolution:** bind a Desktop command ID to a validated page context, reuse or create a tab, call the one content resolver, revalidate before returning, and clean temporary tabs.
- **Drag/protected-media resolution:** own token registry, immutable registration facts, one-shot consumption, bounded fallback sequence, and correlated result.
- **Selection/capture dispatch:** keep capture immutable, validate selection generation/page context, preserve `selectedVideoVariant`, and build the extension command without mutating UI DTOs.

Not every operation needs its own directory or class. Pure functions plus injected ports are preferred.

### 4. Browser adapters and stores

Small adapters isolate APIs that cannot run in pure tests:

- runtime message and sender-context normalization;
- tabs/frame/document query/send/create/update/remove;
- cookies;
- downloads and active-download reconstruction;
- alarms/timers;
- `webRequest` evidence;
- storage update serialization.

The storage adapter provides a serialized `update(key, reducer)` or feature-specific single-writer queue so two read-modify-write operations cannot discard each other. This is not a database abstraction.

Use `details.documentUrl`/frame evidence captured at `webRequest` time as the primary page identity. A later tab lookup may enrich data only after identity still matches; it must not relabel an old response as the current page.

### 5. Content adapters and resolver owner

Content responsibilities remain:

- page observation and frame-local state;
- generic/site-specific DOM/media extraction;
- immutable capture evidence;
- injected launcher/picker UI;
- page-world bridge interaction where required.

One content message router owns each request/response message. Site-specific extractors are called by that router in explicit current priority; they do not independently race `sendResponse` for the same message. This is a bounded dispatcher over existing detectors, not the P6 generalized site plugin model.

Frame policy:

- popup/current-page scan, current-content capture, and current-video resolution target frame `0`;
- a user action originating inside a frame keeps `sender.tab.id`, `sender.frameId`, optional `sender.documentId`, and sender/page URL;
- a background operation sends back only to that registered context;
- if the document identity changed or cannot be revalidated, return `stale_page_context` rather than falling back to a different frame;
- full cross-iframe media discovery UX is deferred; deterministic main-frame behavior is required now.

### 6. Popup/options UI

Popup and options remain plain DOM scripts.

- UI keeps presentation-only state: active drawer/tab, preview, busy/cooldown, selected candidate/variant, localized feedback.
- Selection is bound to the scan's `pageContextKey` and `generation`.
- Download emits an immutable `{ pageContextKey, generation, candidateId, selectedVariantId }` intent. The feature operation resolves/builds the submission command.
- Status polling uses one in-flight/generation gate; a response cannot overwrite a newer push or later poll.
- Options commands use monotonically ordered local command generations or background-authoritative results so older responses cannot roll back newer intent.

UI continues to avoid WebSocket, raw P3 action names, and protocol envelopes.

## Identity model

### Browser message context

Normalize each content-originated message once:

```text
BrowserMessageContext
  tabId
  frameId
  documentId?       # use when Chrome supplies it
  pageUrl
```

This context is authoritative for where the interaction happened. Do not replace it with a later active-tab lookup.

### Page context key

```text
PageContextKey = tabId + frameId + (documentId || normalized page URL + local navigation generation)
```

The browser adapter advances/invalidate generations on tab navigation/loading and removes all page-scoped state on tab removal. When a stable `documentId` is available it is preferred; the fallback remains URL plus explicit navigation generation rather than URL alone.

### Other identities

| Identity | Owner | Purpose / reset |
| --- | --- | --- |
| connection generation | Desktop client | changes on socket replacement/close; owns pending set |
| extension requestId | Desktop client | one extension -> Desktop request/ack |
| Desktop command requestId | Desktop | one Desktop -> extension resolver command; returned as `correlationRequestId` |
| captureId | content/application local | one immutable evidence snapshot; new on recapture; not added to P3 wire |
| scan/selection generation | media/selection feature | supersedes old candidates/selections on scan/navigation |
| siteId / registry generation | Desktop + session feature projection | site session identity/readiness for one connection generation |
| drag token | drag feature | bounded one-shot registration tied to page context |
| browser downloadId | browser downloads API | active browser-download reconstruction/tracking |
| Desktop traceId | Desktop Application | queued Job identity from acknowledgement; never reused as request/tab/session ID |

## State authority and lifecycle

| State | Authority | Lifetime / reset | Persistence strategy |
| --- | --- | --- | --- |
| connection/pending | Desktop client | connection generation; reset on replace/close/worker stop | reconstruct connection; pending fails explicitly |
| Desktop registry readiness | session feature | connection generation; unready until current push/handshake | metadata may cache, but cannot be treated current before generation readiness |
| session cookies | session operation | one validated request | never extension-persisted; Desktop owns stored sessions |
| capture | content/application | immutable page interaction; invalid on document change | none |
| candidates/selection | discovery + popup UI | page/scan generation | bounded cache may persist candidates with page identity; selection does not persist |
| network/scan cache | storage store | tab/page identity + TTL/limit; invalidate on navigation/tab removal | serialized `storage.local` updates |
| drag tokens | drag feature | page context + TTL + total limit + one-shot | fail explicitly after worker restart unless a minimal recoverable record is justified |
| browser downloads | browser download feature | browser `downloadId` until terminal/TTL | rehydrate from `chrome.downloads.search` and/or bounded persisted metadata |
| launcher/settings | background-owned config store | storage key; command generation | serialized background writes; UI/content consume snapshots |
| popup/options UI | UI closure | page lifetime | none |

Do not persist sensitive session material or whole DOM/candidate objects merely to survive worker suspension.

## Session / capture / selection contracts

### Session contract

```text
active tab URL
  -> match current Desktop registry projection
  -> explicit user/Desktop sync request
  -> allowed-domain cookie adapter
  -> correlated Desktop session result
```

Registry readiness and site matching are separate from cookie material. Navigation only changes the current-tab projection. Generic download submission never attaches cookies.

### Capture contract

```text
page/document interaction
  -> immutable ExtensionCapture { captureId, pageContextKey, evidence }
  -> selection/download command validates current context
  -> existing extensionData.ameowCapture
  -> P3 canonical captureEvidence
```

Recapture creates a new snapshot. Do not mutate evidence when selection changes.

### Selection contract

```text
DiscoverySnapshot { pageContextKey, generation, candidates }
  + UI SelectedCandidate/SelectedVariant
  -> immutable SelectionIntent
  -> application validation
  -> selectedVideoVariant + capture evidence dispatch
```

Candidate, capture, and session facts may be combined for a command only at the application operation; they remain distinct authorities.

## Request lifecycle design

### Extension -> Desktop

```text
feature operation
  -> named Desktop port method
  -> client allocates requestId under current connection generation
  -> validate/encode/send
  -> match one acknowledgement or timeout/reset
  -> return typed local result
```

- Duplicate response after resolution is ignored and diagnosed.
- Response from an old generation is ignored.
- Malformed JSON/envelope becomes `protocol_decode_failed`, not a feature rejection.
- Desktop `success:false` remains `desktop_application_rejected` with stable existing code/message.
- Request timeout remains distinct from offline/closed/send failure.

### Desktop -> extension

```text
validated Desktop command { requestId }
  -> command dispatcher
  -> feature operation keyed by Desktop command ID
  -> result via named Desktop port method
     { new transport requestId, correlationRequestId: original requestId }
```

One-shot token operations consume before side effects. Duplicate inbound command IDs either join the same in-flight operation or return a stable already-consumed/duplicate result; they must not repeat downloads/tab creation.

### UI/content runtime messages

Use Chrome's callback channel for short commands. Add a local generation only for state that can be superseded (status poll, scan, config write, resolver/navigation). Do not add UUIDs to fire-and-forget theme notifications or simple getters without a stale-commit risk.

## Paste / drag design

Paste remains Desktop-originated and extension-resolved. The resolver may reuse a tab only after exact page-context validation; otherwise create a bounded temporary tab. It targets one content resolver, revalidates the document before accepting the payload, returns a correlated result, and always cleans a temporary tab.

For drag tokens:

- registration captures immutable tab/frame/document/page/media identity;
- Desktop request data may supply compatible non-authoritative options such as target directory, but cannot replace registered context/media identity;
- registries have TTL and total limits;
- tokens are consumed atomically before one-shot resolution;
- navigation/tab removal invalidates matching tokens;
- worker restart yields a specific expired/restarted result unless a minimal safe persisted record is deliberately added.

## Failure and diagnosability contract

| Category | Owner | Representative stable local result |
| --- | --- | --- |
| browser/content | browser/content adapter | `content_unavailable`, `restricted_page`, `frame_unavailable` |
| capture | capture operation | `capture_invalid`, `capture_unavailable` |
| session | session feature | `site_session_unready`, `unsupported_site_session`, `no_site_session_cookies` |
| selection | selection feature | `selection_invalid`, `stale_page_context`, `stale_selection` |
| Desktop transport | Desktop client | `not_connected`, `send_failed`, `ws_closed` |
| protocol | Desktop client/codec | `protocol_decode_failed`, `unexpected_response` |
| Desktop rejection | Desktop port | existing Desktop/P3 code plus `desktop_application_rejected` category |
| timeout | owning request operation | `request_timeout`, `content_timeout` |

Diagnostics should include safe IDs/generations/action category and omit cookies, credentials, data URLs, and sensitive URLs where current logging rules require redaction. A telemetry platform is follow-up debt.

## Architecture guard strategy

Use a focused Vitest scanner/manifest wiring test for plain JavaScript. Extend the current testing style rather than the TypeScript-only import scanner's directory assumptions.

### Must land in P5

1. Only the Desktop client/codec boundary may contain `new WebSocket`, the loopback URL, pending request map, or raw envelope encode/decode.
2. Popup/options/content/site adapter files may not reference the Desktop client implementation, loopback URL, or raw Desktop WS action constants.
3. Desktop client/codec files may not reference popup/options DOM, site detector globals, cookies, tabs, or capture implementations.
4. Feature model/application modules may not reference popup/options DOM; pure feature modules use injected Chrome adapters rather than raw `chrome.*`.
5. Content/site adapters may not own Desktop socket lifecycle.
6. Manifest/background composition tests assert the required helper order and one content resolver owner.
7. Representative violation fixtures prove each rule, so the guard itself is tested.

### Not worth adding now

- a general dependency graph/cycle analyzer;
- a protocol action registry/version framework;
- a file-size, directory-name, or `background.js` line-count guard;
- blanket bans on global IIFE helpers before a concrete ownership move;
- a compile-time type-test framework for the current plain-JavaScript extension.

Behavioral regression tests are more valuable than TypeScript conversion. JSDoc may document contracts when it improves local safety, but TypeScript migration is not a P5 prerequisite.

## Focused test strategy

### Desktop client

- initial connection and connection-state publication;
- stuck CONNECTING force replacement;
- reconnect timer/alarm coordination;
- stale open/message/error/close callbacks;
- socket replacement rejects all old-generation pending requests;
- request ID matching, expected response kind, timeout, duplicate/unknown/stale response;
- disconnect and worker disposal;
- malformed JSON/envelope and valid Desktop command dispatch;
- no automatic retry after ambiguous timeout/close; safe pre-send retry remains compatible.

### State and identity

- tab/frame/document isolation;
- main-frame current capture/selection;
- navigation invalidates capture, candidates, selection, tokens, and old responses;
- old scan/status/config response after a new generation cannot commit;
- concurrent cache/config updates preserve both writes;
- old `webRequest` document evidence is not relabeled with a new tab URL;
- connection generation resets registry readiness and pending state;
- service-worker restart reconstructs browser download state or returns a specific unavailable state.

### Content/background boundary

- exactly one resolver handles each selection message;
- explicit frame 0 for popup/current-page operations;
- sender tab/frame/document context survives a frame-originated intent;
- site-specific parser result maps into the canonical extension capture/selection model;
- duplicate content/drag messages are bounded and one-shot where applicable.

### UI boundary

- user intent invokes a semantic feature command;
- selection command is immutable and includes page/scan generation;
- popup/options contain no raw Desktop action/envelope construction;
- status polling, hydration, and optimistic config responses cannot overwrite newer state.

### Compatibility

- retain existing P3 WS action/envelope tests;
- queue-ack-only behavior remains unchanged;
- `extensionData.ameowCapture -> captureEvidence` regression remains green;
- `selectedVideoVariant` remains intact;
- site-session allowed-domain filtering and protected-media fallback contracts remain green;
- P0-P4 architecture guards remain green.

Use current Vitest VM tests plus small fake socket/clock/Chrome adapters. Add one unpacked-extension smoke only if the current packaging/smoke harness can do it without a large new framework; it is not a prerequisite for the pure lifecycle tests.

## Compatibility, rollout, and rollback

- P3 wire actions, aliases, envelope shape, loopback endpoint, queue acknowledgement, canonical mapper, and Desktop capability set are unchanged.
- Existing content/UI message names may be retained behind adapters during migration. Message renaming is not a goal.
- Move one owner at a time and keep the old call site as a compatibility wrapper until its focused tests pass.
- Each implementation slice can roll back to the previous wrapper because no public protocol or stored user data migration is required.
- Persisted cache/config changes must remain backward-readable or be safely discarded/rebuilt.

Return to Lead Architecture Review before implementation continues if a slice requires:

- a P3 wire field/action or Desktop canonical mapper change;
- wire-level idempotency or capability symmetry;
- a generalized site/plugin/RPC/event system;
- Desktop Renderer/Main/Download Domain restructuring;
- user-visible behavior beyond correcting the audited stale/wrong-context failures;
- sensitive session material persistence in the extension.

## Lead Architecture Review questions

1. Approve the single Desktop client as owner of both socket generation and pending correlation, with named feature-facing Desktop operations and no new wire fields.
2. Approve deterministic main-frame ownership for popup/current-page requests while preserving originating frame identity for frame-local user actions; full iframe discovery remains deferred.
3. Approve P5 treatment of MV3 restart correctness: reconstruct browser-download state, make registry readiness explicit, and fail expired transient operations rather than persisting sensitive/page-heavy state.
4. Confirm the eight audit Blockers are P5 implementation scope and the listed protocol/auth/observability/site-plugin items remain follow-up debt.
