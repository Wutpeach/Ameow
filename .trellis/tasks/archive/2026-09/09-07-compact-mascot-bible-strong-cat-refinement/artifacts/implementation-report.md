# Compact mascot cat-ear refinement, evidence-gate reconciliation

## Outcome

The final geometry and cleanup gates are **not accepted**. The canonical Compact definition has been restored to its original two diamond ears, the active OneWorks inspector/files/tests/dependencies have been restored, and the character-motion specification again describes diamond ears.

The retained implementation is limited to a Lab-only frozen-pose seam. It renders the existing canonical definition through the existing `CompactMascot` and avatar-core path for neutral, bounded pointer, `surprised`, `curious-short`, and `playful-short` samples; production does not pass the optional prop and retains its prior runtime/lifecycle path.

## Reference findings

- Kirby source identity is `smontlouis/bible-strong-avatar-lab` commit `175691ab32cefe5faec7828af62f3d50210a8eb2`, recorded in `KIRBY_UPSTREAM_REVISION`. Its body is a 240³ sphere with two attached source-hand spheres, which establishes the local-node/shared-pose mechanism only.
- Follow-up research identified the exact official built-in snapshot as species `pig`, breed `pink-pig`: `src/avatarPresetSnapshots/breeds/pig--pink-pig.svg`, introduced at OneWorks revision `9792d24dcdadb13b960757f4352e3fc11bb11130`, blob SHA `4dac35833dcf7be98d07e1d0f2c168cce52aba7e`, and retained through rc.7-rc.9. The reproducible URLs, source fingerprint, and visual-reference-only use boundary are recorded in `research/oneworks-pig-pink-pig-reference.md`; no asset was copied.
- The user's original share/export URL or screenshot is still unavailable, so the official snapshot cannot be claimed to match the exact authored pose, camera, or private/custom state the user previously viewed. No production geometry is claimed to derive from that stronger unverified state.

## Evidence

- `baseline-*.svg`, `cone-a-*.svg`, and `cone-b-*.svg` are retained **diagnostic core-direct evidence only**. Their original magnified row enlarged the holder while retaining the mascot at actual scale, so it cannot establish readable final geometry or root integration.
- `restored-lab-captures/` contains fresh browser screenshots from the rebuilt restored baseline. The capture script is `capture-restored-lab-evidence.mjs`; it drives the compiled Lab's existing `CompactPreviewStage -> CompactMascot` path, records both black/white themes, all five retained samples, a dedicated bounded-pointer sample, and 1× (81px outer/60px shell/56px mascot) plus 3× display captures.
- Those Lab captures verify the frozen-pose seam and the restored canonical output. They are not a substitute for an actual production native-holder capture or a completed comparison/calibration against the identified official `pig--pink-pig` reference, so they do not clear final-geometry acceptance.

## Retained code boundary

- `compactMascotBehaviorRuntime.ts` exports deterministic frozen preview scenes through existing core definition/playback functions.
- `CompactMascot.tsx` accepts an optional Lab-only `previewPose`; absent in production, it starts the unchanged one-clock behavior runtime.
- `CompactPreviewStage.tsx`, `scenarios.ts`, `PresentationLab.tsx`, Lab locales, and `lab-main.tsx` expose/read the same production component at frozen poses and both existing themes.
- No renderer/core API, depth output, mask, clipping mechanism, canvas, independent animation, Product/native state, IPC, or scheduler was added.

## Explicitly restored rather than removed

The OneWorks inspector route, fixture/candidate helpers, focused tests, and both `@oneworks/avatar*` dev dependencies remain active. Equivalent bible-strong inspection coverage and the zero-consumer premise cannot justify their removal until the final geometry evidence gate is actually passed.

## Historical evidence integrity

`historical-experiments/depth-occlusion-2026-09-08/avatar-core-depth-occlusion.patch` SHA-256 before and after reconciliation:

```
B8EDD2CF617558EC0C0A80FBA013DD3CA88DE6A22EF21C915D61403191A0A23D
```

## Validation

The restored Lab build completed with:

```text
npx vite build --config vite.lab.config.ts --outDir .trellis/tasks/09-07-compact-mascot-bible-strong-cat-refinement/artifacts/lab-build-restored
```

- Focused Compact/Lab suites: 16 files, 212 tests passed.
- Restored OneWorks suites: 3 files, 19 tests passed. A stale test-only read path was updated to the existing immutable archived candidate; the archive was not modified.
- `npm run type-check`, `npm run lint`, and task-manifest validation passed.
- Scoped `git diff --check` passed. Global `git diff --check` fails only on the unchanged unrelated CRLF edits in `browser-extension/locales/contract.json`, `electron-builder.config.mjs`, and `src/electron-runtime/runtimeDependencyGate.ts`.

## Remaining decision

The official built-in `pig--pink-pig` source/use boundary is now traceable, but the original user-observed share/custom state is not. Do not reland cone geometry or remove OneWorks until a completed visual comparison/calibration and correctly-scaled component-path evidence include the actual production holder and Lab in both themes for neutral, bounded pointer, and retained action poses.

## Cone C6 stop condition

- A final small definition-only rounded-cone candidate C6 was calibrated independently against the existing avatar-core projection. It used no OneWorks geometry or assets and kept the unchanged 60px shell envelope across retained poses (focused shell test passed), but its 3× component-path capture exposes a whole-node side lobe during `curious-short`; its neutral tips are also too small to establish the requested cat silhouette.
- The evidence is preserved at `artifacts/candidate-cone-c6-lab-captures/` (both existing themes, neutral, bounded eye-attention pointer, and retained frozen actions at 1×/3×). The Lead reviewed and rejected C6 through Orca (`msg_4676c6a4ae7b`), so the canonical definition and its focused test were restored exactly to the diamond baseline.
- The existing Electron launch workflow was started for a native-holder capture, but the desktop provider exposed no visible Electron window to capture. No native-holder evidence was fabricated or substituted: the pointer sample remains eye attention only, not head yaw/pitch, and this rejected candidate clears neither final geometry nor cleanup.

## Independent check reconciliation

The first bounded-pointer screenshots were byte-identical to their neutral captures because the capture point landed outside the response radius. The capture script now targets a bounded point inside the real stage, rejects an unchanged eye path, and regenerates distinct 1x and 3x bounded-pointer evidence in both themes. This proves the existing eye-attention path only; the current Compact pointer recipe does not produce head yaw/pitch, so it does not clear the stronger final-geometry pointer-pose gate.

The checker also found that combining an action preview with Reduced Motion retained action geometry. The shared preview renderer now settles every frozen pose to the neutral Reduced Motion scene; focused deterministic, pointer-additivity, lifecycle-boundary, and scenario-contract tests cover the retained seam.

Latest independent verification: 24 focused files / 331 tests passed, `npm run type-check` passed, `npm run lint` passed, the restored Lab build and capture script passed, task validation passed, and task-scoped `git diff --check` passed. Global `git diff --check` remains blocked only by the unrelated protected CRLF edits listed above; no final geometry, reference, production-holder, or OneWorks-removal gate is accepted.
