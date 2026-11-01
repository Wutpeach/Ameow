# Final independent gate

2026-09-10. Task `task_a0eb97ab4a8e`; Dispatch `ctx_bc7dc72648b5`.

**PASS for the requested default loopback / fixed positive distinct-port / strictPort flow.** The retained matched experiment demonstrates removal of the reproduced long Lab wait; warm refresh, real concurrent optimization, scenario interaction, CSS HMR, restart reuse and capture gates pass. No product fix was needed by this checker. This verdict supersedes earlier performance failures for the final source below, without changing those historical reports or claiming arbitrary-interface/API override support.

## Findings (fixed)

None. This dispatch changed only this report. Product source remains `package.json`, `vite.lab.config.ts`, and `scripts/capture-lab-smoke.mjs` as already implemented; unrelated worktree changes were preserved. No commits, specs, plans or public docs were edited.

## Independent source and evidence checks

- Read the assigned check manifest, task requirements/design/execution record, relevant specs, earlier cleanup/revision audits, final implementation report and raw evidence. Reviewed the complete capture and acceptance-runner lifecycle paths.
- Independently repeated the TypeScript local-import traversal from the actual `lab.html` module entry. It reproduced exactly **97 files**, no unresolved relative imports, and the same retained file list/hashes. Live local roots are `src` and `locales`. The finite traversal includes type imports and imported assets; it is not a universal analyzer for arbitrary computed imports. The current entry, stylesheet and config do not route assets into excluded roots.
- Resolved and compared all nine literal absolute normalized globs: `.cindy-worktrees`, `.cindy-upstream`, `.p2v-release-evidence`, `.trellis`, `desktop-assets`, `build`, `dist-release`, `agentation-placement-package-output`, `spike-package-output`, each exactly `D:/Ameow/<root>/**`. None intersects the 97 inputs. These are native Vite watch exclusions; no global source/dependency exclusion or HMR disable was introduced.
- Checked raw final registration paths: zero paths in all nine excluded roots; `src`, `locales`, `public`, `public/vite.svg`, `lab.html`, `vite.lab.config.ts`, and `postcss.config.js` remain registered. Partial native samples are **21,570 → 1,713 registrations**, with **2,366 → 281 watched directory keys**. The baseline is bounded, not a complete filesystem count. This supports the watcher remedy without asserting CPU cost or antivirus causality.
- Independently read installed Vite 8.0.16: CLI passes options through `inlineConfig.server`; file and inline config merge before `runConfigHook`; absolute cache resolution follows that hook. Fresh `resolveConfig` assertions passed for default 1421, repeated 1421, 55321 and 55322, each strict and mapped to its own `.vite-lab/<port>`. Default host is `127.0.0.1`, shared open is false, and entries equal `['lab.html']`. `package.json` has the exact `/lab.html` opener; direct capture has no open argument.
- Verified SHA256 of every retained source snapshot against its manifest, identical non-Lab-config hashes between the four runs, and identical runner snapshots matching current source. Both measured cold runs used absent exclusive caches under `node_modules/.vite-lab/verify-*/lifecycle/<port>`, no force, TCP-only readiness, no HTML prefetch, normal browser caching and the same logging policy. Baseline config hash is `2fd294956a2f2e0e170919b39dcc1d6a58ef4ee989cf37d6b08bda2a0e7a8dc1`; its difference from the final config is the watcher exclusions.

## Runtime evidence accepted

Windows / Node 22.17.1 / Chromium 148.0.7778.96; viewport 1440×1000. Directly checked `watcher-summary.json` against the raw results and optimizer logs. Run directories under `evidence/runs/`:

| Gate | Run | Result |
| --- | --- | --- |
| Matched baseline | `before-2026-09-10T14-16-52-510Z` | Navigation-to-visible 28.851 s; interactive 29.175 s; warm visible 22.728 / 17.875 s |
| Final isolated | `after-2026-09-10T14-19-47-660Z` | Navigation-to-visible 1.138 s; interactive 1.301 s; warm visible 0.209 / 0.076 s |
| Two Lab forced | `after-2026-09-10T14-20-14-221Z` | Ports 64465/64471, distinct sibling caches; both initial visits and two refreshes each pass |
| Ordinary + Lab forced | `after-2026-09-10T14-20-32-261Z` | Ports 55894/55900, distinct caches; both document loads, ordinary refresh and two Lab refreshes pass |

Process-launch-to-visible is separately **29.265 → 1.487 s**. Ready logs are 263/262 ms and do not establish UI readiness. Cold HTML response start/end is 293.2/293.6 ms before and 220.1/220.6 ms after; DOMContentLoaded is 28.688/1.047 s. Do not relabel DOMContentLoaded as HTML response or the navigation milestone as process startup.

Raw bundling timestamps independently yield **112.44 ms two-Lab overlap** and **287.48 ms mixed overlap**. All four concurrent servers use force with initially absent owned cache paths; this is actual overlapping optimizer work, not a warm read-only inference. No EPERM/EACCES/missing optimized module failures appear. Mixed ordinary Vite is wrapped only to redirect its cache into an owned path; production config remains unchanged.

Every Lab visit shares workspace/stage visibility, stage-in-viewport, HTTP 200, real scenario plus URL change, and one-document-navigation assertions. The inspected final cold screenshot contains the stage and desktop preview. Its screenshot follows interaction; the timed visibility is an observed layout milestone, **not first compositor paint**. The single sequential pair is not a statistical benchmark or proof of machine-wide idleness.

