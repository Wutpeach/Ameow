# Research: Lab Vite cold-start loading

- Query: Verify the Lab Vite cache/entry/open-path behavior, trace callers and shared caches, compare the current configuration with the prior slow-start diagnosis, and decide whether the three proposed configuration changes are sufficient for cold, warm, and concurrent Lab runs.
- Scope: mixed (repository/config inspection, read-only Vite config resolution, installed Vite source, prior task/history evidence)
- Date: 2026-09-10

## Findings

### Executive conclusion

The current Lab server and the ordinary renderer server both resolve `cacheDir` to the same `D:/Ameow/node_modules/.vite`; the Lab has no explicit `optimizeDeps.entries` and no automatic browser open target. This is an evidenced cross-process cache boundary, not an inferred one: a read-only `resolveConfig` call returned the same directory for `vite.lab.config.ts` (port 1421) and `vite.config.ts` (port 1420), and the current generated cache contains both Lab/production dependencies plus a stale `deps_temp_*` directory.

The three proposed changes are directionally correct but are not, by themselves, a proof of full concurrency support:

1. A Lab-specific `cacheDir` separates Lab from the ordinary renderer and directly targets the historical Windows optimizer-swap `EPERM` in the prior task, but two Lab processes using the same config still resolve the same Lab cache and can race on the same `deps` directory. A two-Lab run must therefore be an explicit acceptance gate; if it reports `EPERM`/`EACCES`, the implementation needs process-scoped cache paths or a documented single-Lab constraint rather than claiming isolation.
2. `optimizeDeps.entries: ["lab.html"]` is a useful explicit guard. In Vite 8, the existing `build.rollupOptions.input` already causes the scanner to use `lab.html`, so this setting may document and future-proof the boundary more than it improves the current cold path. It does not prevent a user who manually opens `/` from triggering runtime discovery of the production graph.
3. `server.open: "/lab.html"` (or `--open /lab.html` in `dev:lab`) prevents the common accidental root navigation when Vite opens a browser. It does not change the URL Vite prints, block manual `/` navigation, or affect `lab:capture`, which already navigates directly to `/lab.html`.

The three changes are therefore a minimal first implementation candidate, not a complete performance claim. Acceptance must measure first visible **and interactive** Lab UI, not only the Vite `ready` line or the HTML response, and must run both ordinary-dev + Lab and two-Lab concurrency. The user-provided `390 ms ready / 26.8 s first request` remains a baseline supplied in the active PRD, not an independent reproduction in this pass.

### Current configuration and startup callers

| File:line | Evidence | Consequence |
| --- | --- | --- |
| `vite.lab.config.ts:5-16` | Lab is documented as a plain-browser page at `http://127.0.0.1:1421/lab.html`; it is not an Electron renderer. | `/lab.html` is the intended URL, but the config comment is only guidance. |
| `vite.lab.config.ts:17-33` | React plugin, dev base `/`, fixed `server.port: 1421`, `strictPort: true`, host `127.0.0.1`; `build.rollupOptions.input` is the absolute `lab.html` path. No `cacheDir`, `optimizeDeps.entries`, or `server.open` is present. | Defaults are currently active for cache, dependency scanning, and browser opening. |
| `vite.config.ts:6-20` | Ordinary renderer has `build.rollupOptions.input` pinned to `index.html` and a different dev port (`vite.config.ts:27-35`, port 1420). | The two configurations intentionally have different entries but currently share Vite's default cache. |
| `package.json:9-16` | `dev:lab` is exactly `vite --config vite.lab.config.ts`; ordinary `dev:renderer` is `vite`; `dev`/`electron:dev` run `scripts/run-electron-dev.mjs`. | `dev:lab` has no `--open` argument; the script is the smallest caller to change if config-level `server.open` is not preferred. |
| `scripts/run-electron-dev.mjs:271-297` | The normal Electron harness starts Vite with the default config at port 1420, waits for HTTP/compiled entries, then starts Electron. | It is a separate ordinary Vite process that can contend for the default cache while Lab runs. |
| `scripts/capture-lab-smoke.mjs:36-48` | Capture reserves a random port, starts Vite with `vite.lab.config.ts`, and waits for `${baseUrl}/lab.html`. | It is an existing Lab caller and must remain compatible with any cache/open change. |
| `scripts/capture-lab-smoke.mjs:50-75` | Capture navigates directly to `/lab.html?...`, changes scenarios with `history.pushState`, and asserts exactly one main-document navigation plus no page/request failures. | `server.open` does not affect capture; its navigation/readiness assertions are a model for acceptance. |

