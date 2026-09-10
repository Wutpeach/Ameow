# Acceptance-runner correction and process cleanup

Task `task_fcc275836e1f`, Dispatch `ctx_7915e4c3e976`, 2026-09-10.

## Outcome

Mechanical runner corrections and the focused Windows lifecycle check are complete. **Product acceptance remains failed**; no cold-load improvement or concurrency fix is claimed. No product code, configuration, plans, specs, git state or historical raw artifacts were edited. No browser matrix or shared-cache force operation was run.

Changed sources:

- `evidence/verify-vite-lab.mjs`: measurement, browser assertion and owned-process lifecycle corrections; retained `--cleanup-self-check`.
- `evidence/implementation-report.md`: explicit errata ahead of the preserved historical account.
- `evidence/cleanup-report.md`: this report.

New generated lifecycle evidence lives in `evidence/runs/after-2026-09-10T12-47-42-747Z/`: `cleanup-check.json`, temporary npm fixture `package.json`/`hold.cjs`, `fail-start.config.mjs`, and its server config/startup log. These fixtures are private, task-local test files, not application dependencies or source configuration.

## Fixed

- Cache snapshots now use the resolved effective cache path. Each server writes its resolved config and pre-start cache state before launch. `LAB_TEST_CACHE_DIR` is cleared when no override is supplied, preventing an inherited override from disagreeing with resolution. After forced lifecycle runs and two-Lab forced stress use fresh paths under the current run; a guard rejects forced optimization outside this run's cache paths. No existing cache is deleted.
- Browser results separately record Navigation Timing `responseStartMs`, `responseEndMs`, and `domContentLoadedEventEndMs`. The ready-log metric is explicitly named `processLaunchToReadyLogMs`. The environment includes Chromium version, viewport and normal-cache policy.
- Contexts use 1440×1000. The workspace and preview stage must be visible, and the preview stage must fit entirely inside the viewport. The recorded milestone remains the test's observation of layout visibility, not a compositor paint timestamp.
- Cold visits and warm reloads share one assertion path. Each visit registers and finally removes console-error, HTTP >=400, page-error, failed-request and main-document navigation listeners. Both selected scenario and URL must change to the target. Warm targets alternate from the cold-selected scenario, so both warm clicks demonstrate a transition. No warning allowlist or cache-disabling routing was added.
- Spawned runs are registered immediately. A failed startup cleans up locally, and the outer finally attempts every remaining owned run before closing Chromium, including runs retained after a logging/context/startup failure. Two-Lab starts are awaited sequentially to avoid abandoning a still-pending startup; optimization and browser work still overlap. Windows shutdown uses `taskkill /PID <owned immediate child> /T /F` while the child is live, then awaits its exit. The timeout is cleared. POSIX uses a dedicated process group, but was not runtime-tested here.
- A retained focused check creates an npm shell/Node/Node tree, exercises the same shutdown helper and checks the known PIDs are absent. It also starts Vite with a task-owned config whose `configureServer` deliberately throws, exercising the failed-start path without starting optimization.

## Residual process ownership and cleanup

Before acting, exact PIDs, full command lines, Node executable names and creation times were checked against the preceding audit and retained opener evidence. Only the two independently identified processes were stopped:

| PID | Verified creation (UTC+8) | Ownership anchor | Result |
| --- | --- | --- | --- |
| 54848 | 2026-09-10 20:29:33.917874 | Port 58293, `runs/after-2026-09-10T12-29-32-911Z/npm-dev-lab.log` | Absent in final `Get-Process` and CIM checks |
| 47632 | 2026-09-10 20:30:51.916849 | Port 53247, `runs/after-2026-09-10T12-30-50-859Z/result.json` | Absent in final `Get-Process` and CIM checks |
| 36856 | 2026-09-10 20:26:27.239996 | Port 64699; temporal/argv association only | Left intact; independent task ownership still unproven |

Full matching suffix for both stopped processes was `--config vite.lab.config.ts --open /lab.html --host 127.0.0.1 --port <recorded port>` with executable path under `D:\Ameow\node_modules`. The first guarded attempt used `Invoke-CimMethod -InputObject $candidate -MethodName Terminate` for PID 54848. An immediate existence check still saw it; later it was absent. The second guarded pass rechecked identities, found 54848 already absent, and used `Stop-Process -Id 47632 -Force`; an immediate CIM query again briefly saw it. Final independent `Get-Process -Id 54848,47632 -ErrorAction SilentlyContinue` and CIM queries returned no matching processes. No blind retry, blanket Node/Vite kill, cache deletion or action on PID 36856 occurred.

## Verification

Commands executed from `D:\Ameow`:

```text
node .trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/verify-vite-lab.mjs --cleanup-self-check
node --check .trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/verify-vite-lab.mjs
npx eslint .trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/verify-vite-lab.mjs --no-ignore
npm run lint
npm run type-check
```

Focused lifecycle result: exit 0 in approximately five seconds, persisted as:

```json
{"pids":[52704,51612,9116],"allExited":true,"failedStartupRejected":true}
```

Those are the owned shell, fixture Node and its child Node. All three failed `process.kill(pid, 0)` with `ESRCH` after tree shutdown. The deliberate startup failure was observed as an exited child before listening, and the owned-run registry was empty. No Lab page was requested and no shared cache was forced. Syntax and targeted runner lint passed. Fresh repository lint and frontend/Electron type-check passed.

## Remaining limitations / deferred judgments

- Browser measurement/assertion changes were syntax/lint reviewed but not run through Lab in this bounded dispatch. Known `Unsupported style property -electron-corner-smoothing` console errors will now fail the strict check; they are not suppressed. This may reveal an existing product issue and must not be called a harness success without evidence.
- No full concurrency/reload matrix was repeated. Existing ordinary+Lab and two-Lab functions still need their missing concurrent refresh coverage before a future passing acceptance result can be declared. The before flag does not restore pre-edit product source; a future matched baseline needs the actual baseline source.
- Preview intersection proves the stage is in view, not a renderer-ready frame, paint timestamp or absence of occlusion. A stronger paint/renderer milestone needs an explicit measurement decision. Screenshot capture remains after the interaction.
- `taskkill /T` covers descendants of the live owned root. If an external actor kills the npm root first and leaves detached descendants, a reused PID must never be targeted; this small harness does not add a Windows job-object/process-discovery framework. Such abnormal orphan recovery still needs independently proven identity, as used above. External hard termination of the runner cannot execute its finally blocks.
- PID 36856 remains deliberately unmodified. No ownership evidence was invented from its age or Vite command alone.
- The product's instance-cache contract and the remaining cold-delay diagnosis are unchanged and remain coordinator-owned decisions. No broader implementation was attempted.
