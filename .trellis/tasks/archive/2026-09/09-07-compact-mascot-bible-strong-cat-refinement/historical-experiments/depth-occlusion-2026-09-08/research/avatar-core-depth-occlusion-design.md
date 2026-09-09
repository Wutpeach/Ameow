# Research: avatar-core depth-aware partial occlusion design

- Query: Determine the minimum maintainable design for true depth-aware partial occlusion between the canonical 3D Compact cat-ear body nodes and the primary head/body in the existing bible-strong avatar-core pipeline. The design must remain one bible-strong geometry path, must not become a fixed 2D mask, hand-authored SVG ear, whole-node front/back solution, or OneWorks renderer, and must cover tests, callers, npm maintenance, licensing, distribution, and rollback.
- Scope: mixed (Ameow source, the pinned local bible-strong/avatar-core source and package, archived OneWorks evidence for mechanism comparison only, npm metadata, release packaging, and AGPL-3.0-only text).
- Date: 2026-09-07

## Executive recommendation

Product has selected true partial occlusion (Option B). The smallest maintainable implementation is an additive, opt-in geometry contract in avatar-core:

1. Keep every existing AvatarGeometry field and the existing complete-node backPaths/frontPaths arrays for compatibility.
2. Add an optional nodeFragments array. It contains one record per input BodyNode, in input order, with the existing stable node id and two core-generated SVG path strings: backPath and frontPath. Each string may contain multiple closed subpaths and may be empty.
3. Add one optional RenderAvatarOptions.occlusion mode, with depth-aware as the only new value. The default remains the current whole-node behavior.
4. In depth-aware mode, core samples the existing procedural node surface grid, applies the existing local transform and shared pose, projects the samples, queries the primary surface depth along the same camera ray, and clips each sampled triangle at depth crossings. Back fragments are painted before the head and front fragments after the head. No host-authored ear mask or second renderer is involved.
5. Keep AvatarScene unchanged as a top-level shape: its existing geometry field carries nodeFragments. Add only optional render-policy pass-throughs to the public scene/frame helpers if the canonical static APIs must opt in.
6. Change Compact to one full-body renderAvatar call with BODY.nodes, eyeOffset, and depth-aware mode. CompactMascot continues to own four source-specific SVG slots; it consumes the core fragment records and keeps the existing head clip only for eyes.

The recommended delivery is an upstream contribution to smontlouis/bible-strong-avatar-lab, followed by an exact npm dependency update. A small maintained fork/scoped package is the fallback if upstream cannot publish on the required schedule. Vendoring is an emergency fallback, and patch-package is only a short-lived bridge with an explicit expiry and rollback. The consumed package is AGPL-3.0-only; an Ameow root MIT license does not remove attribution, license, corresponding-source, legal-notice, or (where applicable) installation-information duties.

## Findings

### Current core contract and the missing mechanism

The pinned upstream checkout is .cindy-upstream/bible-strong-avatar-lab-175691a at commit 175691ab32cefe5faec7828af62f3d50210a8eb2, which is the revision recorded by the production Compact definition (compactMascotDefinition.ts:6). The published package currently used by Ameow is @bible-strong/avatar-core 0.1.0 (package.json:49-53; package-lock.json:314-324); npm exposes only version 0.1.0 on the research date.

AvatarGeometry currently exposes complete back/front path arrays, node-id arrays, head and eye paths, visibility, and wire paths; it has no mask or fragment output (upstream packages/avatar-core/src/geometry.ts:49-60). RenderAvatarOptions currently has only includeWire, bodyNodes, and eyeOffset (geometry.ts:62-66). BodyNode has an id, name, procedural SurfaceConfig, position, and rotation (body.ts:5-11), so no new body schema field is required for the fixed Compact use case.

accessoryPath samples a 17 by 49 longitude/latitude grid, applies the node's local Euler rotation and position, then the shared avatar pose and projection (geometry.ts:1155-1191). That is the correct canonical 3D source to reuse. The failure is in accessoryLayers: it reduces each complete node to a center depth, computes a projected depth radius, classifies the whole node with a single front boolean, sorts those whole paths, and returns only the two flattened arrays (geometry.ts:1193-1234). renderAvatar then concatenates composite back paths, complete accessory back paths, the head path, and complete accessory front paths (geometry.ts:1237-1260). More position tuning cannot make an ear root stay behind while its tip crosses the head when a complete node is placed in front.

The primary sphere is the current Compact head. Core already has one projection function with focal-length perspective (geometry.ts:266-270), exact ellipsoid projection for sphere/mickey paths (geometry.ts:930-1044), and front-surface sampling for all supported primitives (surfaces.ts:519-574). These are enough to add an internal primary-depth query without adding a graphics dependency.

### Current scene/runtime/host seams

scene.ts maps definition nodes to runtime-node-index ids and copies their surface, position, and rotation (scene.ts:37-46). AvatarScene is only geometry plus colors (scene.ts:48-51); no scene-level mask or renderer state exists. renderAvatarExpression builds a body and calls renderAvatar with body.nodes (scene.ts:53-69), renderAvatarDefinition selects the expression (scene.ts:71-79), and renderAvatarFrame samples playback then calls renderAvatarExpression (runtime.ts:337-348).

Ameow currently renders Compact head/eyes once without body nodes and renders the same pose a second time with BODY.nodes, then merges only the second call's ear arrays (compactMascotBehaviorRuntime.ts:31-52). This is redundant and makes a future depth result easy to accidentally desynchronise. The target is one renderAvatar call that receives bodyNodes and eyeOffset together, returning one coherent geometry result.