The Lab HTML is deliberately separate: `lab.html:1-11` mounts only `/src/lab/lab-main.tsx`. The production `index.html:1-12` mounts `/src/main.tsx`; opening `/` on the Lab server therefore activates the production graph. The Lab bootstrap awaits local i18n before rendering (`src/lab/lab-main.tsx:13-25`, `src/lab/i18n.ts:23-29`), so the first React workspace marker is a better user-visible milestone than `DOMContentLoaded` alone.

### Read-only resolved configuration and cache state

On 2026-09-10 with Node `v22.17.1`, npm `11.13.0`, and installed `vite@8.0.16`, `resolveConfig({ configFile, command: "serve" })` returned:

| Config | root | cacheDir | server | build input | optimizeDeps.entries |
| --- | --- | --- | --- | --- | --- |
| `vite.lab.config.ts` | `D:/Ameow` | `D:/Ameow/node_modules/.vite` | `127.0.0.1:1421`, strict | `D:\Ameow\lab.html` | `undefined` (default inference) |
| `vite.config.ts` | `D:/Ameow` | `D:/Ameow/node_modules/.vite` | host `false`, `1420`, strict | `D:\Ameow\index.html` | `undefined` (default inference) |

The effective default is confirmed by the installed Vite implementation:

- `node_modules/vite/dist/node/chunks/node.js:34576-34585` resolves a relative `cacheDir` against the project root and, when absent, selects the nearest package's `node_modules/.vite`.
- `node_modules/vite/dist/node/chunks/node.js:31904-31921` places optimized files under `<cacheDir>/deps` and temporary processing directories under the same prefix.
- `node_modules/vite/dist/node/index.d.ts:3358-3366` documents that `cacheDir` stores pre-bundled dependencies and defaults to `node_modules/.vite` when a package is present.

The current generated directory (read only; not a product change) contains `node_modules/.vite/deps/_metadata.json`, optimized production and Lab packages (including `react-router-dom`, `clsx`, `tailwind-merge`, `image-max-url`, React, Motion, i18next, and avatar-core), and `node_modules/.vite/deps_temp_80f9297c`. Metadata values and timestamps are transient and must not be treated as acceptance measurements. Their presence does establish that the default cache is shared and that a prior optimizer run left a temporary directory.

The historical EPERM evidence is recorded in the preceding diagnosis task: `.trellis/tasks/archive/2026-09/09-10-diagnose-slow-vite-lab-loading/prd.md:18-19` reports the user's optimizer swap failing with `EPERM` while renaming `node_modules/.vite/deps` to `deps_temp_17ac276f`, followed by late production-only dependency discovery and a client reload; the same lines note that isolated research servers shared this cache while the user's port-1421 process was alive. This is historical evidence, not a fresh run in this pass.

### Dependency scan entry behavior

Vite 8's scanner source is specific about its precedence:

- `node_modules/vite/dist/node/chunks/node.js:30911-30931` chooses explicit `optimizeDeps.entries` first; otherwise it uses `build.rollupOptions.input`; only when neither exists does it glob `**/*.html`.
- `node_modules/vite/dist/node/index.d.ts:925-936` describes the same contract: `build.rolldownOptions.input`/`build.rollupOptions.input` replaces `index.html` inference, while `optimizeDeps.entries` is a relative tinyglobby pattern that overwrites default inference.

Because the current Lab config already sets `build.rollupOptions.input` to `lab.html` (`vite.lab.config.ts:23-26`), the initial dependency scan is effectively Lab-only today. Adding `optimizeDeps.entries: ["lab.html"]` is still a small, explicit contract and protects against a future build-input change, but it should not be sold as a measured cold-start reduction without an implementation experiment.

