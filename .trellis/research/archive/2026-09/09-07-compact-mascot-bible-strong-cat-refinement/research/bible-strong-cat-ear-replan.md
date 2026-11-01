# Research: bible-strong cat-ear replan

> **Superseded interpretation — 2026-09-08.** This report preserves useful repository facts about the existing body-node path, Kirby source anchors, `CompactPreviewStage`, and the definition-only rounded-cone probe. Its former depth-aware Option B, upstream/package strategy, and any delivery gates are abandoned and are not production requirements. The active interpretation is: verify the existing `body.nodes` mechanism and the OneWorks `pig--pink-pig` ear-shape/root-embedding reference first, then decide from visual evidence whether a definition-only calibration is sufficient. Read the active `prd.md`, `design.md`, and `implement.md` for requirements; this report does not prove either reference mechanism or current occlusion visually sufficient.

- Query: Re-plan CompactMascot cat ears after the product correction: keep production CompactMascot and the active Lab on `smontlouis/bible-strong-avatar-lab` / `@bible-strong/avatar-core`; use OneWorks only as reference for ear geometry, layering, masking, and occlusion; identify the smallest compatible implementation and the remaining product decision.
- Scope: mixed (Ameow repository, local bible-strong checkout, and archived OneWorks evidence)
- Date: 2026-09-07

## Executive conclusion

The smallest compatible first probe is definition-only: replace the two Compact diamond nodes with `cone` surfaces using avatar-core's existing rounded cone profile (`tipRoundness`, `baseRoundness`, and, if needed, `morphRoundness`), while keeping both roots sufficiently behind the 240-unit sphere for the existing back/head/front paint order to hide the seam. This keeps the production host, runtime, Pointer Field, shell bounds, Reduced Motion, and Lab mount unchanged.

Avatar-core can express shared local transforms, rounded cone silhouettes, shared head pose, and whole-node depth ordering, but it cannot emit a OneWorks-style partial face mask: `accessoryLayers` classifies each complete node as back or front. If bounded-pose visual evidence requires an ear to cross the head while its root remains masked, the smallest compatible extension is a node-level occlusion/mask output in avatar-core consumed by the existing `CompactMascot` SVG slots; this is a core-contract and licensing change, not permission to adopt or copy the OneWorks renderer.

The single highest-value remaining product decision is whether the target accepts rounded-cone ears that stay behind the head under avatar-core's binary layering, or requires true partial root occlusion while an ear crosses the head (which justifies the minimal avatar-core mask extension).

## Repository facts

### Production Compact definition and renderer

- `src/presentation/main-window/compactMascotDefinition.ts:6-8` pins the source revision to `175691ab32cefe5faec7828af62f3d50210a8eb2`, keeps the `idle` baseline, and allowlists `surprised`, `curious-short`, and `playful-short`.
- `src/presentation/main-window/compactMascotDefinition.ts:31-62` retains a 240x240x240 sphere and currently replaces the source nodes with two `diamond` ears, each 76x135x78, at `[-70,-76,-82]` and `[70,-76,-82]`, with mirrored rotations `[0,-5,-10]` and `[0,5,10]`. Module-load validation uses `validateAvatarDefinition` at lines 83-86.
- `src/presentation/main-window/compactMascotDefinition.test.ts:5-63` pins those source facts, requires exactly two diamond nodes, validates the definition, and currently expects two non-empty back paths and no front paths. A cone probe must change only the shape/layering assertions; the expression/action facts stay pinned.
- `src/presentation/main-window/compactMascotBehaviorRuntime.ts:31-52` creates one body from the canonical definition, renders the head/eyes with `bodyNodes: []`, renders the same pose's body nodes in a second `renderAvatar` call, and merges only the core `backPaths`/`frontPaths` into the scene. This is the existing seam that can consume the same core output after a definition-only change.
- `src/presentation/main-window/compactMascotBehaviorRuntime.ts:55-128` owns one rAF scheduler, the 18–32 second quiet deadline, playback/action transitions, pause/resume, Reduced Motion, disposal, and generation invalidation. Ear geometry must not add a timer, queue, second scheduler, Product event, or lifecycle callback.
- `src/presentation/main-window/CompactMascot.tsx:58-82` mutates fixed SVG path slots from `AvatarScene`; the four slots are source-specific ear slots, not a general body-node renderer. The `clipPath` at lines 153-156 is used by the eye group only (lines 165-178), not as an ear mask.
- `src/presentation/main-window/CompactMascot.tsx:158-180` paints back ears, then the head, then front ears. Keeping an ear in `backPaths` gives ordinary SVG head-over-root occlusion; a node in `frontPaths` is painted whole after the head.
- `src/presentation/main-window/MainWindowPresentationSurface.tsx:382` and `:723-735` show that the Surface remains the sole Pointer Field writer and writes the forwarded Windows point before compact-hotspot evaluation. The Compact host at `:1235-1242` passes the existing pointer field, colors, attention center, and `COMPACT_MASCOT_VISUAL_SIZE * COMPACT_MASCOT_RENDER_SCALE` (current render scale `0.95`). No ear change needs to touch this boundary.

