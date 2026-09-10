# Lab readiness and active WebGL capture acceptance fix

## Outcome

Closed both outstanding acceptance findings from `reports/check.md` with the smallest existing-renderer hooks. `data-lab-ready` now means the selected renderer is capturable: Compact is synchronously committed with its SVG leaf, the production Fullscreen host reports after its real WebGL2 draw, and the async Ripple reference reports after its first successful WebGL1 draw. The capture runner keeps the four required scenarios and adds independent `download-active.png` evidence; no PNG export, canvas readback, dependency, or alternate renderer path was restored.

## Files changed for this follow-up

- `src/lab/PresentationLab.tsx` — derives Compact readiness synchronously and receives renderer frame confirmation for Fullscreen/Ripple.
- `src/lab/LabOverlayStage.tsx` — passes the narrow capturable-frame callback to the existing production WebGL host.
- `src/presentation/main-window/ExpandedPresentationSurface.tsx` — optional callback after actual WebGL2 draw; callback identity changes force one real redraw so idle-to-idle fixture changes also become capture-ready.
- `src/lab/ripple/RippleLab.tsx` and `src/lab/ripple/RippleCanvas.tsx` — forwards the optional callback and emits it after the async image/WebGL1 initialization produces a draw.
- `scripts/capture-lab-smoke.mjs` — preserves the four required capture IDs and adds `download-active` as explicit active WebGL evidence.
- `src/lab/rendererReuse.test.ts` and `src/presentation/main-window/expandedPresentationSurface.test.ts` — focused source contracts for the readiness/capture seam.
- Refreshed task-local captures under `artifacts/playwright-captures/` and the task-local Lab build.

## Evidence

| Check | Result |
| --- | --- |
| Focused Lab/renderer suite | `npx vitest run src/lab/rendererReuse.test.ts src/lab/scenarios.test.ts src/lab/scenarioUrl.test.ts src/lab/compactPreviewStage.test.ts src/lab/ripple/rippleIsolation.test.ts src/lab/ripple/rippleController.test.ts src/presentation/main-window/expandedPresentationSurface.test.ts` — pass, 7 files / 56 tests |
| Capture evidence | `npm run lab:capture` — pass; writes its ignored default output. `node .\\scripts\\capture-lab-smoke.mjs --output .trellis\\tasks\\09-10-simplify-and-automate-lab\\artifacts\\playwright-captures` — pass with durable task-local evidence; both runs assert exactly one main-frame navigation and no page/request failures |
| Capture output | `compact-pointer.png` (10,400 B), `download-queued.png` (10,557 B), `transcode-failed.png` (13,536 B), `runtime-failed.png` (9,491 B), plus `download-active.png` (14,442 B) |
| Active image inspection | `download-active.png` visibly shows the non-idle WebGL progress arc behind the Chinese active-download status (`下载中… 12.4 MB/s · 预计 0:42`) |
| Type check | `npm run type-check` — pass |
| Lint | `npm run lint` — pass |
| Whole suite | `npm test` — pass, 219 files / 1,825 tests |
| Production renderer build | `npm run build:renderer` — pass, 649 modules; existing browser-externalization, CSS timing, and chunk-size advisories only |
| Lab build | `npx vite build --config vite.lab.config.ts --outDir .trellis/tasks/09-10-simplify-and-automate-lab/artifacts/lab-build` — pass, 597 modules; existing chunk-size advisory only |
| Scoped whitespace check | `git diff --check -- <follow-up source files>` — pass |

## Remaining risks

- If WebGL initialization or the Ripple fixture image fails, readiness intentionally stays absent and capture fails rather than producing a false-ready blank frame.
- The optional `onCapturableFrame` hook is inert in production, which does not pass it; no production rendering or state authority changed.
- Unrelated dirty work remains untouched, including the known global whitespace errors described in `reports/check.md`.
