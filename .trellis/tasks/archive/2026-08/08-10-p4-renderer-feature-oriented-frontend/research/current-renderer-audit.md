# Current Renderer architecture audit

## Scope and method

This audit follows behavior and dependency ownership rather than directory names. It covers Renderer bootstrap and routes, Download/Queue/Advanced Quality/Paste flows, Site Session, Transcode, Runtime Dependency, Settings, Update, Diagnostics, the P3 desktop protocol client and preload bridge, event subscriptions, state helpers, shared UI, and focused tests.

No product code was changed during the audit.

## A. Renderer feature inventory

### App shell and routes

- `src/main.tsx` owns bootstrap, router selection, theme, and runtime i18n composition.
- Production routes are `/`, `/settings`, and `/context-menu`; `/ui-lab` is development-only.
- `src/App.tsx` is the main-window shell and a legacy mixed owner for nearly every foreground feature.
- `src/pages/SettingsPage.tsx` is a second legacy mixed owner for settings-adjacent features.

### Download

```text
Download
├─ UI: App drag/drop, paste intake, center progress/outcome, queue rows
├─ state: App downloadProgressByTrace, queue snapshots, cancelling IDs
├─ commands: queue_video_download, queue_pasted_video_download, cancel_download
├─ events: video-download-progress, video-download-complete
├─ helpers: downloadEventReducers, downloadViewHelpers
└─ dependencies: Queue, Advanced Quality, Runtime Dependency, Transcode,
   Diagnostics, output path, and app-shell foreground/window policy
```

The authoritative Job lifecycle remains in Main/Application/runtime. Renderer state is a set of local protocol mirrors rather than one feature model.

### Download Queue

```text
Download Queue
├─ UI: task badge, center task, full-screen queue popover
├─ state: videoQueueState, videoQueueDetail, progress map, cancelling IDs
├─ commands: cancel_download
├─ events: video-queue-count, video-queue-detail
├─ helpers: queue normalization, progress/cancel pruning, badge selectors
└─ dependencies: Download, Advanced Quality, Transcode, Runtime Dependency
```

The current visible task total is assembled with the maximum of queue count, detail length, and progress-map size. These are competing mirrors of the same lifecycle and can drift.

### Advanced Quality

```text
Advanced Quality
├─ UI: dedicated queue popover and inline queue-row options
├─ state: quality options embedded in queue-detail wire tasks; hover state in App
├─ command: select_advanced_quality_option
├─ events: no separate event; video-queue-detail phase selecting_quality
├─ helpers: protocol mapper plus inline App view logic
└─ dependencies: Download Queue and Transcode presentation terminology
```

It has no independent route. P4 needs only a per-trace transition and in-flight guard that belongs to Download lifecycle.

### Paste Download and drag intake

```text
Paste/Drag
├─ UI: window-level paste listener and main-shell drop target
├─ state: no owner; reuses App output/outcome/download state
├─ commands: queue_pasted_video_download plus image/file commands
├─ events: enters Download/Queue for video; other paths use shared outcome UI
├─ helpers: URL/site/image/file parsing in App and utils
└─ dependencies: Download, image/file intake, output path, site resolution
```

The first P4 slice should route video queueing through the Download public client but should not migrate the complete multi-site image/file intake tree.

### Site Session / Login

```text
Site Session
├─ UI: Settings Sites page
├─ state: SettingsPage registry/state/error/busy mirrors
├─ commands: registry/state query, extension sync, clear session
├─ event: site-session-state-changed
├─ helpers: site icons, registry/state DTOs
└─ dependencies: Settings composition; Download auth dependency is backend-owned
```

The listener ignores the complete event payload and refetches registry plus all site states. A listener registration that resolves after cleanup can leak, and overlapping reloads can stale-write. This is follow-up debt, not part of the Download slice.

### Transcode

```text
Transcode
├─ UI: center progress and the shared task popover
├─ state: queue count/detail, progress map, pending action IDs in App
├─ commands: cancel_transcode, retry_transcode, remove_transcode
├─ events: queue count/detail, progress, queued/retried/removed/failed/complete
├─ helpers: downloadEventReducers and downloadViewHelpers
└─ dependencies: Download shell presentation, Diagnostics, app window lock
```

