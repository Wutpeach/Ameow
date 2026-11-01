# P5 current Browser Extension architecture audit

## Scope and method

This audit covers the current `browser-extension/` runtime and only the Desktop/P3 files needed to establish compatibility. It is organized by feature and state ownership rather than file size. Product code was not changed.

Baseline evidence:

- MV3 service worker: `browser-extension/manifest.json:173-175`.
- all-frame generic content stack: `browser-extension/manifest.json:57-76`.
- background composition: `browser-extension/background.js:4-19`.
- raw Desktop socket: `browser-extension/background.js:1886-1979`.
- request registry: `browser-extension/desktop-download-protocol.js:24-112`.
- UI runtime adapter: `browser-extension/popup.js:30-45`, `browser-extension/options.js:10-25`.
- P3 canonical WS adapter remains Desktop-owned; P5 does not reopen it.

## Current dependency and ownership map

```text
Page / page-world bridges
  -> generic + site content scripts
      -> chrome.runtime semantic-ish messages
          -> background.js
              |- browser adapters: tabs/frames, cookies, storage, downloads,
              |  alarms, webRequest
              |- feature policy: capture forwarding, media merge/fallback,
              |  site session, drag/paste resolution, selection routing
              |- UI RPC router and extension-wide state
              `- raw WebSocket lifecycle
                    -> desktop-download-protocol.js pending registry
                    -> P3 Desktop WS boundary

Popup/options
  -> chrome.runtime messages
      -> background.js feature policy / browser adapters / Desktop WS