### Existing production tests/contracts

- `src/presentation/main-window/compactMascotBehaviorRuntime.test.ts:35-106` compares displayed head/eye/ear paths with direct avatar-core geometry across retained actions and checks shell bounds. Any new ear shape must preserve same-pose equality and the current holder bounds.
- `src/presentation/main-window/compactMascotBehaviorRuntime.test.ts:108-126` covers the one-frame clock, quiet deadline, no-repeat action, pause/resume, Reduced Motion static rendering, and stale disposal. These are unaffected by a definition-only probe and must remain green.
- `src/presentation/main-window/compactMascotArchitecture.test.ts:8-32` requires a source-specific avatar-core SVG leaf with four ear slots, no OneWorks/React renderer/canvas, no authority imports, and no decorative frames under Reduced Motion.
- `src/presentation/main-window/compactMascotSurface.test.ts:12-74` guards production composition, pointer writer ordering, visibility pause/resume, no timers/authority escape, static Reduced Motion, and shell ownership.
- `.trellis/spec/frontend/character-motion.md:1-71` is the relevant contract. It currently says “exactly two core-projected diamond-ear nodes”; a selected cone or mask design requires this statement and its tests to be updated in the implementation task. The one-clock, Pointer Field, lifecycle, 80/60/56 geometry, and authority rules remain unchanged.
- `.trellis/spec/frontend/component-guidelines.md`, `.trellis/spec/frontend/motion-guidelines.md`, and `.trellis/spec/frontend/quality-guidelines.md` reinforce the Surface wiring boundary, local geometry/scheduling ownership, cleanup, and no hot-path React/IPC state. No new shared renderer or scheduler is warranted.

### Active Lab and OneWorks residue

- `src/lab/CompactPreviewStage.tsx:1-12` documents that the Lab mounts the production `CompactMascot` directly; lines 21-37 import that leaf, production 80/60/56 metrics, and a Lab-local pointer field; lines 142-150 pass the same colors, Reduced Motion, attention center, and production visual size. This already satisfies the desired single production renderer path for the Compact target.
- `src/lab/PresentationLab.tsx:101` imports `OneWorksMascotInspector`; `:522` owns `oneWorksInspectorOpen`; `:861-863` switches to a full inspector early return; and `:1122-1130` exposes the `OneWorks Mascot Inspector` button. This is the active Lab path that conflicts with the corrected bible-strong direction.
- The active inspector is `src/lab/OneWorksMascotInspector.tsx:1-16,94-124`: it imports `@oneworks/avatar-react`, its stylesheet, `Avatar`, and `AvatarEditor`, then owns an independent definition/editor/playback/pose state model. `src/lab/oneworksAmeowCandidate.ts` and `src/lab/oneworksMascot.ts` hold the candidate definition and OneWorks-specific animation/pose helpers.
- `src/lab/rendererReuse.test.ts:113-130` currently asserts that OneWorks dependencies remain Lab-only, and `:249-260` asserts the inspector mode and candidate fixtures. If no separately approved evidence consumer remains, these assertions should be inverted or removed with the inspector, candidate helpers/tests, and dev dependencies; archived screenshots/reports remain immutable evidence.
- `package.json:49-58` and `package-lock.json:1255-1269` keep `@oneworks/avatar` and `@oneworks/avatar-react` `1.0.0-rc.6` as dev dependencies. They are not production dependencies, but they keep the active inspector alive and should be removed after the Lab has equivalent bible-strong coverage and no evidence-only consumer is approved.