CompactMascot has four fixed source-specific ear path slots, one head path, two eye paths, and a clipPath used by the eye group (CompactMascot.tsx:40-82 and :153-180). The clipPath is not an ear mask. In the new contract, the host still paints back ear fragments, then the head/eyes, then front ear fragments; all fragments come from the same core sample/pose/depth calculation.

CompactPreviewStage already mounts the production CompactMascot with production 80/60/56 geometry, colors, Reduced Motion, and a Lab-local pointer field (CompactPreviewStage.tsx:1-12 and :142-150). MainWindowPresentationSurface remains the sole Pointer Field writer and should not be changed for this geometry work. PresentationLab still has an active OneWorksMascotInspector import/state/route/button (PresentationLab.tsx:101, :522, :861-863, :1122-1130); this is cleanup after equivalent bible-strong Lab coverage, not a reason to add a second renderer.

### Why the rejected shortcuts are not equivalent

- A fixed 2D clip or mask made in CompactMascot would be screen-space data, would not follow the node's actual camera depth, and would hide an ear tip whenever it lies inside the projected head even if that tip is physically in front. A dynamic mask generated from a separately authored outline has the same authority problem. The host must not own this operation.
- A hand-drawn SVG ear or a static path overlay discards the procedural SurfaceConfig, local transform, shared pose, and depth relation required by the product contract.
- Keeping whole-node frontPaths/backPaths is exactly the missing behavior: there is no way to express a crossing node with a hidden root and visible tip.
- Importing @oneworks/avatar-react, AvatarEditor, or copying the OneWorks software renderer would introduce a second authority, a parallel renderer/editor state model, and a different geometry unit system. The archived OneWorks report is mechanism evidence only.
- Adding an occludedByFace flag to every body definition node would enlarge the v1 JSON schema, parser, editor, and migration surface. For the two fixed Compact ears, primary-vs-node depth is derivable from existing body data; no definition metadata is needed.

## Files found

| Path | Relevant fact |
| --- | --- |
| src/presentation/main-window/compactMascotDefinition.ts | Pinned upstream revision, 240-unit sphere, two current 76x135x78 diamond nodes, expressions, and action definitions. |
| src/presentation/main-window/compactMascotBehaviorRuntime.ts | Current two-render/merge seam; owns one rAF clock, actions, Reduced Motion, pause/resume, and disposal. |
| src/presentation/main-window/CompactMascot.tsx | Four source-specific ear slots; head/eye paint order; existing clipPath is eye-only. |
| src/presentation/main-window/compactMascotDefinition.test.ts | Pinned source/shape/layering assertions and neutral projection checks. |
| src/presentation/main-window/compactMascotBehaviorRuntime.test.ts | Direct core equality, action-boundary times, shell bound, clock, lifecycle, Reduced Motion, and disposal tests. |
| src/presentation/main-window/compactMascotArchitecture.test.ts | One source-specific avatar-core SVG leaf and no canvas/authority checks. |
| src/presentation/main-window/compactMascotSurface.test.ts | Surface wiring, pointer writer ordering, shell, timer, lifecycle, and Reduced Motion guards. |
| src/presentation/main-window/MainWindowPresentationSurface.tsx | Sole Pointer Field writer and unchanged Compact host boundary. |
| src/lab/CompactPreviewStage.tsx | Lab mounts production CompactMascot and production geometry constants. |
| src/lab/PresentationLab.tsx | Active OneWorks inspector import/state/route/button to remove after bible-strong coverage. |
| src/lab/rendererReuse.test.ts | Lab graph and active OneWorks dependency assertions; must be realigned after cleanup. |
| src/architecture/import-guard.test.ts | Existing Compact authority/import boundaries; no new authority imports are allowed. |
| .trellis/spec/frontend/character-motion.md | Compact single-clock, pointer, lifecycle, Reduced Motion, shell, and current diamond wording. |
| .cindy-upstream/bible-strong-avatar-lab-175691a/packages/avatar-core/src/geometry.ts | AvatarGeometry, RenderAvatarOptions, projection, node sampling, current whole-node layer classification, and render output. |
| .cindy-upstream/bible-strong-avatar-lab-175691a/packages/avatar-core/src/scene.ts | Definition-to-body conversion, AvatarScene, and public scene helpers. |
| .cindy-upstream/bible-strong-avatar-lab-175691a/packages/avatar-core/src/runtime.ts | Public renderAvatarFrame helper and playback environment. |
| .cindy-upstream/bible-strong-avatar-lab-175691a/packages/avatar-core/src/body.ts | BodyNode/AvatarBody shape, runtime ids, node count limits, and parsing. |
| .cindy-upstream/bible-strong-avatar-lab-175691a/packages/avatar-core/src/surfaces.ts | Procedural surfaces, cone profiles, front-surface samples, and normals. |
| .cindy-upstream/bible-strong-avatar-lab-175691a/packages/avatar-core/src/__tests__/core-test.ts | Existing public definition/frame and deterministic geometry tests; smallest upstream fixture home. |
| .cindy-upstream/bible-strong-avatar-lab-175691a/packages/avatar-core/src/avatarDefinition.ts | v1 definition types; body nodes currently contain only surface/position/rotation. |
| .cindy-upstream/bible-strong-avatar-lab-175691a/packages/avatar-core/src/avatarDefinition.schema.json | v1 schema with additionalProperties false and no occlusion metadata. |
| .cindy-upstream/bible-strong-avatar-lab-175691a/packages/avatar-core/package.json | AGPL-3.0-only metadata, package files, build, exports, and Node >=22.12.0 engine. |
| .cindy-upstream/bible-strong-avatar-lab-175691a/packages/avatar-core/README.md | Framework-independent contract, scene/frame APIs, and pre-1.0 SemVer rule. |
| .cindy-upstream/bible-strong-avatar-lab-175691a/.changeset/config.json | Fixed release group for avatar-core, avatar-react, and avatar-web. |
| node_modules/@bible-strong/avatar-core/LICENSE | AGPL-3.0 license text, including sections 5, 6, and 13 used below. |
| package.json and package-lock.json | Exact Ameow dependency, npm lock integrity, and OneWorks dev dependencies. |
| electron-builder.config.mjs | Explicit packaged files and node_modules README/LICENSE exclusion. |
| .github/workflows/release.yml | Windows/macOS object-code artifacts, GitHub Release notes, and Node 20 build jobs. |
| THIRD_PARTY_NOTICES.md | Existing Paper-only notice; no bible-strong entry found. |
| LICENSE | Ameow root MIT license; it does not replace dependency terms. |
| .trellis/tasks/archive/2026-09/08-25-oneworks-avatar-cat-source-fidelity/research/oneworks-cat-source-fidelity.md | Archived OneWorks mechanism/occlusion evidence; reference only. |

