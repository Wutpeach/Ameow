# Lab native watcher exclusions: implementation evidence

2026-09-10. Orca Task `task_8bb7d0bb17f6`, Dispatch `ctx_83dfd91252a1`.

## Outcome

**Scoped implementation and Lab runtime gates passed.** The matched isolated cold navigation reached visible preview in **1.138 s**, versus **28.851 s** before watcher exclusions. Ordinary cached reloads improved from **22.728 / 17.875 s** to **0.209 / 0.076 s**. Source CSS HMR reached the browser in **22 ms**. A normal same-port process restart reused unchanged optimizer metadata. Distinct-port two-Lab and ordinary-Vite-plus-Lab runs performed genuinely overlapping dependency bundling, served Lab, and refreshed both Lab instances without cache permission errors, missing dependencies, or unexpected document reloads.

Only the `server.watch.ignored` block in `vite.lab.config.ts` is a new product/config change in this dispatch. Existing port-scoped caches, explicit Lab scan, npm opener, renderer/dependencies, production config, and capture script were preserved. No commit, spec, task-planning or public-docs changes were made. Coordinator review and any final commit remain coordinator-owned.

The ordinary production entry still has slow work and Electron-bridge-unavailable errors when visited in plain Chromium. Its HTTP-200 document load and refresh passed; this is **not** a claim of fully functional Electron UI or a production-server performance fix. Details and the accidental capture-output destination are recorded below.

## Exact exclusions and import evidence

The config maps these literal directory names to absolute, forward-slash native watcher globs rooted beside `vite.lab.config.ts`: `D:/Ameow/<directory>/**`. They are root-specific paths, not a global `src`, dependency, polling, or HMR-disable rule.

| Excluded actual root under `D:\Ameow` | Observed native registrations in first 15.810 s sample | Observed watched directory keys | Reason / concrete observed children |
| --- | ---: | ---: | --- |
| `.cindy-worktrees` | 4,122 | 530 | Nested checkouts and `.orca-worktree-trash/wt-1788999275754-8564c988`; not the active Lab source |
| `.cindy-upstream` | 227 | 50 | Separate `bible-strong-avatar-lab-175691a` upstream checkout |
| `.p2v-release-evidence` | 2,203 | 253 | Packaging fixtures, installed profiles, builder cache and temporary release output |
| `.trellis` | 5,171 | 768 | Task evidence, workflow/scripts and dated workflow backups; 3,405 sampled paths in `.trellis/tasks` alone |
| `desktop-assets` | 4,662 | 234 | Prepared native runtime binaries; 4,650 sampled registrations under `desktop-assets/binaries` |
| `build` | 2,475 | 204 | Generated build/test output; 2,287 sampled paths in `build/python-runtime-manual` |
| `dist-release` | 876 | 50 | Packaged installers and portable output; 791 sampled paths in `dist-release/portable` |
| `agentation-placement-package-output` | 161 | 16 | `win-unpacked` generated application/resources; the intermediate sample reached 3,763 registrations / 288 directories |
| `spike-package-output` | 162 | 16 | `win-unpacked` generated application/resources; the intermediate sample reached 3,992 registrations / 313 directories |

`watcher-registrations-before.json`, `watcher-registrations-after.json`, and `watcher-registrations-after-final.json` retain **every sampled actual registration path**, top-level counts/examples, and the actual `server.watcher.getWatched()` map. These are observed partial samples rather than guessed directory names or filesystem-wide enumeration totals. The first seven exclusions exposed the two remaining package-output roots more fully; their measured extra 7,755 registrations justified adding those exact roots before the final browser comparison. No broader exclusion followed merely from a directory name.

Read-only FFF searches were used for candidate/path references. Because its `src/` constraint also returned nested-checkout source, the decisive import evidence comes from the finite active-entry traversal in `lab-inputs.mjs`. Starting at the actual `lab.html` entry `src/lab/lab-main.tsx`, TypeScript's existing import parser/resolver found **97 local files**, **zero unresolved local imports**, and only the top-level roots **`src` and `locales`**. It includes conservative type-only paths and imported assets, and skips parsing JSON/CSS/image bodies as TypeScript. Full edges, exact paths and SHA256 values are retained in `lab-inputs-before.json`.