The explicit scan does not make the server reject `/`. Vite's optimizer can register a missing bare import after a browser request; the previous report observed the production root discover `react-router-dom`, `clsx`, `image-max-url`, and `tailwind-merge` after the server was ready (`.trellis/tasks/archive/2026-09/09-10-diagnose-slow-vite-lab-loading/research/vite-lab-loading-diagnosis.md:40-56,65-70`). Thus `entries` and `open` address initial intent/ergonomics, while a manual or stale `/` tab can still mutate the shared cache unless the server is structurally made Lab-only (out of scope for this task).

### Cache swap and concurrency limitation

Vite's optimizer writes a temporary directory and swaps it into place:

- `node_modules/vite/dist/node/chunks/node.js:31652-31711` creates a per-run `deps_temp_*`, writes `_metadata.json`, renames the existing `deps` directory away, then renames the processing directory into `deps`.
- On Windows, `node_modules/vite/dist/node/chunks/node.js:32207-32224` retries `EACCES`/`EPERM` for up to five seconds, but the retry is not a cross-process lock.

This explains the boundary of a single shared Lab cache: a Lab cache path distinct from ordinary Vite prevents ordinary renderer and Lab writers from swapping the same `deps`, but two Lab instances with the same resolved `cacheDir` still have two optimizers targeting one `deps`. Different ports do not change the cache path. Two processes may succeed if they share identical metadata and timing, but the absence of a deterministic lock means “same directory name” is not sufficient evidence of safety.

If the two-Lab acceptance run exposes `EPERM`/`EACCES`, the implementation decision is technical rather than product scope: either derive a process/instance-specific cache path (and pass it consistently from the command/caller) or explicitly reject concurrent Lab instances. The PRD currently requires covering two Lab instances (`.trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/prd.md:21-27`), so a shared Lab path must not be declared complete solely because it is different from `node_modules/.vite`.

### Prior diagnosis and history

The preceding slow-start task and session history supply useful but non-equivalent measurements:

| Evidence | What it establishes | Limitation |
| --- | --- | --- |
| Active PRD baseline (`.trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/prd.md:7-10`) | User observed Vite `ready` at 390 ms while the first `/lab.html` request blocked about 26.8 s. | User-provided baseline; not independently reproduced here. |
| Prior diagnosis (`.trellis/tasks/archive/2026-09/09-10-diagnose-slow-vite-lab-loading/research/vite-lab-loading-diagnosis.md:44-56`) | Isolated Lab starts measured about 25.9 s and 39.2 s to first Lab DOM under cold/uncached transform conditions; server ready was 416/181 ms. | Different ports/processes/cache state; not a before/after result for this task. |
| Prior diagnosis (`.../vite-lab-loading-diagnosis.md:58-92`) | A settled warm Lab navigation was about 1.216 s; production `/` then introduced a ~54 s graph/optimizer wait and late production deps. | Warm result came after a production-root experiment and is environment-sensitive. |
| Repeated-refresh probe (`.../repeated-lab-refresh-white-screen.md:9-25,43-70`) | Warm cache-enabled refreshes were 99–293 ms to first workspace; cache-disabled refreshes reproduced 56–106 s waits while source transforms queued. | Cache-disabled mode is not the user's ordinary-cache baseline; no antivirus/file-writer cause was proven. |
| Live 1421 probe (`.../live-port-1421-refresh-probe.md:15-24,62-79`) | A fresh normal-cache context reached first workspace in 151/75/60 ms with one navigation each and no optimizer reload loop. | Server was already warm; it does not disprove a cold-start backlog. |
| Session history (`trellis mem extract 01a084b9-921 --grep cacheDir`) | Earlier decision was to avoid `optimizeDeps.exclude` and only consider an isolated Lab cache if simultaneous Vite processes were necessary; later history spawned this dedicated task after another 26.8 s observation. | Conversation memory is corroborating context, not runtime evidence. |

The prior diagnosis also records that no persistent Ripple/WebGL, HMR, or reload-loop defect was found (`.../repeated-lab-refresh-white-screen.md:56-70`). The current task should therefore keep its change set at the Vite boundary and preserve the existing Lab renderer.