Final CSS HMR reached computed style in 22 ms. Its exclusively created `src/lab/__watcher_probe_53265.css` is absent; the runner checks expected bytes before removing it. Normal restart on 53265 preserved optimizer metadata bytes and mtime and logged `Hash is consistent. Skipping`; restarted navigation-to-visible was 1.103 s. This proves CSS HMR and optimizer disk reuse, not React state-preserving Fast Refresh or browser-memory-cache reuse.

Direct capture log confirms five successful scenarios and cleanup of cache 61216. Capture prefetches HTML and is supplemental rendering evidence, never the cold benchmark.

## Cleanup and failure review

Capture resolves the actual port cache, preserves preexisting caches and any inherited test-root override, validates an exact absolute positive-port deletion target, and awaits child exit before deletion. Spawn rejection is observed; readiness fetches have a bounded abort; browser and output failures reach `finally`; shutdown failure prevents cache removal. A fresh `node scripts/capture-lab-smoke.mjs --cleanup-self-check` passed preservation, wrong-parent rejection, child exit, removal and failed spawn, removing only newly created cache **59659**.

The acceptance runner registers owned children immediately, catches failed startup, stops live Windows child trees with exact PID `/T`, awaits exit, and attempts remaining owned runs in outer cleanup. Deletion is bounded by the exclusively created `verify-*` root and initial absence. All four retained cleanup records have zero owned runs and their exact roots are currently absent. Retained cleanup self-check evidence already covers npm descendants and intentional Vite startup failure; no expensive matrix was repeated. External hard termination cannot run finally blocks; reserve-then-close port selection is not an interprocess lock. These acknowledged abnormal/racing conditions do not expand the supported distinct-port flow.

## Findings (not fixed) and explicit limits

- **Minor evidence-runner flag inconsistency:** `--ordinary-lab-only --skip-open` still calls `verifyOpenTarget` unconditionally. Raw mixed result actually includes a successful npm open at **52450**, URL `http://127.0.0.1:52450/lab.html`, after the mixed measurements. Thus there is fresh opener evidence, despite the implementation report describing only reuse of old opener evidence. It uses the recorder, not an uncontrolled visible browser, and does not invalidate timings. No source change was necessary for this final gate; honor this flag locally if the runner is reused. Preserve current snapshot identity.
- Port-only identity assumes fixed positive ports on the normal loopback host with strict-port binding. Same-port distinct interfaces, port 0, explicit `strictPort:false`, arbitrary API cache overrides and caller-chosen test roots are not universally isolated. The environment variable is a root with a port appended and supersedes inline cacheDir. These are documented limits, not blockers for the requested flow; no new validation/API restrictions were added.
- Exact known React console error remains classified and retained as a warning: `Unsupported style property %s. Did you mean %s? -electron-corner-smoothing ElectronCornerSmoothing`. Every other Lab console/page/request error and HTTP failure still fails. The classification does not repair that preexisting style.
- Ordinary browser logs retain missing Electron bridge errors and slow ordinary bundling. The mixed gate establishes document load/refresh and Lab health, not functional Electron desktop UI or ordinary-server performance.
- Windows runtime evidence only; normalized path construction is portable in form, not a macOS/Linux runtime result. Initial watcher inventory failure and previous failed performance experiments remain historical limitations, not passing evidence.

## Verification and source-commit impact

Fresh checks after performance work: `npm run lint` **pass**, `npm run type-check` **pass**, targeted ESLint of config/capture and all three task-local runtime sources with `--no-ignore` **pass**, capture and runner `node --check` **pass**, capture cleanup self-check **pass**, and `git diff --check -- package.json vite.lab.config.ts scripts/capture-lab-smoke.mjs` **pass**. Repository lint alone does not cover these task scripts; the explicit lint does. The read-only Node assertions above also passed for hashes, traversal, default/positive-port configuration, raw overlap, live watch paths and cleanup.

The five incidental `docs-screenshot-captures/lab/*.png` are valid 480×480 PNGs, untracked and ignored by `.gitignore:17`; `git ls-files` returns none. They have **no source-commit impact** unless forcibly added. Left untouched; exclude them from the task commit. No public documentation behavior/content changes apply to this internal tooling correction; `docs:build` is not required.

Recommended coordinator spec contract: record the Lab-only entry/opener distinction, strict positive-port stable cache identity and test-root ownership, exact native watcher exclusions requiring live-input/HMR verification, and separate navigation/process/layout timing terminology. Keep this in the existing frontend Lab contract, without a new framework. Coordinator owns spec update and commit decisions.

## Final SHA256

| Source | SHA256 |
| --- | --- |
| `package.json` | `828f5c8f8b0471afb6d84b3b9a24b8deef94752389a85bc796eaf816735079dd` |
| `vite.lab.config.ts` | `9bdbad5baf2a609b332f839b5e699811473819639f2b31515dac019af1af3296` |
| `scripts/capture-lab-smoke.mjs` | `929552cef234c1d6c317630355e9fe23c0aa12ca1e05d3b1efce4974d74c1225` |
| `evidence/verify-vite-lab.mjs` | `fcc0bf5080aee24caf0d15c023a260cef86e54d3c4aafc0fcc1fe2c31b1a9ce8` |
| `evidence/watcher-registrations.mjs` | `54ebb4864b710b70ef8f7c519eed2aaf047b8f191ba6d856ba8fc1c5f7ece79a` |
| `evidence/lab-inputs.mjs` | `2134d833b8f5611aebb4175b55c3196531f2f132fe3f5937c04cca4adb35a17f` |
