# Current failure incident export: local design proposal

Status: approved for implementation on 2026-09-11. The user confirmed the complete availability/dismissal/background package and all remaining design/plan directions. Proposal wording below records the approved design, not open questions.

## Confirmed architecture

```text
Application terminal summary (unchanged)
  -> existing typed terminal protocol / download feature client
  -> current failure request owned by main-window incident UI
  -> Electron normalizer + existing incident report builder/formatter
       -> clipboard
       -> user-chosen text file

Application diagnostic sink (unchanged)
  -> runtime developer logger -> session log
  -> separately labeled Settings runtime Support Log
```

The first path has no dependency on session-log readers, support-log snapshots, telemetry JSONL or persistent incident storage. The second path does not define incident meaning. A user-requested exported file is an egress artifact, not an application-maintained diagnostic archive.

## Source and projection ownership

- Application remains the semantic authority for trace, terminal classification and bounded ordered attempts. No new UI/export fields or lifecycle responsibilities in DownloadDiagnostic.
- Existing `ErrorDiagnosticCopyRequest` remains the input boundary; do not rename the type family or add an alias merely because it now has two egresses.
- Reuse `normalizeErrorDiagnosticCopyRequest` and `buildErrorDiagnosticCopyText` from `electron/errorDiagnosticCopy.mts` for both actions. The name need not be generalized to obtain reuse.
- Preserve allowlist-first projection, typed classification, eight-attempt bound, safe URL reduction and final recursive redaction. No event replay, log parsing, generic deduplication or new report schema is required.
- For download failures the incident facts are structured; missing fields remain absent. The shared builder must not emit the legacy raw-message evidence branch for the download surface, including copy callers without an attempt summary. This is a small export-projection compatibility change, not an Application semantics change. Keep the explicitly bounded Transcode evidence behavior unchanged. Do not introduce a legacy-evidence flag or per-egress projection.
- One action captures one immutable incident request before asynchronous IPC/dialog work. A newer task cannot change which incident is being saved. Existing terminal identity and local action generation guard presentation updates; neither becomes a second Product state machine.
- Copy and file output are equivalent under the same request, environment and clock. Independently invoked actions may have different `generatedAt`; this does not warrant a cached report repository.

## File egress and command contract (proposed)

- Add `export_error_diagnostics` beside `copy_error_diagnostics` in `electron/errorDiagnosticCommands.mts` and `AmeowRendererCommand`. The controller normalizes/builds once for either supported command, then chooses the sink. Do not modify `export_support_log` semantics or create a generic egress service.
- Reuse the existing typed desktop/preload command path. Main owns native save dialog, app environment, clipboard and filesystem capabilities; renderer never chooses arbitrary backend read paths. `electron/preload.mts` already forwards generic commands and needs no new branch. The envelope validator and ordered command registry also need no change (delta evidence section 1).
- Save with a neutral timestamp-based `.txt` default filename through Electron's native dialog. Do not put a URL, raw error or local source path in the default filename. Native overwrite behavior is retained.
- Normalize and build once per action in the same controller path before output; inject one `saveDiagnosticText(text: string): Promise<boolean>` capability into the existing controller. Main implements `dialog.showSaveDialog` and Node `writeFile`; no save-dialog helper currently exists, so do not claim reuse of one or introduce a general wrapper. Parent the native dialog to the main window using existing Main ownership.
- Both command results are `boolean`: copy retains its existing `true` success contract; export returns `false` for native cancellation and `true` only after write completion. Cancellation creates no file. Propagate write rejection to local retryable UI feedback; do not invent an error envelope or swallow controller errors.
- Neither successful output nor failed output should alter download queues, runtime lifecycle or logging configuration.

## Approved availability/dismissal lifecycle

Recommended: retain exactly one current/just-failed incident request in renderer memory until explicit dismissal, a newly accepted download, a replacing failure, or renderer/application teardown. Copy/save success keeps the entry available for the other action; save cancellation and errors also keep it.

This retention is separate from the five-second terminal animation opportunity. Do not keep `centerOutcome` locked indefinitely and do not make animation completion own diagnostic availability. Proposed UI: one compact current-failure action strip in the existing full-shell `MainWindowCenterOverlay`, outside the transient outcome branch, with localized copy/save/dismiss controls and a short failure label. Keep it outside the primary cancel control's hit area. Suppress the old embedded download copy button when this strip owns the same incident; preserve the Transcode copy path. No Settings-to-main incident synchronization or history screen. The strip must not render in the compact icon or itself request/lock full mode; normal hover/keyboard expansion reveals it.

While the save dialog is open, retain the captured request for that operation only. A new accepted download invalidates the available old entry, but an already initiated save may finish for the captured incident. Late completion cannot clear or overwrite a newer entry or its feedback.

