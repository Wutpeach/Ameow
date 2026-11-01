# Revised cache isolation: independent check

Date: 2026-09-10. Orca Task `task_e6027da3693c`, Dispatch `ctx_ebc101db99c0`.

## Outcome

**Review completed; overall performance acceptance remains FAILED.** The retained forced distinct-port two-Lab run supports isolation for the intended fixed-port/default-host callers. It does not establish isolation for every host/port override. Cold UI still takes 20.488 seconds in the isolated revision run and 146.445 seconds in the mixed run. The existing report's attribution to a source-transform backlog is too specific: the evidence establishes prolonged request/async-transform elapsed time, including substantial warm HTML waiting, but does not identify CPU transform cost as the cause.

No full runtime matrix or extra performance probe was run. Reviewed retained JSON, actual transform log lines, assertions, installed Vite/React/PostCSS code, and resolved configuration; ran focused cleanup checks and requested static checks. PID 36856 and its caches were not inspected or modified. No git mutation, commit, spec/planning edit, renderer change, dependency change, or production configuration edit was made.

## Findings (fixed)

### Capture cleanup and failed startup

File: `scripts/capture-lab-smoke.mjs`.

- Previously, `rm(cacheDir, { recursive: true })` trusted arbitrary resolved configuration without comparing the deletion target to the expected path. Cleanup now validates a positive integer port and exact absolute `node_modules/.vite-lab/<port>` target before deletion.
- Caches present before capture remain preserved. Any inherited `LAB_TEST_CACHE_ROOT` is now caller-owned and preserved, even if initially absent; capture must not claim arbitrary user override paths as its disposable output.
- Await the direct child's `spawn` event inside the protected block, so spawn errors are observed. Shutdown handles a rejected spawn without waiting for an impossible exit event. A live direct child is still awaited with the existing cleared 10-second deadline; cleanup follows successful shutdown and is skipped if shutdown throws.
- Each readiness fetch now uses the remaining 30-second deadline as an abort timeout. Previously one unresponsive fetch could bypass the loop deadline indefinitely.
- Added `--cleanup-self-check`, which creates one previously absent random-port cache exclusively, checks preservation and invalid-parent rejection, stops and proves absence of its exact Node fixture PID, deletes the owned cache, and exercises a nonexistent-executable spawn failure. No browser or optimizer is needed for this check.

This is a mechanical lifecycle fix, not a change to screenshot navigation/scenario assertions. The five retained successful screenshots remain valid rendering evidence; the revised lifecycle helper was separately exercised. Capture still prefetches `/lab.html` and its rendering timings must not be called a cold browser baseline.

### Evidence deletion guard and warning precision

File: `evidence/verify-vite-lab.mjs`.

- Added a deletion-time absolute descendant check against the current evidence run directory and assertion that the original cache was absent. Existing configuration resolution also requires the test root's exact port child before starting a server. No existing/user cache is deleted.
- The known React style warning now matches the **entire exact recorded string**, instead of two broad substring checks. The classification still records the original console-error text as a warning; it does not make React's unsupported style valid. Every other console error, page error, failed request, and HTTP >=400 response remains a failure.

Exact accepted message:

```text
Unsupported style property %s. Did you mean %s? -electron-corner-smoothing ElectronCornerSmoothing
```

No historical raw evidence or previous report was rewritten.

## Findings (not fixed): cache identity contract

`vite.lab.config.ts` is unchanged by this checker. Its source hash still matches the implementation report.

Installed Vite `dist/node/cli.js` passes CLI options in `inlineConfig.server` to `createServer`. In `dist/node/chunks/node.js`, the file config is merged with inline config before `runConfigHook`; absolute cache resolution happens afterward. Thus the current `config` hook sees a CLI-style `server.port` override before choosing the cache. The present React plugin does not subsequently change server port or cache identity. This is a valid native lifecycle approach for the current callers, without argv parsing.

Fresh `resolveConfig` assertions gave:

| Case | Effective host / port | strictPort | Cache suffix / result |
| --- | --- | --- | --- |
| Default, resolved twice | 127.0.0.1 / 1421 | true | `.vite-lab/1421`, identical on repeat |
| Inline CLI-style port | 127.0.0.1 / 55321 | true | `.vite-lab/55321` |
| Different host, same port | 127.0.0.2 / 55321 | true | **same** `.vite-lab/55321` |
| Explicit strictPort override | 127.0.0.1 / 55321 | false | still `.vite-lab/55321` |
| Ephemeral port request | 127.0.0.1 / 0 | true | `.vite-lab/0` |
| Test-root override plus inline cacheDir | 127.0.0.1 / 55321 | true | test root `/55321`; inline cacheDir overwritten by hook |