## Code patterns and line citations

- The core public geometry shape is geometry.ts:49-66. Extending it with one optional nodeFragments field and one optional occlusion option is additive and keeps all existing callers type-compatible.
- Body-node identity already exists at body.ts:5-11 and scene.ts:37-46. Preserve the supplied BodyNode.id in each fragment record; do not add definition ids for this task.
- Procedural cone support is already in surfaces.ts:149-195, :250-284, and :340-348. Cone tipRoundness/baseRoundness/morphRoundness alter sampled 3D profiles and can be calibrated without a new renderer.
- Existing sample transforms are geometry.ts:1155-1182. Reuse this transform sequence and cache; do not introduce a host-side transform.
- Existing projection is geometry.ts:266-270. A perspective camera ray can be reconstructed internally from the same focal-length formula; orthographic mode can use a negative-z ray.
- Existing primary front sampling is surfaces.ts:519-574 and full sampling/normal handling is surfaces.ts:615-665. A generic primary depth fallback can be built from a deterministic projected front-surface mesh using these helpers.
- Existing exact ellipsoid projection is geometry.ts:930-1044. The Compact sphere can use an analytic ray/ellipsoid intersection for the primary depth query.
- Existing whole-node ordering is geometry.ts:1217-1234 and output assembly is :1237-1260. Keep those arrays as the compatibility path; nodeFragments is the authoritative output only when depth-aware mode is explicitly requested.
- Public scene/frame wrappers are scene.ts:53-79 and runtime.ts:337-348. If static Definition and public Frame paths must opt in, add trailing optional render-policy arguments, not a new scene state object or a playback environment field.
- Ameow's current redundant render is compactMascotBehaviorRuntime.ts:31-52. The minimal consumer change deletes the head-only call and ear merge and keeps one call with both bodyNodes and eyeOffset.
- Compact's existing source-specific slot/order boundary is CompactMascot.tsx:58-82 and :158-180. Replace complete ear-path reads with node fragment reads; retain slot count, fills, head path, eye clip, pointer reads, and lifecycle effects.
- Action fixture times already exist at compactMascotBehaviorRuntime.test.ts:45-59: 0, 250, 500, 2_299, 2_300, 2_550, 2_800, 5_099, 5_100, 5_350, and 5_599 ms.
- Existing shell and lifecycle checks are compactMascotBehaviorRuntime.test.ts:64-81 and :108-126. They remain required after geometry changes.
- The Lab production renderer reuse contract is rendererReuse.test.ts:221-247; active OneWorks assertions are :113-130 and :249-260.
- Packaging excludes dependency license files at electron-builder.config.mjs:39-44 and packages dist/assets through :54-63. Do not assume the npm package's LICENSE is present in an installer.
- Release artifacts and source-note gate are .github/workflows/release.yml:49-69, :118-149, and :201-240. The release workflow currently checks release-notes/v<version>.md and publishes GitHub Release artifacts.

## Exact proposed contract

### Types and compatibility

The following is the smallest public shape. Names are illustrative but intentionally specific; implementation should settle the final spelling in the upstream PR.

~~~ts
export type AvatarOcclusionMode = "none" | "depth-aware";

export type AvatarNodeFragments = {
  nodeId: string;
  backPath: string;
  frontPath: string;
};

export type AvatarGeometry = {
  // Existing fields stay byte-for-byte compatible.
  backPaths: string[];
  frontPaths: string[];
  backNodeIds: (string | null)[];
  frontNodeIds: (string | null)[];
  headPath: string;
  leftPath: string;
  rightPath: string;
  leftVisible: boolean;
  rightVisible: boolean;
  wirePaths: string[];
  nodeFragments?: AvatarNodeFragments[];
};

export type RenderAvatarOptions = {
  includeWire?: boolean;
  bodyNodes?: BodyNode[];
  eyeOffset?: Readonly<{ x: number; y: number }>;
  occlusion?: AvatarOcclusionMode;
};
~~~

Contract invariants:

- With the default/none mode, nodeFragments is omitted and current complete-node arrays are unchanged.
- With depth-aware mode, nodeFragments is present even when bodyNodes is empty (an empty array in that case), and contains exactly one record per bodyNodes item, in input order. Each record preserves that node's id. Compact therefore gets exactly two records with the stable runtime-node-0 and runtime-node-1 ids produced by bodyFromDefinition.
- backPath and frontPath are unit-space SVG paths generated by core's existing path formatter. They may contain multiple closed M...Z subpaths because clipping a tessellated surface can produce disconnected pieces; an empty string means no fragment on that side.
- The complete-node backPaths/frontPaths and their node-id arrays remain available as a compatibility/diagnostic fallback. A caller requesting depth-aware output must not paint those complete accessory paths as well as nodeFragments, or it will undo the occlusion.
- No mask, clipPath, canvas, DOM node, or renderer object is added to AvatarGeometry. The output is geometry fragments, not a second rendering pipeline.
- nodeFragments is optional at the type level to preserve existing consumers, but renderAvatar must guarantee it for the depth-aware option. Focused tests should fail if the guarantee is broken.

### Scene and runtime API surface

AvatarScene does not need a new top-level field: its geometry field already carries AvatarGeometry (scene.ts:48-51). Keep colors and all playback state unchanged.

For canonical high-level callers, add a trailing optional render policy to renderAvatarExpression, renderAvatarDefinition, and renderAvatarFrame. The policy should be a narrow Pick of includeWire, eyeOffset, and occlusion so scene helpers cannot accidentally accept/override bodyNodes; scene.ts always supplies body.nodes. Existing call sites remain valid because the argument is optional. renderAvatarFrame should keep occlusion out of AvatarRuntimeEnvironment: playback environment is random/reducedMotion, while occlusion is a geometry/render policy.

If upstream maintainers prefer not to widen those wrappers in the first release, Ameow can use the low-level renderAvatar call for every production frame and allow the initial static scene to settle on the first runtime render. The cleaner canonical path is the optional wrapper pass-through because CompactMascot's initialScene and direct public-frame tests then exercise exactly the same depth-aware output without a one-frame legacy flash.

Do not change the v1 avatar definition schema or add occlusion metadata to body nodes. The fixed primary-vs-node depth relation is derivable from existing data. A future per-node policy belongs in a separately versioned schema proposal, not this Compact refinement.

## Exact geometry algorithm

All steps stay inside avatar-core/src/geometry.ts and reuse existing helpers. No graphics library, browser API, or host geometry code is needed.

1. Build the existing pose and complete-node compatibility output exactly as today. Keep accessoryLayers for legacy backPaths/frontPaths, node ids, and ordering.
2. When options.occlusion is not depth-aware, return the existing geometry object without nodeFragments.
3. When depth-aware, obtain the cached 17 by 49 local sample grid for each node. Keep the duplicate longitude seam handling deterministic. For every sample, retain both the transformed camera-space point and its projected point; do not reduce it to a convex hull.
4. Build a primary-depth query for the surface passed to renderAvatar:
   - For sphere/mickey ellipsoids, reconstruct the same camera ray used by project. For perspective p, focal length f = FOCAL_LENGTH / p, camera origin is (0, 0, f), and a projected point q uses ray direction (q.x, q.y, -f). Transform the ray by the inverse pose quaternion and solve the ellipsoid quadratic; choose the nearest positive intersection and transform it back to camera space.
   - For orthographic/zero perspective, use a negative-z ray at the same projected x/y and solve the front depth in the primary's local frame.
   - For capsule, cone, cylinder, cube, diamond, or any future primary where an analytic intersection is not already available, construct a deterministic front-surface mesh from surfaceFrontSampleAt. Transform/project its vertices with the same pose/perspective and interpolate camera z inside the containing projected triangle. If a query lies outside the projected primary mesh, return no hit. This generic fallback is internal and can be improved later without changing the public contract.
5. For each adjacent surface grid cell, triangulate with one fixed diagonal. For each triangle vertex, compute signed depth delta = nodeCameraZ - primaryDepthAt(projectedXY). A missing primary hit means the point is outside the head silhouette and is front-visible.
6. Classify each triangle:
   - all deltas below a small internal epsilon: append the projected triangle to the node's back fragment;
   - all deltas above epsilon: append it to the front fragment;
   - mixed signs: clip the triangle twice (behind and in-front) with a Sutherland-Hodgman style half-plane pass. At a crossing edge, linearly interpolate both the projected point and camera depth at the zero crossing. Drop degenerate polygons.
   Equal/near-equal depth must consistently favor back (head wins the tie). Keep the epsilon internal and fixed; do not add a per-frame tuning knob. A value documented in the upstream implementation and covered by boundary tests is preferable to exposing another public option.
7. Concatenate the clipped polygon loops into backPath/frontPath using the existing path formatter. Internal shared edges are harmless under one fill color; do not run convexHull over fragments because that would fill the very regions that need occlusion. Preserve input node order in nodeFragments.
8. Return existing head/eye/wire paths and compatibility arrays unchanged, plus nodeFragments. Compact paints each node's backPath before head and frontPath after head. The core therefore owns the crossing decision, while the host remains a narrow source-specific SVG leaf.

This algorithm is a sampled depth test, not a 2D mask: every fragment is regenerated from the canonical 3D surface, local transform, shared pose, projection, and primary depth at the current frame. It naturally changes with yaw, pitch, transition interpolation, ambient motion, and action frames. The existing 17 by 49 density should be reused first; only a measured 56px visual/performance failure justifies a density adjustment.

## Fixture and assertion matrix

Use the existing production definition and action state machinery. Add one deliberately crossing core-only body fixture if the deeply embedded production ears never produce both fragments at an approved Compact pose. Do not move production ears solely to make a test cross.