Proposed background policy: capture a typed failed download terminal before the existing foreground-reveal suppression check; do not change that suppression check or interrupt ongoing progress. The strip may expose the one latest failure while other work continues. A later failure replaces it. A newly accepted download request clears the prior entry using the existing authoritative acceptedTraceId/new-membership queue marker, not a local enqueue acknowledgement or arbitrary progress tick. Automatic promotion of an already queued task does not clear this incident slot: clearing on the same terminal snapshot's next-primary change could immediately erase the just-failed incident. Existing next-primary invalidation still applies to the transient visual/lock only. Include existing download enqueue-failure requests as sparse structured incidents; do not treat Transcode/image/folder failures as new Download incidents. No plan may promise access to every historical or concurrently failed task: capacity is one. This background/lifetime package is part of the pending product confirmation.

Keep the sole retained request in App-local UI state, not in Download reducer, center visual state or a singleton. A small pure `src/utils/currentDownloadIncident.ts` transition helper with a focused test is justified only for the real capture/clear/generation rules. It is not a repository/store API. Existing overlay `diagnostic` payloads can remain for transient presentation/Transcode compatibility, but both new Download action callbacks must use the one retained current request. Pending output captures one request/generation; disable duplicate egress locally, preserve entry on failure/cancellation, and guard late feedback by generation.

Queue-marker evidence: `src/protocol/download/ipcTypes.ts:66` defines `VideoQueueDetailPayload.acceptedTraceId` explicitly as the transient new-membership cause. The current runtime tests distinguish marked acceptance events from ordinary snapshots (`src/electron-runtime/service.test.ts:383`). The existing frontier between authoritative acceptance and visual primary promotion is retained; no new Application marker is needed.

## Support Log responsibility

Keep `export_support_log`, its return-path contract, current file destination and environment/settings/runtime/recent-log sections. Change user-facing labeling/help to identify it as session runtime support data. The download-failure action uses the incident command, never this Settings command. This does not conflict with the current logging spec's requirement to retain chronological support evidence.

## UI and operational constraints

- Work within existing Ameow main-window surfaces, theme tokens and window ownership. Do not add a new page, persistent modal, diagnostic viewer or visual system.
- Provide keyboard-accessible copy/save/dismiss controls, localized names/tooltips, pending state and concise success/error feedback. Prevent duplicate concurrent save dialogs locally.
- Keep success/cancelled download and existing Transcode behavior unchanged except shared command internals proven compatible. A legacy download with no typed attempt facts exports a sparse structured report, not raw engine text; expose missing facts honestly rather than inventing attempts or classifications.
- No dependencies, data migration, persistent state, log rotation changes or yt-dlp collection changes. Rollback removes the new action/command/ephemeral retention as one local unit and leaves Quick Copy and runtime Support Log operational.

## Product gate closed

The user approved the availability/dismissal/background behavior and authorized implementation without reopening planning. All remaining repository seams were checked in `research/incident-export-planning-evidence.md` (Orca Task `task_c17380cb05a9`, Dispatch `ctx_506ff05fd7f4`, succeeded). The worker was released and Delivery `delivery_a9211dfe352a` acknowledged. The phrase 'pending product confirmation' in historical research is superseded by this approval and the PRD.

## Expected file boundary

| Area | Planned files / responsibility |
| --- | --- |
| Shared incident projection | `electron/errorDiagnosticCopy.mts` and its test: download-only structured evidence, preserve typed facts and Transcode behavior |
| Egress | `electron/errorDiagnosticCommands.mts` and its test: shared normalization/build path, clipboard/file branching, cancel/error contract |
| Composition/typing | `electron/main.mts`, `src/types/electronBridge.ts`: save callback and command name only |
| Current incident UI | `src/App.tsx`, `src/presentation/main-window/MainWindowCenterOverlay.tsx`: capture, one retained request, callbacks/action strip, output feedback; keep existing window lifecycle authority |
| Local lifecycle check | Proposed `src/utils/currentDownloadIncident.ts` and `.test.ts`: pure current-incident transitions; no persistence or framework |
| Existing overlay | `src/components/ForegroundOutcomeOverlay.tsx` only if existing props cannot suppress the old download copy affordance; otherwise leave unchanged |
| Copy/help | `locales/en/desktop.json`, `locales/zh-CN/desktop.json`, both `site/src/content/docs/{docs,en/docs}/troubleshooting/error-messages.md`; `SettingsPage.tsx` only if locale replacement cannot convey the distinction |
| Existing preview consumers | `src/lab/LabOverlayStage.tsx` or other direct MainWindowCenterOverlay callers only if required to satisfy added optional props/types; no Lab feature or rework |
| Regression reads/tests | Existing Support Log, centerOverlayState, downloadTerminalProjection, registry and import-guard tests; change only assertions made obsolete by the approved incident behavior |

Protected: `src/application/download-diagnostics.ts`, Job/orchestrator semantics, runtime diagnostic sink/session logger, telemetry, yt-dlp collection, persistent config/storage, preload bridge internals and core window lifecycle. Update relevant spec contracts during the future implementation/check phase only, not now.