Limits needing a coordinator decision:

1. `strictPort: true` prevents port hopping on a conflicting bind, but does not stop two processes binding the same port on distinct non-overlapping interfaces. Their cache identity is equal. Supporting arbitrary host overrides requires host-aware identity or an explicit supported-host contract. Do not claim universal instance isolation from the current port-only key.
2. An API caller can override `strictPort` to false; an occupied requested port may then lead to a different actual listener while retaining the requested port's cache identity. Port 0 likewise has no stable configured listener identity. The smallest defensive contract would reject nonpositive ports and `strictPort !== true` for Lab serve. That changes accepted override behavior and was left for review, rather than silently imposing new restrictions.
3. `LAB_TEST_CACHE_ROOT` is a **root**, and the hook always appends the configured port. It deliberately supersedes inline `cacheDir`; it is not a conventional direct cacheDir override. Empty or arbitrary relative roots are not validated by the product hook. The evidence runner supplies controlled absolute roots and capture now preserves caller overrides.
4. Repeated resolution proves stable naming; retained evidence has same-process browser reloads, not a new process restart proving optimizer metadata reuse. Stable default naming is compatible with reuse, but a warm restart outcome was not freshly runtime-tested.
5. Capture's reserve-then-close port selection is still a bind race, and the before-start absence snapshot is not an interprocess ownership lock. The expected exclusive local-port flow is supported; arbitrary concurrent use of the same cache/bind during that gap is not guaranteed. Introducing locks or a new capture identity contract was outside mechanical review.

Production isolation passed resolved-config assertions: `vite.config.ts` build input is exactly `D:\Ameow\index.html`, base is `./`, cache is `node_modules/.vite` even while the Lab test-root environment variable is set. No production config imports this hook. An explicit build through the Lab config is a different, preexisting diagnostic entry. A full production bundle was not rebuilt for these development/capture changes.

`package.json` still sets `dev:lab` to `vite --config vite.lab.config.ts --open /lab.html`. Shared `server.open` resolves to false, and direct capture argv has no `--open`; the retained npm recorder proves the `/lab.html` argument. Neither entries nor opener prevent deliberate navigation to `/`.

## Actual timing evidence and causal assessment

All paths below are relative to this task's `evidence/` directory. Resource durations come from retained `result.json`; transform durations come from the corresponding raw `.log` files. Durations are elapsed wall time and must not be summed across overlapping requests.

### Isolated revision run

`runs/after-2026-09-10T13-25-51-214Z/result.json` and `lifecycle.log`:

| Visit | HTML response start / end | DOMContentLoaded | Visible / interactive |
| --- | --- | --- | --- |
| Cold | 0.392 / 0.392 s | 20.300 s | 20.488 / 20.808 s |
| Warm 1 | 8.783 / 8.786 s | 8.894 s | 9.193 / 9.263 s |
| Warm 2 | 21.404 / 21.404 s | 25.810 s | 25.884 / 26.155 s |

- Dependency scan: 1,344.93 ms. Bundling: 3,353.20 ms. Optimized log: `13:25:56.610Z`, recorded 5,040 ms after launch. This contributes to cold startup but cannot explain the full late path or warm waits.
- Top cold resources: `react-dom_client.js` 10,159.6 ms; `react_jsx-dev-runtime.js` 10,132.1 ms; `react.js` 10,131.8 ms; `src/lab/lab.css` 10,093.7 ms. These requests started around navigation +1.257 s and completed near +11.35–11.42 s.
- Later `react-dom.js` resource: 8,571.1 ms, from +11.431 to +20.002 s; its transform log reports 8,414.05 ms. `react_jsx-runtime.js` transform: 8,129.56 ms. `lab.css` transform: 7,515.06 ms; `LabOverlayStage.tsx`, `stateFixtures.ts`, `ripple/RippleLab.tsx`, `labControls.ts`, and `previewTargets.ts` all cluster near 6,683 ms and finish together.
- Warm 1's slow region is overwhelmingly before HTML response start. Its longest resource is only 17.3 ms. Warm 2 adds approximately 4,278 ms each for cached `lab-main.tsx`, `@vite/client`, and `@react-refresh` after the 21.404-second HTML wait. Those resources have 300-byte transfers, consistent with conditional validation rather than full module transfer.

These warm results contradict attributing all remaining time to compiling the Lab source graph. They locate long waits before document/module delivery, without distinguishing browser scheduling, server queueing, event-loop delay, I/O, or machine contention.