### Common assertions for every depth-aware frame

- geometry.nodeFragments exists and has exactly two records for Compact.
- Record ids are exactly the two BODY ids in stable input order; no node appears twice and no body node is silently dropped.
- Every fragment path is deterministic across repeated renders of the same pose/time/random input. Paths contain no NaN or Infinity and use unit-space coordinates.
- The core headPath, leftPath, and rightPath are exactly the canonical output for that same pose; only ear consumption changes.
- At least one deliberate crossing fixture has both backPath and frontPath non-empty for the same node. A node with only one visible side is valid when the current pose is fully behind, fully in front, or outside the primary.
- Changing yaw or pitch changes the fragment strings at a crossing without replacing the node with a different whole-ear path or dropping the stable id.
- Flattened compatibility arrays still contain the existing complete-node paths for legacy callers; the Compact host reads nodeFragments in depth-aware mode and never paints both representations.

### Required pose/action fixtures

| Fixture | Input | Required evidence |
| --- | --- | --- |
| compact-neutral | COMPACT_MASCOT_DEFINITION, neutral head [0, 0, 0], reducedMotion false and true | Two attached ears; deterministic fragments; roots are hidden by back fragments where the sphere overlaps. Reduced Motion changes playback policy only, not the depth algorithm. |
| compact-yaw-left | A test expression produced by rotateExpressionAroundAxis(neutral, y, -35 degrees) or equivalent explicit head yaw | Fragment boundaries follow shared pose; no whole-ear front/back flip; head and ears remain attached. |
| compact-yaw-right | Same with +35 degrees; expression-15 ([0.319140625, 35.307421875, -10.904296875]) is an additional production-data sample | Symmetric yaw coverage and deterministic opposite-side visibility. |
| compact-pitch-up | rotateExpressionAroundAxis(neutral, x, -20 degrees) or explicit -20 degree head pitch | Root depth changes continuously and remains attached; no fixed mask artifact. |
| compact-pitch-down | rotateExpressionAroundAxis(neutral, x, +20 degrees) or explicit +20 degree head pitch | Same assertions in the opposite direction. Existing expression-02 ([-15.287109375, 15.006640625, 12.787890625]) and expression-03 ([2.946875, -16.051171875, -20.916015625]) are retained production samples. |
| depth-crossing-neutral | Core-only primary sphere 240x240x240 and mirrored cone nodes, starting with surface cone width 76, height 135, depth 78, roundness 0, tipRoundness 0.55, baseRoundness 0.45; positions [-70, -55, 55] and [70, -55, 55], rotations [0, 0, 0] | At least one node has non-empty backPath and frontPath at neutral. This fixture deliberately intersects the primary; it is not the Compact definition. |
| depth-crossing-yaw/pitch | The same crossing body with +/-35 degree yaw and +/-20 degree pitch | Fragment strings change with pose while node ids and source surfaces remain constant. |
| surprised action | COMPACT_MASCOT_DEFINITION, surprised (expression-03 -> expression-21) | Render at 0, 250, 500, 2_299, 2_300, 2_550, 2_800, 5_099, 5_100, 5_350, and 5_599 ms with deterministic random source. |
| curious-short action | curious-short (expression-00 -> expression-15) | Same transition/hold boundary times; preserve the existing distinct upstream poses. |
| playful-short action | playful-short (expression-02 -> expression-17) | Same times and geometry/bounds assertions. |
| neutral/static lifecycle | reducedMotion true, renderStatic, pause/resume, dispose/remount | No extra timer or scheduler; static frame still uses one depth-aware render; stale callbacks do not mutate fragments. |

The action times come directly from compactMascotBehaviorRuntime.test.ts:45-59 and the action definitions at compactMascotDefinition.ts:74-80. Add the core crossing fixture to upstream packages/avatar-core/src/__tests__/core-test.ts (the current smallest shared test file) and add production fixture/host assertions to compactMascotBehaviorRuntime.test.ts. A separate fixture framework is unnecessary.

Keep the existing shell bound assertion at COMPACT_MASCOT_RENDER_SCALE, both themes, pointer attention, one-frame clock, quiet deadline, no-repeat action, pause/resume, Reduced Motion, and stale disposal. Add a source-architecture assertion that depth-aware rendering is one full-body call and that no ear clipPath or hand-authored path appears in CompactMascot.

## Caller and data-flow map

### Current flow

1. COMPACT_MASCOT_DEFINITION is validated once and BODY is made by bodyFromDefinition.
2. Each runtime frame samples playback and ambient pose.
3. renderCompactMascotScene calls renderAvatar without body nodes, then calls it again with BODY.nodes, and merges only ear arrays.
4. CompactMascot writes four complete ear arrays into fixed slots, paints head/eyes, and keeps a head clip for eyes.
5. CompactPreviewStage mounts the same leaf in the Lab; MainWindowPresentationSurface owns pointer writes and shell/lifecycle.

### Target flow

1. The canonical definition and BODY remain unchanged except for cone calibration in the implementation phase.
2. Each frame calls renderAvatar once with BODY.primary, BODY.nodes, eyeOffset, blink, and occlusion: depth-aware.
3. Core returns head/eyes plus compatibility arrays and two nodeFragments records. No host mask is generated.
4. CompactMascot maps the two fragment records to its four fixed slots: each node's backPath before the head and frontPath after the head. The existing eye clip continues to clip eyes only.
5. Lab continues to mount CompactMascot through CompactPreviewStage. Once equivalent bible-strong coverage is available, PresentationLab's OneWorks inspector route and dev dependencies are removed. Pointer Field, one rAF clock, lifecycle, Reduced Motion, shell size, and Product/native authority remain untouched.

