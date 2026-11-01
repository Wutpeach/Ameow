# Design: Optimize Vite Lab cold-start loading

## Evidence and boundaries

The research report in `research/lab-cold-start.md` confirms that both Vite configurations resolve to `node_modules/.vite`. Installed Vite 8 already infers the Lab dependency scan from its `build.rollupOptions.input`. The reported 390 ms ready / 26.8 s first-request wait is user-supplied, not a fresh reproduction.

Keep the fix at the development configuration boundary. Preserve the Lab renderer, scenarios, Electron runtime, production entry and production build. No dependencies, optimizer exclusions, dependency pre-inclusion, cache locks or new server architecture.

## Minimal candidate

1. Set `cacheDir: "node_modules/.vite-lab"` in `vite.lab.config.ts`. This gives Lab and ordinary development distinct optimizer output directories and retains reusable Lab cache across restarts.
2. Set `optimizeDeps.entries: ["lab.html"]` in the same config. This makes the initial scan contract explicit; it is not evidence of a new performance benefit by itself.
3. Add `--open /lab.html` to the existing `dev:lab` script in `package.json`. Keep this out of shared `server.open` configuration so `scripts/capture-lab-smoke.mjs`, which directly spawns Vite with the Lab config, does not open an extra browser window.

Coordinator review correction to the research report: capture explicitly navigating to `/lab.html` does not mean a shared `server.open` setting has no effect on it. The npm script approach avoids this side effect without changing the capture harness.

## Concurrency and deferred experiments

The fixed Lab cache isolates ordinary development from Lab; it does not isolate two Lab processes from each other. Both ordinary-dev + Lab and two-Lab stress cases remain acceptance gates. Record actual resolved paths and optimizer swaps. A passing stress run establishes only the observed result, not a cross-process locking guarantee.

If two Lab processes produce EPERM/EACCES, missing optimized files or reload races, do not call the candidate complete. Research the smallest instance-isolation extension, preserving warm cache reuse where possible, and revise the plan before widening the change. Do not silently remove the two-Lab criterion, add a single-instance restriction, or hide failures with cache deletion/retries. Per-process cache directories are deferred because they force fresh optimization on every restart and add cleanup cost.

Likewise, if cold UI loading still waits tens of seconds, report the measured remaining bottleneck and revise the plan rather than claiming the three settings solved it. Runtime requests to `/` can still load the production graph; blocking or redirecting such requests is outside scope.

## Compatibility, documentation and rollback

The existing capture harness should retain its direct Lab navigation and no-browser-launch behavior. The production Vite configuration remains unchanged. There is no identified public docs page for this internal Lab command; keep the config usage comment accurate. If public startup guidance changes, update the corresponding Chinese/English docs-site content and run `npm run docs:build`.

Rollback is limited to this task's config/script changes. Generated cache directories are evidence/runtime state, not source artifacts; do not delete or move a cache used by another live process. Stop only test-owned processes, and verify absolute paths before any recursive filesystem cleanup.

## Failed candidate and approved revision

The user explicitly approved this revision on 2026-09-10 after reviewing the failed initial attempt and independent audit. Proceed with instance isolation and measured diagnosis; another approval is not needed for the scoped work below.

The candidate has been applied but failed runtime acceptance. Independent review confirms a real two-Lab cache swap EPERM. The observed cold UI remained about 27 seconds; current evidence does not identify the remaining slow phase. See `evidence/check-report.md` for measurement limitations. Keep the minimal candidate as uncommitted work, not a completed fix.

Proposed next scope:

1. Repair the task-local acceptance harness and reclaim proven test-owned process children before more runtime experiments. Preserve historical logs. This is corrective test work, not a product redesign.
2. Isolate Lab caches by stable instance identity. Prefer the configured development port under existing `strictPort: true`, using Vite's configuration lifecycle only after verifying that the hook receives CLI overrides. This keeps the ordinary `dev:lab` port's cache reusable across restarts and makes distinct-port Labs write distinct directories, without a new user-facing instance flag. Both npm and direct capture callers must follow the same resolution. If Vite cannot expose a reliable identity at cache resolution, bring back a concrete explicit-instance contract for review rather than parsing argv or guessing ports.
3. Before additional performance edits, run one matched isolated cold browser navigation with accurate responseStart/responseEnd/DOMContentLoaded, optimizer completion and request/transform timing, followed by two normal-cache reloads. Record browser version, cache transfers, representative desktop preview visibility and actual scenario/URL transitions. Fix only the phase the evidence identifies; a renderer/dependency change still requires a concrete revised design.

Trade-off: capture uses a random port, so port-scoped caches add fresh optimization and extra generated directories for capture runs. Own and clean only test/capture-specific cache paths when their process is stopped; preserve the stable interactive Lab cache. Do not accept indefinite cache accumulation or silently turn every normal restart into a per-process cold cache.

No dependency exclusions/pre-includes, source-graph refactor, runtime UI change, production-root redirect or generic cache-locking system is approved by this proposal. Required acceptance remains cold visible/interactable UI, warm refreshes and both concurrent-process cases without filesystem/cache errors. If the isolated matched run remains slow, report the actual phase before proposing a fix.

## Evidence-directed configuration correction

The representative-cache profile in `evidence/profile-report.md` retains a valid CPU sample trace: approximately 85% of sampled elapsed time is inside native FSWatcher startup via Vite/Chokidar. Browser cold/reload waits remain long. ELU and server timing flush failed, and static checks overlapped the run, so this establishes a concrete watcher investigation lead, not a clean performance comparison or pure CPU-cost estimate.

The smallest next correction remains inside the approved Vite configuration boundary: first summarize the actual watched directories, verify that any large nested checkout/generated roots do not supply Lab imports or runtime assets, then add native `server.watch.ignored` entries for those proven irrelevant roots only. Preserve watching of source, locales, config and public assets and verify a source edit reaches the browser. Do not disable HMR or exclude whole source/dependency graphs. This does not change the user-facing scope; it implements R4's evidence requirement for additional minimal configuration fixes.

Before/after observations must run without overlapping lint/type-check or other task-generated load, with equivalent owned caches under node_modules and no speculative claim about machine-wide idleness. Compare watched-entry counts, cold visible/interactive UI, normal reload and HMR. Keep ordinary+Lab and two-Lab concurrency gates. Performance acceptance remains open until these results are reviewed.

## Final design acceptance

The configuration correction is implemented and independently accepted in `evidence/final-check-report.md`. Final scope is stable configured-port cache isolation, Lab-only initial scanning, the npm `/lab.html` opener, nine proven non-input native watcher exclusions, and owned capture-cache cleanup. Source HMR and restart cache reuse pass. Earlier failed-candidate statements above are retained history; final performance/concurrency acceptance is closed for the documented supported flow. Commit/archive remain pending.
