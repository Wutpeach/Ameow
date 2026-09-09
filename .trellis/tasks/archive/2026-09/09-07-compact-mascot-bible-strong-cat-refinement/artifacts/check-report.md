# Independent check report

## Findings (fixed)

- `src/presentation/main-window/compactMascotBehaviorRuntime.ts`: an action `previewPose` could retain action geometry while Reduced Motion was enabled. The preview renderer now settles every frozen pose to the neutral Reduced Motion scene.
- `src/presentation/main-window/compactMascotBehaviorRuntime.test.ts`: the retained seam lacked checks for deterministic action samples, additive pointer attention, and Reduced Motion settlement. Focused assertions now cover all three without adding a new runtime or renderer.
- `src/presentation/main-window/compactMascotArchitecture.test.ts`: the seam had no explicit guard that production omits `previewPose` or that Lab pointer subscriptions are disposed before runtime transitions. The architecture test now pins both boundaries.
- `src/lab/scenarios.test.ts`: the scenario contract still expected the former three-scenario list. It now covers the six retained scenarios, their frozen poses, pointer modes, and Reduced Motion flags.
- `artifacts/capture-restored-lab-evidence.mjs`: the original bounded-pointer target was outside the response radius, so its two 1x captures were byte-identical to neutral. The script now targets the stage at a bounded 75%/25% point, fails if the eye paths remain neutral, and captures distinct 1x and 3x pointer evidence in both themes.
- `.trellis/spec/frontend/character-motion.md`: the documented component signature omitted the retained Lab-only seam. The spec now records the optional frozen pose, production non-use, deterministic core path, disposable subscriptions, and neutral Reduced Motion settlement.

## Findings (not fixed)

- Final geometry remains unaccepted. The canonical definition is restored to exactly two avatar-core diamond nodes; fresh neutral captures show the same small spike-like silhouette, while curious/playful captures expose whole-node side lobes under stronger head pose. This check makes no cat-readability or root-integration claim.
- Follow-up research now identifies the exact official `pig--pink-pig` snapshot at OneWorks revision `9792d24dcdadb13b960757f4352e3fc11bb11130`, blob SHA `4dac35833dcf7be98d07e1d0f2c168cce52aba7e`, with a visual-reference-only use boundary (`research/oneworks-pig-pink-pig-reference.md`). What remains unproven is whether that built-in snapshot matches the user's original share/custom state because no original share URL, export, or screenshot is available; no final geometry may be attributed to that stronger claim.
- No actual production native-holder capture exists. `restored-lab-captures/` proves only the rebuilt Lab's `CompactPreviewStage -> CompactMascot` component path at the production geometry and CSS-magnified display scale.
- The bounded-pointer captures cover the current production eye-attention offset only. The current Compact pointer recipe has no head yaw/pitch output, so these files do not satisfy the PRD's stronger “bounded pointer yaw/pitch” final-geometry evidence wording.
- The older `baseline-*` / `cone-*` core-direct artifacts remain diagnostic only. Their magnified row does not magnify the mascot, and none is treated as final evidence.
- The OneWorks inspector, helpers, tests, and exact rc.6 dev dependencies remain active by design. Cleanup is unsupported until equivalent accepted bible-strong coverage and the zero-consumer premise are established.
- No broader renderer/core API, depth output, mask, clip, native state, IPC, scheduler, or production lifecycle change is warranted.

## Runtime and evidence review

- Production has no `previewPose` caller. With the prop absent, `CompactMascot` still creates the existing one-rAF behavior runtime, retains document visibility pause/resume, Reduced Motion static rendering, and disposal.
- With the Lab prop present, the frozen path runs before runtime creation, subscribes only to the Lab-local pointer MotionValues, and unsubscribes both on pose/theme/Reduced Motion changes or unmount. Switching back to an undefined pose creates a fresh production runtime after cleanup.
- The fixed samples are deterministic: neutral plus `surprised` at 800ms, `curious-short` at 3700ms, and `playful-short` at 3700ms render through the canonical definition and existing avatar-core playback/scene functions.
- Fresh evidence contains 24 PNGs: both themes, five base scenarios at 1x and 3x, plus distinct bounded-pointer captures at both scales. The files are 81x81 and 241x241 because browser screenshot bounds include fractional CSS edges; the component geometry remains 80/60/56 and the 3x view scales the same component path.
- Historical patch SHA-256 remains `B8EDD2CF617558EC0C0A80FBA013DD3CA88DE6A22EF21C915D61403191A0A23D`. No archived or historical file was edited by this check.
- Coordinator inbox review incorporated the parallel reference report before completion; the earlier rc.6/`3ad2542` negative search is treated as a version boundary, not a universal absence claim.

## Verification

- Focused tests: pass — 24 files, 331 tests.
- Type-check: pass — `npm run type-check`.
- Lint: pass — `npm run lint`.
- Restored Lab build: pass — `npx vite build --config vite.lab.config.ts --outDir .trellis/tasks/09-07-compact-mascot-bible-strong-cat-refinement/artifacts/lab-build-restored`.
- Evidence capture: pass — `node .trellis/tasks/09-07-compact-mascot-bible-strong-cat-refinement/artifacts/capture-restored-lab-evidence.mjs`; unchanged-pointer assertions passed at both scales/themes.
- Task manifest: pass — `python ./.trellis/scripts/task.py validate .trellis/tasks/09-07-compact-mascot-bible-strong-cat-refinement`.
- Task-scoped whitespace: pass — scoped `git diff --check`.
- Global whitespace: fail, unrelated — only the protected pre-existing CRLF edits in `browser-extension/locales/contract.json`, `electron-builder.config.mjs`, and `src/electron-runtime/runtimeDependencyGate.ts`; this worker did not modify them.

## Spec recommendation

The only narrow spec update needed for the retained seam has been applied to `character-motion.md`. Do not update the diamond-ear contract, accept cone geometry, or document OneWorks removal until the remaining product/reference gates pass.
