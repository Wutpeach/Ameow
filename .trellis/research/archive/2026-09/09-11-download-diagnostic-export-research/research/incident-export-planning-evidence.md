# Research: incident export planning evidence

- Query: remaining repository seams for a sibling file egress of the existing incident report, failure-overlay availability, UI/locale/docs/test wiring
- Scope: internal repository only; direct controller, builder, bridge, overlay, locale, docs, and focused tests
- Date: 2026-09-11

## Findings

### 1. Existing controller/builder/bridge and smallest egress seam

- `electron/errorDiagnosticCommands.mts:17-27` options currently accept app metadata, `writeClipboardText`, and an optional clock; its allowlist contains only `copy_error_diagnostics`.
- `electron/errorDiagnosticCommands.mts:36-55` normalizes the payload, calls `buildErrorDiagnosticCopyText`, writes the resulting text to the clipboard, and returns `true`; this is the smallest sibling-command insertion point for file egress while reusing the same request normalization and text builder.
- `electron/errorDiagnosticCopy.mts:204-240` is the allowlist/normalization boundary; `:248-301` builds the incident-scoped report; `:338-399` formats it; `:401-402` exposes the final text builder. It never reads runtime logs.
- The typed command vocabulary is `src/types/electronBridge.ts:10-53` (`copy_error_diagnostics` at `:17`, `export_support_log` at `:19`). `electron/preload.mts:37-42` exposes one generic `commands.invoke(command,payload)`; no per-command preload branch exists. Main validates only the IPC envelope shape/nonblank command (`src/protocol/envelopes.ts:14-25`), then dispatches to the first supporting controller (`electron/main.mts:3086-3094`; registry `electron/rendererCommandControllerRegistry.mts:17-32`).
- Main composes the current controller at `electron/main.mts:1830-1844` and orders it after Support Log at `:1857-1867`; the clipboard sink is injected at `:1835-1842`. A new command therefore needs the command union, this controller allowlist/options, and the Main callback only; the generic preload bridge remains unchanged.
- Existing file egress is `electron/supportLogExport.mts:76-82` (`writeFile`, timestamped path) through `electron/supportLogCommands.mts:17-38`; Settings invokes it and opens the returned parent directory (`src/pages/SettingsPage.tsx:660-686`). The only native dialog helper is open-file/open-directory (`electron/main.mts:2644-2668`, `dialog.showOpenDialog`); fff found no `showSaveDialog`/save-dialog implementation in the indexed repository. A save action would need a new Main-owned `dialog.showSaveDialog` callback (or command) rather than claiming an existing save pattern.

### 2. Failure overlay ownership, timing, and just-failed availability

- App owns `centerOverlayState` and timer refs (`src/App.tsx:411-418`, `:457-466`). The state carries `diagnostic` only in task-outcome loading/visible variants (`src/utils/centerOverlayState.ts:20-41`); `dismissTransient`/`reset` clear it and bump `requestId` (`:53-95`).
- `showForegroundTaskOutcome` clears the prior timer, enters loading, reveals the outcome, then schedules a request-id-guarded finish (`src/App.tsx:775-817`). Failure reveals use 5000 ms for enqueue errors (`:1043-1068`), typed foreground download terminals (`:1387-1400`), and transcode failures (`:1623-1649`).
- There is no manual close prop/button today: the overlay props expose copy/cancel only (`src/presentation/main-window/MainWindowCenterOverlay.tsx:32-42`); the copy button is rendered/invoked by `:146-165` and `src/components/ForegroundOutcomeOverlay.tsx:200-230`. `dismissTransientCenterOverlay` is called by successful copy (`src/App.tsx:761-773`), any progress (`:1326-1336`), and new-primary invalidation (`:1338-1357`), in addition to the timer.
- Background download terminals are intentionally suppressed: `src/App.tsx:1359-1370` passes the exact post-reduction primary to `shouldShowDownloadTerminalReveal`; `src/presentation/main-window/downloadTerminalProjection.ts:3-16` reveals only when that primary is `null`. A new primary invalidates retained typed download outcomes only (`:18-38`), and tests cover both behaviors (`downloadTerminalProjection.test.ts:35-84`). Transcode failure events currently call `showForegroundTaskOutcome` unconditionally (`src/App.tsx:1623-1649`), so background-transcode visibility is a product choice, not an established suppression fact.
- Queue lifecycle retains only terminal trace-ID tombstones, not terminal diagnostics (`src/features/download/model.ts:60-95`; `src/features/download/reducer.ts:195-208`). With no archive/store, the minimal local availability fact is one `ErrorDiagnosticCopyRequest | null` (optionally trace/source plus the existing request generation) in App, set on the chosen just-failed path and cleared on next primary/reset/expiry/manual dismissal according to UX policy. Whether it survives the 5000 ms overlay, whether copy/export dismisses, whether a close control exists, and whether background failures are eligible are UX decisions, not repository facts.

