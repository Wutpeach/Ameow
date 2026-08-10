# P5 staged implementation plan

## Entry gate

Do not run `task.py start` until Lead Architecture Review approves `prd.md`, `design.md`, this plan, and the Blocker/debt classification. Product code remains unchanged during planning.

Implementation must preserve unrelated local changes and begin from a reviewed git status. Each slice should be independently reviewable and leave existing public behavior/protocol compatible.

## Slice 1 — Own the Desktop WS client lifecycle

### Objective

Move socket generation, reconnect/replacement, envelope handling, request correlation, and pending reset behind one independently testable Desktop protocol client. Keep `background.js` as composition/bootstrap only for this concern.

### Likely files/modules

- evolve `browser-extension/desktop-download-protocol.js` or add one narrowly named Desktop client/transport helper;
- reduce the connection/request sections in `browser-extension/background.js` to construction, Chrome-alarm adapter wiring, Desktop command registration, and UI status forwarding;
- extend `browser-extension/desktop-download-protocol.test.js` and add a focused connection-lifecycle test if separation keeps the tests clearer;
- update `browser-extension/manifest.test.js` or background `importScripts` ordering assertions.

Final filenames may follow existing plain-JavaScript conventions. Do not create a directory hierarchy merely for appearance.

### Ownership change

- Desktop client becomes sole owner of raw WebSocket, current connection generation, status, reconnect/replacement, JSON/envelope handling, request IDs, pending requests, timeout, and stale/duplicate response handling.
- Background owns the Chrome alarm/timer adapter and application command handler it injects, not connection policy internals.
- Feature call sites use named Desktop operations; raw action strings stop at the Desktop adapter.

### Invariants

- `ws://127.0.0.1:39527`, public actions, aliases, acknowledgement envelope, queue-ack-only behavior, and P3 canonical mapping do not change.
- stale socket callbacks cannot mutate the current generation;
- force replacement can retire a stuck CONNECTING socket;
- retiring a generation resolves every associated pending request exactly once;
- no retry after timeout/close/ambiguous acceptance; preserve only proven-safe pre-send behavior;
- Desktop command request ID and extension acknowledgement request ID remain distinct.

### Focused tests

- connect/open/status and normal close;
- stuck CONNECTING force replacement;
- reconnect timer plus alarm without duplicate sockets;
- stale callbacks from a retired socket;
- concurrent pending requests rejected on forced replacement;
- matching, duplicate, unknown, stale-generation, wrong-kind, and timeout responses;
- malformed JSON/envelope versus valid Desktop command dispatch;
- existing requestId/request_id aliases and current actions remain accepted.

### Explicit non-goals

- no generalized RPC/client hierarchy, protocol registry, auth handshake, version negotiation, progress/cancel support, or P3/Desktop rewrite;
- no background feature extraction beyond what is required to give the client one owner.

### Risk and rollback

Connection startup and reconnect behavior are high risk. Keep the current background wrapper until all callers use the client, then remove only the old duplicated state. Roll back by restoring the wrapper; no persisted data or wire migration is involved.

## Slice 2 — Establish deterministic page/frame and content resolver identity

### Objective

Eliminate first-responder-wins selection/capture behavior and bind every page-scoped operation to a normalized tab/frame/document context and generation.

### Likely files/modules

- `browser-extension/background.js` runtime message and tab-message adapter sections;
- `browser-extension/generic-video-detector.js`;
- overlapping listener sections in `twitter-detector.js`, `youtube-detector.js`, `pinterest-detector.js`, and any other detector confirmed by implementation search;
- `browser-extension/floating-launcher.js`, `capture-evidence.js`, `site-video-parser-registry.js` as required to route through one resolver;
- a small page-context/message-router helper plus focused tests;
- `browser-extension/manifest.json` only if script order must add the router, preserving current injection behavior.

### Ownership change

- one content message router owns each selection/capture/scan response;
- site/generic extractors provide results to that router instead of competing `sendResponse` listeners;
- browser adapter creates `BrowserMessageContext` / `PageContextKey` and owns navigation/tab invalidation;
- popup/current-page operations explicitly target frame 0; frame-originated actions retain sender frame/document identity.

### Invariants

- current site-specific extraction behavior and parser priority remain compatible;
- content scripts remain responsible for DOM/page observation and immutable capture evidence;
- full iframe discovery UX is not added; deterministic main-frame behavior is the popup/current-page contract;
- `extensionData.ameowCapture` content and `selectedVideoVariant` remain unchanged at the P3 boundary;
- stale context returns a specific local failure instead of silently switching frame/tab.

