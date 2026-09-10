# Lab quality-check report

## Outcome

The registry → URL → renderer → capture flow is coherent and all requested automated gates pass after four mechanical fixes. The Lab remains a browser-only `lab.html` entry, derives every visible scenario from `LAB_SCENARIOS`, resolves URL state through the same registry, renders production Compact/Fullscreen leaves or the retained isolated Ripple reference, and captures the four required scenarios with one main-frame document request.

## Flow trace

```text
LAB_SCENARIOS (scenarios.ts)
  -> parseLabUrlState / serializeLabUrlState (scenarioUrl.ts)
  -> PresentationLab History API state + registry-derived target
  -> CompactPreviewStage -> production CompactMascot/@bible-strong/avatar-core
     | LabOverlayStage -> production projections/components/ExpandedPresentationSurface
     | RippleLab -> retained standalone WebGL1 reference
  -> data-lab-selected-scenario + data-lab-ready
  -> capture-lab-smoke.mjs -> four URL-selected screenshots + one-navigation assertion
```

## Findings (fixed)

### Default test discovery included Orca worktree trash

- File: `vite.config.ts`
- Issue: `npm test` discovered duplicate/stale suites under `.cindy-worktrees/.orca-worktree-trash/**`, causing failures unrelated to repository source.
- Fix: Extended the existing `test.exclude` array with only `**/.cindy-worktrees/**`. This is the existing configuration boundary and excludes known Orca worktree metadata without narrowing normal repository test discovery.
- Evidence: Default `npm test` now passes 219 files / 1,823 tests.

### Obsolete Lab seams survived the consolidation

- Files: `src/lab/stateFixtures.ts`, `src/lab/overlayProjection.ts`
- Issue: The task-local deletion audit explicitly identified `createEmptyDownloadQueueFixture` and the Lab re-export of `selectAdvancedQualitySelectionTask` as unused. Both remained after implementation.
- Fix: Removed the unused helper, import, and re-export. No caller existed in active source.

### PNG-export-only WebGL API survived exporter deletion

- Files: `src/presentation/main-window/ExpandedPresentationSurface.tsx`, `src/presentation/main-window/expandedPresentationSurface.test.ts`
- Issue: The PNG exporter, `html2canvas`, Lab readback component, and UI were removed, but the production surface still exposed `backingScale`/`redrawEpoch` and retained same-commit capture redraw plumbing plus a test for it. This violated the requirement to remove the exporter/readback unit coherently.
- Fix: Removed the two unused props, capture-only ref/layout effect, override branch, stale comments, and capture-specific test expectations. Preserved and reasserted the normal capped-device-pixel-ratio resize path.

### Frontend directory spec described deleted files

- File: `.trellis/spec/frontend/directory-structure.md`
- Issue: The Lab inventory still listed `exportPng.ts` and the old three-pane shell.
- Fix: Updated only the inventory to describe the registry-driven shell, `scenarios.ts`, `scenarioUrl.ts`, and typed fixtures.

## Findings (not fixed)

### Readiness is frame-delayed, not renderer-confirmed

- Files: `src/lab/PresentationLab.tsx`, `src/lab/ripple/RippleCanvas.tsx`
- Evidence: `data-lab-ready` is published after two parent `requestAnimationFrame` callbacks. The standalone Ripple renderer loads its image and initializes WebGL asynchronously and does not report first successful draw to the shell.
- Why not fixed: Adding renderer readiness callbacks changes component contracts and readiness policy, which is a design/interface judgment outside a mechanical check fix.
- Recommendation: If readiness must cover every registry entry literally, have the selected renderer publish its first capturable frame before setting `data-lab-ready`; at minimum, Ripple must wait for its asynchronous image/WebGL initialization.

### The required four captures do not visibly prove active WebGL pixels

- Files: `scripts/capture-lab-smoke.mjs`, `src/lab/stateFixtures.ts`
- Evidence: The three Fullscreen smoke scenarios are queue-only, transcode-failure, and runtime-failure fixtures; each projects an idle Expanded target, so the inspected screenshots prove DOM/canvas composition but not a non-idle WebGL progress frame. Playwright screenshot support and all four accepted images are working, but the former PNG export's active WebGL content is not explicitly represented in this smoke set.
- Why not fixed: Changing the accepted four-scenario set or the queued fixture's semantics is a product/evidence decision.
- Recommendation: If explicit active-WebGL equivalence is required for the PNG-export gate, make the queued/multi-task fixture include one active download plus one queued task, or add a separate active-download capture.