The bootstrap imports `ThemeContext`, `PresentationLab`, Lab i18n, URL state and Lab CSS; Lab i18n uses the shared statically bundled locale resources. The Lab CSS contains no additional stylesheet imports or root-directory references. Config review verified no Lab alias/plugin points into the excluded roots. All 97 input hashes were checked unchanged after experiments. The final native registration list explicitly still contains `src`, `locales`, `public`, `public/vite.svg`, `lab.html`, `vite.lab.config.ts` and `postcss.config.js`. Other config files and actual source remain watched. `site`, `dist-electron`, `dist-scripts`, extension source, and other smaller trees were left alone.

## Watcher observations and bounded recovery

| Sample | Sampling elapsed | Native registration attempts / unique paths | Actual watched directory keys | Actual watched entries |
| --- | ---: | ---: | ---: | ---: |
| Before | 15.810 s | 21,570 / 21,570 | 2,366 | 21,577 |
| Seven exclusions, intermediate | 15.181 s | 9,468 / 9,468 | 882 | 9,468 |
| Final nine exclusions | 15.178 s | 1,713 / 1,713 | 281 | 1,713 |

All nine excluded roots have **zero registration paths and zero watched directory keys** in the final sample. These snapshots establish a much smaller observed native watcher footprint (about 92% fewer registrations in comparable short samples). The baseline enumeration was intentionally bounded, so 21,570 is not the total it would eventually register. Counts include files and directories and should not be described as a count of directories only. Before/after sampling is separate from browser timing; none of the counting hooks ran during the performance comparison.

The retained `watcher-registrations.mjs` installs a task-local `fs.watch` counter before dynamically importing Vite. It synchronously checkpoints the path summary before every 500th native call, snapshots after roughly 15 seconds, and closes its server. Its **parent process** owns a 45-second external deadline and the exact child PID; cache roots are exclusively created under `node_modules/.vite-lab/watcher-sample-*`. All three bounded samples closed naturally (`forced: false`), with child PIDs **37880, 53304, 53908** proven absent and exact cache roots removed. `watcher-registrations-*-cleanup.json` records those facts. The final config snapshot is `watcher-registrations-after-final-config.ts`.

Before that recovery, an initial combined inventory/import probe was unsuccessful. PID **12452** reached approximately **149,016 process handles** and had not persisted its footprint after more than five minutes; the in-process deadline did not bound initialization/cleanup. It was identity-checked against its exact Node command and stopped. A second short recovery invocation (retained empty/early snapshot `watcher-before.json`, only the config file registered at 67 ms) was stopped after the coordinator directed the pre-import native counter. That early snapshot is **invalid as a complete watcher footprint** and is not used in the table. Its exec session finished with exit 1. The unsafe combined probe source was removed, and import analysis was separated into the finite synchronous read-only traversal described above.

The coordinator explicitly reviewed the escalation and authorized this bounded recovery (`msg_1789d194ec95`; Delivery `delivery_638f0e56d5f7` processed and acknowledged). The initial two exclusively created empty roots, `watcher-5Kd6nj` and `watcher-29LR5c`, were subsequently checked to have the exact `.vite-lab` parent and zero children, then removed **non-recursively**. Their creation times match the two probe invocations; the latter path is also recorded in the early snapshot. Neither contained data. No existing user cache, PID **36856**, or port **64699** was inspected, stopped, or modified.

## Matched sequential browser comparison

Commands from `D:\Ameow`:

```text
node .trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/lab-inputs.mjs
node .trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/watcher-registrations.mjs before
node .trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/verify-vite-lab.mjs --phase before --lifecycle-only
node .trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/watcher-registrations.mjs after
node .trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/watcher-registrations.mjs after-final
node .trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/verify-vite-lab.mjs --phase after --lifecycle-only --hmr-restart
```

Each command finished before the next performance command. Lint/type-check started **after** all performance, concurrency, and capture experiments completed. No claim of machine-wide idleness is made.