### Focused tests

- main-frame current capture and current-video resolution;
- one content resolver response when generic and site extractors both apply;
- frame-originated intent preserves tabId/frameId/documentId/pageUrl;
- navigation/document replacement rejects an old response;
- tab removal cleans page-scoped operations;
- pasted-tab reuse revalidates context before returning;
- capture stays immutable across recapture and selection changes.

### Explicit non-goals

- no P6 site plugin model, detector rewrite, new supported sites, broad page-world bridge redesign, or iframe media browser;
- no UI redesign or message-name cleanup campaign.

### Risk and rollback

Site detectors contain compatibility-specific behavior. Migrate one shared resolver message at a time and keep extractors unchanged behind the router. Roll back routing per message without changing Desktop protocol.

## Slice 3 — Give application operations and state stores one owner

### Objective

Extract the minimum feature/application operations and lifecycle-safe stores for download submission, media discovery, site session, paste/drag resolution, browser downloads, and serialized extension persistence.

### Likely files/modules

- `browser-extension/background.js` feature-heavy functions;
- existing pure helpers: `download-capability-utils.js`, `media-scan-cache.js`, `media-network-cache.js`, `site-session-cookie-sync.js`, `browser-download-lifecycle.js`, `video-selection-routing.js`, `xiaohongshu-drag-resolution-utils.js`;
- small application modules for download submission, discovery, session, and resolution where policy needs independent tests;
- one narrow serialized storage/config update helper;
- focused tests beside each existing/new helper.

### Ownership change

- feature operations call injected Desktop/browser/store ports and return stable local results;
- media/network caches have serialized single-writer updates and page-context keys;
- session feature owns registry readiness per connection generation; Desktop remains stored-session authority;
- drag feature owns immutable bounded one-shot tokens and navigation invalidation;
- browser-download feature reconstructs active state from browser APIs or returns an explicit restart/unavailable result;
- launcher/config writes become background/store authoritative rather than competing cross-context read-modify-write.

### Invariants

- Application/Desktop still own provider matching, engine/fallback/auth/queue/retry/failure policy;
- extension browser fallback behavior remains compatible except audited stale/wrong-context corrections;
- generic video submission never carries session cookies;
- allowed-domain site-session filtering remains intact;
- caches retain hard TTL/size bounds and backward-readable/discardable storage shapes;
- no sensitive session material or whole DOM/candidate objects are persisted.

### Focused tests

- concurrent scan/network/config updates preserve unrelated writes;
- old `webRequest.documentUrl` evidence cannot be relabeled after tab navigation;
- old scan result after a newer generation cannot commit;
- session registry unready/ready transitions across connection generations;
- tab/session isolation and no generic cookie attachment;
- drag token total limit, TTL, immutable authority fields, navigation invalidation, single consumption, duplicate command;
- worker restart behavior for transient registries;
- browser download acceptance, rehydration, complete/interrupted events, and unknown/restarted state;
- download submission preserves browser fallback and Desktop application rejection categories.

### Explicit non-goals

- no telemetry/outbox platform, sensitive state persistence, browser abstraction framework, settings redesign, provider routing, or Desktop intake rewrite;
- no attempt to extract every helper from background.

### Risk and rollback

Storage changes can create stale user data. Prefer compatible read + safe rebuild, and isolate each store migration. Roll back one feature to the old wrapper if its behavioral tests fail; avoid a cross-feature big-bang switch.

## Slice 4 — Make background/UI adapters emit intent and reject stale commits

### Objective

Recompose the service worker, popup, options, and launcher around the approved feature operations so UI renders state/emits intent and background performs routing/composition rather than inline policy.

### Likely files/modules

- `browser-extension/background.js` `runtime.onMessage` router and initialization;
- `browser-extension/popup.js`;
- `browser-extension/options.js`;
- `browser-extension/floating-launcher.js`;
- launcher/config helper and tests;
- small runtime-message adapter/contract helper only if it removes real duplicated routing.

### Ownership change

- runtime router maps known semantic messages to one feature operation and returns `false` for unknown/unowned messages;
- popup selection remains UI-local but is bound to page/scan generation and submits immutable intent;
- feature operation, not popup, mutates/builds the Desktop submission DTO;
- status polling, launcher hydration, and options writes use generation/single-flight rules so old responses cannot commit;
- background broadcasts snapshots/results without becoming a second UI state store.

### Invariants

