# Vite Lab cache-boundary implementation report

## Checker errata — 2026-09-10

The historical raw artifacts and table below are preserved, but these corrections take precedence over their original interpretation:

- The original runner's `htmlResponseMs` was measured after DOMContentLoaded, not at HTML response arrival. Its `viteReadyMs` was process launch to receipt of the ready log. Neither should be compared directly with the user's first-request latency.
- Before used an empty task-owned cache; after used a real shared Lab cache with `--force`. The after `coldCacheBefore/After` fields described an unused path. These are approximate observations, not a matched experiment establishing the quoted percentage improvement.
- Current runner code has no cache-disabling Playwright routing, but old runs lack source snapshots and resource-cache evidence. Warm timings alone prove neither cache bypass nor continuing optimizer work. Existing evidence does not isolate a transform/UI bottleneck; causal diagnosis remains open.
- The focused two-Lab logs prove an EPERM failure under forced shared-cache writes. They do not establish ordinary warm-launch failure frequency or independently prove repeated EPERM from the earlier incomplete run.
- Existing 480×480 screenshots show a shell and controls, not a verified first visible preview. The ordinary+Lab case did not refresh Lab, and its final JSON was lost when the later opener check failed.
- The corrected task-local runner now records actual caches, separate Navigation Timing fields, desktop viewport/preview intersection, warm error/URL/state-transition assertions and Windows process-tree cleanup. Future forced tests use fresh task-owned caches, including a shared **test-owned** two-Lab cache; they do not force the real shared cache. These changes do not retroactively repair historical evidence.

See `cleanup-report.md` for exact verification and remaining limits. **Product acceptance remains failed.**

## Outcome

Implemented the reviewed minimal candidate:

- `vite.lab.config.ts` now uses `cacheDir: "node_modules/.vite-lab"` and explicit `optimizeDeps.entries: ["lab.html"]`.
- `package.json` now runs `dev:lab` with `--open /lab.html`; the Vite config deliberately has no shared `server.open`, so direct capture invocations do not launch a browser.
- Added one task-local Playwright/Vite acceptance runner at `evidence/verify-vite-lab.mjs`, plus its transparent test config and open-target recorder. It records browser-visible workspace and scenario-click milestones, process/browser timings, cache resolution, normal renderer + Lab logs, two-Lab forced-optimizer stress, and the npm opener target.

No renderer, production Vite config, dependency, exclusion, cache-locking, or documentation changes were made.

## Environment and controlled baseline

- Windows (`win32`), Node `v22.17.1`, installed `vite@8.0.16`, Playwright Chromium.
- Baseline command: `node .trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/verify-vite-lab.mjs --phase before`
- The baseline used a newly-created task-owned cache at `evidence/runs/before-2026-09-10T11-43-44-517Z/cold-cache`; it started absent and was never a user cache. The source configuration was otherwise unmodified. Its resolved `optimizeDeps.entries` was absent (Vite inferred the existing `build.rollupOptions.input`).

| Measurement | Before controlled cold | After forced cold | Change |
| --- | ---: | ---: | ---: |
| Vite ready | 270 ms | 424 ms | +154 ms |
| Process launch → visible Lab workspace | 28,569 ms | 27,223 ms | -1,346 ms (4.7%) |
| Browser navigation → visible workspace | 28,208 ms | 26,687 ms | -1,521 ms (5.4%) |
| Browser navigation → successful scenario click | 28,522 ms | 26,994 ms | -1,528 ms (5.4%) |
| Warm refresh 1 → visible / interactive | 24,228 / 24,277 ms | 23,174 / 23,238 ms | still prolonged |
| Warm refresh 2 → visible / interactive | 22,514 / 22,602 ms | 19,811 / 19,897 ms | still prolonged |

After command: `node .trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/verify-vite-lab.mjs --phase after --force --lifecycle-only`. It resolved the real Lab cache to `D:/Ameow/node_modules/.vite-lab` and entries to `["lab.html"]`. `--force` is Vite's controlled re-optimization mode; no cache directory was recursively deleted.

