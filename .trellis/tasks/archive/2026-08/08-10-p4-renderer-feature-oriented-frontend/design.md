# Technical design

## Design intent

Create the smallest feature-owned Download lifecycle that can sit between App composition and the P3 Renderer protocol boundary. Preserve the current UI and transport behavior, remove lifecycle policy from event handlers, and make ordering behavior deterministic in pure Node tests.

Do not generalize this into a frontend framework or migrate unrelated features.

## Current architecture

```text
App component
  ├─ parses paste/drop and runtime conditions
  ├─ invokes generic command strings
  ├─ subscribes to generic event strings
  ├─ stores queue count/detail/progress/cancel snapshots
  ├─ reduces protocol events and classifies terminal state
  └─ controls shell window, overlay, notices, and queue JSX
        |
        v
desktopCommands / desktopEvents generic facade
        |
        v
P3 preload + IPC adapter -> Download Application API
```

This makes App both feature controller and presentation shell. Multiple event handlers can write overlapping task state, and asynchronous shell work can reorder lifecycle reduction.

## Target architecture

```text
App shell / existing route
  ├─ paste/drop composition and non-Download intake compatibility
  ├─ window/overlay/notification policy
  └─ consumes Download feature state + transition facts
             |
             v
Download feature
  ├─ feature-owned model
  ├─ one pure lifecycle reducer
  ├─ selectors and minimal presentation components
  └─ lifecycle-safe hook
             |
             v
narrow DownloadQueueClient
  ├─ typed queue/cancel/select methods
  ├─ protocol DTO decoding
  └─ one subscription surface
             |
             v
existing P3 Renderer desktop protocol facade
             |
             v
preload / IPC adapter / Download Application API
```

## Feature model

The feature model represents what the Renderer needs to present and interact with, not the complete wire schema.

Suggested concepts:

- `DownloadTask`: trace ID, source/title display metadata, lifecycle phase, queue position, public quality options, and view-relevant timestamps.
- `DownloadProgress`: normalized progress stage, completed/total values, speed/ETA/display label as needed by the current UI.
- `DownloadTerminalOutcome`: success, typed failure, or cancelled using P3 stable code/classification.
- `DownloadQueueState`: task map/order, progress map, max concurrency, cancelling traces, quality-selecting traces, and terminal guards.

Protocol DTOs are decoded in the client adapter. `model.ts`, `reducer.ts`, and `selectors.ts` must not import `src/protocol`.

## Reducer ownership and transitions

One reducer owns all lifecycle mutation. Representative actions:

```text
queueAccepted(trace)
queueSnapshotReceived(tasks, maxConcurrent)
progressReceived(trace, progress)
cancelRequested(trace)
cancelRequestRejected(trace)
qualitySelectionRequested(trace, optionId)
qualitySelectionRejected(trace, optionId)
terminalReceived(trace, typedOutcome)
```

Required rules:

1. `terminalReceived` is authoritative and idempotent.
2. A terminal trace is placed in a tombstone/generation guard before it is removed from active state.
3. `progressReceived` and stale queue snapshots cannot revive a terminal trace.
4. A genuinely new accepted Job generation for a reused trace may clear the guard only through an explicit accepted transition; ordinary snapshots cannot do so.
5. Typed terminal success/failure/cancel wins over local `cancelRequested` state.
6. Optimistic cancel state is cleared when the command rejects/returns false and may only assist legacy terminal payloads without typed failure.
7. Quality selection is keyed by trace and option; repeated clicks while in flight are ignored. A new authoritative task phase clears or advances it.
8. Multiple traces are independent; no global `isDownloading` transition mutates unrelated tasks.

If the protocol guarantees trace IDs are never reused within a Renderer session, a bounded terminal set is sufficient. Otherwise use a per-trace generation supplied by explicit queue acceptance. Do not add timestamps or heuristics when an explicit transition can express the rule.

## Snapshot reconciliation

Queue detail is a server/runtime snapshot input, but it is not allowed to overwrite terminal knowledge blindly.

- Decode each task into the feature model.
- Upsert non-terminal tasks that are not blocked by a terminal guard.
- Remove active tasks absent from a current authoritative detail snapshot only when doing so does not synthesize a terminal outcome.
- Use queue count/max-concurrent metadata for consistency and capacity display, not as a competing owner of visible total.
- Derive visible task count from the reconciled task model.

The reducer may record a small development diagnostic when count and detail disagree, but must not introduce a logging framework.

## Narrow client

`client.ts` should expose only the Download use cases needed by this slice, for example:

```text
queue(request) -> accepted trace
queuePasted(request) -> accepted trace
cancel(traceId) -> boolean/typed result
selectQuality(traceId, optionId) -> typed result
subscribe(listener) -> Promise<dispose> or dispose
```

The concrete adapter owns current command/event names and P3 DTO imports. The feature hook receives the interface so reducer/client behavior can be tested without Electron.

Do not introduce Repository, Manager, Controller, command bus, event bus, or a universal protocol client.

## Subscription lifecycle