- current popup/options/launcher visual behavior, locale copy, message names, and user workflow remain compatible unless a stale-state correctness fix visibly changes an error state;
- UI does not import/reference Desktop client, loopback URL, P3 action constants, or raw envelopes;
- background remains one MV3 service worker and does not become an event bus;
- no frontend framework/state library is introduced.

### Focused tests

- user intent -> semantic runtime message -> feature command;
- immutable selected variant submission with page/scan generation;
- earlier status poll after newer push is ignored;
- earlier launcher hydration after newer theme/config event is ignored;
- rapid options changes cannot roll back newer intent;
- unknown runtime messages do not leave an asynchronous response port open;
- existing popup/options source/behavior compatibility tests remain green.

### Explicit non-goals

- no popup/options redesign, CSS cleanup, React conversion, state framework, centralized message registry, or broad locale rewrite.

### Risk and rollback

UI scripts have limited DOM harness coverage. Move one message/operation path at a time, retain existing DOM structure, and use current source assertions only as compatibility supplements to behavioral tests.

## Slice 5 — Add architecture guards and full regression evidence

### Objective

Lock the real dependency direction and prove P3/P0-P4 compatibility after all ownership moves.

### Likely files/modules

- new focused `browser-extension/*architecture*.test.js` or equivalent;
- `browser-extension/manifest.test.js`;
- current extension protocol/capture/selection/session/media/browser-download tests;
- `src/architecture/import-guard.test.ts` only if a small shared scanner extraction is useful; do not force plain-JS extension rules into TypeScript directory assumptions;
- `package.json` only if a small `test:browser-extension` script materially improves repeatable validation.

### Ownership change

None. This slice enforces the approved boundaries and closes missing integration/compatibility evidence.

### Required guards

- raw WebSocket/loopback/pending/envelope mechanics only in Desktop client/codec;
- UI/content/site adapters cannot depend on Desktop transport implementation/raw actions;
- Desktop client cannot depend on UI, DOM, tabs/cookies, or site-specific capture;
- pure feature/application modules cannot depend on popup/options DOM and use injected browser adapters;
- content/site adapters cannot own socket lifecycle;
- manifest/background wiring has one resolver owner and required script order;
- representative violations prove the guard detects failures.

### Focused/integration tests

- small fake Chrome + fake WebSocket round trip for UI/background/content/Desktop command paths;
- all tests from Slices 1-4;
- P3 captureEvidence, selectedVideoVariant, queue-ack-only, WS envelope/alias compatibility;
- site-session and protected-media compatibility;
- existing P0-P4 architecture guards.

### Explicit non-goals

- no dependency analyzer, import graph package, compile-time migration, file-size guard, protocol registry, or speculative barrel/directory system.

### Risk and rollback

Guards can overfit names. Test rules against ownership capabilities and representative violations; avoid banning innocent helpers. Roll back a brittle rule, not the established boundary or behavioral tests.

## Validation plan

### Focused during each slice

Run the changed Browser Extension test files through Vitest, for example:

```text
npm test -- browser-extension/desktop-download-protocol.test.js
npm test -- browser-extension/<changed-focused-test>.test.js
```

Run manifest/package-focused checks whenever composition changes:

```text
npm test -- browser-extension/manifest.test.js
npm run package:browser-extension
```

If a dedicated `test:browser-extension` script is added in Slice 5, it must be a thin repeatable Vitest selection, not a separate framework.

### Final required gate

```text
npm test
npm run type-check
npm run lint
npm run build
npm run package:browser-extension
git diff --check
```

Also verify:

- all focused P5 tests and Browser Extension manifest/package validation;
- P0-P4 architecture regression tests;
- no product docs change is needed, or relevant `site/src/content/docs/` pages and `npm run docs:build` are included if behavior became user-visible;
- the packaged extension contains the new helpers in manifest/import order and excludes test files;
- a minimal unpacked-extension smoke covers popup connection/scan and picker dispatch if the existing environment supports it without new infrastructure.

## Review checkpoints and stop conditions

After every slice, review:

- ownership removed from old modules, not duplicated;
- identity/reset behavior and failure category;
- public message/WS compatibility;
- focused tests and rollback point;
- no Optional Cleanup or Follow-up Debt slipped into scope.

Stop and return to Lead Architecture Review if implementation needs a P3 wire change, wire idempotency field, Desktop capability change, generalized site/plugin/RPC/event architecture, sensitive extension persistence, or unrelated Desktop/Renderer/Domain refactor.
