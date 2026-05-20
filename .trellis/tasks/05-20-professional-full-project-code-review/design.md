# Design

## Review Scope

The review targets the actively maintained product code and high-signal supporting code:

- `src/`: renderer, shared runtime-facing TypeScript, state, orchestration, download flows
- `electron/`: main/preload runtime, IPC bridges, file/runtime/system integration
- `browser-extension/`: page detectors, selection flows, content/popup/background scripts
- `scripts/` and selected root config/runtime files when they influence build, packaging, or operational correctness

Excluded from direct review unless they reveal product-risk evidence:

- `node_modules/`
- build output directories such as `dist-electron/`
- archived task artifacts under `.trellis/tasks/archive/`

## Review Method

The review is evidence-driven rather than stylistic:

1. Map repository structure and identify high-risk subsystems.
2. Inspect representative files and tests in each subsystem.
3. Use targeted searches to find risky patterns:
   - broad `any`/`ts-nocheck`
   - duplicated branching or protocol mapping logic
   - manual async/process lifecycle handling
   - unbounded listeners, timers, retries, or data copying
   - weak validation at cross-layer boundaries
4. Cross-check code against nearby tests to assess defect exposure and coverage gaps.
5. Consolidate only issues with a defensible root-cause explanation and concrete impact.

## Evidence Standard

A finding is reportable only if it has:

- a concrete location in code
- a plausible failure mode, maintenance burden, or measurable waste
- an explanation of why the current structure causes the problem

Preference is given to:

- correctness and data-loss risks
- cross-layer contract drift
- lifecycle/resource leaks
- performance hazards in hot paths
- structural debt that blocks safe iteration

## Parallel Review Strategy

Sub-agents may be used as read-only reviewers for distinct areas:

- renderer/shared `src/`
- Electron runtime `electron/`
- browser extension and related scripts

The main session remains responsible for:

- assigning boundaries
- verifying cited evidence
- deduplicating overlapping findings
- normalizing severity
- producing the final ranked report