The feature hook registers Download progress, terminal, queue count, and queue detail once per client identity. It reduces protocol events synchronously before requesting shell presentation effects.

Deferred registration must use an eventual-dispose pattern:

```text
setup starts
  -> component disposes before setup resolves
  -> setup resolves with disposer
  -> disposer is called immediately
  -> later callbacks are ignored by disposed flag
```

One hook cleanup owns all Download listeners. App must not retain duplicate raw subscriptions.

Shell preparation, window expansion, overlay animation, notifications, and diagnostics run after reducer transition facts are available. They must never be awaited before state reduction.

## App-shell composition

App retains:

- main-window geometry/mode lock;
- queue popover placement and shell-level overlay coordination;
- notification/dialog behavior;
- non-video image/file paste/drop flows;
- Runtime Dependency, Update, Transcode, and other feature compatibility code.

App consumes Download selectors and transition facts such as `becameActive`, `becameTerminal`, and `activeCountChanged`. These are presentation facts, not a second lifecycle state store.

Existing visual components may remain in place and receive props during the first step. Move a component under `features/download/components` only when doing so is necessary to eliminate direct state/protocol ownership. Avoid a cosmetic directory sweep.

## Application versus UI policy

Application remains authoritative for:

- Job lifecycle and terminal outcome;
- fallback and auth recovery;
- engine availability/selection;
- retry policy and failure classification.

Renderer owns:

- local selection/in-flight interaction;
- view order and display formatting;
- popover/dialog/overlay/notification behavior;
- localization of stable typed failure codes/classifications.

Remove the App-side Pinterest/gallery-dl rejection that constructs `E_ENGINE_UNAVAILABLE`. Let queue/terminal typed results drive the UI. Do not move this policy into the feature client.

## Error and cancellation compatibility

For P3 payloads, map stable typed classification/code directly to feature outcomes. Do not regex or `includes()` raw failure text.

Keep raw `cancelled`/`canceled` parsing only in the concrete protocol compatibility decoder for an old completion payload that has no typed `failure`. It must not be visible to the reducer or feature model. Other diagnostics regex cleanup is deferred unless the Download terminal presentation can stop calling it without expanding scope.

## Cross-feature boundaries

- Download must not import Transcode internals even though both appear in one popover.
- App composes Download rows and legacy Transcode rows into the existing popover.
- Download must not import Site Session/Settings to handle auth; Application owns credential recovery.
- Runtime Dependency may remain an adjacent shell indicator, but it must not decide Download engine failure in the new queue path.
- Shared UI primitives remain shared. Feature-specific view formatting moves with Download ownership only when in scope.

## Architecture Guard

Extend `src/architecture/import-guard.test.ts` with small static rules:

1. Files under `src/features/**` cannot import `electron`, repository `electron/`, `src/electron-runtime`, Domain/Engine infrastructure, or raw preload implementation.
2. Download `model`, `reducer`, and `selectors` cannot import `src/protocol` or desktop runtime modules.
3. A feature cannot import another feature's internal file paths. App-level composition may import an explicitly designated public module.
4. Existing P0-P3 guard directions remain unchanged.

Use the current Vitest scanner and representative fixtures/assertions. Do not add a dependency analyzer or create dozens of barrel files.

## Testing design

Use pure reducer/selectors plus an injected fake client and subscription harness under current Node-only Vitest.

Reducer tests:

- accepted task and queue snapshot reconciliation;
- progress normalization;
- success, typed failure, and cancelled terminal state;
- concurrent task isolation;
- terminal then delayed progress;
- terminal then stale detail;
- duplicate terminal event;
- cancel request, typed success, then rejected cancel response;
- per-trace Advanced Quality selection and repeated-click suppression.

Hook/controller tests without DOM:

- initial subscription and one event-reduction path;
- cleanup after normal registration;
- cleanup before registration promise resolves;
- callbacks after dispose are ignored;
- rerender/client replacement does not duplicate listeners.

Selector tests:

- active total, primary task, queue rows, badge visibility, and quality prompt are derived consistently from one state.

Keep existing P2/P3 tests as backend/transport evidence; do not duplicate their business cases in frontend tests.

## Migration sequence

1. Add pure model/reducer/selectors and focused tests alongside legacy helpers.
2. Add the narrow client adapter and subscription harness around existing P3 facade.
3. Add the lifecycle hook and switch Download events/commands from App to it.
4. Recompose existing queue/center/quality UI from selectors, preserving visual behavior.
5. Remove obsolete Download-specific state writers and bounded helpers from App; leave Transcode compatibility helpers untouched.
6. Add guards and run focused/full gates.

Each step must remain reviewable and preserve public protocol/UI behavior. Avoid moving unrelated files.

## Rollback and stop conditions

The slice can roll back to App-owned state because public protocol and backend contracts are unchanged.

Return to planning if implementation appears to require:

- a P0-P3 Application/Domain/Engine/protocol contract change;
- a route, state-library, CSS, or design-system migration;
- Transcode/Site Session/Runtime/Update redesign;
- generalized frontend framework layers or a dependency-analysis package;
- breaking IPC/event changes;
- broad paste/drag behavior changes.