## Bible-strong upstream inspection

The existing local checkout is `.cindy-upstream/bible-strong-avatar-lab-175691a`, with Git HEAD exactly `175691ab32cefe5faec7828af62f3d50210a8eb2` and remote `https://github.com/smontlouis/bible-strong-avatar-lab.git`. This is the same revision pinned by the production definition.

### Core capabilities

- `packages/avatar-core/README.md:1-5,35-77` describes a framework-independent package for validation, semantic playback, and renderer-neutral SVG scene generation; it has no React, DOM, Motion, or browser-storage dependency. `renderAvatarDefinition` and `renderAvatarFrame` are the canonical definition/frame paths.
- `packages/avatar-core/src/surfaces.ts:3-15` defines `SurfaceConfig` with `sphere`, `cube`, `capsule`, `cylinder`, `cone`, and `diamond`, plus optional `morphRoundness`, `tipRoundness`, and `baseRoundness`. The schema clamps these optional roundness values to the 0–2 range.
- `packages/avatar-core/src/surfaces.ts:149-195,250-284,336-348` implements procedural cone radial profiles. Tip and base rounding change the sampled cone shoulder/apex profile; they are not CSS corner-radius decoration. This is sufficient for a first integrated-ear silhouette probe without a new renderer.
- `packages/avatar-core/src/scene.ts:37-46` maps definition nodes to runtime nodes, copying surface, position, and rotation. `:53-79` routes definitions through `renderAvatarExpression` / `renderAvatarDefinition`; no separate editor or renderer state is required for Compact or the Lab.
- `packages/avatar-core/src/geometry.ts:49-66` exposes `AvatarGeometry` as `backPaths`, `frontPaths`, node IDs, `headPath`, eye paths/visibility, and optional wire paths. It has no mask, clip, or per-fragment occlusion field.
- `packages/avatar-core/src/geometry.ts:1155-1191` samples each accessory surface, applies local Euler rotation and position, then the shared avatar pose and projection. This supplies the local attachment/shared-pose part of the desired cat-ear behavior.
- `packages/avatar-core/src/geometry.ts:1217-1234` computes one center depth and a projected depth radius, classifies each complete node with `front = depth > radius * 0.1`, sorts whole paths, and returns only back/front arrays. There is no per-node face mask or partial ear/head occlusion.
- `packages/avatar-core/src/geometry.ts:1237-1260` emits composite back paths, accessory back paths, the head path, and accessory front paths. The current Compact host's back/head/front slot order is therefore compatible with core's existing contract.

### Upstream design direction useful to the Lab

- `docs/adr/0022-model-avatar-studio-as-a-versioned-document.md:13-26` treats the avatar Studio document as one versioned document with durable expression identity and playback-owned animation. For Ameow, the practical implication is one canonical validated Compact definition and semantic actions, not a second OneWorks candidate state model.
- `docs/adr/0023-name-avatar-sequences-animations.md:14-26` standardizes “Animation” as the product term and keeps Playback as execution. The Lab can expose the existing semantic action names and playback states while remaining a read-only view of the production definition/runtime.

## OneWorks comparison (reference only)

