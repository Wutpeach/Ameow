# Final check report: current Download failure diagnostic export

Date: 2026-09-11  
Task: `.trellis/tasks/09-11-download-diagnostic-export-research`  
Verdict: **ready for lead review**

## Executive result

The approved one-slot current/just-failed Download incident feature is implemented inside the intended App/Electron/UI boundary. Final root-only tests pass (10 files, 101 tests), production build, lint, TypeScript, locale sync, docs build/route verification, and diff whitespace checks pass. Native Windows save/cancel and controlled UI lifecycle/race smoke pass with the platform limits recorded in `evidence/native-ui-smoke.md`.

No DownloadDiagnostic, Job, orchestrator, yt-dlp, telemetry, runtime/session log, Support Log implementation, preload, persistence/store/history, framework, or dependency semantics were changed.

## Findings and checker fixes

1. **Fixed: stale `finally` could write pending UI for a replacement incident.** `src/App.tsx` now resets generation-local pending UI when an incident is captured/cleared, keeps the global in-flight guard independent, and lets `finally` change React pending state only when its captured generation is still current. A fresh Electron race reproduced Save(A) -> failure(B) -> native cancel(A): B stayed enabled and received no stale cancellation feedback.
2. **Fixed: native dialog hard-coded English chrome.** `electron/main.mts` now supplies only a neutral timestamp default path; Windows localized the actual title and buttons (`另存为`, `保存`, `取消`).
3. **Fixed: compact-shell control usability.** `MainWindowCenterOverlay.tsx` uses theme-backed contrast, no-wrap controls, and stable 24 px action heights; keyboard and both themes were smoke-tested in the 200 px shell.
4. **Fixed: missing behavioral regression coverage.** Added generation invalidation/lifetime assertions and authoritative accepted-intake versus unmarked queue-promotion coverage using existing Vitest tooling. Final focused collection is 10 files / 101 tests.
5. **Not fixed (out of scope): theme event echo loop.** Runtime synthetic `theme-changed` caused repeated persistence/event emission. This predates and is independent of diagnostic incident behavior; startup settings provided deterministic theme smoke without expanding the approved boundary.

No design change was needed. Checker edits enforce the already approved stale-completion, native-localization, accessibility, and lifecycle contracts.

## Acceptance matrix

| Acceptance | Result | Evidence |
| --- | --- | --- |
| AC1: selected incident only; unrelated runtime/B cannot alter captured A | PASS | Controller captures the normalized request before async egress; unit tests assert deterministic sink text; native race proves replacement does not mutate the in-flight capture. |
| AC2: no session/runtime reader or missing-data fallback | PASS | Incident command imports only the shared normalizer/builder. Download raw legacy fallback is absent in `errorDiagnosticCopy` tests and native reports omit raw sentinels/session logs. |
| AC3: runtime developer logging and Support Log remain separate | PASS | Support Log code/tests pass unchanged; help/copy explicitly describes it as a separate session-level export. |
| AC4: Application/yt-dlp semantics unchanged | PASS | Scope audit found no changed DownloadDiagnostic, Job, orchestrator, yt-dlp, diagnostic sink, telemetry, or runtime-log files. |
| AC5: Copy/Save share normalized request/text builder | PASS | One controller path normalizes/builds before choosing clipboard/file sink; fixed-clock tests assert equal text. Native copy/save matched after normalizing `generatedAt`. |
| AC6: one App-local incident, approved lifetime only | PASS | Pure one-slot helper plus App ownership; latest replaces; explicit dismiss, accepted new intake, and teardown clear; timeout, collapse/re-expand, and unmarked promotion retain; restart has no incident. No persistence/history/store. |
| AC7: cancel/error retry and stale completion safety | PASS | Native cancel retained/re-enabled retry. Controller rejection propagates. Save(A)/replace(B)/cancel(A) left B enabled with no stale feedback; global dialog guard still released. |

## Critical lifecycle checks

