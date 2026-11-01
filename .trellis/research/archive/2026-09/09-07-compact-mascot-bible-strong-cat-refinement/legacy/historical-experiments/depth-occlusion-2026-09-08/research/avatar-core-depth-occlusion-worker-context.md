# Avatar-core depth occlusion: worker context

## Selected outcome

- Option B is required: both ears remain procedural 3D `body.nodes`, and one canonical full-body render derives partial head/ear occlusion from shared pose, projection, and camera depth.
- Reject whole-node front/back classification, fixed screen-space masks, host-authored SVG ears, independent overlays/animation, OneWorks runtime adoption, and a parallel renderer.
- OneWorks is immutable mechanism/visual reference only. Bible Strong remains production and Lab authority.

## Minimum core contract

- Extend `RenderAvatarOptions` with opt-in `occlusion?: "none" | "depth-aware"`; preserve current default behavior.
- Extend `AvatarGeometry` with optional `nodeFragments`, guaranteed in depth-aware mode and ordered exactly like input `bodyNodes`.
- Each fragment record is `{ nodeId, backPath, frontPath }`; either path may be empty and a crossing node may have both.
- Preserve all existing geometry fields and complete-node `backPaths`/`frontPaths` arrays for compatibility. A depth-aware consumer paints fragments, never both forms.
- Keep `AvatarScene` shape unchanged. Only add trailing optional render-policy pass-throughs to definition/frame helpers if needed. Do not alter the avatar-definition schema or playback environment.

## Minimum algorithm

1. Reuse the existing 17×49 procedural surface samples, node-local transform, shared avatar pose, projection, and SVG path formatter.
2. Retain camera-space and projected sample coordinates instead of reducing each ear to one convex hull.
3. Query primary-surface camera depth at the same projected point: analytic camera-ray/ellipsoid intersection for the Compact sphere, with a deterministic sampled front-surface fallback for other documented primaries.
4. Triangulate adjacent sample cells with a fixed diagonal. Compare each vertex depth with the primary depth.
5. Send fully behind triangles to `backPath`, fully in-front/outside-primary triangles to `frontPath`, and split crossing triangles at their zero-depth boundary. A fixed internal epsilon resolves ties behind the head.
6. Concatenate closed polygon subpaths without applying a convex hull, which would refill occluded regions.

The fragment boundary is regenerated from 3D geometry every frame and therefore follows neutral pose, yaw, pitch, action interpolation, and ambient motion. No host mask is involved.

## Ameow consumer flow

- Delete the current head-only render plus full-body ear render/merge in `compactMascotBehaviorRuntime.ts`.
- Call `renderAvatar` once with primary, `bodyNodes`, `eyeOffset`, and depth-aware mode.
- `CompactMascot.tsx` maps the two ordered fragment records to its existing four slots: each `backPath` before the head and each `frontPath` after it. The current head clip remains eye-only.
- Replace the two production diamonds with mirrored rounded cones and calibrate only dimensions/roundness, position, and rotation.
- Preserve `MainWindowPresentationSurface`, Pointer Field ownership, one rAF clock, actions, shell geometry, visibility pause/resume, Reduced Motion, and disposal.

## Fixtures and checks

- Add one core-only 240-unit sphere with deliberately crossing mirrored cone nodes. At least one stable node id must have both fragments at neutral.
- Repeat under ±35° yaw and ±20° pitch; paths must change deterministically while ids and source surfaces remain constant.
- Preserve complete-node compatibility arrays and canonical head/eye output.
- Exercise production neutral plus existing `surprised`, `curious-short`, and `playful-short` action boundary times.
- Architecture tests enforce one full-body call, fragment-only consumption, no ear mask/overlay, no OneWorks production import, and unchanged lifecycle/Pointer Field/shell contracts.
- Visual evidence covers both themes at the real 56px holder and magnified view. Reuse current sample density until measurement proves it insufficient.

## Lab and cleanup

- Keep `CompactPreviewStage` as the production renderer reuse seam.
- Add bible-strong-equivalent definition, pose, action, pointer, Reduced Motion, lifecycle, and size inspection.
- Only after parity exists, remove the active OneWorks inspector route/files/tests and unused `@oneworks/avatar*` dev dependencies. Keep archived evidence.

## Package and license boundary

- Durable delivery is an upstream bible-strong contribution with source, tests, README contract, Changeset, and an exact published dependency update.
- If upstream cannot publish, stop before Ameow integration. A maintained scoped AGPL fork requires separate explicit approval. Vendoring and `patch-package` are not accepted automatic fallbacks.
- The package is AGPL-3.0-only. Retain author, upstream URL, base revision, license text, modification date/status, and source provenance.
- Add a bible-strong entry to `THIRD_PARTY_NOTICES.md`; deliberately ship the full AGPL text and immutable Corresponding Source pointer because current packaging excludes dependency `LICENSE`/`README` files.
- Release must fail closed on missing notice/source evidence. Owner/counsel confirms final distribution and any Installation Information treatment before release.
- Rollback pins `@bible-strong/avatar-core@0.1.0` and removes fragment-mode consumption; no second renderer or long-lived feature flag remains.

## Source report

Full evidence, line citations, affected-file map, package ranking, and caveats are in `research/avatar-core-depth-occlusion-design.md`.