### 3. UI action chain, localization/docs, and focused tests

- App builds the typed request (`src/App.tsx:725-759`), invokes `desktopCommands.invoke("copy_error_diagnostics", diagnostic)` and dismisses on success (`:761-773`), then passes `onCopyDiagnostic` to the overlay (`:2815-2821`). `MainWindowCenterOverlay` maps a failure diagnostic to `showCopyAction`/callback and the localized label (`src/presentation/main-window/MainWindowCenterOverlay.tsx:136-165`); `ForegroundOutcomeOverlay` owns the accessible button and calls the prop (`src/components/ForegroundOutcomeOverlay.tsx:200-230`).
- Existing action copy is `locales/en/desktop.json:130-141` and `locales/zh-CN/desktop.json:130-141`. Settings Support Log copy is `locales/en/desktop.json:437-445` / `locales/zh-CN/desktop.json:437-445`: title `Support`, hint/button/status text currently say “diagnostic log”. To distinguish generic developer/session support export from a one-failure diagnostic report, these keys need product wording (e.g. “Support log” / “Export support log” and a helper that points to center copy/export for one failure); exact wording is a UX choice.
- User docs repeat the ambiguity at `site/src/content/docs/en/docs/troubleshooting/error-messages.md:12-20,124-136` and the Chinese mirror `site/src/content/docs/docs/troubleshooting/error-messages.md:12-20,124-136` (both call Settings “Export diagnostic log” a full environment/settings snapshot). No support-log wording was found in the current advanced dependency docs; do not broaden docs changes without a product copy decision.
- Focused existing tests: `electron/errorDiagnosticCopy.test.mts:11-111,313-329` (typed report, privacy, no runtime-log read); `electron/errorDiagnosticCommands.test.mts:6-77` (allowlist, clipboard output, unsupported/sink errors); `electron/supportLogCommands.test.mts:6-68` and `electron/supportLogExport.test.mts:59-230` (file export contract); `src/utils/centerOverlayState.test.ts:28-47,110-152,189-245` (timer/request guards, diagnostic transport, invalidation); `src/presentation/main-window/downloadTerminalProjection.test.ts:35-84` (background suppression/new-primary invalidation); `electron/rendererCommandControllerRegistry.test.mts:24-165` (first supporting controller dispatch). There is no focused renderer test for `App`, `MainWindowCenterOverlay`, or `ForegroundOutcomeOverlay` itself.

## Candidate files and validation evidence

- Candidate code seams: `electron/errorDiagnosticCommands.mts`, `electron/errorDiagnosticCopy.mts` (only if a small file wrapper is needed), `electron/main.mts`, `src/types/electronBridge.ts`, `src/App.tsx`, and possibly `src/utils/centerOverlayState.ts`/overlay components for availability/manual-dismiss UX. Candidate copy/docs: both `locales/*/desktop.json` files and both bilingual `error-messages.md` files above. `electron/preload.mts` should remain unchanged unless the design introduces a non-generic bridge API.
- Exact existing targeted commands (not run per task instruction):
  - `npm run test -- electron/errorDiagnosticCopy.test.mts electron/errorDiagnosticCommands.test.mts`
  - `npm run test -- electron/supportLogCommands.test.mts electron/supportLogExport.test.mts`
  - `npm run test -- src/utils/centerOverlayState.test.ts src/presentation/main-window/downloadTerminalProjection.test.ts`
  - `npm run lint`; `npm run type-check`; `npm run docs:build`

## Caveats / Not Found

- This is planning evidence only; no code/spec/planning artifact other than this report was changed and no tests were run. DownloadDiagnostic semantics, persistent history, runtime logging, and yt-dlp paths were not re-reviewed.
- “Native save dialog pattern” is not present in the indexed code; only `showOpenDialog` exists. The file-export design must choose the save-dialog ownership and cancellation UX explicitly.
