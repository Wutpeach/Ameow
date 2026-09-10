# Independent Vite Lab acceptance audit

Date: 2026-09-10. Checker Task `task_8cd38c22c588`, Dispatch `ctx_7e4c874a6133`.

**Acceptance remains FAILED.** The three product edits implement the planned cache boundary, scan entry and opener target, but do not establish the required cold-load improvement or two-Lab stability. This audit completed successfully as a review; it does not approve the implementation for completion.

Paths below are relative to this evidence directory unless identified as repository paths. Existing measurement artifacts were preserved. No product, spec, plan, runner or git-state changes were made; only this report was added. No servers or browsers were launched, no stress matrix was repeated, and no existing process was killed.

## Findings (fixed)

- None in this checker pass. The opener recorder's earlier CommonJS-in-ESM failure is already fixed by the implementation: `record-vite-open.js` now uses an ESM import. `runs/after-2026-09-10T12-29-32-911Z/npm-dev-lab.log` shows the earlier failure; `runs/after-2026-09-10T12-30-50-859Z/result.json` records the subsequent successful target. These are distinct runs, not contradictory results.

## Findings (not fixed)

### 1. Cold timings remain long; before/after are only approximate controls

`runs/before-2026-09-10T11-43-44-517Z/result.json` records 28,569 ms process-to-workspace, 28,208 ms navigation-to-workspace and 28,522 ms navigation-to-click. `runs/after-2026-09-10T12-15-56-103Z/result.json` records 27,223 / 26,687 / 26,994 ms respectively. The arithmetic in the implementation report is correct. A single roughly 5% difference cannot establish a performance benefit.

The before run used an absent task-owned cache without `--force`; the after run used the real shared `node_modules/.vite-lab` with `--force`. Both trigger optimizer work, but the latter is not an equivalent empty, isolated cache experiment. `verify-vite-lab.mjs:302-312` snapshots the newly named `cold-cache` even for the after run, which does not use that directory. Thus its `exists: false` fields say nothing about the actual after cache. There is no metadata hash, live writer inventory or per-run source/runner snapshot. Node/platform and Vite log versions match; browser build and contemporaneous machine load are not recorded. `--phase before` currently changes only cache location, not product configuration: rerunning it now would not recreate the pre-edit baseline.

The report's claim of an independent transform/UI bottleneck goes beyond these measurements. Lifecycle logs establish that bundling started and UI arrived later, but contain no optimizer completion duration, individual transform spans, browser network trace or CPU profile. They do not locate the remaining time in optimizer, transforms, browser evaluation, initialization, rendering or external load. Preserve the slow-load observation and withhold causal attribution.

### 2. Warm cache policy looks ordinary in the current runner, but evidence is incomplete

The complete current runner has no `page.route`, `context.route`, HAR routing or CDP cache-disable call. It uses one browser context and the same server for `page.reload` twice (`runLifecycle`, lines 197-212). Therefore there is **no code evidence of Playwright routing disabling caching**. `--force` is passed at server startup; the runner does not restart or force the optimizer on each reload. Both lifecycle logs have one initial bundling announcement and no repeated optimization/reload announcement during warm measurements. They do not substantiate continuous warm rebundling.

Recorded warm workspace times are 24,228 / 22,514 ms before and 23,174 / 19,811 ms after. They are valid recorded end-to-end waits under the apparent runner policy, not proof that browser cache was bypassed or that transforms were the cause. The runner was subsequently edited and no contemporaneous source hash or resource transfer/cache-hit evidence was saved, so historical cache behavior cannot be independently certified from the JSON alone.

Warm browser failures are not asserted: `visitLab` attaches collectors and asserts them once before returning (lines 138-159), while `warmRefreshes` never checks those collectors again (lines 169-195). HTTP 4xx/5xx subresources also need explicit response checks; they are not necessarily Playwright `requestfailed` events. Console errors are not collected, despite visible `console.error` warnings in the server logs. Click checks verify selected-scenario state and one document navigation, but omit the required URL query assertion. The first warm click selects `download-queued`, already selected by the preceding cold click, so that click does not prove a state transition; the second click does.