Transcode has its own backend lifecycle but shares Renderer presentation and suffers a similar stale-progress race. It remains compatible legacy ownership for this slice.

### Runtime Dependency

```text
Runtime Dependency
├─ UI: main-window status indicator/popover
├─ state: status, gate snapshot, feedback and hover state in App
├─ commands: status/gate query, refresh, bootstrap
├─ event: runtime-dependency-gate-state
├─ helpers: runtimeDependencyGate
└─ dependencies: Download eligibility, queue changes, window mode lock
```

Renderer currently participates in Pinterest/gallery-dl availability policy before queueing. The Download feature must stop synthesizing an engine-unavailable failure and consume the Application typed outcome instead.

### Settings

```text
Settings
├─ UI/state: one large SettingsPage owns navigation and all sections
├─ commands: config, output, site session, update, proxy, support log
├─ events: update, proxy, output path, navigation request, site session
├─ shared UI: Neon primitives
└─ dependencies: Site Session, Update, Diagnostics, Theme/i18n, output path
```

Settings decomposition is not needed to merge the first P4 slice.

### Update

```text
Update
├─ UI: main-window indicator and Settings System controls
├─ state: duplicate scheduler snapshots in App and SettingsPage
├─ client: desktopUpdater facade
├─ event: app-update-state
└─ dependencies: settings preferences and main-window mode lock
```

The duplicate mirrors are follow-up debt.

### Diagnostics and utility surfaces

- Download/Transcode terminal failures feed the foreground outcome and copy-diagnostics command.
- `errorDiagnosticCategories.ts` regex-classifies raw text into categories. Download's new typed terminal path must not use this as business classification; a view-only text fallback can remain for legacy payloads.
- Settings exports support logs.
- Context Menu owns output-folder utility behavior.
- UI Lab is a development-only simulation surface.

## B. Current Download lifecycle

```text
URL from paste/drop
  -> App parses source/site and reads output/config/runtime gate
  -> App may reject Pinterest from gallery-dl state                 [UI repeats engine policy]
  -> App invokes queue_video_download or queue_pasted_video_download [generic command string]
  -> Main/P3 adapter -> Download Application API -> runtime queue
  -> video-queue-count + video-queue-detail                         [separate snapshots]
  -> App stores queue state/detail and may open quality popover
  -> video-download-progress
       -> App awaits foreground-window preparation                  [ordering hazard]
       -> progress reducer updates protocol DTO map
       -> shell overlay/progress presentation
  -> selecting_quality task in queue detail
       -> App invokes select_advanced_quality_option
  -> optional cancel
       -> App optimistically records cancelling trace
       -> App invokes cancel_download
  -> runtime removes queue row, then emits video-download-complete
  -> App removes progress and combines payload with optimistic cancel state
  -> success: foreground success/notification
     typed failure: diagnostics/outcome
     cancelled: cancellation outcome
```

Current owners by step:

| Step | Current owner | Finding |
| --- | --- | --- |
| Intake and site decision | `App` component and unrelated helpers | Paste/video/image/file use cases are interleaved. |
| Queue invocation | `App` through generic desktop command facade | Component knows protocol vocabulary and mixes runtime/UI policy. |
| Queue acceptance | Main/runtime plus queue snapshots | Renderer has no accepted-event/model transition owner. |
| Queue membership | `videoQueueState` and `videoQueueDetail` | Duplicate derived state. |
| Progress | `downloadProgressByTrace` protocol DTO map | Delayed callback can revive terminal trace. |
| Advanced Quality | queue-detail DTO plus App popover state | No per-trace selecting/in-flight model. |
| Cancel intent | `cancellingTraceIds` plus ref | Optimistic intent can override authoritative success. |
| Terminal | completion handler plus reducer and diagnostics helpers | Reducer, protocol compatibility, shell effects, and text classification are mixed. |

## C. State ownership audit