- Windows; Node **v22.17.1**, installed Vite **8.0.16**, Chromium **148.0.7778.96**.
- Headless Chromium started before each server; viewport **1440 × 1000**, scale 1. Normal browser cache: no request routing, no cache-disable commands.
- TCP-only readiness; no HTML prefetch; `BROWSER=none` during measurements; direct navigation to `/lab.html?scenario=compact-pointer`.
- Same runner source snapshot and logging policy (`DEBUG=vite:deps`) for the matched before/after visits. No broad transform logging or CPU profiler. All non-Lab-config hashes in the per-run snapshot match between runs.
- Both isolated cold runs use previously absent exclusive cache roots in **`node_modules/.vite-lab/verify-*/lifecycle/<port>`**, and neither uses `--force`. This preserves normal dependency-path exclusions. Every port remains distinct. Actual resolved paths, pre-start absence, logs, source snapshots, runner snapshot and browser evidence are retained per run.

| Visit | Ready log from process launch | HTML first byte / end from navigation | DOMContentLoaded | Preview visible | Scenario interaction complete |
| --- | ---: | ---: | ---: | ---: | ---: |
| Before cold | 0.263 s | 0.2932 / 0.2936 s | 28.688 s | **28.851 s** | 29.175 s |
| Before normal refresh 1 | same server | 0.5862 / 0.5869 s | 22.450 s | 22.728 s | 22.795 s |
| Before normal refresh 2 | same server | 17.6603 / 17.6608 s | 17.798 s | 17.875 s | 18.100 s |
| After cold | 0.262 s | 0.2201 / 0.2206 s | 1.047 s | **1.138 s** | 1.301 s |
| After normal refresh 1 | same server | 0.0036 / 0.0039 s | 0.044 s | 0.209 s | 0.252 s |
| After normal refresh 2 | same server | 0.0029 / 0.0031 s | 0.043 s | 0.076 s | 0.227 s |
| Same-port new process, reused optimizer cache | 0.239 s | 0.2757 / 0.2761 s | 1.007 s | 1.103 s | 1.374 s |

Process-launch-to-visible was **29.265 s before / 1.487 s after**. The same-port restarted process took **1.372 s** to visible. These differ from navigation-to-visible because process startup and context/page setup precede navigation. Ready time alone remained essentially unchanged and is not used as a success proxy.

Both cold visits recorded 77 resources and zero zero-transfer resources; each ordinary reload recorded 77 resources with 10 zero-transfer resources. Each result retains individual requestStart, responseStart, responseEnd, transfer size and Navigation Timing fields. Cache-enabled reload behavior is therefore directly observable. The new-process restart reused the optimizer disk cache but transferred browser resources again; it is not presented as a browser-memory-cache hit.

Every Lab cold/reload visit asserts visible workspace and preview stage, positive bounds completely inside the viewport, actual scenario transition plus matching URL query, HTTP 200 and exactly one document navigation. Screenshot inspection confirms a real desktop preview in the stage. Screenshots occur after scenario interaction; the visible milestone is observed layout visibility, **not an exact compositor-paint timestamp**. The only allowed console error is the exact pre-existing React message:

```text
Unsupported style property %s. Did you mean %s? -electron-corner-smoothing ElectronCornerSmoothing
```

It remains separately recorded in each result. All other Lab console/page/request failures and HTTP >=400 responses fail the shared visit assertion. No warnings were broadened or suppressed in this dispatch.

### Source HMR and restart

The runner exclusively created `src/lab/__watcher_probe_53265.css`, dynamically imported it in the existing page, and confirmed its initial CSS custom property. It compared the exact current bytes before changing the property from `before` to `after`, then awaited the browser's computed style. The observed update took **22 ms**. Cleanup compared expected bytes again and removed only that exact fixture; its absence was independently asserted later. No existing source file was edited or reverted. This demonstrates real **source CSS HMR**; it is not a separate React Fast Refresh state-preservation test.

The same Lab port **53265** was then restarted normally, without force or a cache clear. Before/after `_metadata.json` bytes **and mtime** were equal; the new log states `Hash is consistent. Skipping`. Both processes used `node_modules/.vite-lab/verify-PpSMWg/lifecycle/53265` as recorded in the run's config. The result's `restart` object retains the exact metadata SHA256 and new command. Cleanup removed the exclusively owned root only after the restarted process stopped.

## Concurrent real optimizer work

```text
node .trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/verify-vite-lab.mjs --phase after --two-lab-only
node .trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/verify-vite-lab.mjs --phase after --ordinary-lab-only --skip-open
```