Evidence:

- Before: `evidence/runs/before-2026-09-10T11-43-44-517Z/result.json`, `cold.png`, `warm-1.png`, `warm-2.png`, and `lifecycle.log`.
- After: `evidence/runs/after-2026-09-10T12-15-56-103Z/result.json`, `cold.png`, `warm-1.png`, `warm-2.png`, and `lifecycle.log`.

## Runtime matrix

### Ordinary Vite + Lab

Actual Vite resolution after the change was:

```json
[
  { "cacheDir": "D:/Ameow/node_modules/.vite" },
  { "cacheDir": "D:/Ameow/node_modules/.vite-lab", "entries": ["lab.html"] }
]
```

The bounded ordinary renderer + Lab browser run completed the Lab workspace/interaction assertion and retained `ordinary-plus-lab.png` plus both server logs under `evidence/runs/after-2026-09-10T12-23-54-596Z/`. The normal logs contain no `EPERM`, `EACCES`, missing-optimized-module, or `optimized dependencies changed` match. The Lab still took nearly four minutes in this heavily backlogged concurrent environment before the UI became visible, so this is cache-isolation evidence, not a performance pass.

### Two Lab forced-optimizer stress — failed acceptance gate

Focused repeat command:

```text
node .trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/verify-vite-lab.mjs --phase after --two-lab-only
```

Both test-owned Lab processes resolved to the same `D:\Ameow\node_modules\.vite-lab` path and were started with `--force` on ports `55621` and `55622`. The second process logged:

```text
Error: EPERM: operation not permitted, rename
'D:\Ameow\node_modules\.vite-lab\deps_temp_d098d062' ->
'D:\Ameow\node_modules\.vite-lab\deps'
```

It then logged `optimized dependencies changed. reloading`; its Lab page navigated but never made `[data-lab-workspace]` visible within 120 seconds. The peer Lab completed normally. Evidence is retained in `evidence/runs/after-2026-09-10T12-10-30-764Z/two-lab-first.log`, `two-lab-second.log`, `two-lab-first.png`, and `error.txt`.

This explicitly fails the two-Lab concurrency criterion. A shared Lab-specific cache fixes the ordinary-renderer boundary but cannot serialize two Lab optimizer writers.

### Entry and capture

- `node .trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/verify-vite-lab.mjs --phase after --open-only` started the actual `npm run dev:lab` script and recorded `http://127.0.0.1:53247/lab.html` in `evidence/runs/after-2026-09-10T12-30-50-859Z/result.json`.
- Direct capture command: `node .\\scripts\\capture-lab-smoke.mjs --output .trellis\\tasks\\09-10-optimize-vite-lab-cold-start-loading\\evidence\\capture-after-direct`; it passed and wrote all existing scenario screenshots to that task-local directory. This direct caller has no `--open` argument and did not auto-open a browser.
- `npm run lab:capture -- --output <dir>` was also invoked, but npm 11 consumed `--output` as an npm config argument and the existing script fell back to its default `docs-screenshot-captures/lab` directory. The direct invocation above is the retained task-local capture evidence.

## Checks

Passed:

```text
npm run type-check
npm run lint
npx eslint vite.lab.config.ts
node --check evidence/verify-vite-lab.mjs
node --check evidence/record-vite-open.js
node scripts/capture-lab-smoke.mjs --output <task-local path>
```

## Risk and required follow-up

The minimal candidate is correctly scoped for Lab-vs-ordinary Vite cache isolation and opener/entry intent, but it does **not** meet the performance or two-Lab concurrency gates. Do not claim this task complete.

The smallest correction for the two-Lab race is an explicitly passed per-instance Lab cache directory (for example, a caller-supplied cache suffix/path), while preserving the existing stable cache for the normal single-Lab command. That requires a coordinator-approved caller/environment contract and adds a cold-cache cost for parallel Labs; it should be planned separately rather than silently added here. The near-identical cold/warm UI timings show a remaining transform/UI bottleneck independent of the ordinary-cache contention, so it also needs focused diagnosis before any further performance implementation.