### 3. Timing and visibility labels overstate what is measured

`verify-vite-lab.mjs:148-164` takes `htmlResponseAt` **after** `page.goto(...waitUntil: "domcontentloaded")`. Consequently `htmlResponseMs` is a DOMContentLoaded-based navigation duration, not first HTML response latency. The recorded 28,053 / 26,542 ms values must not be equated with the user's reported first-request blockage. A future measurement should record Navigation Timing `responseStart`, `responseEnd` and `domContentLoadedEventEnd` separately.

The ready field is parent-process launch to receipt of a `ready in` log chunk; the log itself reports 190 ms before and 346 ms after, versus the harness's 270 / 424 ms. Both are useful with correct labels. TCP-only readiness avoids an artificial HTML fetch. Browser startup is excluded from process-to-UI because Chromium launches before Vite; context/page creation is included. Lifecycle tests suppress the opener using `BROWSER=none`, while the opener is tested separately. This is a controlled direct-navigation protocol, not npm-command-to-default-browser timing.

`state: "visible"` checks a rendered box and visibility, not viewport intersection or first painted preview. All contexts use 480×480. The inspected after `cold.png` shows scenario controls and Inspector, with the central preview absent from the captured viewport; the scenario strip wraps vertically. Repository `src/lab/PresentationLab.tsx:46-50` reserves at least 280 px for Inspector. These screenshots prove a nonblank interactive shell, but do not prove first visible preview. Screenshots occur after the click, not at the claimed first-visible instant. Use a representative desktop viewport and explicitly verify the intended preview/control intersects the viewport before claiming that stronger milestone.

### 4. Two-Lab failure is real shared-cache stress, not ordinary-use frequency evidence

`runTwoLabs` starts both servers with `force: true`, distinct ports and the same imported Lab config (lines 242-266). The test config changes only `cacheDir` when `LAB_TEST_CACHE_DIR` is present; it introduces no mock filesystem or forced rename failure. The focused run's two logs show simultaneous forced optimization on ports 55621 and 55622; the second logs an actual Windows EPERM renaming `D:\Ameow\node_modules\.vite-lab\deps_temp_d098d062` to `deps`, subsequent rediscovery/reload and failure to show workspace within 120 seconds. This is sufficient to fail the plan's explicitly required overlapping cold/forced writer gate.

It does not establish that two already-warm ordinary launches always fail, or identify the precise process holding a filesystem handle. The stressed cache is the **real shared Lab cache**, not a task-owned override. The runner does not prove exclusive ownership before stressing it and does not durably save config/commands when the phase throws. The focused logs substantiate one complete EPERM reproduction; the earlier `12-01-57` error/screenshot artifacts alone do not independently substantiate a second EPERM occurrence. Do not call repetition verified from those artifacts alone.

The test performs no two-Lab warm refreshes after successful visits. That missing gate matters for a future passing result, although it cannot erase the present failure.

### 5. Ordinary+Lab and opener/capture have narrower coverage than a full pass

The fixed cache paths are correctly different by configuration. `runs/after-2026-09-10T12-23-54-596Z/ordinary-plus-lab.log` and the screenshot support one Lab interaction; the ordinary log includes extensive expected bridge-unavailable errors when the production entry runs outside Electron. Ordinary HTTP-200 DOMContentLoaded and reload assertions are not a desktop-functionality check. The code does not refresh Lab in this phase. This run later fails at the opener, so it lacks a final `result.json`; the report's approximate multi-minute timing is not a preserved navigation measurement here.

The successful opener JSON records the actual npm command and `/lab.html` URL. `BROWSER` is a recording script, so it validates the opener argument, not a real default browser rendering. This is adequate target evidence. Keeping `--open` in `package.json`, absent from shared config and direct capture argv, correctly avoids adding an opener to capture. All five direct-capture PNG names are present. Capture fetches `/lab.html` before navigation (`scripts/capture-lab-smoke.mjs`), so capture timing is prewarmed and cannot be a cold baseline. The capture success assertion is reported by the implementation; no durable command-exit log was found here, and this audit did not rerun capture.

