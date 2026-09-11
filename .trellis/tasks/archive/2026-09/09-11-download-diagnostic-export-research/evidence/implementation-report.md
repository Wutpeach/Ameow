# Implementation report: current failure diagnostic export

## Delivered boundary

- Reused `normalizeErrorDiagnosticCopyRequest` and `buildErrorDiagnosticCopyText` for `copy_error_diagnostics` and new `export_error_diagnostics`; Download reports with no typed attempts now remain sparse, while Transcode evidence remains bounded.
- Added Main-owned native save dialog/write injection, the typed command union, one App-local latest Download failure slot, generation-guarded copy/save feedback, and a full-shell-only accessible Copy/Save/Dismiss strip.
- Updated source locales, generated extension locale mirrors, and Chinese/English troubleshooting text. No DownloadDiagnostic, Job, orchestration, yt-dlp, Support Log export, preload, telemetry, persistence, or session-log reader changed.

## Acceptance mapping

| Acceptance | Evidence |
| --- | --- |
| AC1 / AC2 | The report builder stays incident-only and has no session-log dependency; `electron/errorDiagnosticCopy.test.mts` proves an untyped Download omits raw legacy text. |
| AC3 | `export_support_log` and its controller/export sources remain unchanged; wording calls it a separate session support log. |
| AC4 | Final source diff excludes Application DownloadDiagnostic, Jobs, orchestrator and yt-dlp paths. |
| AC5 | Controller test injects a fixed clock and asserts clipboard/file sinks receive exactly the same text. |
| AC6 | `currentDownloadIncident` is one App-local slot; the pure test proves latest-replaces, clear, and generation invalidation. Its only clear callers are accepted Download intake, explicit dismiss, and teardown. |
| AC7 | Export cancellation returns `false`; sink rejection propagates for retry; App captures `{ request, generation }`, disables duplicate egress, and only applies feedback while that generation remains current. |

## Commands and results

Passed:

```powershell
npx vitest run electron/errorDiagnosticCopy.test.mts electron/errorDiagnosticCommands.test.mts electron/supportLogCommands.test.mts electron/supportLogExport.test.mts electron/rendererCommandControllerRegistry.test.mts src/utils/currentDownloadIncident.test.ts src/utils/centerOverlayState.test.ts src/presentation/main-window/downloadTerminalProjection.test.ts src/architecture/import-guard.test.ts --exclude '.trellis/**'
# 9 files, 75 tests passed

npx vitest run electron/errorDiagnosticCopy.test.mts electron/errorDiagnosticCommands.test.mts src/utils/currentDownloadIncident.test.ts --exclude '.trellis/**' --reporter=verbose
# 3 files, 14 tests passed; confirms each new root test was collected

npm run locales:sync
# synced 2 languages and 4 namespaces

npm run type-check
npm run lint
git diff --check
# all passed
```

The three prescribed `npm run test -- ...` commands also passed, but their Vitest configuration discovered snapshot test copies under untracked `.trellis/tmp/` (58/303, 87/648, and 82/960). The explicit `.trellis/**` exclusion above is the focused source-root evidence; no snapshot result was counted.

`npm run docs:build` was attempted but could not validate content in this worker environment. The current docs contract requires Node `>=22.19.0`, while the host is `v22.17.1`; the pre-existing/incomplete `site/node_modules` install also lacks `astro/dist/cli/index.js` after lockfile recovery attempts. The lockfile was restored without a tracked change.

## Files changed

- Product/code: `electron/errorDiagnosticCopy.mts`, `electron/errorDiagnosticCommands.mts`, `electron/main.mts`, `src/types/electronBridge.ts`, `src/App.tsx`, `src/presentation/main-window/MainWindowCenterOverlay.tsx`, `src/utils/currentDownloadIncident.ts`.
- Tests: `electron/errorDiagnosticCopy.test.mts`, `electron/errorDiagnosticCommands.test.mts`, `src/utils/currentDownloadIncident.test.ts`.
- Copy/docs: `locales/en/desktop.json`, `locales/zh-CN/desktop.json`, generated `browser-extension/locales/{en,zh-CN}/desktop.json`, and both `site/src/content/docs/*/docs/troubleshooting/error-messages.md` pages.

## Checker smoke setup

Run `npm run electron:dev`, then use a controlled failed Download. Verify Copy then Save outputs the same captured report; wait past five seconds and collapse/re-expand; use keyboard focus; cancel the native save dialog; choose an unwritable target; begin a new download while a save dialog is open; trigger a background failure while another Download remains active; inspect empty/dismissed state, both themes, reduced motion, and restart. Native dialog/UI smoke was not claimed by these unit tests and remains for the independent checker.
