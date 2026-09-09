# Compact mascot bible-strong cat-ear refinement implementation plan

## Status

Archived on `main` as stopped/rejected. The prior user-approved same-task replan is retained only as historical context.

## Final closure

Implementation stops at the validated Lab-only frozen-pose seam. C6/final geometry is rejected, no Architecture PASS is granted, and the OneWorks zero-consumer/removal criteria remain unmet; do not run further Compact geometry work from this plan. Preserve the depth/C6 evidence and required SHA-256 `B8EDD2CF617558EC0C0A80FBA013DD3CA88DE6A22EF21C915D61403191A0A23D`; a future refinement requires a new task.

## 1. Inspect references and preserve the baseline

- Record the pinned Kirby hand-node source facts used by `KIRBY_SOURCE_BODY`.
- Identify the exact OneWorks `pig--pink-pig` source/asset, revision or package version, and permitted-use boundary. Treat it as unverified until recorded.
- Capture the untouched canonical Compact definition at the real 56px holder and magnified Lab scale in both themes.
- Record the current SHA-256 of the historical depth-occlusion patch before implementation; do not edit historical or archived evidence.

## 2. Build reversible local candidates

- Through `COMPACT_MASCOT_DEFINITION`, `CompactMascot`, and `CompactPreviewStage`, create the smallest rounded-cone candidate variations needed to compare silhouette and root embedding.
- Candidate preview code and read-only Lab capture controls are allowed here because they produce the decision evidence; keep them reversible and production-path based.
- Cover neutral, bounded pointer yaw/pitch, and `surprised`, `curious-short`, and `playful-short` poses in both themes at actual and magnified size.

## 3. Gate the final geometry on evidence

- Accept final node dimensions, roundness, local positions, and rotations only when captures show readable cat ears and convincing root integration across the approved poses.
- Prefer a definition-only result.
- If needed, make the smallest focused `CompactMascot.tsx` or `compactMascotBehaviorRuntime.ts` change that consumes avatar-core's existing one-body/shared-pose output. Preserve existing APIs, SVG slots, lifecycle, one-clock behavior, and authority boundaries; no separate task is required for this routine integration.
- If the accepted result would require a new core API, depth fragments, masks, custom ear clipping, a fork, vendoring, or `patch-package`, stop and preserve the failed evidence instead.

## 4. Realign the Lab and remove active OneWorks residue

- Ensure `CompactPreviewStage` provides equivalent bible-strong inspection/capture coverage through the production component and canonical definition.
- Verify repository-wide that `OneWorksMascotInspector`, OneWorks candidate/playback helpers, and `@oneworks/avatar*` have no remaining active consumers outside the removal set.
- Remove the active inspector route/files, candidate/helper files and their focused tests.
- Update Lab reuse/import assertions to require the production bible-strong path and reject active OneWorks imports.
- Remove `@oneworks/avatar` and `@oneworks/avatar-react` from `package.json` and `package-lock.json` only after the zero-consumer check.
- Keep archived reports, screenshots, source references, and all `historical-experiments/` bytes unchanged.

## 5. Update focused contracts and evidence

- Update Compact definition/render-wiring tests for the accepted geometry and same-pose output.
- Keep behavior-runtime, lifecycle, Pointer Field, Reduced Motion, disposal, shell-bounds, import-guard, and Compact/Full assertions green.
- Update `.trellis/spec/frontend/character-motion.md` only after final geometry and any focused render wiring are verified.
- Save baseline/candidate/final captures and a short decision record in this task without copying OneWorks assets.

## 6. Validate the implementation

Run the focused suites first, followed by project static checks and task checks:

```powershell
npm test -- --run src/presentation/main-window/compactMascotDefinition.test.ts src/presentation/main-window/compactMascotBehaviorRuntime.test.ts src/presentation/main-window/compactMascotArchitecture.test.ts src/presentation/main-window/compactMascotSurface.test.ts src/lab/rendererReuse.test.ts src/architecture/import-guard.test.ts
npm run type-check
npm run lint
python ./.trellis/scripts/task.py validate .trellis/tasks/09-07-compact-mascot-bible-strong-cat-refinement
git diff --check
```

- Verify the accepted captures match the landed geometry at actual and magnified scale.
- Repeat the zero-consumer check after removals and confirm both OneWorks dev dependencies are absent from package files.
- Recompute the historical patch SHA-256 and require it to match the pre-implementation value.

## Non-Goals

- No new avatar-core API, depth/fragment contract, mask/clip mechanism, or generic renderer.
- No upstream PR/publish, package publication/version change, fork, vendoring, or `patch-package`.
- No OneWorks production/Lab authority and no modification or deletion of archived/historical evidence.