| State | Correct classification | Current owner/problem | P4 direction |
| --- | --- | --- | --- |
| Theme, locale, router, desktop window mode | app-global/shell | Theme context, runtime bridge, App | Keep outside Download. |
| Authoritative Job/queue lifecycle | server/runtime state | Application/runtime | Do not duplicate policy in Renderer. |
| Download task membership/progress/terminal guard | feature-local protocol-derived state | Separate App snapshots/maps | One Download reducer/model. |
| Queue count/detail | server snapshot input | Stored independently | Decode and reduce; derive visible totals. |
| Cancelling/quality-selecting requests | feature-local interaction state | Sets/hover in App | Per-trace feature state. |
| Selected/hovered quality option, popover visibility | temporary UI state | App | Keep local or feature presentation state; do not make app-global. |
| Foreground overlay and window expansion | app-shell presentation policy | App | Consume feature transition facts. |
| Site session registry/state | Site Session feature mirror | SettingsPage | Follow-up feature owner. |
| Transcode queue/progress | Transcode feature mirror | App | Follow-up; compatibility boundary now. |
| Runtime dependency gate/status | operational feature mirror | App | Follow-up; Application decides download engine policy. |
| Update scheduler snapshot | Update feature mirror | App and SettingsPage | Follow-up duplicate owner. |

Reading state from two components does not make it app-global. Download lifecycle stays feature-owned and is composed into shell views.

## D. Protocol consumption audit

The raw channel names `ameow:command:invoke` and `ameow:event:*` are correctly confined to Main/preload. Renderer uses `src/desktop/runtime.ts`, so it does not import Electron implementation directly.

Residual leakage above P3:

- `desktopCommands.invoke<TResult>(command, payload)` and `desktopEvents.on<TPayload>(event, listener)` do not correlate names with request/result/payload types.
- `App` knows raw Download command/event string vocabulary and supplies its own generic type assertions.
- `App` imports Download IPC DTOs and keeps them as long-lived UI state.
- `downloadViewHelpers` performs both wire normalization and UI formatting.
- Download enqueue logic constructs an `E_ENGINE_UNAVAILABLE` outcome from Renderer-side Pinterest/gallery-dl policy.
- Terminal helpers retain raw `cancelled`/`canceled` parsing, and diagnostics regexes reclassify raw failures.

The P4 boundary should be:

```text
Download feature hook/reducer
  -> narrow DownloadQueueClient
  -> P3 renderer protocol facade/DTO decoder
  -> preload generic transport
```

## E. Event lifecycle audit

| Event family | Registration owner | Current reduction/effect | Cleanup/risk |
| --- | --- | --- | --- |
| video-download-progress/complete | one App effect | progress/terminal state plus shell effects | Cleanup exists, but async progress work reorders state. |
| video-queue-count/detail | separate App effect | separate snapshots, pruning, popover policy | Multiple writers and stale snapshot revival risk. |
| video-transcode-* | one App effect with many listeners | queue/progress/action/outcome mirrors | Cleanup exists; delayed progress has same race; follow-up. |
| runtime-dependency-gate-state | App effect | gate mirror plus status refresh | Promise cleanup is eventually safe; redundant hydration work. |
| site-session-state-changed | SettingsPage effect | ignores payload and starts full async reload | Deferred disposer can leak; older reload can overwrite newer state. |

Important ordering facts:

- Preload invokes listeners without awaiting returned promises.
- Download progress awaits foreground-window work before reducer mutation.
- Completion reduces synchronously.
- Runtime emits queue removal before terminal completion.
- There is no revision, epoch, or terminal tombstone in the Renderer reducer.

Therefore event reduction must happen synchronously before presentation side effects, and terminal trace guards must reject late progress and stale detail.

## F. Shared versus feature ownership

| Classification | Modules/areas |
| --- | --- |
| App shell | `main.tsx`, routing/bootstrap, theme/i18n composition, main-window geometry/animation/hotspots |
| Feature-specific | Download reducers/view helpers, runtime dependency helper, update preferences, site-session modules, diagnostics categories, Context Menu, UI Lab |
| Shared UI | Neon UI primitives, icons, circular progress, foreground overlay primitives |
| Shared hooks | Theme context and i18n runtime bridge only; no business feature hooks today |
| Protocol/client | `desktop/runtime.ts`, `types/electronBridge.ts`, `protocol/download/*` |
| Legacy mixed ownership | `App.tsx`, `SettingsPage.tsx`, Download/Transcode portions of shared helpers |

Only modules reused with the same semantics should remain shared. Similar-looking Download and Transcode code should not be prematurely generalized during the first slice.

