# Single representative-cache cold/reload profile

Task `task_4dfd2444654a`, Dispatch `ctx_1799edcfa448`, 2026-09-10.

## Outcome

**Partial evidence; requested profiling deliverable is incomplete.** Exactly one cold navigation and one ordinary cached reload completed their browser assertions. The cold page was visible in **33.441 s** and interactive in **33.777 s**; reload was visible in **26.332 s** and interactive in **26.413 s**. Moving the diagnostic cache underneath `node_modules` did not remove the slow behavior.

The retained Node CPU profile supplies a concrete new lead: **52.058 s of 60.977 s sampled elapsed time (85.37%) is inside native filesystem watcher `start`, called by Vite/Chokidar file and directory watcher registration.** This supports watcher setup as the main server-thread blocking activity in this run, not React/module transformation or Tailwind candidate scanning. A sampling profile does not distinguish CPU execution from time blocked within a native filesystem call, so this is not a claim of 52 seconds of CPU consumption.

However, buffered server arrival/finish timestamps, ELU/CPU-usage samples and event-loop delay records were not persisted before shutdown. The CPU profile and full browser Navigation/Resource/CDP timing survived. The missing server telemetry prevents the requested complete correlation and ELU report. **No additional navigation or performance rerun was performed**, because the first pair produced valid evidence and the dispatch explicitly prohibited widening/repeating it.

## Run and ownership

Exact command, from `D:\Ameow`:

```text
node .trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/profile-vite-lab.mjs
```

New retained artifacts:

```text
evidence/profile-vite-lab.mjs
evidence/profiles/2026-09-10T13-54-22-700Z/config.json
evidence/profiles/2026-09-10T13-54-22-700Z/result.json
evidence/profiles/2026-09-10T13-54-22-700Z/browser-network.json
evidence/profiles/2026-09-10T13-54-22-700Z/vite.cpuprofile
evidence/profiles/2026-09-10T13-54-22-700Z/profile-analysis.json
evidence/profiles/2026-09-10T13-54-22-700Z/server.log
evidence/profiles/2026-09-10T13-54-22-700Z/cold.png
evidence/profiles/2026-09-10T13-54-22-700Z/reload.png
evidence/profile-report.md
```

The runner spawns the same script with `--server`, using `process.execPath`, cwd `D:\Ameow`, and an IPC channel. The child imports Vite's native `createServer` and the unchanged `vite.lab.config.ts`. Environment additions are `LAB_TEST_CACHE_ROOT=D:\Ameow\node_modules\.vite-lab\profile-Xzjgjr`, `LAB_PROFILE_PORT=49910`, and `LAB_PROFILE_OUTPUT=<absolute artifact directory above>`; `BROWSER=none` and inherited `DEBUG` is removed. A single instrumentation plugin observes selected request paths, without changing responses.

The cache root was created exclusively with `mkdtemp` under the existing `.vite-lab` directory. Its actual resolved child was **`D:/Ameow/node_modules/.vite-lab/profile-Xzjgjr/49910`**, initially absent. Host `127.0.0.1`, port **49910**, strict port enabled; scan entries `['lab.html']`. TCP-only readiness followed listen; no HTTP prefetch/prewarm occurred. The browser was started before the server.

Owned server PID **17308** was awaited and independently checked absent with `process.kill(pid, 0)` yielding ESRCH before removing the exact unique cache root. The absolute root prefix and child-parent relation were validated immediately before recursive deletion. `result.json.cleanup` records exit and owned cache removal. No user cache, PID 36856, port 64699, unrelated process, source, dependency, config or git state was changed. Only new task-local evidence artifacts were written.

## Browser results

Environment: Windows, Node **v22.17.1**, Vite **8.0.16**, Chromium **148.0.7778.96**, Playwright viewport **1440 × 1000**. Browser cache remained normal: no routing and no cache disabling. Resource transfers: cold 77 resources/0 zero-transfer; reload 77 resources/10 zero-transfer.

Both visits asserted visible workspace and stage, positive stage bounds completely within the viewport, an enabled scenario click, selected-scenario and URL change, one document navigation only, HTTP 200, and no page/request/HTTP/console failures other than the exact recorded React unsupported-style warning. Cold changed compact-pointer to download-queued; reload changed it back. Screenshots were taken after interaction. This proves observed layout visibility and usable scenario controls, not an exact compositor paint timestamp.