| Case / page | Actual cache child under `node_modules/.vite-lab` | Cold visible / interactive | Normal reload visible (two visits) |
| --- | --- | ---: | ---: |
| Two Lab, first port 64465 | `verify-KfwZzL/two-lab/64465` | 1.042 / 1.232 s | 0.306 / 0.117 s |
| Two Lab, second port 64471 | `verify-KfwZzL/two-lab/64471` | 1.404 / 1.591 s | 0.312 / 0.117 s |
| Mixed, Lab port 55900 | `verify-ZAl0Jv/ordinary-lab/55900` | 1.515 / 1.688 s | 0.385 / 0.167 s |
| Mixed, ordinary port 55894 | `verify-ZAl0Jv/ordinary/55894` | HTTP-200 document and refresh passed | Full Electron interactions not claimed |

Every concurrent server started with `--force` against an absent exclusive cache. Ordinary Vite uses a task-local wrapper importing the unchanged production config and replacing only its cache path with the owned node_modules path. This avoids forcing or deleting the live default `.vite` cache. It retains ordinary plugins, inputs and watcher behavior; no production source/config was changed. Actual commands/config snapshots are stored even before startup succeeds.

Both pairs' logs show real scan, bundling, metadata creation and rename. Overlap was independently asserted from Vite's logged bundling completion timestamp minus its logged bundling duration:

- Two Lab: first bundling approximately `14:20:15.522Z–14:20:16.075Z`, second `14:20:15.963Z–14:20:16.472Z`; **112 ms overlap**.
- Mixed: ordinary bundling approximately `14:20:34.367Z–14:21:24.040Z`, Lab `14:20:33.991Z–14:20:34.654Z`; **287 ms overlap**.

These are overlapping elapsed optimizer-work windows, not CPU parallelism estimates. Both Labs were actually navigated concurrently, and each was refreshed twice. Mixed Lab and ordinary initial navigations also overlapped, with two Lab refreshes after the ordinary document refresh. All relevant Lab pages passed the same error/scenario/URL/navigation assertions. Logs contain no EPERM, EACCES, missing optimized modules or cache rename failures.

The unchanged ordinary production server reported about **49.673 s bundling elapsed** and numerous `Ameow Electron bridge is unavailable` errors in the plain browser. Those lines are retained unsuppressed in `ordinary-vite.log`; the ordinary page is intentionally checked only for document load/refresh, not desktop capability correctness. This dispatch's performance result applies to Lab, including Lab while that ordinary work is active.

## Opener, direct capture and cleanup

The existing successful npm opener evidence at `runs/after-2026-09-10T12-30-50-859Z/result.json` is reused, together with fresh assertions that `dev:lab` remains exactly `vite --config vite.lab.config.ts --open /lab.html`, shared `server.open` resolves false, entries remain `['lab.html']`, default strict port remains 1421 and default cache resolves to `.vite-lab/1421`. No additional opener test was necessary; capture script SHA256 still equals the independent check's value.

Fresh direct capture succeeded for all five existing scenarios:

```text
node scripts/capture-lab-smoke.mjs --output .trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/watcher-capture
```

`watcher-capture.log` retains its Vite startup, output directory and exact owned port-cache cleanup (**61216**). The five PNGs are in `watcher-capture/`. Capture keeps its existing prefetch and capture-mode assertions, so none of its time is called a cold baseline. Shared config does not open another browser.

**Incidental generated-output change:** the preceding attempt used `npm run lab:capture -- --output <task directory>`. In this PowerShell/npm invocation npm consumed `--output` and printed its argument warning, so capture successfully refreshed the five existing generated PNG destinations under **`docs-screenshot-captures/lab/`** instead of the task-local path. The exact capture cache **59368** was cleaned. This is recorded rather than hidden or reverted; those generated PNGs are outside the intended evidence directory and should not be included in a source commit. The direct Node invocation above fixed the destination. The capture script itself was not changed.

All four browser-run `cleanup.json` files assert empty owned-run registries and removal of their unique `verify-*` cache root; a later read-only check confirmed those roots absent. The corrected runner retains exact child-tree stop/await behavior. Its fresh `--cleanup-self-check` proved fixture PIDs **34436, 43836, 54648** absent, rejected intentional startup failure and left no owned run. The check also used a new unique cache root and cleaned it. Capture's existing validated cleanup guards were reused unchanged. The only explicit removals outside normal runtime cleanup were the two empty failed-probe roots noted above and the exact temporary HMR file; none held user data.