### Forced two-Lab run

`runs/after-2026-09-10T13-27-10-823Z/`:

- Ports 57254 and 57262 resolve distinct cache children and both logs show forced optimizer activity. No recorded EPERM/EACCES/missing optimized module error. Both cold pages and two reloads per page passed the shared visible/scenario/URL assertions.
- Cold visible: 30.455 and 31.478 s. First-page reloads: 12.621 and 39.304 s; second-page reloads: 14.484 and 1.280 s.
- First-page cold top resource `motion_react.js`: 13,021.6 ms; its transform span: 12,769.82 ms. Numerous unrelated helpers and presentation modules have approximately 12,121 ms overlapping spans.
- Second-page `react-dom_client.js`: 15,951.1 ms resource duration. `lab.css` transform: 15,225.18 ms. An optimized `chunk-B-1-B7_t.js` is logged **[skipped]** yet its awaited transform span is 13,128.61 ms. This is direct evidence that a huge transform span need not represent meaningful code transformation.
- The first page's 39.304-second reload has HTML at 5.374 s, then approximately **32.095 seconds** for cached `@vite/client`, `lab-main.tsx`, and `@react-refresh` (each transferSize 300). This remains failed warm performance even though cache integrity and interaction pass.

### Ordinary Vite plus Lab

`runs/after-2026-09-10T13-29-08-651Z/result.json`, `ordinary-plus-lab.log`, `ordinary-vite.log`:

- Lab HTML response starts at 17.799 s, DOMContentLoaded at 146.258 s, visible/interactive at 146.445/146.743 s.
- Top Lab resources: `motion_react.js` **73,466.5 ms**; `downloadViewHelpers.ts` and `runtimeDependencyGate.ts` **73,457.3 ms**; `rippleController.ts` **73,456.4 ms**; `centerOverlayState.ts` **73,454.0 ms**. They start around +71.1 s and end near +144.6 s.
- Yet `motion_react.js`'s transform log is only **304.88 ms**, and `downloadViewHelpers.ts` is **247.03 ms**. Their full resource delay is therefore not explained by their own recorded transform duration.
- Largest Lab transform: `i18next.js` **70,408.94 ms**. `lab-main.tsx` **44,967.56 ms** and `@vite/client` **44,615.88 ms** finish together. `lab.css` is **4,678.85 ms**, materially smaller than the longest late spans.
- Lab scan/bundle finish early: scan 772.42 ms; bundling 6,374.88 ms; optimized at `13:29:16.853Z`, long before the visible milestone around `13:33:11Z`.
- Ordinary Vite has `src/index.css` 48,768.34 ms and a cluster of unrelated JS transforms around 48,535 ms ending at `13:30:04Z`. The ordinary page and reload are checked for HTTP 200/DOMContentLoaded only, not usable production UI. Moreover, the runner refreshes ordinary Vite before navigating Lab; it does **not** reload Lab in this mixed case. Full mixed-case refresh acceptance remains incomplete despite both servers coexisting.

### What is established versus unknown

Vite's `loadAndTransform` starts its timer immediately before `await pluginContainer.transform(...)` and logs it after that promise resolves (`node_modules/vite/dist/node/chunks/node.js:24645`). This includes async hook waiting, scheduling delay and unrelated work interleaving on the event loop; it is not a CPU profiler. The retained runner enables only `vite:deps,vite:transform`. It has no server request-arrival/first-byte trace, per-hook CPU profile, event-loop utilization, browser long-task trace, or machine utilization sample. Its Resource Timing records omit per-resource requestStart/responseStart, so queue, wait and transfer cannot be separated.

Browser execution after the last resources appears relatively short in these visits (e.g. cold DOMContentLoaded to observed visibility about 188 ms; mixed about 187 ms), but there is no browser CPU trace to exclude interleaved browser stalls. Optimizer completion is evidenced; ongoing optimization as the sole explanation is not. Prolonged module/document delivery and async transform elapsed waits are evidenced; CPU-bound transform, queueing, I/O, instrumentation overhead and machine load remain alternatives.

The timing harness also relocates optimized dependencies from `node_modules` into `.trellis/...`. Installed `@vitejs/plugin-react` defaults to excluding `/node_modules/` from its refresh handling; that exclusion no longer applies to test-root dependency paths. This is a concrete measurement-condition difference, not proof that it causes the long spans. Avoid calling this a fully representative or matched production-default cache-location benchmark.

### Tailwind hypothesis and smallest next profile