| Metric, relative to navigation | Cold | Cached reload |
| --- | ---: | ---: |
| HTML requestStart | 3.8 ms | 1.0 ms |
| HTML responseStart | 983.2 ms | 24,795.5 ms |
| HTML responseEnd | 983.9 ms | 24,796.3 ms |
| DOMContentLoaded | 33,271.1 ms | 26,045.4 ms |
| Visible stage/workspace | 33,441 ms | 26,332 ms |
| Scenario interaction completed | 33,777 ms | 26,413 ms |
| Recorded browser long-task total | 426 ms | 218 ms |

The reload's dominant delay is **24.795 seconds before the first HTML byte**, with a sub-millisecond body transfer. After HTML, three cached entry resources wait another approximately 1.13 seconds before responseStart. This is not a full dependency recompilation or slow network body transfer observation.

Cold resource timing examples (all milliseconds after navigation):

| Resource | startTime | requestStart | responseStart | responseEnd |
| --- | ---: | ---: | ---: | ---: |
| optimized react-dom_client.js | 4,030.5 | 4,032.1 | 23,126.4 | 23,129.9 |
| optimized react.js | 4,030.5 | 4,030.9 | 23,103.6 | 23,104.3 |
| optimized react_jsx-dev-runtime.js | 4,030.9 | 12,043.7 | 23,102.8 | 23,103.9 |
| src/lab/stateFixtures.ts | 12,051.6 | 23,132.6 | 23,144.4 | 23,144.8 |
| src/lab/ripple/RippleLab.tsx | 12,051.6 | 23,130.5 | 23,143.9 | 23,144.7 |

For react-dom_client, approximately **19.094 s** elapses between requestStart and responseStart; transfer then takes only 3.5 ms. For stateFixtures, approximately **11.081 s** elapses before requestStart and only 11.8 ms between requestStart and responseStart. Thus browser-side request queueing also contributes to some resources' long total durations, while other already-started requests wait for response. Full timing fields and CDP events are retained; these are not inferred from duration alone.

Reload `lab-main.tsx`: requestStart 24,805.7 ms, responseStart 25,937.4 ms, responseEnd 25,937.7 ms, transferSize 300. `@vite/client` and `@react-refresh` show almost identical waits. The longest recorded browser long task is 194 ms cold and 164 ms reload; the observed long tasks cannot explain the tens-of-seconds pre-response waits.

## CPU profile and code-path evidence

The inspector profile samples at 1 ms requested interval. Total accumulated sample deltas: **60,976.538 ms**. This is sampled elapsed time, not process CPU usage or ELU.

| Top sampled leaf | Weighted time | Calling path |
| --- | ---: | --- |
| native `start` | 44,683.189 ms | Node FSWatcher → fs.watch → Vite createFsWatchInstance → setFsWatchListener → _watchWithNodeFs → _handleFile → _addToNodeFs |
| native `start` | 7,375.078 ms | Same watcher chain, through _handleDir → runMicrotasks |
| `(idle)` | 1,723.620 ms | profiler idle category |
| `(program)` | 660.75 ms | native/program category |
| native `stat` | 533.20 ms | filesystem work |
| `(garbage collector)` | 484.14 ms | GC |
| native `lstat` (three separate nodes) | 454.53 ms combined | filesystem traversal |
| `_getWatchedDir` | 110.25 ms | Vite-bundled watcher implementation |

Full top-node ancestor stacks and weights are retained in `profile-analysis.json`, derived from `samples` plus `timeDeltas` in the unmodified `vite.cpuprofile`.

Installed Vite source confirms the chain is ordinary filesystem watching. `node_modules/vite/dist/node/chunks/node.js:26217` starts Chokidar on the **repository root**, config dependencies, env files and public directory. Its `resolveChokidarOptions` at line 12510 defaults to ignoring `.git`, `node_modules`, `test-results`, cacheDir and build output; it does **not** generally exclude arbitrary nested worktree directories or honor every repo-local generated-directory convention. Current `vite.lab.config.ts` has no custom watcher exclusions.

This makes an overly broad watch tree a much better evidenced lead than the previous transform-span/Tailwind hypothesis. The CPU stacks do not contain path arguments, and no getWatched directory inventory was retained, so this run cannot identify which specific nested directory contributed how many watchers. Existing nested checkout directories are plausible candidates, not measured per-directory offenders.

