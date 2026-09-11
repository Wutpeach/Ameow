# Native/UI smoke: current Download failure diagnostic export

Date: 2026-09-11 (Asia/Shanghai)  
Platform: Windows, Electron 41 development build from the current worktree  
Renderer: `http://127.0.0.1:1420/#/`, CDP `127.0.0.1:9333`  
Isolation: task-local `evidence/smoke-user-data`; output under `evidence/smoke-output`

## Result

PASS within the Windows scope described below. The current-failure incident survived timeout/collapse, native cancel, background activity, replacement races, and retry. The actual native save dialog used Windows-localized labels and wrote a valid incident report. No personal Ameow profile, settings, log, or history was used.

## Actual native coverage

- Built and ran the current Electron app with an isolated `--user-data-dir` and a task-local output directory.
- Opened the real Windows save dialog from the current-failure Save action. Computer Use observed title `另存为`, buttons `保存` / `取消`, and a neutral timestamp filename such as `ameow-diagnostic-2026-09-11T13-25-32-813Z.txt`. The implementation supplies no English dialog title or filter labels, so Windows owns localization/default labels.
- Invoked real native cancel. The incident remained available and the renderer showed `已取消保存`; Copy and Save were enabled for retry.
- Invoked real native save. The written UTF-8 report is preserved as `evidence/smoke-output/native-report.txt`; it contains only the selected typed incident and no injected raw sentinel or session log.
- Invoked the real Electron clipboard command and read the OS clipboard. Copy and Save text matched after normalizing only `generatedAt`; both used format version 2 and the same structured incident fields.
- Opened a real native Save dialog for incident A, injected replacement incident B while the dialog was open, then cancelled A through the native dialog. B's Copy/Save controls became enabled immediately; A's stale cancellation/finally did not overwrite B's feedback or pending state.
- Restarted the isolated Electron app. A fresh renderer initially contained no current-failure incident, confirming no persistence/restart recovery.

## Controlled renderer/event coverage

The task-local driver `evidence/native-ui-smoke-driver.mjs` uses the repository's existing Playwright dependency over CDP. It emits typed bridge events; these are controlled fixtures, not real yt-dlp/engine execution.

| Scenario | Observation |
| --- | --- |
| Latest replaces | A later failed Download replaced the visible one-slot incident. |
| Background failure | With a synthetic active Download at 42%, a different failure exposed the strip without hiding the active progress/cancel control. |
| Queued promotion | An unmarked queue-detail promotion retained the incident. |
| Authoritative intake | A queue detail carrying a new-membership `acceptedTraceId` cleared it. |
| Explicit dismiss | Dismiss cleared the incident. |
| Five-second timeout | After 5.2 seconds the shell collapsed, but the incident was retained. Moving the CDP pointer into the actual compact hotspot expanded the shell and restored the same strip. |
| Stale completion | Replacement during an in-flight native Save kept the newer incident's buttons enabled and ignored the older result/feedback. |
| Keyboard | Tab order reached Copy report, Save report, Dismiss, and the active task Cancel control. |
| Hit targets | Copy and Save measured 48x24 px; Dismiss measured 24x24 px in the 200 px shell. Controls did not wrap. |
| Themes/motion | White theme and black theme were exercised from isolated startup settings; black was also captured with `prefers-reduced-motion: reduce` reporting true. |

Computer Use coordinate clicks against the compact Windows window were ignored while Electron was in compact passthrough mode. This did not clear the incident: CDP pointer entry into the measured 60x60 compact hotspot caused the real presentation lifecycle to expand and reveal it. This distinction is intentional in the evidence; the re-expansion was renderer/native-lifecycle integration coverage, not a successful OS-level click.

## Artifacts

- `evidence/current-failure-white.png`
- `evidence/current-failure-black.png`
- `evidence/current-failure-black-reduced.png`
- `evidence/smoke-output/native-report.txt`
- `evidence/smoke-output/native-saved-report.txt`
- `evidence/native-ui-smoke-driver.mjs`

## Limits and deviations

- A native filesystem write rejection was not safely induced on this Windows host without changing permissions or targeting user/system locations. The injected controller test covers sink rejection propagation and retry behavior; this is bounded simulated coverage, not a native write-error claim.
- The Download failures, queue snapshots, progress, and acceptance markers were controlled typed events. No live yt-dlp/download engine execution was used because this smoke validates incident intake/presentation/egress rather than engine semantics.
- macOS and Linux save-dialog labels/behavior were not exercised.
- Runtime `theme-changed` injection exposed a pre-existing theme persistence echo loop (`theme-changed` -> provider setter -> persistence -> `theme-changed`). It is outside this task's approved boundary; deterministic isolated startup settings were used for theme coverage instead, and no production change was made.

All task-owned Electron and Vite processes were stopped after the smoke. The isolated profile remains under the task evidence directory; it contains no personal application data.
