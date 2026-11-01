# Implementation plan: current failure incident copy/export

Status: approved for implementation on 2026-09-11. Lifecycle and all other plan directions are explicitly approved; execute this checklist without reopening product planning. Implementation entry HEAD is `b7b254e72cd2ae1e351df0a573ad2ac80ba33b92`; preserve its docs integration changes and refreshed docs-site contract.

## Entry gate

- Completed: the user confirmed the availability/dismissal/background package in `prd.md` / `design.md` and explicitly approved the latest converged plan.
- Keep this as one task: source, egress and UI must satisfy the same end-to-end acceptance boundary.
- Recheck HEAD and relevant worktree changes before implementation; planning observed `9440310326382691217e606664ef53de001dd9fa`, with the original chain verified equal to `f1b4991`.
- Use selected Trellis roles through real Orca dispatch; workers own assigned code boundaries, must preserve others' changes and must not spawn workers. Curated manifests are context, not implementation authorization.

## Ordered local changes

1. **One report, two outputs (AC1, AC2, AC4, AC5).**
   - Keep existing report v2, normalization and formatting in `electron/errorDiagnosticCopy.mts`.
   - Remove raw legacy evidence from the Download surface only. A failure without attempts remains sparse and structured; retain existing Transcode evidence behavior.
   - Extend `electron/errorDiagnosticCommands.mts` with `export_error_diagnostics`, using the same normalized request -> text builder call before choosing clipboard or save.
   - Add the command name to `src/types/electronBridge.ts`. Inject a single native-save/write callback in Main. Copy stays `true`; export returns `false` on cancel, `true` after write, rejects on failure.
   - Do not import session log/support-log/telemetry readers, rename the whole report type family, or add a new generic controller/store/helper package.
2. **Current incident availability and actions (AC1, AC6, AC7; approved product decision).**
   - Add one App-local current Download incident slot, captured from typed terminal/enqueue failure requests. Preserve Product facts and existing foreground/background visual policy.
   - Implement approved capture/replacement/new-download/dismiss/teardown transitions in a small pure local helper so real transition behavior can be tested without introducing a component-test framework.
   - Add the full-shell copy/save/dismiss action strip in `MainWindowCenterOverlay`; use a single retained request for both commands. Avoid duplicate Download copy controls and preserve Transcode copy behavior.
   - Keep the existing five-second outcome timer and lock release. Do not make report availability depend on animation completion or hold full mode indefinitely.
   - Capture incident/generation on click, prevent duplicate simultaneous egress, keep incident available on save cancel/error, and ignore stale completion feedback after replacement/dismissal.
   - Update direct preview callers only as needed to preserve compilation and browser-only isolation; no new Lab capability.
3. **Clarify product wording (AC3, AC6).**
   - In both source locale files use distinct labels: current failure report actions versus Settings runtime Support Log.
   - Explain Support Log as environment/settings/runtime-session support data; point failure troubleshooting to the main-window incident actions. Keep its command, file sections and destination unchanged.
   - Update the two existing troubleshooting `error-messages.md` pages with the approved availability and explicit no-history behavior. Do not create a new help page or edit generated locale files manually.
4. **Validate the composed change and review boundaries.**
   - Run the focused checks below, then lint/type-check, locale sync and docs build as applicable.
   - Perform the native save/cancel/failure and compact-window interaction smoke; a fake filesystem/dialog callback alone cannot prove the Electron UI path.
   - Review the final diff for forbidden dependencies and unexpected source/store/history changes. Capture results and any platform limit in task-local evidence.
   - Update only the affected logging/incident-egress and UI availability spec contracts to reflect the approved behavior; retain Support Log and window-lifecycle contracts. No spec edits in this planning phase.

## Acceptance evidence matrix

| Acceptance | Smallest meaningful proof |
| --- | --- |
| AC1: one incident | Fixed A request containing ordered attempts; background B facts and unrelated session sentinel exist but neither appears in A's report |
| AC2: no log fallback | Incident module/controller dependencies exclude log/telemetry readers; typed and missing-attempt Download cases both exclude raw evidence/context/session sentinels |
| AC3: independent logging | Existing Support Log controller/export tests pass unchanged; review confirms no runtime sink/logger changes; labels distinguish the two outputs |
| AC4: Application unchanged | Final diff has no changes to DownloadDiagnostic/Job/orchestrator/yt-dlp semantics; existing typed terminal assertions remain valid |
| AC5: shared projection | Inject fixed clock/environment and request; clipboard sink and file sink receive exactly the same text; both preserve redaction/attempt order |
| AC6: bounded lifecycle | Pure transition tests: one failure replaces another; timeout/collapse/automatic queue promotion does not destroy availability; explicit close/new accepted download/teardown clears; no persistence APIs |
| AC7: async correctness | Cancel does not write; save/write/clipboard failure is retryable; A completion after B/clear is a stale no-op; duplicate click does not create a second pending save |

Reuse existing Vitest infrastructure. Extend existing report/controller tests and add one focused lifecycle test file; no new testing framework or broad per-function suite.

## Exact validation commands for the implementation phase

```powershell
npm run test -- electron/errorDiagnosticCopy.test.mts electron/errorDiagnosticCommands.test.mts
npm run test -- electron/supportLogCommands.test.mts electron/supportLogExport.test.mts electron/rendererCommandControllerRegistry.test.mts
npm run test -- src/utils/currentDownloadIncident.test.ts src/utils/centerOverlayState.test.ts src/presentation/main-window/downloadTerminalProjection.test.ts src/architecture/import-guard.test.ts
npm run locales:sync
npm run lint
npm run type-check
npm run docs:build
```

`currentDownloadIncident.test.ts` is a planned new test. `npm test` currently permits no-test runs; confirm the output actually collects the named new test before counting it as evidence. If UI prop changes affect Browser Lab compilation, use the existing build/type-check path rather than adding a special runner. Run broader tests only when failures/new changes justify them.

Native/UI smoke after implementation: failed download -> copy -> save same incident; wait past five seconds and collapse/re-expand; keyboard access; native cancellation; unwritable destination; new task while save is pending; background failure without stealing progress/cancel controls; empty/no-incident state; black/white themes and reduced motion. Check that restart has no incident entry. Observe actual failure locally; do not require an external site to fail deterministically when an existing typed dev fixture or controlled input suffices. Use Orca browser for embedded preview and Computer Use only where native dialog verification requires it.

## Risk and rollback boundaries

- Highest-risk file is `src/App.tsx`: do not change Product queue ownership, centerOutcome lock, native window lifecycle or transcode behavior while adding report availability.
- Shared report compatibility: legacy Download raw evidence disappears by design; missing structured fields remain absent. Preserve Transcode bounded evidence and document this narrower Download output.
- Native dialog is new at this seam; verify parent ownership, cancellation and write errors on the active platform. Do not claim untested platform behavior.
- Capacity is one; later failures replace earlier ones and new work/dismissal ends availability. There is no recovery after dismissal/restart. This is the product risk awaiting confirmation.
- Roll back new command/composition, incident slot/actions and copy/help together, keeping existing Quick Copy and Support Log functional. No data migration or persistent state cleanup is needed.

## Planning verification

Repository seams and test command definitions were inspected; no implementation tests, native smoke or builds were run in planning. Artifact/schema/path validation does not certify runtime behavior. Current task remains `planning` until the later approval gate is satisfied.