Native watcher `start` may involve synchronous OS/filesystem blocking, scheduling, antivirus/filter-driver work, or CPU execution. **ELU, process CPU utilization and per-interval event-loop delay are unavailable**, so do not convert these samples into a pure CPU saturation claim. Likewise, no exact optimizer-completion timestamp was collected with broad DEBUG disabled; `server.log` only records the bundling notice. This run does not independently time optimizer completion.

## Instrumentation failure and controls

The script accumulates request arrival/finish records, 1-second ELU/CPU/delay samples and visit markers in memory, then on stop writes the CPU profile **before** `server-timing.json`. The latter file is absent despite a valid complete CPU JSON file. Parent shutdown allows 15 seconds before killing and awaiting the exact direct child. Its catch path does not record the reason and its final cleanup success can mask incomplete telemetry; consequently shell exit 0 is **not** sufficient evidence of a complete profile. The likely shutdown fallback interrupted the final telemetry flush. The executed script is retained unchanged to preserve that limitation, rather than retroactively presenting a repaired script as the source of this evidence.

For any future explicitly authorized profile, write/flush the small request/ELU record before CPU-profile serialization, checkpoint it periodically, and assert every required artifact exists before declaring success. Record graceful versus fallback shutdown and the reason. This needs no new framework or application instrumentation.

There is a second control limitation: repository lint/type-check were inadvertently started during the profile interval. Their overlap may add CPU/filesystem contention, particularly to cold loading. The run is isolated in server/cache ownership, **not an idle-machine benchmark**; no clean performance comparison or magnitude-of-speedup claim is appropriate. Profiling, in-memory middleware timestamps, CDP collection and the browser long-task observer also add overhead. Broad DEBUG output was disabled and server stdout/stderr went directly to a file, avoiding the previous transform-log pipe volume.

The representative cache location restores `/node_modules/` plugin exclusions, but other controls differ from earlier runs (inspector enabled, API server entry, lower debug logging, machine load). Long waits persisted, so this run rules out claiming that merely changing the test-cache location solved the issue. It does not quantify the cache location's isolated effect.

## Smallest next recommendation

Review one **Lab-config-only watcher exclusion candidate** for known nested checkout/generated roots that do not supply the Lab's live source, while preserving watching of actual source, locales, config and public assets. Start with confirming the concrete watch footprint rather than changing rendering, dependencies, Tailwind scan roots or disabling all HMR. `server.watch.ignored` is the existing native configuration surface; no watcher abstraction or dependency is needed.

The watcher-stack evidence justifies investigating this configuration boundary. It does not authorize calling particular exclusions proven, making product changes in this dispatch, or declaring performance accepted. A coordinator-reviewed candidate would need a later bounded before/after check under controlled load; this dispatch ran no such second experiment.

## Verification and source identity

Commands run:

```text
node --check .trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/profile-vite-lab.mjs
npx eslint .trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/profile-vite-lab.mjs --no-ignore
node .trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/profile-vite-lab.mjs
npm run lint
npm run type-check
```

Syntax, focused lint, repository lint and frontend/Electron type-check passed. The browser pair and owned cleanup passed. **Full profiling contract failed** because required server timing/ELU telemetry is absent; no follow-up run was attempted. All prior evidence and source edits are preserved.

SHA256:

```text
profile-vite-lab.mjs          67c8961361eb6a01f94d0bf03b35c37f2190b1fe1275359a781802b5332df8df
vite.lab.config.ts           2fd294956a2f2e0e170919b39dcc1d6a58ef4ee989cf37d6b08bda2a0e7a8dc1
scripts/capture-lab-smoke.mjs 929552cef234c1d6c317630355e9fe23c0aa12ca1e05d3b1efce4974d74c1225
src/lab/lab-main.tsx          8290402127f61fc655f56483e6a6685653af73ec9d0f6a2fe15ecf5b88fd4b16
src/lab/lab.css               cb69d938b6a126237fd07d425486ed6ad624e592a965ca8bb0f981f2673e3c88
postcss.config.js             725980494aa651bb44b5bcfef02fa9d20af03700c1e3f1d178b39c339dceb9b5
```