The primary archived reference is `.trellis/research/archive/2026-09/08-25-oneworks-avatar-cat-source-fidelity/research/oneworks-cat-source-fidelity.md:11-31`, with supporting implementation/evidence reports under the same archived task family. It records the pinned OneWorks source revision `3ad2542ea4487e95884f313b84943df602c0e742` and registry packages `1.0.0-rc.6`; those artifacts are evidence, not a production recommendation.

Relevant mechanisms only:

1. Two cone ears and an ellipse head are assembled from shared local transforms and the shared head pose, so ears stay attached during yaw/pitch.
2. Cone roundness changes the procedural 3D profile and apex/shoulder silhouette.
3. Parts are depth ordered with the head.
4. An `occludedByFace` part flag causes a projected face outline to mask ear roots while tips remain visible. This is partial occlusion, not merely placing a whole ear behind or in front of the head.

The archived comparison explicitly concludes that Ameow's current avatar-core path has local transforms and binary depth ordering but no per-part face mask (`oneworks-cat-source-fidelity.md:27-31`). It also warns that direct renderer/editor adoption would duplicate authority and add a large runtime/editor surface. This report does not recommend direct `@oneworks/avatar-react` use, OneWorks editor adoption, or copying its renderer code.

## Smallest implementation options

### Option A — definition-only rounded cones (preferred first probe)

Change only the two node `surface` values in `compactMascotDefinition.ts` from `diamond` to `cone`, starting from the current 76x135x78 envelope and mirrored attachment transforms. Tune `tipRoundness`, `baseRoundness`, and optionally `morphRoundness`; keep the ear roots behind the sphere (`backPaths`) across neutral and bounded pointer/action poses. Exact final numbers are a product/visual calibration choice, not inferred from OneWorks units.

Affected contracts/files:

- `compactMascotDefinition.ts` — canonical shape data only.
- `compactMascotDefinition.test.ts` — cone/roundness assertions, two back paths, and retained expression/action facts.
- Existing `compactMascotBehaviorRuntime.ts`, `CompactMascot.tsx`, `MainWindowPresentationSurface.tsx`, and their lifecycle/surface tests — no API or authority changes expected.
- `.trellis/spec/frontend/character-motion.md` — later implementation task should replace the diamond-specific statement with the selected cone contract.

Why it is the smallest compatible option:

- It reuses avatar-core sampling, local transform, shared pose, binary depth, existing SVG slots, and all existing runtime/lifecycle code.
- Back-ear paint followed by head paint naturally hides deeply embedded roots; no custom clipping code is needed.
- It preserves the current 80px reachable frame, 60px shell, 56px holder, render scale, Pointer Field ordering, actions, Reduced Motion, and disposal.

Known ceiling:

- If a bounded pose causes an ear to classify as front, the whole projected ear is painted after the head. There is no way in the current `AvatarGeometry` contract to keep only the root hidden while the tip crosses the head. More coordinate tuning cannot create that missing mechanism.

Required evidence gate before widening scope:

- Render neutral, bounded pointer yaw/pitch, and retained actions through `renderAvatarDefinition` / `renderAvatarFrame` at the true 56px holder and a magnified Lab view.
- Confirm two readable rounded ears, no detached wedge/root, no front/back flip artifact, and unchanged shell bounds in both themes.
- Confirm existing behavior/runtime, import guards, type-check, lint, and lifecycle tests remain green. Existing tests are mostly path/bounds/architecture assertions; a visual capture is still required for the cat-seam decision.

### Option B — minimal avatar-core node mask extension (conditional)

Use only if Option A fails the visual gate specifically because a bounded pose requires partial root occlusion. Extend the bible-strong geometry contract with a small node-level occlusion representation (for example, a mask/clip path associated with a node ID) while preserving the existing back/front arrays for all callers. The current `CompactMascot` host would apply the returned mask only to the two ear slots; it would remain the source-specific SVG leaf and would not become a general editor or renderer.

Likely affected upstream/core contracts:

