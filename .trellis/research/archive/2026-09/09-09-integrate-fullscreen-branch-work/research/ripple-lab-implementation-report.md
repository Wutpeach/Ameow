# Ripple Lab implementation report

- Active task: `.trellis/research/archive/2026-09/09-09-integrate-fullscreen-branch-work`
- Implemented: 2026-09-09
- Approved source: `818057f664c7474ec1722b143fcc84dcf3ec67e9`

## Delivered scope

- Transplanted only the approved ten `src/lab/ripple/` paths from the approved
  source commit. The maintained wrapper is embedded in `PresentationLab`, is
  fixed to the one-scene Ameow fixture, and does not use a query route.
- Ordinary `lab.html` now keeps only `?theme=white`; its default Full lane is
  Ripple. Full lanes also retain Download, Transcode, and Mixed, while Compact
  retains the existing `previewPose` seam.
- Removed Lab-only Intake and Heatmap reducer/state/presets/copy/tests and
  simplified the Lab WebGL2 stage to production-reuse fixture lanes. No
  production presentation, Electron, runtime, shader, or Product file was
  changed.
- Ripple keeps forward/reverse, both cancel destinations, phase scrub, click
  and native X/Y origin controls, Pinch on/off, one-pending-rAF controller behavior, context-loss
  recovery, cleanup, failure status, and Reduced Motion synchronous settling.
  The existing WebGL2 export control is absent for Ripple.
- Added English/Chinese Ripple controls and an MIT/source-modification notice
  for `m1ckc3s/ripple` commit `99ee6e4412bcab34bcb4337f5f21845ae87c12d5`.

## Changed paths

```
THIRD_PARTY_NOTICES.md
src/lab/LabOverlayStage.tsx
src/lab/PresentationLab.tsx
src/lab/locales/en.json
src/lab/locales/zh-CN.json
src/lab/productionRuntimeSemantics.test.ts
src/lab/rendererReuse.test.ts
src/lab/scenarios.test.ts
src/lab/scenarios.ts
src/lab/ripple/RippleLab.tsx
src/lab/ripple/RippleCanvas.tsx
src/lab/ripple/rippleController.ts
src/lab/ripple/rippleSource.ts
src/lab/ripple/rippleResourceCleanup.ts
src/lab/ripple/rippleTextureUpload.ts
src/lab/ripple/rippleController.test.ts
src/lab/ripple/rippleSource.test.ts
src/lab/ripple/rippleIsolation.test.ts
src/lab/ripple/ameow-download-active-200.png
```

## Verification

Passed:

```text
npx vitest run src/lab
# 40 files / 339 tests passed

npm run type-check
npm run lint -- --quiet
git diff --check -- THIRD_PARTY_NOTICES.md src/lab
```

`npm run build:renderer` was invoked twice but the execution wrapper returned
after its 30-second window while Vite was still transforming, without a final
success or failure line. It is therefore not claimed as passed and should be
rerun by the validation phase. No browser visual check was run in this worker
environment.

## Scope audit

- No commit, tag, ref, worktree, branch, push, archive, or cleanup operation
  was performed.
- No Paper, GSAP, upstream A/B fixture/evidence, production renderer, or
  unrelated dirty file was changed.