The coordinator suggested CSS/PostCSS source scanning as a hypothesis. `postcss.config.js` installs `@tailwindcss/postcss` with default options (base defaults to `process.cwd()`). Ordinary `src/index.css` includes Tailwind directives and can activate the scanner. However, **Lab's `lab.css` has no Tailwind/import/apply/etc. directives**; the installed plugin's `Quick bail check` returns before creating a compiler/scanner for this file. The large Lab CSS elapsed span therefore does not itself prove automatic Tailwind candidate scanning. Mixed-run late waits extend well beyond ordinary CSS completion. A Tailwind scan-root rewrite is not supported by these logs alone.

No config-scoped performance remedy is justified yet. The smallest discriminating profile is **one isolated cold navigation plus one normal reload**, using a fresh owned root **under `node_modules/.vite-lab`** to retain normal dependency exclusions, with the existing exact process/cache cleanup. Record per-resource requestStart/responseStart/responseEnd and CDP request/response timestamps; log server middleware arrival/finish timestamps for only HTML, `@vite/client`, Lab entry/CSS and the slow optimized modules, plus one Vite Node CPU profile and event-loop delay sample over the same interval. Keep diagnostic output in files and use normal browser caching. If wall time is large but CPU/ELU low, pursue wait/I/O/scheduling; if a specific plugin dominates CPU, change only that evidenced config boundary. If the original long wait does not reproduce, do not infer a source fix from the faster run. Only profile Tailwind scanning/exclusions if the CPU profile points there; do not redesign the renderer or preinclude dependencies speculatively.

This profile is a recommendation, not a probe performed or a new instrumentation product.

## Verification

Fresh commands from `D:\Ameow`:

```text
npm run lint
npm run type-check
npx eslint vite.lab.config.ts scripts/capture-lab-smoke.mjs .trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/verify-vite-lab.mjs --no-ignore
node --check scripts/capture-lab-smoke.mjs
node --check .trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/verify-vite-lab.mjs
node scripts/capture-lab-smoke.mjs --cleanup-self-check
node .trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/verify-vite-lab.mjs --cleanup-self-check
git diff --check -- scripts/capture-lab-smoke.mjs vite.lab.config.ts
```

All passed (exit 0). Repository lint covers its configured `src`/`vite.config.ts` target; focused ESLint separately covers all touched source files. Type-check covers frontend and Electron.

Capture check removed only its new `/55396` fixture and reported `path guard, preservation, exit, removal, failed spawn`. Runner cleanup JSON is retained at `runs/after-2026-09-10T13-45-19-717Z/cleanup-check.json`: owned PIDs `[40740,1176,41128]` absent, failed startup rejected, registry empty. Earlier successful runtime JSON/logs/screenshots were reused, not rerun or erased. No docs build applies to these internal tooling changes.

The read-only config matrix used `node --input-type=module -` with `resolveConfig({ configFile: 'vite.lab.config.ts', server }, 'serve', 'development')` for `server = {}`, `{port:55321}`, `{port:55321,host:'127.0.0.2'}`, `{port:55321,strictPort:false}`, and `{port:0}`. It resolved default twice and asserted equality; set `LAB_TEST_CACHE_ROOT` to the task's `evidence/config-check-cache`, supplied inline `cacheDir:'ignored-inline-cache'`, and asserted the root/port result. It finally resolved `vite.config.ts` in build mode and asserted `base === './'`, exact `index.html` input, and default `.vite` cache. The environment was restored in `finally`; no server was started or test cache created by this check.

Modified by this checker:

- `scripts/capture-lab-smoke.mjs`
- `.trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/verify-vite-lab.mjs`
- `.trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/revision-check-report.md`
- New task-local cleanup fixture/result directory `evidence/runs/after-2026-09-10T13-45-19-717Z/`.

Source SHA256 after checks:

```text
vite.lab.config.ts            2FD294956A2F2E0E170919B39DCC1D6A58EF4EE989CF37D6B08BDA2A0E7A8DC1
scripts/capture-lab-smoke.mjs  929552CEF234C1D6C317630355E9FE23C0AA12CA1E05D3B1EFCE4974D74C1225
evidence/verify-vite-lab.mjs   49A009AF2CFACC08E85DC01009A268798D55869BF421980A686B86A8DFA5FA77
```

Remaining gates are concrete: override/cache identity contract decisions, usable mixed-case Lab refresh evidence, representative matched cold/warm phase profiling, and actual removal of the tens-of-seconds waiting. Static success and no EPERM in the retained distinct-port run are not permission to mark the performance task complete.
