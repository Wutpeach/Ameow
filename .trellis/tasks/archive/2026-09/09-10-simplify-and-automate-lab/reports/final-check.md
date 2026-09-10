# Final independent Lab acceptance review

## Findings (fixed)

- `src/lab/PresentationLab.tsx`: readiness was stored as the scenario ID. An A → Compact → A revisit could inherit A's earlier ready flag before the remounted asynchronous renderer drew. Replaced that cached ID with a per-selection symbol token; a prior selection's callback cannot satisfy the current token.
- `src/presentation/main-window/ExpandedPresentationSurface.tsx`: the observation callback followed void render/redraw calls even when drawing returned early for context loss or no stored frame. Private render/redraw now return whether drawing occurred, and readiness is conditional on that result. Existing production callers ignore the return value and omit the observation callback; shader math, inputs, scheduling, DPR and production mount remain unchanged.
- `src/lab/ripple/RippleCanvas.tsx`: added context-loss checks before drawing and before frame confirmation so a lost WebGL1 context cannot confirm a capturable frame.
- Updated existing focused source-contract assertions for these seams. No dependency, framework, renderer authority, PNG readback or exporter was added.

## Verification

All commands below ran after the source fixes:

| Command | Result |
| --- | --- |
| `npx vitest run src/lab/rendererReuse.test.ts src/lab/scenarios.test.ts src/lab/scenarioUrl.test.ts src/lab/compactPreviewStage.test.ts src/lab/ripple/rippleIsolation.test.ts src/lab/ripple/rippleController.test.ts src/presentation/main-window/expandedPresentationSurface.test.ts` | Pass, 7 files / 56 tests |
| `npm run lab:capture` | Pass, all five screenshots, exactly one main-frame document request, no page/request failures |
| `node .trellis/tasks/09-10-simplify-and-automate-lab/artifacts/check-readiness.mjs` | Pass: delayed Ripple image on A → Compact → A revisit stays unready until loaded; unavailable WebGL2 and Ripple WebGL1 remain unready |
| `node scripts/capture-lab-smoke.mjs --output .trellis/tasks/09-10-simplify-and-automate-lab/artifacts/playwright-captures` | Pass, refreshed task-local five-image evidence |
| `npm run type-check` | Pass |
| `npm run lint` | Pass |
| `npm test` | Pass, 219 files / 1,825 tests |
| `npm run build:renderer` | Pass, 649 modules |
| `npx vite build --config vite.lab.config.ts --outDir .trellis/tasks/09-10-simplify-and-automate-lab/artifacts/lab-build` | Pass, 597 modules |
| `git diff --check -- src/lab src/presentation/main-window/ExpandedPresentationSurface.tsx src/presentation/main-window/expandedPresentationSurface.test.ts package.json package-lock.json vite.config.ts .trellis/spec/frontend/directory-structure.md` | Pass |
| `npm ls --depth=0 @bible-strong/avatar-core playwright agentation @oneworks/avatar @oneworks/avatar-react html2canvas` | Only retained avatar-core 0.1.0 and Playwright 1.60.0 listed |

## Image inspection

Opened all five refreshed task-local PNGs at original resolution. Compact shows its blue mascot; queued Download shows the two-item badge; Transcode failure shows the red failure mark, diagnostic text and copy action; Runtime failure shows the amber status indicator. `download-active.png` visibly includes the non-idle circular WebGL progress arc behind the active-download text, confirming combined DOM/WebGL capture without the deleted exporter.

## Scope and spec compliance

The finite registry drives the panel and URL resolver, target is derived from the registry, and the capture runner selects the five accepted entries through same-document History API changes. Lab remains a separate browser entry with production projection/presentation reuse. No production integration of Ripple occurred. The complete PNG-export unit remains deleted: exporter and tests, UI/locales, html2canvas, readback and backing-scale/epoch props. Active-source/package search found no removed dependencies or exporter implementation. Protected Compact implementation, Ripple shader/controller, and archived evidence have no diff.

The observation callback carries no Product/lifecycle completion or mutation. Existing motion and character contracts remain applicable. No public workflow changed, so public docs-site updates are unnecessary. The existing directory-spec update correctly describes the new Lab inventory.

## Files changed by this final check

- `src/lab/PresentationLab.tsx`
- `src/lab/rendererReuse.test.ts`
- `src/lab/ripple/RippleCanvas.tsx`
- `src/presentation/main-window/ExpandedPresentationSurface.tsx`
- `src/presentation/main-window/expandedPresentationSurface.test.ts`
- This report and task-local `artifacts/check-readiness.mjs`.
- Refreshed task-local five PNGs and Lab build output; default capture output and renderer build are generated outputs.

No commit was made. Pre-existing unrelated dirty paths and archived evidence were preserved.

## Remaining risks and limits

Builds retain existing Vite browser-externalization, CSS timing and chunk-size advisories. The readiness marker confirms a capturable frame for a selection, not completion of normal-motion animation or continuous monitoring of subsequent graphics health. Focused unit checks primarily assert source contracts; the five-scenario smoke is the real-browser success-path evidence. Native Electron graphics recovery was not exercised by this browser-only task.

The additional task-local fault-injection harness initially required startup adjustments (in-process Vite startup/port collision and a 30-second load wait); its final run uses the existing child-process Vite pattern and DOM-content readiness and passed. Development React prints the existing unsupported Electron corner-smoothing style warning. It did not prevent the behavioral assertions.