## G. Boundary violations and classification

### Blockers

1. Download/Queue lifecycle has no single owner; count/detail/progress/cancelling are overlapping writers.
2. Delayed progress can recreate a terminal task; stale detail and duplicate terminal behavior are not guarded.
3. Optimistic cancellation can override an authoritative successful terminal payload.
4. IPC DTOs are retained as Renderer business state and normalization/presentation are mixed.
5. Feature UI knows generic protocol command/event strings instead of a typed narrow client.
6. Renderer repeats engine availability and terminal classification policy already owned by Application/P3.
7. The main Download lifecycle cannot be tested as a unit; tests cover only disconnected helpers.
8. Queue/Advanced Quality interaction lacks a per-trace in-flight/idempotent transition.

### Follow-up debt

- Transcode shares presentation and has a similar progress/terminal race.
- Site Session can leak a deferred listener and stale-write overlapping reloads.
- Runtime Dependency has duplicate hydration and adjacent ownership ambiguity.
- Update state is mirrored separately in App and Settings.
- Operational protocol families remain less strictly decoded than P3 Download.
- Renderer-emitted events are not runtime-validated in Main.
- Non-Download diagnostics retain broad raw-message regex categorization.
- Paste/drag site and image/file intake remain mixed in App.

### Optional cleanup

- Remove a debug completion log after feature-level diagnostics own logging.
- Correct the queue acknowledgement re-export location so UI does not import an Application-owned ack directly.
- Replace permissive queue/transcode coercion with protocol-drift reporting when the relevant client is migrated.
- Move feature-only helpers from `utils/` after ownership is established; the move itself is not a blocker.

CSS, file length, component size, naming, and visual design are not architecture blockers by themselves.

## H. Recommended minimum implementation slice

Implement only:

```text
Download + Download Queue lifecycle
  + required Advanced Quality per-trace transition
  + compatibility entry points for ordinary/paste/drag video queueing
```

Candidate modules, without barrels or new dependencies:

```text
src/features/download/
├─ model.ts
├─ reducer.ts
├─ selectors.ts
├─ client.ts
├─ useDownloadQueue.ts
└─ components/        # only presentation pieces that must move for ownership
```

Keep Transcode, Site Session, Runtime Dependency, Update, Settings, complete paste/drag resolution, routes, shell geometry, CSS, and design system in their current compatibility boundaries.

Recommended state shape:

```text
tasksById
order
maxConcurrent
progressByTrace
cancelling
qualitySelecting
terminalTraceIds (or equivalent generation/tombstone guard)
```

Counts, primary task, badge rows, and display status are selectors. Queue count is consistency/max-concurrency input, not an independent visible-total owner.

## I. Guard and test recommendations

Extend the current static Vitest import scan:

- `src/features/**` must not import `electron`, repository `electron/`, `src/electron-runtime`, Domain/Engine infrastructure, or raw preload implementation.
- Download `model.ts`, `reducer.ts`, and `selectors.ts` must not import `src/protocol`.
- Feature A must not import Feature B internal paths. App composition may import explicit public feature surfaces.
- Keep the rule list small and path-based; add no dependency analyzer.

Focused Node-only tests:

- queue accepted;
- progress update;
- success, typed failure, and cancelled terminal outcomes;
- multiple concurrent jobs;
- completion followed by delayed progress;
- stale queue detail after terminal;
- duplicate terminal event idempotency;
- typed success racing with rejected cancel request;
- Advanced Quality per-trace transition and double-click suppression;
- subscription promise resolving after dispose still calls the disposer and ignores later events;
- selector consistency for total/primary/badge state.

Do not repeat P2/P3 backend policy tests.

## J. Planning baseline

```text
npm test -- src/utils/downloadEventReducers.test.ts src/utils/downloadViewHelpers.test.ts src/protocol/download/ipcMappers.test.ts src/architecture/import-guard.test.ts src/utils/centerOverlayState.test.ts src/utils/runtimeDependencyGate.test.ts

6 files passed
91 tests passed

npm run type-check
passed

npm run lint
passed
```

Planning conclusion: the task is ready for Lead Architecture Review but must remain in `planning`; no Develop Worker should be dispatched until explicit approval.