- `packages/avatar-core/src/geometry.ts` `AvatarGeometry` and `renderAvatar` output/options, plus focused geometry tests for mask bounds, shared-pose transforms, and front/back compatibility.
- `packages/avatar-core/src/scene.ts` only if the definition needs an explicit validated occlusion flag; avoid adding one if a geometry policy can derive it from node metadata.
- Ameow `compactMascotBehaviorRuntime.ts` scene pass-through and `CompactMascot.tsx` ear-slot mask application; `MainWindowPresentationSurface` and runtime clock remain untouched.
- Ameow definition/architecture/runtime tests and the character-motion spec to pin the new contract.

This is a larger change: it crosses the consumed AGPL package boundary and must not be implemented by embedding a second OneWorks renderer or by reimplementing a parallel SVG pipeline in the host. If source changes are required, use a properly attributed AGPL-compatible fork/patch or an upstream contribution path and retain corresponding-source obligations.

### Explicitly rejected direction

Do not adopt `@oneworks/avatar-react`, `AvatarEditor`, or a OneWorks-derived production renderer. Do not add a dual-renderer flag, a production candidate state model, or a second Lab authority. The corrected product direction requires bible-strong compatibility and one production definition/renderer path.

## Lab realignment plan (no production-authority duplication)

1. Keep `CompactPreviewStage` as the Lab's Compact host. It already mounts the production `CompactMascot`, passes the production visual size and colors, uses Lab-local pointer values, and exercises neutral/live/Reduced Motion behavior.
2. Replace the OneWorks inspector route in `PresentationLab.tsx` with the existing Compact target/scenario controls. If geometry diagnostics are needed, show read-only facts or captures derived from `COMPACT_MASCOT_DEFINITION` and the production `renderCompactMascotScene`; do not add authoring state, a second renderer, or a copy of the Studio editor.
3. Retire active OneWorks files and tests (`OneWorksMascotInspector.tsx`, `oneworksAmeowCandidate.ts`, `oneworksMascot.ts`, and their tests) once no separately approved evidence-only consumer remains. Keep archived reports, screenshots, and source references immutable for comparison.
4. Update `src/lab/rendererReuse.test.ts` and any Lab architecture assertions to require bible-strong production renderer reuse and to forbid active OneWorks imports. Remove `@oneworks/avatar` and `@oneworks/avatar-react` from `package.json` / `package-lock.json` in the same cleanup change if no active evidence consumer remains.
5. Keep Lab-local preview state limited to scenario, pointer mode, Reduced Motion, and display/background controls. The canonical definition, semantic actions, runtime clock, pointer writer, and lifecycle remain production-owned.

This alignment follows the upstream ADR shape (one versioned definition plus semantic animations) without importing or duplicating upstream Studio UI. The Lab is a probe/capture surface for the actual Ameow production path, not a second implementation.

## Exact affected-file map by decision

| Decision | Required files/contracts | Not affected |
| --- | --- | --- |
| Rounded-cone definition accepted | `compactMascotDefinition.ts`; focused definition tests; character-motion wording; visual evidence | `compactMascotBehaviorRuntime.ts`, `CompactMascot.tsx`, Surface, Pointer Field, lifecycle/native/Product state |
| Partial root occlusion required | Above, plus avatar-core `geometry.ts`/tests and Compact scene/host mask plumbing; AGPL compliance artifacts | Surface ownership, one-clock runtime, shell geometry, Product/native/IPC authority |
| Lab realignment | `PresentationLab.tsx`, `rendererReuse.test.ts`, removal of active OneWorks inspector/candidate files/tests, `package.json`, `package-lock.json` | Archived OneWorks reports/screenshots/source evidence; production `CompactMascot` authority |

## Licensing and copying boundaries