### First visible/interactable UI evidence

`src/lab/PresentationLab.tsx:97-100` marks capture readiness after a capturable renderer frame, but the default non-capture page renders its interactive workspace and scenario buttons at `src/lab/PresentationLab.tsx:176-193,199-201`. For acceptance, record both:

1. **Visible:** first DOM timestamp for `[data-lab-workspace]` after `initializeLabI18n` completes, plus a screenshot or browser trace showing the workspace/panel and its selected scenario.
2. **Interactive:** click an enabled `[data-lab-scenario="download-queued"]` (or another registered scenario), assert the URL query changes via the History API, assert the selected scenario marker updates, and assert there is still exactly one main-document navigation. This proves the UI is not merely an HTML shell or a canvas frame.

For deterministic capture-only checks, `scripts/capture-lab-smoke.mjs:59-75` uses `data-lab-ready` and asserts one document navigation/no page or request failures. Keep that as a supplemental artifact; it does not replace the non-capture click check for user-visible interactivity.

## Minimal change recommendation

1. In the implementation task, first add only the Lab cache boundary, explicit `optimizeDeps.entries: ["lab.html"]`, and automatic `/lab.html` open behavior. Prefer the existing config/script surface (`vite.lab.config.ts` and `package.json`) and do not add dependency exclusions or a new server/root architecture.
2. Verify the resolved `cacheDir` for every process, rather than assuming the configured string. Run ordinary renderer + Lab, then two Lab instances on different ports. Treat a shared Lab path that logs `EPERM`/`EACCES` as a failed concurrency design; do not hide it with retries or by deleting caches.
3. If two Lab instances are a hard requirement, make the cache instance-specific in a follow-up implementation experiment (with an explicit caller/env contract) and record the duplicate-cache cost. If the product only needs one Lab plus ordinary dev, a shared Lab-specific path may be sufficient after a clean no-EPERM run, but this is a scope decision for the coordinator/implementation review, not something research can claim.
4. Do not pre-include production dependencies. The prior report shows that opening `/` activates a larger graph; eagerly including those packages in the Lab would make the intended Lab graph heavier and would not fix manual root navigation.

## Acceptance protocol (cold, warm, concurrent)

Use the same machine, Node/npm/Vite versions, browser profile mode, and network conditions for before/after. Store terminal logs, browser trace/HAR/screenshots, and a small timing table under a task-local evidence directory chosen by the implementation/check phase; this research pass did not create a server or evidence run.

### Cold Lab

1. Record the exact command (`npm run dev:lab` plus any host/port flags), Node/npm/Vite versions, cache path, and cache state (`_metadata.json` hash/timestamp and any `deps_temp_*`). Use a dedicated empty cache path or a documented `--force` run for a controlled cold case; do not call the existing shared cache “cold” without recording what was present.
2. Capture server timestamps for optimizer scan/bundling, Vite `ready`, `deps_temp_*` swaps, and any `EPERM`/`EACCES`/`optimized dependencies changed` messages (`DEBUG=vite:deps,vite:transform` is appropriate for a diagnostic run).
3. In a browser, navigate to `/lab.html` (not `/`) and record `responseStart`, HTML response end, `DOMContentLoaded`/`load`, first `[data-lab-workspace]`, and first successful scenario click. Save a screenshot/trace showing the visible workspace and the click/URL change. Report the first `[data-lab-workspace]`/interactive time separately from the Vite `ready` time.
4. Compare against the supplied 390 ms / 26.8 s numbers as user-provided baseline only, and against the prior reports as non-identical historical measurements. Do not claim the 26.8 s value was reproduced unless the new run actually records it.

### Warm Lab refresh

1. Keep the same Lab process and browser context; reload `/lab.html` at least twice with ordinary cache settings. Record the same visible/interactable milestones and the number of main-frame navigations.
2. Require no repeated optimizer reload/HMR transition, no continuous dependency bundling, normal scenario click behavior, and no page/request failures. A warm HTML response alone is insufficient.

### Concurrent processes

Run this matrix, with separate terminal log files and process command lines:

| Case | Processes | Required observations |
| --- | --- | --- |
| Ordinary renderer + Lab | `npm run dev:renderer -- --host 127.0.0.1 --port 1420` (or the full `npm run dev` harness) plus `npm run dev:lab -- --host 127.0.0.1 --port 1421` | Effective `cacheDir` differs after the fix; `/lab.html` remains Lab-only; both pages respond and refresh; no `EPERM`/`EACCES` or unexpected production dependency discovery in the Lab log. |
| Two Lab instances | Two `vite --config vite.lab.config.ts --host 127.0.0.1 --port <p1|p2>` processes | Record each resolved cacheDir. If they are equal, treat the run as a deliberate shared-writer stress test and inspect swap/temporary-dir logs. Both `/lab.html` pages must mount and accept a scenario click; repeat refreshes; no `EPERM`/`EACCES`, stuck transforms, or cross-instance hash/reload behavior. |
| Mixed three-process stress (optional) | Ordinary renderer + two Lab instances | Use only after the two required cases; it distinguishes an ordinary/Lab boundary fix from a two-Lab writer race. |

Keep each server's browser navigation on `/lab.html`; a root `/` navigation intentionally tests the production graph and is a separate negative control, not a Lab acceptance path.

## Docs and scope impact

The repository's public docs contract requires behavior/startup guidance changes to update `site/src/content/docs/` and run `npm run docs:build` (`.trellis/spec/frontend/docs-site.md:1-18,35-66`). The current indexed docs/README search found no public page mentioning `dev:lab`, `lab.html`, port 1421, or the Presentation Lab, so a config-only automatic open change has no identified docs page to update. If implementation adds or changes user-facing Lab startup instructions, add the relevant Chinese and English docs-site page in that task and run the docs build; do not add a new root `docs/` guide.

No product-scope decision currently requires user input. The one unresolved technical decision is whether the acceptance requirement for two Lab instances means “two instances may share one Lab cache without errors” or “each instance gets its own cache.” The implementation experiment and coordinator review should decide this explicitly; research must not silently claim that a shared `node_modules/.vite-lab` path is process-safe.

## Related specs for context manifests

These are real, existing paths suitable for `implement.jsonl`/`check.jsonl` curation:

- `.trellis/spec/frontend/index.md` — frontend stack and public docs contract index.
- `.trellis/spec/frontend/directory-structure.md:70-74` — Lab must remain a dev-only plain-browser entry through `vite.lab.config.ts`/`lab.html`, with no Electron route or desktop imports.
- `.trellis/spec/frontend/quality-guidelines.md:106-122,162-174` — frontend quality checklist and renderer asset/validation constraints.
- `.trellis/spec/frontend/docs-site.md:1-18,35-66` — docs-site trigger and `npm run docs:build` validation when startup guidance changes.
- `.trellis/spec/guides/cross-platform-thinking-guide.md:1-17,31-61` — script/path/platform review and Windows process-cleanup safety.
- `.trellis/spec/guides/code-reuse-thinking-guide.md:1-32,48-59` — search/reuse before adding configuration or helpers.
- `.trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/research/lab-cold-start.md` — this research artifact (add to manifests only if implementation/check needs its protocol and caveats).

## Caveats / Not Found

- This pass did not start Vite, open a browser, clear caches, install packages, edit product/config/spec files, or run git operations. The resolved-config and installed-Vite-source checks were read-only.
- No fresh before/after measurement exists yet. The 390 ms / 26.8 s numbers are user-provided; all other timings in this report are explicitly attributed to prior task reports and must not be presented as this task's reproduction.
- A dedicated Lab cache path isolates Lab from the ordinary renderer only if every ordinary process continues using the existing default path and no caller overrides it. It does not automatically provide per-instance locking for two Lab processes.
- `optimizeDeps.entries` controls initial dependency scanning; it does not reject requests to other HTML documents or prevent runtime discovery after a manual `/` navigation.
- `server.open` is an ergonomic browser-launch setting, not an access-control or URL-rewrite rule. Manual links/bookmarks and the Vite-printed root URL remain possible.
- The stale `deps_temp_*` directory and metadata observed under the current default cache are generated runtime state and may disappear or change before implementation; record them only as contemporaneous evidence.

