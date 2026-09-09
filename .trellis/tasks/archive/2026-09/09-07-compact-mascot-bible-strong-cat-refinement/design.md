# Compact mascot bible-strong cat-ear refinement design

## Design Status

Archived on `main` as stopped/rejected after the user-corrected 2026-09-08 plan. This design does not claim that the Kirby visual result, `pig--pink-pig` asset, candidate geometry, or root integration has been verified.

## Final closure

The C6 exploration is stopped/rejected, not accepted geometry. Preserve the Lab-only frozen-pose seam as the sole retained implementation; do not award an Architecture PASS, remove OneWorks, or reopen geometry/core research under this design. The historical depth patch and rejected C6 evidence remain immutable; any new geometry decision starts a new task.

## Fixed Basis

- Keep `@bible-strong/avatar-core`, one canonical Compact definition, the production `CompactMascot`, its current behavior lifecycle, and `CompactPreviewStage`.
- Keep exactly two procedural ear `body.nodes` with local transforms evaluated through the Compact body's shared pose and projection.
- Use Kirby hands only as the attached-node source reference and `pig--pink-pig` only as the ear-silhouette/root-embedding visual reference.
- Prefer geometry-only calibration while allowing minimal existing-core Compact/runtime render wiring when necessary. No new core contract is allowed.

## Active Data Flow

```text
COMPACT_MASCOT_DEFINITION.body.nodes
  -> existing avatar-core body/pose/projection
  -> existing Compact scene slots
  -> CompactMascot
  -> production 56px holder + CompactPreviewStage
```

The final result must retain one canonical definition, one shared body pose, and one Compact-local clock. A candidate preview may temporarily vary ear geometry but must still travel through this production path.

## Evidence-Producing Implementation

1. Record the exact pinned Kirby source-node facts and identify the exact `pig--pink-pig` source/asset, revision or package version, and permitted-use boundary.
2. Capture the untouched production definition as a baseline.
3. Add reversible local rounded-cone candidates through the canonical Compact path. Candidate work is permitted before the final visual evidence because it produces that evidence.
4. Capture 56px and magnified output in both themes for neutral, bounded pointer yaw/pitch, and retained actions.
5. Select and land final geometry only when the evidence shows readable ears and convincing root integration.

The evidence gate accepts final geometry; it does not prohibit reference inspection, local candidate code, or capture controls needed to reach the gate.

## Minimal Integration Boundary

- First choice: change only the two canonical node surfaces, dimensions, roundness, local positions, and rotations.
- If avatar-core's existing output needs different local consumption to preserve a single body/shared pose, the task may make the smallest focused change in `CompactMascot.tsx` or `compactMascotBehaviorRuntime.ts` and their tests.
- Such wiring must reuse existing avatar-core APIs and existing SVG slots, preserve the runtime lifecycle and one-clock behavior, and add no renderer abstraction, scheduler, authority, or public core API.
- These routine integration edits belong to this task; they do not require a separate task.
- If the result would require new depth fragments, masks, clipping contracts, or any core API extension, stop with preserved evidence.

## Lab Realignment and Dependency Cleanup

1. Extend `CompactPreviewStage` only as needed to provide bible-strong baseline/candidate, pose, scale, and theme inspection through the production component.
2. Confirm that this supplies equivalent coverage for the active OneWorks inspector use case without copying its renderer/editor model.
3. Run a repository-wide zero-consumer check for `OneWorksMascotInspector`, OneWorks candidate/playback helpers, and `@oneworks/avatar*` imports.
4. Remove the active inspector route, candidate/helper files and focused tests, then remove both OneWorks dev dependencies from `package.json` and `package-lock.json`.
5. Update Lab reuse/import assertions to require the bible-strong production path and forbid active OneWorks imports.

Archived OneWorks reports/screenshots/source references and every file under `historical-experiments/` remain immutable evidence.

## Preserved Contracts

- `MainWindowPresentationSurface` remains the only Pointer Field writer.
- The Compact runtime retains one rAF clock, the current action allowlist, visibility behavior, Reduced Motion path, and stale-callback disposal.
- Shell bounds, holder size, native geometry, Product state, Presentation ownership, and IPC remain unchanged.
- The Lab remains a read-only view/capture surface for production behavior, not an editor or second source of truth.

## Explicit Exclusions

No new avatar-core API, depth/fragment output, face mask, ear clip path, generic renderer, upstream PR/publish, package publication, fork, vendored core, or `patch-package` work is part of this design.

## Rollback

- Revert candidate/final ear data and any focused Compact/Lab wiring to the prior values.
- Restore removed active OneWorks files and dependency entries only if the zero-consumer/equivalent-coverage premise was wrong.
- Never use or modify the historical patch as a rollback mechanism.