## Verification, evidence index and hashes

Performance/capture finished before these checks:

```text
npm run lint
npm run type-check
node node_modules/eslint/bin/eslint.js vite.lab.config.ts .trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/verify-vite-lab.mjs .trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/watcher-registrations.mjs .trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/lab-inputs.mjs --no-ignore
node --check .trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/verify-vite-lab.mjs
git diff --check -- vite.lab.config.ts
node .trellis/tasks/09-10-optimize-vite-lab-cold-start-loading/evidence/verify-vite-lab.mjs --cleanup-self-check
```

All passed, exit 0. Repository lint and frontend/Electron type-check logs are `watcher-lint.log` and `watcher-type-check.log`. Fresh read-only assertions also checked the default opener/cache contract, HMR fixture absence, all 97 input hashes, required watcher roots, zero excluded final roots, each run's cleanup, matching non-config baseline hashes, and positive real bundling overlap. No docs build applies to this internal development configuration change.

Raw browser run directories:

| Evidence | Directory under `evidence/runs/` |
| --- | --- |
| Real unchanged-config baseline | `before-2026-09-10T14-16-52-510Z` |
| Final config, HMR, normal restart | `after-2026-09-10T14-19-47-660Z` |
| Two Lab forced optimization | `after-2026-09-10T14-20-14-221Z` |
| Ordinary + Lab forced optimization | `after-2026-09-10T14-20-32-261Z` |

Each includes `result.json`, logs, screenshots, `server-<port>.json`, `source/`, `source-hashes.json`, `runner-snapshot.mjs` and `cleanup.json` as applicable. The real baseline config snapshot is `runs/before-2026-09-10T14-16-52-510Z/source/vite.lab.config.ts`. `watcher-summary.json` consolidates the exact timings, watcher counts, asserted overlap, environment and final source hashes. Original historical runs and CPU profile were not edited.

SHA256 identities:

```text
baseline vite.lab.config.ts   2fd294956a2f2e0e170919b39dcc1d6a58ef4ee989cf37d6b08bda2a0e7a8dc1
final vite.lab.config.ts      9bdbad5baf2a609b332f839b5e699811473819639f2b31515dac019af1af3296
capture-lab-smoke.mjs         929552cef234c1d6c317630355e9fe23c0aa12ca1e05d3b1efce4974d74c1225
verify-vite-lab.mjs           fcc0bf5080aee24caf0d15c023a260cef86e54d3c4aafc0fcc1fe2c31b1a9ce8
watcher-registrations.mjs     54ebb4864b710b70ef8f7c519eed2aaf047b8f191ba6d856ba8fc1c5f7ece79a
lab-inputs.mjs                2134d833b8f5611aebb4175b55c3196531f2f132fe3f5937c04cca4adb35a17f
```

Modified source responsibilities in this dispatch: `vite.lab.config.ts`; task-local `verify-vite-lab.mjs`; new `watcher-registrations.mjs`, `lab-inputs.mjs`, this report and their generated evidence. The runner changes move all owned cache roots under node_modules, preserve distinct port children and cleanup guards, add matched snapshots/resource timings, mixed Lab reloads, simultaneous navigations and optional CSS HMR/same-port restart checks. No installed dependency was added.

## Limits for coordinator review

- Single sequential before/after pair, not a statistical benchmark. File-system/machine activity outside this task was not controlled. The large observed difference plus bounded native-path evidence supports this watcher-boundary remedy; it does not quantify antivirus or pure CPU cost. No full CPU reprofile was needed.
- The original port-only cache identity still assumes fixed positive ports, the normal loopback host and strict-port behavior. The previously reported host override / port 0 / strictPort override limitations were not broadened or repaired in this watcher-only dispatch.
- Inventory before is partial; screenshot visibility is a layout observation; source HMR is CSS; ordinary plain-browser checks are document-level. These limits must remain attached to the respective claims.
- Windows execution was validated. Forward-slash absolute glob construction is portable by design, but macOS/Linux runtime tests were not run.
- The exact known Lab style warning and ordinary missing-Electron-bridge errors remain visible in evidence. They were not fixed, generalized into warning exceptions, or used to mask cache errors.