- Root `LICENSE` is MIT, but `package-lock.json:314-320` records `@bible-strong/avatar-core` 0.1.0 as `AGPL-3.0-only`; the local upstream package manifest also says AGPL-3.0-only (`packages/avatar-core/package.json:1-18`). Ameow already consumes that package, so a definition-only change does not copy core source.
- A core extension that copies or materially modifies upstream source must preserve AGPL notices, provide the required corresponding source/offer for the distributed form, and record the provenance. This is an engineering compliance boundary, not legal advice; confirm the release treatment with the project owner.
- `THIRD_PARTY_NOTICES.md` has no bible-strong-specific notice entry discovered in this pass. If source is vendored/forked or release policy requires a package notice, add the appropriate attribution during implementation rather than silently copying files.
- The archived OneWorks report identifies the rc.6 packages as MIT, and `package-lock.json:1255-1269` records those packages as MIT. MIT permission does not override the product decision: do not copy or ship the OneWorks renderer/editor, and remove active dependencies when the evidence-only consumer is retired.

## Related artifacts and references

### Internal files inspected

- `src/presentation/main-window/compactMascotDefinition.ts`
- `src/presentation/main-window/compactMascotBehaviorRuntime.ts`
- `src/presentation/main-window/CompactMascot.tsx`
- `src/presentation/main-window/MainWindowPresentationSurface.tsx`
- `src/presentation/main-window/compactMascotDefinition.test.ts`
- `src/presentation/main-window/compactMascotBehaviorRuntime.test.ts`
- `src/presentation/main-window/compactMascotArchitecture.test.ts`
- `src/presentation/main-window/compactMascotSurface.test.ts`
- `src/lab/CompactPreviewStage.tsx`
- `src/lab/PresentationLab.tsx`
- `src/lab/OneWorksMascotInspector.tsx`
- `src/lab/oneworksAmeowCandidate.ts`
- `src/lab/oneworksMascot.ts`
- `src/lab/rendererReuse.test.ts`
- `package.json`, `package-lock.json`, `LICENSE`, `THIRD_PARTY_NOTICES.md`

### Internal specs and archived evidence

- `.trellis/spec/frontend/character-motion.md`
- `.trellis/spec/frontend/component-guidelines.md`
- `.trellis/spec/frontend/motion-guidelines.md`
- `.trellis/spec/frontend/quality-guidelines.md`
- `.trellis/research/archive/2026-09/08-25-oneworks-avatar-cat-source-fidelity/research/oneworks-cat-source-fidelity.md`
- `.trellis/tasks/archive/2026-09/08-25-oneworks-avatar-cat-source-fidelity/implementation-report.md`
- `.trellis/research/archive/2026-09/08-25-oneworks-mascot-production-adoption-planning/research/production-adoption-research.md`

### External/local upstream references

- Bible Strong repository: https://github.com/smontlouis/bible-strong-avatar-lab (local checkout at `.cindy-upstream/bible-strong-avatar-lab-175691a`, revision `175691ab32cefe5faec7828af62f3d50210a8eb2`)
- `@bible-strong/avatar-core` README and package manifest under `packages/avatar-core/`
- Upstream geometry: `packages/avatar-core/src/surfaces.ts`, `src/geometry.ts`, and `src/scene.ts`
- Upstream ADRs `docs/adr/0022-model-avatar-studio-as-a-versioned-document.md` and `docs/adr/0023-name-avatar-sequences-animations.md`
- OneWorks pinned source/evidence: archived report above (source revision `3ad2542ea4487e95884f313b84943df602c0e742`, registry `1.0.0-rc.6`), reference-only

## Caveats / not found

- No avatar-core field or helper for `occludedByFace`, masks, clipping, or fragment-level ear/head intersection was found in the inspected v0.1.0 source. The only current Compact clip path clips eyes to the head; it does not mask ears.
- Current Compact tests prove geometry equality, layering counts, bounds, lifecycle, and authority boundaries, but they do not prove a convincing 56px cat seam. A visual neutral/bounded-pose capture is required before deciding that Option A is sufficient.
- The archived OneWorks measurements use a different surface model, coordinate scale, and renderer; their numeric ear coordinates/roundness values must not be copied as bible-strong definition values. Only the construction mechanisms are comparable.
- The local upstream checkout was available and matched the pinned production revision; no network fetch or upstream code modification was needed. No production, Lab, spec, package, or archived evidence file was changed by this research task.