### Exact callers affected by the core extension

| Caller/file | Change |
| --- | --- |
| upstream packages/avatar-core/src/geometry.ts | Add types, primary depth query, triangle clipping, nodeFragments output, and opt-in mode. Keep legacy arrays. |
| upstream packages/avatar-core/src/scene.ts | Only optional render-policy pass-through for renderAvatarExpression/renderAvatarDefinition if high-level callers need depth-aware output; AvatarScene shape stays unchanged. |
| upstream packages/avatar-core/src/runtime.ts | Only optional trailing render-policy pass-through for renderAvatarFrame; do not alter AvatarRuntimeEnvironment. |
| upstream packages/avatar-core/src/__tests__/core-test.ts | Add neutral/yaw/pitch/crossing node and deterministic fragment assertions plus public wrapper equality. |
| upstream packages/avatar-core/README.md | Document nodeFragments, depth-aware mode, compatibility arrays, and sample semantics. |
| Ameow compactMascotBehaviorRuntime.ts | Delete the head-only render and merge; issue one full-body depth-aware render and pass geometry through unchanged. |
| Ameow CompactMascot.tsx | Read nodeFragments for the two fixed ear slots; do not add a mask/renderer. Initial scene should opt into depth-aware mode through the public wrapper if that wrapper is extended. |
| Ameow compactMascotDefinition.ts | Calibrate the two procedural cone surfaces only after the core mode exists; no occlusion metadata. |
| Ameow focused Compact tests | Assert two records/ids, crossing fragments, direct core equality, action boundaries, shell, architecture, and lifecycle. |

## Exact affected-file map and unchanged boundaries

### Upstream contribution files

- packages/avatar-core/src/geometry.ts: required implementation and public types.
- packages/avatar-core/src/scene.ts: optional wrapper pass-through only.
- packages/avatar-core/src/runtime.ts: optional frame-policy pass-through only.
- packages/avatar-core/src/__tests__/core-test.ts: focused fixtures/assertions.
- packages/avatar-core/README.md: public contract documentation.
- .changeset/depth-aware-occlusion.md (name to be chosen): release metadata. The upstream fixed group includes avatar-core, avatar-react, and avatar-web (.changeset/config.json); expect the group policy when publishing.
- Generated dist and declaration output: build from source; never hand-edit generated files.

### Ameow consumer/cleanup files

- src/presentation/main-window/compactMascotBehaviorRuntime.ts
- src/presentation/main-window/CompactMascot.tsx
- src/presentation/main-window/compactMascotDefinition.ts
- src/presentation/main-window/compactMascotDefinition.test.ts
- src/presentation/main-window/compactMascotBehaviorRuntime.test.ts
- src/presentation/main-window/compactMascotArchitecture.test.ts
- src/presentation/main-window/compactMascotSurface.test.ts
- src/lab/rendererReuse.test.ts
- src/lab/PresentationLab.tsx
- package.json and package-lock.json (exact core version; remove OneWorks dev dependencies only when no evidence-only consumer remains)
- .trellis/spec/frontend/character-motion.md (replace diamond-specific language with procedural cone/nodeFragments wording while preserving all lifecycle/Pointer Field contracts)
- THIRD_PARTY_NOTICES.md and the chosen shipped legal-notice path
- electron-builder.config.mjs and/or a legal-file staging step, so notices are actually present in app artifacts
- .github/workflows/release.yml and release-notes/v<version>.md when publishing an updated package/app

Retire active OneWorks files/tests only after equivalent bible-strong Lab coverage and no separately approved evidence-only consumer:

- src/lab/OneWorksMascotInspector.tsx
- src/lab/oneworksAmeowCandidate.ts
- src/lab/oneworksMascot.ts
- related OneWorks-specific tests and package.json/package-lock.json dev dependencies

Do not touch MainWindowPresentationSurface, Pointer Field writers, native-window geometry, Product/native/IPC state, lifecycle ownership, or the archived OneWorks research artifacts for this geometry task. CompactPreviewStage needs no code change; it is already the correct production renderer reuse seam.

## Package maintenance while avatar-core is an npm dependency

### Package facts

The upstream package is framework-independent and renderer-neutral (packages/avatar-core/README.md:1-5), exports the root plus geometry/body/surfaces/ambient-motion/schema entry points (package.json:30-51), builds with Vite and TypeScript (package.json:53-56), ships dist/README.md/LICENSE (package.json:25-29), and declares Node >=22.12.0 (package.json:68-70). The upstream workspace uses pnpm and Changesets; its fixed group is avatar-core/avatar-react/avatar-web (.changeset/config.json). Ameow currently uses npm and a root release workflow pinned to Node 20 (.github/workflows/release.yml:19-23, :87-91). The core package is consumed from a prebuilt npm tarball, so runtime bundling does not require Ameow to build upstream TypeScript, but contribution/package CI should run under Node 22 and the release workflow should be aligned or explicitly tested for the engine warning.

### Ranked delivery choices

1. Upstream contribution — minimum maintainable choice.
   - Implement the additive contract, tests, README, and Changeset in the upstream repository; preserve the existing package structure and AGPL license.
   - Publish the fixed release group (likely 0.2.0 because the project documents pre-1.0 feature/breaking changes as minor increments). Confirm the exact version with upstream maintainers.
   - Update Ameow to an exact published version and lockfile integrity. No source fork, patch drift, or hidden copy remains in Ameow.
   - Pros: one geometry authority, upstream tests/build, clean source provenance, simplest rollback to the previous exact npm version. Cons: dependent on review/release timing and Node 22 CI.

