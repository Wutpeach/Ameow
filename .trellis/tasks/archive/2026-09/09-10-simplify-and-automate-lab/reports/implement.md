# Lab implementation report

## Outcome

Implemented the approved browser-only Lab simplification. `src/lab/scenarios.ts` is now the single finite registry for Ripple, all Fullscreen fixtures, and Compact poses; `scenarioUrl.ts` is the pure allow-listed query parser/serializer for `scenario`, `theme`, `reducedMotion`, and `capture`.

The manual panel derives target and scenario options from that registry and uses `history.pushState` for selection, with `popstate` support. Capture mode renders the exact selected production/reference preview without panel, controls, Dev Tools, backdrop picker, or export chrome, and publishes `data-lab-selected-scenario` plus a two-frame `data-lab-ready` marker.

## Changed files

- Added `src/lab/scenarioUrl.ts` and `scenarioUrl.test.ts` for the URL contract.
- Reworked `src/lab/scenarios.ts`, `PresentationLab.tsx`, `lab-main.tsx`, `LabOverlayStage.tsx`, locales, and relevant Lab tests around the shared registry and production runtime-indicator visibility.
- Added `scripts/capture-lab-smoke.mjs` and `npm run lab:capture`.
- Removed Agentation mount/CSS; live OneWorks inspector/candidate sources and focused tests; PNG exporter/tests, html2canvas, and WebGL readback-only props.
- Updated `package.json` and `package-lock.json` through `npm uninstall --save-dev agentation @oneworks/avatar @oneworks/avatar-react html2canvas`.

Archived evidence and the retained Ripple source/tests, `CompactMascot`, and `@bible-strong/avatar-core` were not changed. `npm ls --depth=0` confirms Playwright and avatar-core remain installed and the removed packages are absent.

## PNG exporter decision

**Removed as a complete unit.** The final Playwright runner captures the combined DOM/WebGL browser result for all accepted smoke scenarios without page/request failures. It opens one document, changes all later scenarios exclusively with same-document History API URL state, and asserts exactly one main-frame document request; therefore it covers the needed evidence workflow without html2canvas compositing or direct WebGL readback.

## Screenshots

Final task-local capture command:

```text
node .\\scripts\\capture-lab-smoke.mjs --output .trellis\\tasks\\09-10-simplify-and-automate-lab\\artifacts\\playwright-captures
```

- `artifacts/playwright-captures/compact-pointer.png` (10,400 bytes)
- `artifacts/playwright-captures/download-queued.png` (10,557 bytes)
- `artifacts/playwright-captures/transcode-failed.png` (13,536 bytes)
- `artifacts/playwright-captures/runtime-failed.png` (9,491 bytes)

All four were visually inspected. The default runnable command, `npm run lab:capture`, also passed and writes ignored local output to `docs-screenshot-captures/lab`.

## Validation

| Command | Result |
| --- | --- |
| Focused Lab Vitest suite | Passed: 31 files, 251 tests |
| `node scripts/capture-lab-smoke.mjs --output <task artifacts>` | Passed: four PNGs, one document request, no page/request failures |
| `npm run lab:capture` | Passed |
| `npm run type-check` | Passed |
| `npm run lint` | Passed |
| `npm run build:renderer` | Passed (existing Vite chunk-size/externalized-module warnings only) |
| `npx vite build --config vite.lab.config.ts --outDir .trellis/tasks/09-10-simplify-and-automate-lab/artifacts/lab-build` | Passed |
| `npm test` | Failed outside task scope: Vitest discovers untracked `.cindy-worktrees/.orca-worktree-trash/**` suites (5 test failures plus 1 suite setup failure). |
| `npx vitest run --passWithNoTests --exclude '**/.cindy-worktrees/**'` | Passed: 219 files, 1,823 tests |

## Remaining risk

The repository's default `npm test` remains unable to pass while the pre-existing untracked Orca worktree-trash directory is present because Vitest discovers those unrelated duplicate suites. It was preserved per scope constraints; no Lab or repository-owned test failed in the excluding verification.