### Unrelated dirty paths contain whitespace errors

- Files: `browser-extension/locales/contract.json`, `electron-builder.config.mjs`, `src/electron-runtime/runtimeDependencyGate.ts`
- Evidence: Global `git diff --check` reports trailing whitespace in these pre-existing, unrelated changes. The task-scoped `git diff --check` passes.
- Why not fixed: The dispatch explicitly required preservation of unrelated dirty work. Hashes of these files and `AGENTS.md` were recorded before builds and remained byte-identical afterward.

## Boundary and deletion review

- Production entry/config search found no production import of `src/lab/**`; `vite.config.ts` still pins `index.html` as the sole production build input.
- `src/lab/**` contains no desktop/Electron import.
- Active `src/`, `scripts/`, and package metadata contain no `agentation`, `@oneworks/avatar`, `@oneworks/avatar-react`, `html2canvas`, live OneWorks inspector/candidate, PNG exporter, or WebGL readback implementation.
- `npm ls --depth=0 ...` confirms `@bible-strong/avatar-core@0.1.0` and `playwright@1.60.0` remain, while the removed packages are absent.
- `CompactPreviewStage` still renders production `CompactMascot`; its pointer/pose/Reduced Motion tests pass.
- Ripple implementation, texture, controller/source tests, and isolation test remain. Only `rippleIsolation.test.ts` changed to follow the shared registry/URL contract.
- The archived OneWorks evidence directory remains present with 26 files and no dirty paths.
- PNG export was removed as one unit after Playwright capture was established: source/test/UI/locales/dependency/readback plumbing are absent.

## Verification

| Command | Result |
| --- | --- |
| `npx vitest run src/presentation/main-window/expandedPresentationSurface.test.ts ... <focused Lab/Ripple files>` | Pass: 15 files, 101 tests |
| `npm run lab:capture` | Pass: four screenshots; built-in assertion accepted exactly one main-frame document request and no page/request failures |
| `node .\\scripts\\capture-lab-smoke.mjs --output .trellis\\tasks\\09-10-simplify-and-automate-lab\\artifacts\\playwright-captures` | Pass: refreshed task-local four-image evidence |
| `npm run type-check` | Pass |
| `npm run lint` | Pass |
| `npm test` | Pass: 219 files, 1,823 tests |
| `npm run build:renderer` | Pass: 649 modules; existing browser-externalization, chunk-size, and CSS timing warnings only |
| `npx vite build --config vite.lab.config.ts --outDir .trellis/tasks/09-10-simplify-and-automate-lab/artifacts/lab-build` | Pass: 597 modules; existing chunk-size warning only |
| Task-scoped `git diff --check` | Pass |

Task-local screenshots inspected:

- `compact-pointer.png` — 10,400 bytes
- `download-queued.png` — 10,557 bytes
- `transcode-failed.png` — 13,536 bytes
- `runtime-failed.png` — 9,491 bytes

## Changed files from this check phase

- `.trellis/spec/frontend/directory-structure.md`
- `.trellis/tasks/09-10-simplify-and-automate-lab/reports/check.md`
- `src/lab/overlayProjection.ts`
- `src/lab/stateFixtures.ts`
- `src/presentation/main-window/ExpandedPresentationSurface.tsx`
- `src/presentation/main-window/expandedPresentationSurface.test.ts`
- `vite.config.ts`
- Refreshed `.trellis/tasks/09-10-simplify-and-automate-lab/artifacts/playwright-captures/*.png` and the task-local Lab build.

## Spec-sync decision

Updated `.trellis/spec/frontend/directory-structure.md` because it named the deleted exporter and obsolete shell shape. No other `.trellis/spec/` update is needed: browser/Electron boundaries, Compact motion ownership, Reduced Motion, and production renderer contracts were preserved rather than changed.

## Remaining risks

The two in-scope design risks are renderer-confirmed readiness (especially async Ripple initialization) and explicit non-idle WebGL screenshot evidence for the PNG-export equivalence decision. No mechanical, lint, type, test, build, dependency, or deletion-boundary defect remains known.