2. Maintained fork/scoped package — fallback when upstream cannot ship.
   - Fork at the pinned revision, apply the smallest patch, retain upstream remote/base commit and the patch commit, and publish a scoped package such as @wutpeach/avatar-core. Update imports or use an npm alias only if preserving the @bible-strong/avatar-core specifier is important.
   - Preserve package build, exports, README, LICENSE, tests, and AGPL metadata. Pin an exact version/commit in Ameow and document the fork URL and upstream diff.
   - Pros: schedule control and one maintained source tree. Cons: fork drift, release and security maintenance, and additional legal/source bookkeeping.

3. Vendoring — emergency fallback only.
   - Copy the upstream packages/avatar-core source into an explicit vendor/bible-strong-avatar-core subtree with its LICENSE, README, package manifest, provenance (base commit), and a reproducible build. Import it as a local package, not as an undocumented source copy under src/.
   - Keep generated output reproducible and retain a clean diff against upstream. This creates a second maintenance boundary and should be removed once an upstream/fork package is available.

4. patch-package — short-lived bridge only.
   - No patch infrastructure is currently installed. A temporary patch would need an exact @bible-strong/avatar-core 0.1.0 integrity pin, a postinstall hook, a CI assertion that the patch applies to that exact package, a tracked expiry issue, and a documented rollback.
   - It is fragile across npm/Vite/CI/package tarball changes and easy to distribute a modified bundle without corresponding source. Do not use it as the durable implementation.

Never hide a modified core inside Ameow src/ or create a parallel OneWorks/OneWorks-like renderer. If upstream/fork work is unavailable, stop at the existing whole-node behavior rather than shipping an unreviewable copy.

## AGPL-3.0-only attribution, corresponding source, distribution, notices, and rollback

This is an engineering compliance checklist, not legal advice; confirm the final distribution treatment with the project owner/counsel.

### Current license boundary

- Ameow's root LICENSE is MIT (LICENSE:1-20).
- @bible-strong/avatar-core is explicitly AGPL-3.0-only in its package manifest and lockfile (upstream package.json:12-18; package-lock.json:314-324). The root MIT notice does not relabel or erase dependency obligations.
- THIRD_PARTY_NOTICES.md currently documents Paper Shaders history only and has no bible-strong/avatar-core attribution. The existing expandedPresentationSurface.test.ts legal assertion is Paper-specific and should remain honest when the new entry is added.
- OneWorks packages are MIT dev dependencies (package-lock.json:1255-1274) and are not production guidance. If active Lab code and dependencies are removed, no new OneWorks production notice is needed; archived evidence remains immutable.

### If contributing upstream versus modifying locally

- An upstream contribution keeps the published package's AGPL notices and source provenance in the upstream repository; Ameow still needs to preserve the package license and provide source/legal access for the distributed form.
- A fork, vendored copy, or patch is a modified covered work. AGPL section 5(a) requires prominent notices that the files were modified and a relevant date; section 5(b) requires a prominent AGPL notice; section 5(c) keeps the modified covered work under AGPL as a whole; and section 5(d) requires Appropriate Legal Notices for interactive interfaces (node_modules/@bible-strong/avatar-core/LICENSE:196-231).
- Do not relabel modified core files or a fork as MIT. Retain the original copyright/author, Stéphane Montlouis-Calixte, upstream repository URL, pinned base revision, full AGPL text, and a concise modification/date note in the modified source and notice index.

### Corresponding Source for Electron artifacts

AGPL section 6 requires machine-readable Corresponding Source when object code is conveyed (LICENSE:233-283). Section 6(d) permits a designated network location with equivalent no-charge access, clear directions next to the object code, and continued availability as long as required (LICENSE:263-274). Treat Windows installers/portable ZIPs and macOS DMG/ZIPs as object-code distribution for release planning:

- Publish a versioned source archive or stable source link next to each GitHub Release asset. The existing workflow uploads release artifacts and reads release-notes/v<version>.md (.github/workflows/release.yml:151-240); add the source asset/link and legal-notice pointer there.
- Corresponding Source must include everything needed to generate, install, run, and modify the distributed covered work (LICENSE:122-140): the modified core source if forked/vendored/patched, package manifests and build/declaration scripts, Ameow source that imports and bundles it, lockfiles, and relevant renderer/packaging scripts. If relying on an unmodified upstream npm package, include its exact source revision/link and package LICENSE as well as the Ameow source/lockfile; counsel should confirm whether the Electron bundle is treated as an aggregate or derivative.
- Keep source access free and machine-readable; do not depend on an npm tarball disappearing or a mutable branch. Prefer a release-tagged GitHub source asset or immutable commit URL and retain it for the required period.
- Section 6 User Product/Installation Information may apply to consumer-product analyses; desktop installers need an explicit owner/counsel review rather than assuming this obligation is absent (LICENSE:285-329).
- Section 13 applies if a modified core program supports remote network interaction; a normal local Electron renderer likely does not, but any future remote avatar service must prominently offer Corresponding Source over the network (LICENSE:540-551).

### Attribution and Appropriate Legal Notices in the shipped app

electron-builder.config.mjs sets asar false and explicitly packages dist/dist-electron/etc. (lines 46-63), while its NODE_MODULES_JUNK_EXCLUDES removes every node_modules README and LICENSE (lines 39-44). Vite bundles the imported core into the renderer, so the dependency's npm LICENSE is not guaranteed to survive packaging. Do all of the following in the implementation/release change:

