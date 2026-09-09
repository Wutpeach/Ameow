# Refine Compact mascot cat ears on the bible-strong base

## Status

Archived on 2026-09-09 as a stopped/rejected exploration on `main`. The user-approved 2026-09-08 replan and its historical depth-occlusion work remain retained evidence only.

## Final closure

This exploration stopped after C6 failed the final geometry/root-integration gate. The validated Lab-only frozen-pose seam is retained, but final cat geometry, native-holder/yaw-pitch evidence, and OneWorks cleanup are **not accepted**; this task grants **no Architecture PASS**. Do not resume geometry work here: retain all historical depth/C6 evidence (including patch SHA-256 `B8EDD2CF617558EC0C0A80FBA013DD3CA88DE6A22EF21C915D61403191A0A23D`) and create a new task if a future product decision calls for refinement.

## Goal

Make the Compact mascot read as a cat on the existing `@bible-strong/avatar-core` basis, then realign the Lab around that production path and remove the active OneWorks inspector/dependencies once equivalent bible-strong coverage and zero remaining consumers are verified.

## Confirmed Inputs

- `COMPACT_MASCOT_DEFINITION` already uses avatar-core and replaces the two pinned Kirby source-body hand nodes with two ear `body.nodes`.
- The Kirby hand nodes are the source reference for attached local nodes that share the body pose and projection. Their suitability for the final ear shape is not yet visually verified.
- OneWorks `pig--pink-pig` is a visual reference for ear silhouette and root embedding only. Its exact source/asset, revision or package version, and permitted-use boundary still require inspection before it can support the final geometry decision.
- `CompactMascot`, its behavior runtime, `CompactPreviewStage`, Pointer Field ownership, lifecycle, Reduced Motion, one-clock behavior, and Compact/Full contracts are the retained basis.
- The active OneWorks Lab inspector, candidate helpers/tests, and dev dependencies remain cleanup scope. Archived reports, screenshots, source references, and the historical patch must remain unchanged.

## Requirements

### R1 — Keep one bible-strong 3D path

- Represent exactly two ears as procedural avatar-core `body.nodes` on the Compact body's shared pose and projection path.
- Prefer a definition-only rounded-cone calibration.
- If final integration requires it, allow the smallest change to existing `CompactMascot` or Compact runtime render wiring needed to consume avatar-core's already-available one-body/shared-pose output. Preserve the current lifecycle and do not create another renderer or API.
- Do not add SVG-only ears, an independent animation, canvas, a duplicate definition, or an alternate renderer.

### R2 — Inspect references without adopting them

- Inspect the pinned Kirby hand-node source facts and the exact `pig--pink-pig` visual reference before accepting final geometry.
- Record reproducible source identity and comparison evidence. Do not describe either reference as visually verified until that evidence exists.
- Do not copy or import OneWorks renderer, editor, state, code, or assets into Ameow.

### R3 — Use reversible previews to produce the evidence

- Reference inspection, an untouched baseline, and reversible local rounded-cone candidate previews are the first implementation steps; they are not blocked on prior candidate evidence.
- Render candidates through the canonical Compact definition/component path in the production holder and `CompactPreviewStage` at 56px and magnified scale.
- Compare neutral, bounded pointer yaw/pitch, and retained `surprised`, `curious-short`, and `playful-short` poses in both themes.
- Accept final geometry only after captures show readable ears and convincing root integration with the existing avatar-core path.
- If existing avatar-core capabilities cannot produce an acceptable result, preserve the evidence and stop. Do not introduce depth fragments or a new core contract.

### R4 — Realign the Lab and retire OneWorks residue

- Keep `CompactPreviewStage` as a view of the production Compact component and canonical definition. Add only the smallest read-only pose/capture seam needed for equivalent bible-strong inspection.
- After equivalent bible-strong Lab coverage exists, verify repository-wide that the OneWorks inspector, candidate helpers, and packages have no remaining active consumers.
- Then remove the active OneWorks inspector route/files/tests and `@oneworks/avatar` / `@oneworks/avatar-react` dev dependencies from both package manifests.
- Preserve all archived OneWorks evidence and the historical depth-occlusion files byte-for-byte.

### R5 — Preserve behavior ownership

- Keep the existing host/runtime boundary, Pointer Field writer, one rAF clock, action policy, visibility pause/resume, Reduced Motion settlement, disposal, shell size, and native interaction behavior.
- Do not add Product/native state, IPC, a scheduler, a feature flag, or another rendering authority.

### R6 — Validate the focused result

- Update only focused definition, render-wiring, Lab, dependency, test, spec, and evidence contracts required by the accepted result.
- Keep architecture, behavior-runtime, lifecycle, import-guard, type-check, lint, focused visual/definition tests, task validation, and whitespace checks green.
- Verify zero active OneWorks consumers before dependency removal and verify archived evidence hashes remain unchanged afterward.

## Acceptance Criteria

- [ ] Two procedural avatar-core ear `body.nodes` share the Compact body's pose and projection; no independent 2D ear or second renderer exists.
- [ ] Final geometry is supported by identified Kirby and `pig--pink-pig` references plus reproducible baseline/candidate evidence; no active document overstates verification.
- [ ] Evidence at actual and magnified size covers both themes, neutral, bounded pointer yaw/pitch, and retained action poses.
- [ ] Final root integration uses only existing avatar-core capabilities; any minimal Compact/runtime wiring preserves lifecycle and one-clock behavior.
- [ ] Production and Lab use the same canonical Compact definition/component path with equivalent bible-strong inspection coverage.
- [ ] Active OneWorks inspector/candidate code, tests, and dev dependencies are removed only after zero-consumer verification; archived evidence and historical patch bytes/hash are preserved.
- [ ] Pointer, action, visibility, Reduced Motion, disposal, Compact/Full, and native-window contracts remain unchanged.
- [ ] Focused tests, type-check, lint, relevant build checks, task-manifest validation, and `git diff --check` pass for implementation.

## Out of Scope

- New avatar-core APIs, per-fragment or depth-aware output, face masks, custom ear clipping, or a generic renderer.
- Upstream PR/publish work, package publication/version changes, forks, vendoring, or `patch-package`.
- Adopting any OneWorks renderer, editor, package, state model, code, or asset as production or Lab authority.
- Product, Pointer Field, native-window, general motion, shell-geometry, release, or legal-policy changes.
- Deleting or rewriting archived/historical evidence.

## Risks and Stop Conditions

- Whole-node ordering may not integrate the ear roots across all bounded poses. This must be decided from candidate captures, not assumed.
- The exact `pig--pink-pig` reference remains unverified. If it cannot be identified or used as a reproducible visual reference, do not derive or claim final geometry from it.
- If acceptable geometry requires a forbidden core/depth mechanism, retain the failed evidence and return the unresolved product decision without broadening this task.
