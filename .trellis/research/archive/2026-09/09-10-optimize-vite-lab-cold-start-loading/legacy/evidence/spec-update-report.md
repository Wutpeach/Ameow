# Lab spec update report

- Changed [`directory-structure.md`](../../../spec/frontend/directory-structure.md): added one compact seven-section Lab Vite/cache/watcher/capture contract.
- Verified against [`vite.lab.config.ts`](../../../../vite.lab.config.ts), [`package.json`](../../../../package.json), and [`scripts/capture-lab-smoke.mjs`](../../../../scripts/capture-lab-smoke.mjs); no product, public-doc, task-plan, journal, or Git metadata/staging/commit/branch state changed.

## Checks

- `git diff --check` for both changed paths — passed.
- Read-only factual-anchor check for the Lab entry, serve-only port cache hook, watcher exclusions, npm opener, and capture cleanup guard — passed.
- Runtime checks were intentionally not rerun because this is a prose-only contract update.

## Caveats

- Timing and HMR/restart values document one retained Windows evidence run, not a universal performance SLO.
- Same-port/different-host, port-zero, and `strictPort: false` instance setups remain explicitly unsupported by the current port-derived cache contract.

## Follow-up factual correction

- Clarified that `optimizeDeps.entries: ["lab.html"]` limits only the initial dependency scan; it does not block deliberate root navigation or its production graph.
- Replaced the CLI examples with explicit `vite.lab.config.ts` selection and valid `--strictPort` syntax, and added the watcher root-cause guardrail: irrelevant native watcher trees can delay serving after ready even when caches are isolated.
- Moved one-run timing history out of the permanent spec while retaining the required visible/interactive, HMR, restart, and concurrency assertions; no runtime command was rerun.