1. Add a bible-strong/avatar-core entry to THIRD_PARTY_NOTICES.md with package/version, AGPL-3.0-only, copyright author, upstream URL, pinned revision, modification status/date, and corresponding-source URL.
2. Ship the full AGPL license text and notice index in a deterministic app-readable location (for example a dist/legal directory or a legal-notices screen/resource). Merely leaving a repository-only Markdown file is not enough evidence for an interactive packaged app.
3. Ensure the same notice/source pointer is present or linked in the installer/portable/macOS release documentation. The macOS DMG currently adds only an install guide and browser-extension ZIP (package-macos-open-source-dmg.mjs:235-310), so a legal/source file or link must be intentionally added if the release policy requires it.
4. Keep root MIT attribution separate from the AGPL entry; do not overwrite LICENSE with AGPL text.

### Rollback and release hygiene

- Keep depth-aware mode opt-in and preserve complete arrays so a rollback can pin the previous exact core version and remove only the mode/fragment consumption. No default behavior should change in the first release.
- For an upstream release, rollback is an npm version/lockfile revert plus removal of the option; retain the previous source tag and release notes.
- For a fork, retain the upstream base revision and patch commit, publish immutable versions, and keep the old package available. A rollback points Ameow back to @bible-strong/avatar-core 0.1.0 and removes the fork alias.
- For vendoring, delete the vendor package only after the import/lockfile/build references are reverted; retain the provenance record and old release source archive.
- For a temporary patch-package bridge, remove the patch/postinstall hook and restore the exact npm integrity. CI must fail if the patch silently stops applying or applies to an unexpected tarball.
- Do not release an app artifact with a missing source asset/notice. The release workflow already blocks missing versioned release notes (.github/workflows/release.yml:201-209); add the same fail-closed behavior for the corresponding-source pointer if the core is modified locally.

## Related specs and implementation constraints

- .trellis/spec/frontend/character-motion.md:5-8 keeps Compact source-specific and forbids a shared/generic renderer; :24-32 defines the existing SVG leaf and current node paint contract; :33-60 keeps Pointer Field, one rAF clock, lifecycle, Reduced Motion, and 80/60/56 geometry unchanged; :87-98 lists focused tests.
- .trellis/spec/frontend/component-guidelines.md, motion-guidelines.md, and quality-guidelines.md require local ownership, no hot-path React state, cleanup, and reuse of the existing Surface/runtime seam.
- Task PRD/design/implement artifacts select Option B, require one canonical full body per frame, and explicitly forbid static masks, hand-authored SVG ears, OneWorks renderer adoption, and authority/lifecycle changes.
- Archived OneWorks evidence (.trellis/tasks/archive/2026-09/08-25-oneworks-avatar-cat-source-fidelity/research/oneworks-cat-source-fidelity.md:11-31) is useful for the mechanism decomposition (procedural cones, shared pose, depth ordering, head-root occlusion), but its units and renderer code must not be copied.

## External references and versions

- Bible Strong repository: https://github.com/smontlouis/bible-strong-avatar-lab
- Pinned upstream revision: 175691ab32cefe5faec7828af62f3d50210a8eb2
- Npm package: @bible-strong/avatar-core 0.1.0; npm view @bible-strong/avatar-core versions returned only ["0.1.0"] on 2026-09-07.
- Package metadata: upstream packages/avatar-core/package.json, AGPL-3.0-only, Node >=22.12.0, dist/README.md/LICENSE package files.
- AGPL text: node_modules/@bible-strong/avatar-core/LICENSE; relevant sections 5, 6, and 13 cited above. Canonical license reference: https://www.gnu.org/licenses/agpl-3.0.html
- Archived OneWorks mechanism source/evidence: pinned revision 3ad2542ea4487e95884f313b84943df602c0e742, MIT packages, reference only.

## Caveats / not found

- No existing avatar-core field/helper for masks, clipping, per-fragment paths, or face-depth queries was found in the pinned 0.1.0 source. The only Compact clipPath is the head clip used by eyes.
- A true sampled depth split is more work and may produce larger SVG path strings than the current convex hull. Measure one rAF at the real 56px holder and a magnified Lab view before increasing sampling or adding caches. Reuse existing local sample caches first.
- Generic primary surfaces are not required by current Compact production (the primary is a sphere), but a deterministic front-surface mesh fallback prevents the new public mode from being silently sphere-only. If maintainers intentionally scope v1 to analytic ellipsoid primaries, state and test that restriction explicitly rather than pretending whole-node behavior is depth-aware for other surfaces.
- The suggested crossing fixture positions are a deterministic starting point, not production calibration. Verify that the chosen grid density yields both fragments; adjust only the test fixture within the same bounded sphere/cone units if a particular implementation's epsilon/grid misses the crossing. Never distort the production Compact definition to manufacture a test.
- nodeFragments cannot be made mandatory in the TypeScript type without breaking existing consumers; the depth-aware option invariant and focused tests must enforce presence at runtime.
- No current in-app legal-notices UI was found. THIRD_PARTY_NOTICES.md is repository documentation, not proof that an Electron installer displays Appropriate Legal Notices. Packaging and UI treatment need an implementation decision and owner/counsel review.
- Ameow's release jobs use Node 20 while the upstream package declares Node >=22.12.0. Align contribution/package CI and decide whether app builds should move to Node 22 before publishing the extension.
- The root worktree had unrelated user changes and untracked evidence/worktree directories during research. This report is the only file created by this worker; no product, spec, package, release, or archived-evidence file was edited.