```

The raw socket does not leak into UI/content code, but `background.js` is simultaneously the browser adapter, application layer, Desktop transport adapter, state authority, and command dispatcher. The extracted protocol helper owns only request ID/pending mechanics, so socket generation and pending lifecycle have competing owners.

## Extension feature inventory

| Feature | Entry and current owner | State/lifecycle | Dependencies and coupling | Failure/tests |
| --- | --- | --- | --- | --- |
| Desktop connection / bridge | `background.js:1886-2147`; pending in `desktop-download-protocol.js` | global socket, reconnect timer/alarm, attempts, status, pending map; service-worker lifetime | raw WebSocket, alarms, popup broadcast, preference/debug bootstrap, Desktop action switch | local status strings/logs; request helper tests cover basic correlation/timeout but not full socket lifecycle |
| Download submission | content `video_selection`, popup `download_media_candidate`, background `handleVideoSelectionRequest` / `downloadMediaCandidate` | one request plus limited connection retry; browser fallback may create browser download tracker state | capture/selection helpers, quality storage, capability policy, browser downloads, raw action names | focused helper/source tests; no full content/background/Desktop harness |
| Site capture | `capture-evidence.js`, launcher/picker and current-content handlers | immutable object per interaction in content memory | DOM/meta/JSON-LD, runtime message, `extensionData.ameowCapture` | strong pure tests; background frame ownership is not deterministic |
| Media/video discovery | generic detector, site detectors/parser registry, `webRequest`, scan/network caches | content document lifetime; in-flight map; persistent TTL caches | DOM/performance/site parsing + background tabs/storage | many pure tests; multi-listener resolution and concurrent storage races are not covered |
| Video selection | generic detector + site listeners; popup `selectedVariantByGroup`; background normalization/routing | frame-local playback/context history; popup-lifetime selected variant; no shared page generation | UI grouping mutates candidate DTO before submission; background rereads active tab | parser/selection tests exist; stale page/multi-responder tests missing |
| Site session | `site-session-cookie-sync.js` + background Desktop handshake + popup drawer | registry only in worker memory; cookie material acquired on demand; Desktop owns stored session | allowed-domain cookies, active tab, Desktop registry/actions, popup UI | domain filtering is well bounded; worker restart/readiness not explicit |
| Paste resolution | Desktop inbound `resolve_pasted_video_selection` -> background -> existing/hidden tab -> content -> correlated result | Desktop request ID; optional temporary tab; no extension paste listener | site allowlist, tab lookup by URL, content resolver, Desktop result action | correlation exists; tab navigation and duplicate resolver ownership not covered |
| Protected-image/XHS drag | content registers token; Desktop asks background to resolve | worker-memory token registries with TTL; protected token consumes once, XHS does not | tab/frame, content fetch, background fetch, cookies, hidden tab, Desktop save/result | detailed fallback tests/specs exist; authority/replay/navigation lifetime gaps remain |
| Request correlation | runtime callbacks for UI/content; request map for extension -> Desktop; `correlationRequestId` for Desktop -> extension results | callback channel, transport request ID, Desktop command ID | socket generation is external to pending map; no expected response kind/action | basic request helper tests pass; generation/reset/malformed/duplicate behavior incomplete |
| Popup UI | `popup.js` | popup-lifetime connection/session/scan/selection/preview/busy state; 1.2s status polling | semantic runtime messages plus candidate grouping/capability decisions | UI does not access WS; main tests are largely source assertions and do not exercise response ordering |
| Options/settings UI | `options.js`, `launcher-config.js` | optimistic local config + persistent `chrome.storage.local` | runtime commands and direct storage change listener | UI is close to render+intent; concurrent optimistic responses and multi-context writes can reorder/lose updates |
| Persistence / local state | launcher/quality/language/pending-sync/media caches in storage; connection/registries/tokens/download tracker in memory | mixed persistent, reconstructed, and accidental worker-lifetime state | multiple contexts and read-modify-write sites | cache pruning is tested; restart/single-writer behavior is not |
| Tab/frame integration | sender metadata, active-tab queries, some explicit frame sends | inconsistent: drag stores tab/frame, scan targets frame 0, current capture/selection broadcasts | Chrome tabs/runtime APIs and all-frame injection | no one identity model; wrong-frame and navigation reuse are real races |

## Desktop WS client ownership audit

### Connection ownership

`background.js` owns the socket, current-socket check, reconnect timer/alarm, connection status, and inbound action switch. `desktop-download-protocol.js` has no socket generation and receives callbacks (`isConnected`, `ensureConnection`, `send`) from background.

Positive behavior:

- every socket callback checks `ws === socket` before state mutation (`background.js:1910-1978`);
- normal close rejects all pending requests (`background.js:1949-1961`);
- socket handlers are detached before replacement (`background.js:280-293`).

Ownership failures:

1. `connect({ force: true })` still returns when a socket is `CONNECTING`, before force semantics can replace it (`background.js:1886-1894`). An errored socket that remains CONNECTING can block both timer and alarm reconnect attempts.
2. `resetSocketForRetry()` detaches/closes the socket without rejecting other pending requests (`background.js:649-669`). Because the close callback was detached, concurrent requests wait for individual timeouts.
3. Socket generation lives in background while pending ownership lives in the helper. Pending entries therefore cannot assert that a response belongs to the generation on which the request was sent.

### Request ownership

Current extension -> Desktop requests receive `req_<time>_<counter>`, a timeout, and one pending entry. Unknown or duplicate responses are ignored after the first match. Disconnect normally resolves all pending entries with `ws_closed`.

Gaps:

- a pending entry stores only `{ resolve, timer }`; it has no expected response kind/action or socket generation (`desktop-download-protocol.js:38-101`);
- any incoming envelope carrying a matching `data.requestId` is consumed before Desktop command dispatch (`background.js:1933-1944`);
- no cancellation capability currently exists, which is acceptable for queue-ack-only;
- fire-and-forget theme/language bootstrap bypasses request correlation by design and should remain explicit, not accidental;
- retry is currently limited to `not_connected` and synchronous `send_failed` (`background.js:587-594`). It must not expand to timeout/closed/unknown acceptance without P3 idempotency design.

Desktop -> extension asynchronous work correctly keeps the Desktop request ID separate. Result commands receive a new extension transport request ID and send the original as `correlationRequestId` (`background.js:1035-1162`). These concepts must remain separate.

### Protocol ownership

Popup/options do not construct P3 envelopes, which already satisfies a P5 target. However raw action strings and payload mapping are distributed across `background.js`, while the so-called protocol client only owns a pending registry. The smallest useful boundary is one Desktop protocol client that owns socket generation, connection/reconnect, request registry, JSON/envelope validation, encoding, decoding, and Desktop command dispatch, with feature-facing named operations outside the UI.

## Content/background/UI ownership audit

### Content scripts

The correct current ownership is page observation, site parsing, DOM/media extraction, frame-local playback/context state, capture evidence, and injected controls. The pure capture helper is a good seam and should remain content-owned.

The main violation is response authority. Generic content code is injected into every frame and registers the standard selection/scan listener (`manifest.json:57-76`, `generic-video-detector.js:1501-1538`). Site detectors also register overlapping resolver messages. Background selection requests often omit `frameId` (`background.js:3442-3475`). Chrome messaging does not aggregate multiple frame/listener responses; the first responder wins. This makes the chosen resolver and page frame nondeterministic.

### Background / service worker

Background currently owns:

- MV3 lifecycle and Chrome API adapters;
- Desktop socket/codec/request lifecycle;
- feature orchestration and routing;
- session registry/cookie acquisition;
- capture and selection normalization;
- media caches, browser-download tracking, drag tokens;
- popup/options command dispatch and UI broadcasts.

The service worker should remain the composition root and authority for cross-tab/global state, but feature policy must move into small application modules and Chrome APIs into adapters/stores. This is an ownership split, not a requirement to make every helper a class or directory.

### Popup / options

Positive findings:

- neither UI opens WebSocket nor constructs raw WS envelopes;
- options is mostly render + intent over launcher configuration;
- popup uses semantic runtime messages for status, scan, picker, login state, and download.

Pressure:

- popup owns candidate grouping, selected-variant state, cooldown, and submission DTO mutation (`popup.js:765-795`, `1720-1750`);
- status polling can commit an older `get_status` after a newer push; launcher hydration and options optimistic commands have similar last-response-wins behavior;
- direct mutable candidate augmentation makes UI state and application submission policy share an object.

Selection may stay popup-local, but submission should receive an immutable user intent plus selection generation and let the feature boundary build the command.

## State inventory and lifecycle risk

| State | Current authority | Key/lifetime/reset | Persistence | Stale risk |
| --- | --- | --- | --- | --- |
| connection | background globals | socket instance; until close/replacement/worker stop | none | stuck CONNECTING; split pending generation |
| pending requests | protocol helper Map | requestId; timeout/normal close/response | none | forced replacement or worker stop orphan/lose result |
| site registry | cookie-sync module array | siteId; Desktop push/worker stop | none | empty/stale before fresh Desktop generation |
| session material | collected per Desktop request | siteId + allowed domains; request lifetime | Desktop persists, extension does not | correct bounded filtering; readiness unclear |
| capture | content-created evidence object | page/document interaction | none | background does not retain origin frame/document |
| selection | content frame state + popup map | DOM element/group; document/popup lifetime | none | multi-responder winner; candidate not bound to page generation |
| tab/frame/page | ad hoc tabId/frameId/URL | inconsistent | cache only | navigation reuses tab/frame and can attach old evidence to new page |
| drag token | worker Maps | token + TTL; protected one-shot, XHS replayable | none | unbounded count, worker loss, payload can override registered facts |
| media scan cache | storage object | tabId + URL hash + TTL | local | different-tab RMW lost update |
| network evidence | storage buckets | tabId + pageUrl + TTL | local | old request can be stamped with new tab URL; RMW lost update |
| browser download | tracker Map | downloadId + TTL | none | MV3 restart loses active/completion state |
| UI status/session | popup closure | popup lifetime | none | older poll/hydration response can overwrite newer push |
| UI selected variant | popup Map by group | popup/candidate set | none | old entries are inert but not generation-bound |
| launcher config | storage plus UI/content copies | storage key | local | multiple read-modify-write owners can lose fields |
| quality/language/pending sync | storage + background globals | extension lifetime / storage key | local | generally bounded; ownership must stay explicit |

Concrete contamination cases:

1. A popup/current-video request can be answered by an iframe or competing generic/site listener.
2. An old `webRequest` response can be normalized with the newly navigated tab URL because the tab is reread after the event.
3. A drag token created before navigation retains a reused tab/frame and can fall back using stale URLs; XHS tokens can be replayed.
4. Two simultaneous cache/config read-modify-write operations can discard each other's update.
5. A late status/hydration response can overwrite a newer connection/config state.
6. MV3 worker suspension discards active browser-download tracking and in-memory registries.

## Request correlation review

| Interaction | Correlation semantics | Current risk | P5 identity |
| --- | --- | --- | --- |
| popup/options -> background short command | Chrome callback channel is sufficient | out-of-order commands/polls can commit stale UI | UI command generation where last-write-wins matters; no UUID by default |
| background -> content single resolver | callback plus explicit target should be sufficient | no unique resolver/frame today | `PageContextKey` and one resolver owner; optional local request generation for timeout/stale commit |
| content -> background intent | sender metadata is authoritative | tab/frame/document is dropped in several handlers | immutable `BrowserMessageContext` from sender |
| extension -> Desktop request | extension requestId | no socket generation/expected reply kind | client-owned requestId + connection generation |
| Desktop -> extension resolver | Desktop requestId, returned as correlationRequestId | duplicate/replay policy differs by feature | inbound command ID + feature operation registry/token policy |
| capture | no current ID | page evidence can be detached from origin | extension-local immutable capture ID + PageContextKey; wire evidence unchanged |
| selection | group/candidate URLs | stale candidate may submit after navigation | page context + candidate snapshot generation + selected candidate/variant |
| download | Desktop trace after acknowledgement | must not be reused as request/session identity | Desktop-owned trace remains separate and queue-ack-only |

## Session / capture / selection boundary

### Session

- Identity: Desktop registry `siteId`, not tab ID.
- Relation to tab: active tab selects which registry entry a user wants to sync; the stored session remains site-scoped.
- Lifecycle: registry readiness belongs to the current Desktop connection generation; cookie material is acquired only for an explicit validated sync/resolution request.
- Navigation: changing tabs/pages changes the UI's current-site projection, not the session authority.
- Ownership: Desktop stores and applies generic download sessions. Extension only acquires allowed browser cookies and returns them through the approved session flow.

### Capture

- Created in content context from page/DOM evidence by `capture-evidence.js`.
- Treat each evidence object as immutable. Refresh/re-capture creates a new capture snapshot.
- Bind locally to tab/frame/document/page identity until dispatch.
- Preserve `extensionData.ameowCapture` and the P3 canonical `captureEvidence` mapping unchanged.
- Capture is evidence; it neither selects a candidate nor proves login/session state.

### Selection

- Candidate discovery produces a page-scoped snapshot.
- Selection chooses one candidate/variant from that snapshot and remains UI/application state.
- A new scan/navigation/document invalidates the selection generation.
- `selectedVideoVariant` remains an explicit selection output and must continue across P3 unchanged.
- Session, capture, and selection are not merged into one state blob.

## Paste and drag architecture review

The extension has no direct paste listener. Desktop asks the extension to resolve supported pasted video URLs. Background may reuse a matching tab or create a temporary one, asks content for page-local evidence, and returns a correlated result. This is a valid application entry, but tab reuse must bind/revalidate a page context and resolution must have one content owner.

Drag resolution is token-based. The token registry should be the immutable authority for tab/frame/document/page facts. Desktop may add target directory or compatible request metadata, but must not replace authority-bearing URL/context fields. One-shot operations consume tokens before work; duplicate command IDs return/replay a stable outcome or explicit already-consumed failure. This stays an extension application concern and does not require Renderer intake refactoring.

## Findings classification

### Blockers

1. **Nondeterministic resolver/frame ownership:** all-frame generic listeners and overlapping site listeners compete for one response, so the wrong frame/site adapter can produce a download selection.
2. **Split socket/pending ownership:** forced connection cannot replace a stuck CONNECTING socket, and forced socket reset can strand concurrent pending requests until timeout.
3. **Correlation lacks connection/response generation:** pending matching has no socket generation or expected response kind, so ownership cannot be proven independently of raw transport.
4. **Page evidence state races:** post-event tab lookup can stamp old network evidence with a new page; candidate/capture/drag identities do not consistently retain document generation.
5. **Competing asynchronous state writers:** storage read-modify-write and UI poll/hydration responses can lose or overwrite newer state.
6. **MV3 lifecycle mismatch:** browser-download state and some registries rely on worker memory even when correctness spans normal service-worker suspension.
7. **Drag authority/replay:** Desktop payloads can override token facts and XHS tokens are not single-consume, enabling stale/cross-context combinations.
8. **Application logic cannot be tested behind one port:** feature policy, Chrome APIs, raw action mapping, and UI RPC are interleaved in background/popup despite several good pure helpers.

These blockers meet P5 criteria because they contain real wrong-selection/cross-navigation races or prevent the requested independently testable boundary. File length alone is not a blocker.

### Follow-up debt

- richer extension telemetry/observability and log export;
- WS authentication/token handshake and protocol versioning;
- wire-level operation idempotency if future retry semantics include ambiguous post-send failures;
- generalized site plugin/engine extension model (P6);
- native messaging/custom-protocol Desktop launch and packaging;
- broader cross-browser abstraction, Firefox support, and full iframe media UX;
- broader settings redesign or progress/cancel capability symmetry;
- outbox/retry for Desktop-initiated resolution results beyond current compatibility.

### Optional cleanup

- renaming helpers/directories;
- merging small normalization helpers;
- removing inert popup selection map entries;
- replacing all message string constants with a registry;
- shortening `background.js` beyond required ownership moves;
- cosmetic popup/options cleanup or unrelated locale work.

## Test baseline and gaps

The focused unchanged-extension baseline passed 28 test files / 163 tests during the audit. Existing strengths include pure VM tests for capture, protocol request correlation, selection/parsers, cache pruning, site sessions, and manifest wiring.

Gaps that matter to P5:

- socket connect/reconnect/replacement/stale callback generation;
- concurrent pending reset and malformed/duplicate response behavior;
- one-resolver/main-frame routing and sender identity preservation;
- navigation invalidation and old-request-after-new-request behavior;
- serialized storage writes and old `webRequest` document evidence;
- MV3 worker restart reconstruction/failure behavior;
- popup/options/hydration ordering and immutable intent submission;
- an end-to-end fake Chrome + fake WebSocket adapter path.

No large fake framework is needed. Small injected clock/socket/Chrome adapter harnesses and current VM/Vitest patterns are sufficient.