- Sparse enqueue/background failures enter the same one-slot Download incident path.
- A background failure does not preempt current progress or the cancel action.
- Only the exact `acceptedTraceId` new-membership intake signal clears for new work; local command acknowledgement and queued promotion do not.
- Successful Copy/Save, cancellation, write error, five-second outcome timeout, and shell collapse do not clear the incident.
- The strip renders only in the full shell and does not acquire a main-window lock.
- Captured egress is immutable. Generation checks protect success, error, and `finally` UI updates.
- Copy and Save use the same normalization/report builder. Download raw-message fallback is absent; bounded Transcode compatibility remains tested.

## Commands and exact results

```powershell
npx vitest run electron/errorDiagnosticCopy.test.mts electron/errorDiagnosticCommands.test.mts electron/supportLogCommands.test.mts electron/supportLogExport.test.mts electron/rendererCommandControllerRegistry.test.mts src/utils/currentDownloadIncident.test.ts src/features/download/useDownloadQueue.test.ts src/utils/centerOverlayState.test.ts src/presentation/main-window/downloadTerminalProjection.test.ts src/architecture/import-guard.test.ts --exclude '.trellis/**'
# PASS: 10 files, 101 tests

npm run build
# PASS: renderer TypeScript/Vite build and Electron build; prebuild locale sync completed

npm run locales:sync
# PASS: 2 languages, 4 namespaces; extension mirrors synchronized

npm run lint
# PASS

npm run type-check
# PASS: root and electron TypeScript configurations

git diff --check
# PASS
```

Docs environment repair and validation used the cached compatible binary without changing manifests or lockfiles:

```powershell
C:\Users\Administrator\AppData\Local\npm-cache\_npx\992a19d7d9bf36d4\node_modules\node\bin\node.exe -v
# v22.19.0

& 'C:\Users\Administrator\AppData\Local\npm-cache\_npx\992a19d7d9bf36d4\node_modules\node\bin\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' ci --prefix site
# PASS; package manifests/lockfiles unchanged

& 'C:\Users\Administrator\AppData\Local\npm-cache\_npx\992a19d7d9bf36d4\node_modules\node\bin\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' --prefix site run build
# PASS: Astro built 63 pages, Pagefind completed, verify-build.mjs verified 6 required docs routes
```

`git diff -- package.json package-lock.json site/package.json site/package-lock.json` returned empty. The root-only Vitest exclusion is intentional because unrelated snapshot copies under `.trellis/tmp` otherwise contaminate discovery.

## Documentation/spec/locale validation

- Chinese and English user troubleshooting pages distinguish current incident reports from the separate session Support Log.
- Source locale JSON and generated browser-extension mirrors are synchronized.
- `.trellis/spec/backend/logging-guidelines.md` now records the shared incident Copy/Save egress contract, Download sparse behavior, Transcode compatibility, native cancellation, and retry semantics.
- `.trellis/spec/frontend/state-management.md` now records one-slot App ownership, exact clear conditions, generation guards, global dialog guard separation, accessibility, and no-lock behavior.
- Current docs-site build contract (`Node >=22.19.0` plus `verify-build.mjs`) was satisfied exactly.

## Deviations and platform limits

- Native filesystem write rejection was not safely induced. Controller sink rejection is covered with bounded injected tests and is not reported as native coverage.
- Typed failure/progress/queue events in smoke were controlled fixtures, not a live engine run; no engine semantics changed.
- Windows native dialog/save/cancel was exercised; macOS/Linux were not.
- Computer Use clicks are ignored by the compact passthrough surface on this Windows host. CDP pointer entry into the measured compact hotspot drove the actual presentation lifecycle and proved retained incident re-expansion.
- The pre-existing theme persistence echo loop is reported but not modified.

## Changed boundary reviewed

Product changes remain limited to shared incident report projection/controller, Electron command/save composition, typed command union, App-local incident state/UI, focused tests, locales, and two troubleshooting pages. Checker-owned additions are the bounded smoke driver/results/screenshots, these reports, the two directly affected Trellis contracts, focused regressions, and the small stale-pending/native-dialog/control polish fixes. No new dependency or generalized abstraction was introduced.

## Judgment

Ready for review. All required automated gates and Windows native/UI smoke passed; the only untested native branch is a safely induced filesystem write error, which has focused controller rejection coverage and is explicitly bounded above.