### 6. Test-owned process cleanup is incomplete and left residual Vite children

A bounded read-only `Get-CimInstance Win32_Process` check found these Vite processes at audit time:

| PID | Parent PID | Created (UTC+8) | Port / evidence |
| --- | --- | --- | --- |
| 36856 | 49644 | 20:26:27 | 64699; failed opener-era process |
| 54848 | 58812 | 20:29:33 | 58293; exact `12-29-32` opener log |
| 47632 | 4880 | 20:30:51 | 53247; exact successful `12-30-50` opener JSON |

All command lines are Vite with `vite.lab.config.ts --open /lab.html --host 127.0.0.1`. The latter two match exact retained test ports/times, demonstrating residual children even after success. The first is strongly associated by time/argv but lacks a persisted opener log tying that port to the run. No unknown process was killed. These residuals were created after the measured cold and focused two-Lab runs, so they cannot by themselves explain those earlier timings.

Root cause in the runner is concrete: Windows npm starts through a shell (`startVite:85-109`), while `stopVite:124-131` kills and awaits only that immediate child. Additional cleanup holes: startup failures happen before the caller acquires a run handle; concurrent startup can lose a successful peer if another rejects; log writes precede process cleanup inside finally blocks and can prevent it if writing fails. The losing 10-second timeout is not cleared. The outer finally closes Chromium only. Direct capture also only calls `vite.kill()` without awaiting exit.

These runner issues are recorded rather than partially repaired: accepting a repaired harness requires a focused cleanup/measurement-contract check, and patching historical labels cannot retroactively supply missing evidence. Do not rerun the matrix until its cleanup and cache ownership are corrected. The coordinator can reclaim proven test children after rechecking PID, creation time and command; do not use a blanket Node/Vite kill.

## Verification

- **TypeCheck: PASS**, freshly ran `npm run type-check` (both frontend and Electron `tsc --noEmit`), exit 0.
- **Lint: PASS**, freshly ran `npm run lint`, exit 0. This script covers `src` and `vite.config.ts`; additionally ran `npx eslint vite.lab.config.ts`, exit 0.
- **Runner/recorder syntax: PASS**, `node --check` on both evidence JS entry files, exit 0.
- **Runtime acceptance: FAILED / incomplete** for the reasons above; reused the existing JSON/log/screenshot evidence instead of repeating stress.
- **Docs build: not applicable**, no public docs or public product workflow changed in this candidate. Public Lab guidance was not identified by the task research.
- Reviewed the dispatched check manifest, PRD/design/implementation plan and referenced frontend/platform/reuse/research context. Current Trellis task lookup is empty in this worker environment; the explicitly dispatched path exists and has `in_progress` status. No task was created or switched.

## Minimal next step

1. Choose the instance-cache contract before further product edits: a stable explicit instance ID/cache override offers reuse across restarts but requires every parallel caller to supply a distinct ID; deriving from a consistently configured stable port can automate this if npm and capture resolve the same port identity; per-process IDs isolate automatically but lose restart cache reuse and need cleanup. A single-instance restriction changes the current acceptance scope and is not a silent alternative. A bare optional override with both default instances still sharing the cache is not sufficient for the existing gate.
2. Repair only the acceptance runner's lifecycle, actual-cache recording, timing labels, warm error/URL assertions and viewport contract. Retain old raw evidence as historical. Keep ordinary cached refresh separate from deliberately forced-writer stress and verify owned processes exit.
3. Diagnose the remaining cold delay using one matched, isolated cold navigation with real HTML response timing, request/transform spans and optimizer completion timestamps; then two ordinary cached reloads in that same process/context. Record browser version and cache transfer evidence. Profile only the phase those measurements implicate. Do not add dependency exclusions, pre-includes, renderer changes or a guessed transform fix from the current timing table.
