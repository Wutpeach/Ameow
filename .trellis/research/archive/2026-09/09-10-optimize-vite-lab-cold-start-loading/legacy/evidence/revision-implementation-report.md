# Revised Lab cache-isolation implementation report

Date: 2026-09-10.  Base commit: `c8b9f14c6457eb3d2fc86fc584ea94d6862db3e2` on `fix/vite-lab-cold-start` (dirty worktree preserved).

## Outcome

The approved stable-port cache isolation is implemented.  A Vite `config` hook derives the Lab development `cacheDir` from the resolved `server.port`, while the existing `strictPort: true` remains in the same server configuration.  Thus the normal interactive command reuses `node_modules/.vite-lab/1421` across restarts, whereas independently selected ports never write the same Vite `deps` directory.

The measured long cold path is **not claimed fixed**.  The isolated cold evidence shows Vite dependency optimization completing well before the interactive Lab milestone; late Vite source-transform/resource spans remain.  No dependency exclusion/pre-include, renderer/source refactor, redirect, or lock was added.

## Changed files and boundaries

- `vite.lab.config.ts`
  - Replaced the single shared Lab `cacheDir` with the native Vite `config` hook `lab-port-cache`.
  - The hook returns `<LAB_TEST_CACHE_ROOT or node_modules/.vite-lab>/<resolved server.port>` only for `serve`.
  - The pre-existing explicit `optimizeDeps.entries: ["lab.html"]` and `strictPort: true` were retained; the pre-existing npm `/lab.html` opener remains in `package.json` and was not changed in this revision.
- `scripts/capture-lab-smoke.mjs`
  - Resolves the actual Vite config for its reserved port before launch.
  - Waits for the direct Vite child to exit, then deletes only a previously absent, exact port-child cache.  An existing cache is not removed.
- `evidence/verify-vite-lab.mjs`
  - Uses the actual Lab config rather than a test config that overwrote every process with one cache directory.
  - Uses a task-owned cache **root** only for test runs, preserving the hook's real port child (`<root>/<port>`), records resolved ports/paths, Navigation Timing, optimizer/transform log spans, resource transfer sizes, screenshot evidence, warnings, and cleanup state.
  - Adds the previously missing two-Lab concurrent refreshes.  The exact React unsupported-style message is retained as a recorded warning; page errors, failed requests, HTTP >=400 responses, and other console errors still fail the check.
- Deleted task-local `evidence/vite-lab-test.config.mjs`; its single-directory override is no longer valid.

No production entry, renderer, package dependency, documentation site, or user-owned cache was changed.  Public docs are not applicable because no public Lab workflow is documented or changed.

## Verified Vite lifecycle and cache mappings

Installed Vite source was inspected before the config change:

1. `dist/node/cli.js:700-720` passes CLI `--port` as `inlineConfig.server.port` to `createServer`.
2. `dist/node/chunks/node.js:34455-34490` merges the config file with that inline config and then invokes plugin `config` hooks.
3. `dist/node/chunks/node.js:34583-34589` resolves `cacheDir` after those hooks, before server/optimizer startup.

The focused resolved-config assertion also passed for ports 1421 and 55321:

| Caller / case | Effective port | Effective cacheDir | Result |
| --- | ---: | --- | --- |
| Normal `dev:lab` config | 1421 | `D:/Ameow/node_modules/.vite-lab/1421` | Stable cache identity; `strictPort: true` |
| Resolved CLI-style override | 55321 | `D:/Ameow/node_modules/.vite-lab/55321` | CLI port reaches the hook |
| Isolated cold/warm acceptance | 63421 | `.../runs/after-2026-09-10T13-25-51-214Z/lifecycle-cache/63421` | Empty before force; `deps` observed before shutdown; port child removed after exit |
| Forced two-Lab writer test, first | 57254 | `.../runs/after-2026-09-10T13-27-10-823Z/two-lab-cache/57254` | Distinct child; passed |
| Forced two-Lab writer test, second | 57262 | `.../runs/after-2026-09-10T13-27-10-823Z/two-lab-cache/57262` | Distinct child; passed |
| Direct capture | 49589 | `D:/Ameow/node_modules/.vite-lab/49589` | Five screenshots; exact child cleaned after Vite exit |
| npm opener exercise | 53203 | Task-owned `.../open-cache/53203` | Opened `http://127.0.0.1:53203/lab.html`; child cleaned |

The empty task cache-root directories remain as run evidence, but their port cache children are absent after the successful processes exit.  `--cleanup-self-check` also verified its owned npm/Node process tree exited (`16132`, `3396`, `58000`) and that a failed Vite startup cleans up its registered run.  No command targeted PID 36856 or port 64699.

## Browser and concurrency evidence

Environment for the retained browser evidence: Node `v22.17.1`, npm `11.13.0`, Vite `8.0.16`, Chromium `148.0.7778.96`, headless Playwright viewport `1440x1000`, normal browser cache policy (no routing or cache-disable call).

### Matched isolated cold and normal-cache reloads

`runs/after-2026-09-10T13-16-05-776Z/` is the pre-port-revision isolated source/config observation.  It reached visible/interactive at 28,018/28,329 ms after navigation; Vite logged `dependencies optimized` at 9,482 ms after process launch.  Its late trace contains transform completions around the workspace milestone.

The post-port-isolation cold and two normal-cache reloads are retained in `runs/after-2026-09-10T13-25-51-214Z/` (`result.json`, `lifecycle.log`, `cold.png`, `warm-1.png`, `warm-2.png`):

| Visit | Visible ms after navigation | Interactive ms after navigation | Notes |
| --- | ---: | ---: | --- |
| Forced isolated cold | 20,488 | 20,808 | `responseStart`/`responseEnd`: 391.6/392.3 ms; Vite ready log: 297 ms; `dependencies optimized`: 5,040 ms after process launch |
| Normal-cache reload 1 | 9,193 | 9,263 | Scenario and URL transition asserted |
| Normal-cache reload 2 | 25,884 | 26,155 | Scenario and URL transition asserted |

Both warm resource tables contain 10 zero-transfer resources of 77, which is browser cache-transfer evidence; the full per-resource Navigation/Resource Timing records and Vite request/transform spans are in `result.json`/`lifecycle.log`.  The rendered workspace and preview stage had to be visible and fully in the 1440x1000 viewport before interaction.  The only recorded browser warning was:

```text
Unsupported style property %s. Did you mean %s? -electron-corner-smoothing ElectronCornerSmoothing
```

It is included in every result rather than suppressed.  There were no asserted page errors, failed requests, HTTP >=400 responses, or other console errors.

These cold runs are controlled isolated observations, not a sound before/after performance claim: process scheduling and machine load varied.  The isolated evidence nevertheless locates the slow region after optimizer completion in source/resource transform work.

### Concurrent cases

- Forced two-Lab concurrency (`runs/after-2026-09-10T13-27-10-823Z/`): both ports began forced optimization under distinct task-owned port children; both mounted and interacted.  Cold visible times were 30,455 ms (57254) and 31,478 ms (57262).  Each page then completed two concurrent normal-cache reloads: 12,621/39,304 ms and 14,484/1,280 ms respectively.  Logs contain no `EPERM`, `EACCES`, missing optimized module, or optimizer-not-found match.
- Ordinary Vite plus Lab (`runs/after-2026-09-10T13-29-08-651Z/`): ordinary Vite used `D:/Ameow/node_modules/.vite`; Lab used the isolated task path ending in `/56873`; the ordinary page and its reload returned HTTP 200, and Lab mounted/interacted without cache errors.  This mixed-load Lab navigation was 146,445 ms to visible / 146,743 ms to interaction, with 17.8 s HTML response start and long later resource spans.  It is evidence of a remaining performance bottleneck under concurrent transform load, not a cache-collision failure and not a reason to expand beyond the approved Vite/capture scope.
- npm opening behavior: `runs/after-2026-09-10T13-29-08-651Z/npm-dev-lab-open.txt` records `/lab.html`.  The npm `dev:lab` script retains the pre-existing script-only opener, so direct capture does not open an extra browser.

Direct capture produced the five expected images in `evidence/capture-after-port-scope-direct/`; its terminal log explicitly confirms cleanup of `/49589`.  The npm `lab:capture` caller also completed and cleaned `/65457`; npm 11 consumed `--output` as its own unknown config option in that invocation, so the direct capture command was used to retain the task-local output evidence.

## Commands and static checks

```text
node --input-type=module -e "... resolveConfig({ configFile, server: { port } }) ..."
npm run lab:capture -- --output .trellis/tasks/.../evidence/capture-after-port-scope
node ./scripts/capture-lab-smoke.mjs --output .trellis/tasks/.../evidence/capture-after-port-scope-direct
node .trellis/tasks/.../evidence/verify-vite-lab.mjs --phase after --lifecycle-only --force
node .trellis/tasks/.../evidence/verify-vite-lab.mjs --phase after --two-lab-only --force
node .trellis/tasks/.../evidence/verify-vite-lab.mjs --phase after --ordinary-lab-only
node .trellis/tasks/.../evidence/verify-vite-lab.mjs --cleanup-self-check
node --check scripts/capture-lab-smoke.mjs
node --check .trellis/tasks/.../evidence/verify-vite-lab.mjs
npx eslint vite.lab.config.ts scripts/capture-lab-smoke.mjs .trellis/tasks/.../evidence/verify-vite-lab.mjs --no-ignore
npm run lint
npm run type-check
git diff --check -- vite.lab.config.ts scripts/capture-lab-smoke.mjs
```

All commands above passed.  `npm run lint` intentionally covers its repository-configured `src`/`vite.config.ts` target; the extra ESLint command covers the modified config/capture/evidence files.

Exact source hashes at report time:

```text
vite.lab.config.ts                                      2FD294956A2F2E0E170919B39DCC1D6A58EF4EE989CF37D6B08BDA2A0E7A8DC1
scripts/capture-lab-smoke.mjs                           5F593083BC75604672E61736AC5AA95B66E952AC1735EB631226FE2D94502B9D
evidence/verify-vite-lab.mjs                            A9F95950FBCF6C36350A719C67FD9112D246F72FB32034C1AF1D830F63AFF86F
```

## Remaining limitation

Port-scoped cache isolation removes the demonstrated two-Lab `deps` swap collision.  It does not reduce the independently measured Lab source/resource transform backlog, which remains severe under the mixed ordinary-plus-Lab run.  Any renderer, dependency-graph, pre-bundle, redirect, or profiling-product change requires a separate measured design decision; none is implemented here.
