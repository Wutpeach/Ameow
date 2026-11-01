# Fullscreen branch/ref inventory

Active task: .trellis/tasks/09-09-integrate-fullscreen-branch-work

Inventory date: 2026-09-09 (Asia/Shanghai). The inspected worktree is main at
ff53f9749aa095c69f8a84d6537838d46ce3037c; the working tree is intentionally
dirty and another Codex window is writing to it.

## Executive result

There is no missing fullscreen Product implementation to import. The accepted
chain (48987f7 substrate -> c762c143 MR9 activation -> e01be015 material
repair -> 046f228 derived Refraction -> 0e24a7a localized boundary response)
is already in main, and the current production Lab still mounts that one
renderer. 818057f is a real but candidate-only Ripple Lab experiment; it has
no Product scene-source contract and its own closure says not to integrate
Product. 9221927/77eb561 are Paper Lab experiments whose final closure is
NO-GO; they should not be brought into the current Lab or dependency graph.

The minimal current integration diff is therefore empty. Preserve the current
dirty Compact mascot work, then validate main; only a new explicit decision
should reopen either candidate line.

Classification summary: already integrated = accepted Thermal/MR9/Lab chain;
required prerequisite = the original Expanded substrate and ordinary Lab
consolidation; include = none; defer = Ripple source-fidelity Lab; rejected =
Paper official/derivative; unrelated = stale/recovery/mascot/diagnostics refs.

## Scope, method, and evidence boundary

This was a read-only Git-plumbing inventory. I used git show, git diff,
git log --all, git merge-base, git for-each-ref --contains, git for-each-ref,
git branch, and git status; no checkout, fetch, merge, commit, push, stash,
reset, or product-file edit was performed. Indexed file lookups used the FFF
file finder; known reports were then read directly.

The ref scan found 9 local heads, 3 remote-tracking refs, and 31 tags. All tags
predate the August Lab work (latest v0.3.1 is 2026-06-17), so no tag is a
plausible post-Lab fullscreen implementation. git log --all over the Lab and
Expanded-surface paths, plus a merge-base/diff scan of every head and remote,
found only two refs with unique candidate Lab code: Ripple and Paper. The old
origin/motion/presentation-integration ref is a predecessor of the accepted
Expanded surface, not a competing implementation.

## Current refs and relation to main

The following is the complete local/remote-tracking inventory relevant to this
decision (tip hash and committer date are full values from git for-each-ref).
“Unique Lab/fullscreen paths” is the merge-base diff restricted to src/lab and
src/presentation/main-window.

| Ref | Tip (full hash) | Date | Unique Lab/fullscreen paths / classification |
| --- | --- | --- | --- |
| refs/heads/main | ff53f9749aa095c69f8a84d6537838d46ce3037c | 2026-09-09T15:21:53+08:00 | Current truth; already integrated |
| refs/heads/lab/mr9-ripple-source-fidelity | 818057f664c7474ec1722b143fcc84dcf3ec67e9 | 2026-08-24T01:09:58+08:00 | src/lab/ripple/**, lab-main.tsx; defer |
| refs/heads/motion/mr9-paper-heatmap-official-baseline | 77eb5611178a06f7079db29563c9ef75197d7af8 | 2026-08-23T21:23:37+08:00 | Paper official/derived Lab files; rejected |
| refs/remotes/origin/motion/presentation-integration | 48987f7f65bcf5bba7547152441b14cf8853809c | 2026-08-14T22:13:08+08:00 | Expanded substrate predecessor; required prerequisite (already integrated through descendants) |
| refs/remotes/origin/main | 5619ba031163c3dab7071f67ad4739d49b1f095f | 2026-08-14T22:28:15+08:00 | Pre-Lab baseline; unrelated to current candidates |
| refs/remotes/origin/HEAD | 5619ba031163c3dab7071f67ad4739d49b1f095f | 2026-08-14T22:28:15+08:00 | Same stale pre-Lab baseline; unrelated |
| refs/heads/feat/compact-mascot-depth-occlusion | b9a00ab93f15bbaf301e2b129406b0b5f16c69fb | 2026-09-07T17:45:24+08:00 | No unique fullscreen paths; Compact mascot work; unrelated |
| refs/heads/chore/trellis-tooling-0.6.15 | 40d31d38c4e140f389bbb1ba066b58fba3e43a91 | 2026-08-24T17:53:51+08:00 | No unique fullscreen paths; unrelated |
| refs/heads/cindy/auto-o3p8cr | 342991724502ff067583d56fd877de9d1e536943 | 2026-08-13T10:33:40+08:00 | No unique fullscreen paths; unrelated |
| refs/heads/history/m3-auto-o3p8cr-raw-snapshot | b4acb4addc98964b6d019c9874f6b20bd6093da8 | 2026-08-24T12:55:50+08:00 | Old M3 DownloadIntake*/MainWindowPresentationSurface snapshot; unrelated/superseded |
| refs/heads/recovery/main-pre-phase4-2b46f91 | 2b46f91496214a85162593557f38c04267524deb | 2026-08-24T01:10:48+08:00 | Recovery pointer, no unique current fullscreen implementation; unrelated |
| refs/heads/repair/diagnostics-readability-export-cleanup | 353a7984174a3d3d6e56a7944b7cb33b1ce5707f | 2026-08-18T23:53:16+08:00 | Diagnostics-only repair; unrelated |

main is 115 commits ahead of origin/main (git rev-list --count
origin/main..main). Do not infer that the stale remote-tracking refs include
any newer candidate; fetching was deliberately forbidden.

## Current main behavior and dependency graph

The production path is a single, shared surface rather than a branch-specific
alternative:

| Area | Current anchor and observed behavior |
| --- | --- |
| Lab composition | src/lab/LabOverlayStage.tsx:316-326 mounts one ExpandedPresentationSurface and forwards THERMAL_PALETTE, heatmap, refraction, and boundaryHalo. |
| Accepted Heatmap | src/presentation/main-window/ExpandedPresentationSurface.tsx:203-296 computes the analytic full-surface travelling field, palette, material, and localized contact response. |
| Boundary halo | Same file :256-278 projects the accepted contact response into the real outer gutter only when the Lab/production gate is enabled. |
| Derived Refraction | Same file :297-378 finite-differences the existing low-frequency bend, applies an energy/contact envelope, and analytically resamples the same field. Refraction-off skips this block. |
| Mode dispatch | Same file :470-477 selects Heatmap output for the whole surface; no second canvas or pass exists. |
| Public props | Same file :482-524 declares heatmap, refraction, boundaryHalo, and dev-only capture controls. |
| Renderer authority | Same file :570-717 obtains WebGL2, links one program, writes uniforms, and calls one gl.drawArrays. :741-865 owns runtime, resize, context-loss/restoration, and disposal. |
| Lab scenarios | src/lab/scenarios.ts:113-160 exposes six accepted Heatmap variants (moving/reduced, Refraction, and localized contact-halo). |

git status --short -- src/lab/LabOverlayStage.tsx
src/presentation/main-window/ExpandedPresentationSurface.tsx is clean: the
current Compact work does not modify either accepted fullscreen surface. Thus
the accepted Thermal behavior is not a conflict to be replayed from any
candidate branch.

## Ranked candidates (behavior and graph, not branch names)

### Rank 1 — accepted Product fullscreen chain: already integrated

These are historical candidates because they define the current behavior, but
none is a future cherry-pick:

| Commit (full hash, date) | Parent | Changed paths / behavior | Evidence and outcome |
| --- | --- | --- | --- |
| 48987f7f65bcf5bba7547152441b14cf8853809c, 2026-08-14T22:13:08+08:00 | — | Replaced DotFieldCanvas with src/presentation/main-window/ExpandedPresentationSurface.tsx, and introduced the Expanded runtime/target/policy tests. | This is the concrete substrate on which all later fullscreen behavior depends; required prerequisite and already present through descendants. |
| c762c1437047372802a077e576db89176d1e95b2, 2026-08-15T11:33:28+08:00 | 4de9c2edc74f8b2becd5f3b27a25f0e31dba4c14 | MR9 activation/progress Product and Lab support: ExpandedPresentationSurface, MainWindowPresentationSurface, intake/terminal projections and tests, expandedPresentationPolicy/runtime/targets, folderActivationPresentation, pointerField, thermalPalette, plus application/Electron/feature/protocol/utils and both download docs. | mr9-validation.md records implementation c762, 15 files/229 focused tests, type-check/lint/build/docs pass; the MR9 report records the single-canvas WebGL2 contract. git for-each-ref --contains c762... includes main; already integrated. |
| 30e0e54598b593d484b7d7c95a843eb80a9380bc, 2026-08-18T22:08:05+08:00 | c762c1437047372802a077e576db89176d1e95b2 | Consolidated Browser Lab: src/lab/LabOverlayStage.tsx, PresentationLab.tsx, lab-main.tsx, locales, scenarios/state/overlay/export helpers and their tests; added the shared overlay components under src/presentation/main-window/. | Required to exercise later Lab presets; current main contains it. Required prerequisite for ordinary Lab scenarios, already integrated. |
| e01be0157a61b2b8fca3c4d6c96d57dd731227b9, 2026-08-20T21:56:04+08:00 | 59b62ea227f23a6a5662d89886b372457a4b9bc4 | src/presentation/main-window/ExpandedPresentationSurface.tsx, expandedPresentationRuntime.ts and tests; src/lab/LabOverlayStage.tsx, PresentationLab.tsx, scenarios.ts/.test.ts, and both Lab locales. This completed MR9 activation/progress refinement and the accepted material/palette/edge repair. | Archived mr9-implementation-report.md says final GPT Architecture Lead acceptance of Earlier Motion Baseline + Material/Palette/Edge Repair; final gates were type-check/lint/build/docs and 25 files/248 tests. Already integrated ( --contains confirms main). |
| 046f228c8e245dead84dbc22f1a210550c1933dc, 2026-08-21T13:40:03+08:00 | d4a5aeae8a1183df73c7efed61d9f5d7ecd18ca2 | Derived Thermal Refraction Lab mode in the same ExpandedPresentationSurface, runtime/tests, Lab overlay/scenarios/locales, and renderer-reuse assertions. | thermal-refraction-implementation-report.md: one surface/canvas/program/draw, no texture/framebuffer/second pass, 5 files/76 focused tests, type-check/lint pass; uRefractionMode=0 preserves baseline. It is a prerequisite already consumed by current scenarios, not a new branch to import. Already integrated. |
| 25040db9ab7887444010a70d43cd537331286721, 2026-08-22T21:52:00+08:00 | eaead6573302e16839aa87a7d70b15717a708f3f | Presentation playground v1 Lab files (LabOverlayStage, PresentationLab, CSS, locales, scenario/target/renderer tests; removed earlier standalone Lab controls). | Current Lab shell descends from this checkpoint; already integrated, not a competing fullscreen renderer. |
| 0e24a7acea53d9f1fcb690ac79b28590d7e6bff6, 2026-08-22T23:44:44+08:00 | 4db772276977db96812b84b11c47c9a92d6ff0a1 | src/presentation/main-window/ExpandedPresentationSurface.tsx and test; src/lab/LabOverlayStage.tsx, scenarios.ts/.test.ts, PresentationLab.tsx, locales, rendererReuse.test.ts, and updated download docs. Adds accepted localized boundary contact/14px-gutter halo while retaining one draw. | Current anchors above show boundaryHalo; --contains confirms main. Already integrated; no future diff is needed. |

The accepted chain is contiguous in main history (git log main -- over the
paths prints 48987f7, c762, 30e0, e01, 046, 25040, 0e24, then Lab merge
commits). git diff 6114f47...main is empty for the accepted fullscreen
renderer paths (LabOverlayStage.tsx and ExpandedPresentationSurface.tsx); the
remaining main-vs-6114 changes are Compact mascot/tooling only.

### Rank 2 — lab/mr9-ripple-source-fidelity: defer (candidate-only Lab)

Verified tip: 818057f664c7474ec1722b143fcc84dcf3ec67e9,
2026-08-24T01:09:58+08:00, parent/merge-base
2bb9a221708c211bdec8721e02d0e469de44ef89. git diff --stat
main...818057f is a one-commit branch delta (37 files, 1,161 insertions
including evidence); git diff --name-status identifies the implementation
paths below. git merge-base main 818057f returns 2bb9a221; the tip is not an
ancestor of main (git merge-base --is-ancestor exits 1).

Implementation paths:

- src/lab/lab-main.tsx (3 additions/1 deletion): :16-20 selects the mutually
  exclusive ?ripple/?ripple=scene route; the normal route remains
  PresentationLab.
- src/lab/ripple/RippleLab.tsx:26-98: candidate controls for
  forward/reverse/cancel/scrub, click origin, Pinch ON/OFF, and single-scene
  mode.
- src/lab/ripple/RippleCanvas.tsx:87-207: one fixed 200x200 WebGL1 canvas,
  two texture roles (or one shared scene texture), one program/draw, resize,
  context-loss/restoration, and cleanup. It does not import
  ExpandedPresentationSurface (rippleIsolation.test.ts:23-34).
- src/lab/ripple/rippleController.ts:52-140: candidate-local generation,
  phase, one pending rAF, start/reverse/cancel/replace/scrub, and settlement.
- src/lab/ripple/rippleSource.ts:1-55,57-162: pinned MIT source-derived
  GLSL from m1ckc3s/ripple commit
  99ee6e4412bcab34bcb4337f5f21845ae87c12d5, complete normalized digest
  guards, and fixed 1.4s/parameter baseline.
- rippleResourceCleanup.ts, rippleTextureUpload.ts, the three Ripple test
  files, and src/lab/ripple/ameow-download-active-200.png support the
  candidate. The other additions under evidence/mr9-ripple/ are review
  artifacts, not Product source.

Behaviorally this is a genuine source-fidelity image transition: WebGL1,
fBm/wavefront/displacement/RGB split/glow/pinch, and a same-scene one-texture
repair. It is not a Thermal fullscreen implementation: there is no production
scene capture/texture ownership, no ExpandedPresentationSurface, and no
Product import. The source report records 9/9 initial focused tests, 25/25
rendererReuse, type-check/lint/renderer build; the repair report records 10/10
Ripple tests and the same renderer/build gates. The closure report says
“Browser Lab feasibility checkpoint only,” no live Product scene-source
contract, no macOS/cross-GPU evidence, and STOP — do not integrate Production.

Classification is defer, not include: retain the branch as evidence and reopen
only with an explicit Lab-only decision. If that decision is made, the smallest
safe change is the candidate source/test/fixture paths plus one manually
resolved lab-main.tsx route; do not merge its evidence binaries or adapt it
into the production Thermal renderer.

### Rank 3 — motion/mr9-paper-heatmap-official-baseline: rejected research line

The Paper branch has two distinct commits and a real dependency edge:

#### Official baseline (92219275e07ebe2eca4b0f0486cb406faf0312c7)

Date 2026-08-23T15:04:41+08:00, parent/merge-base
431114af4f44619483f1b700554f3f47f1b86619. git diff --stat 431114a..9221927
is 15 files / 912 insertions and git diff --name-status lists:

package.json, package-lock.json, THIRD_PARTY_NOTICES.md,
src/lab/PaperHeatmapInteriorCalibration.tsx,
PaperHeatmapOfficialBaseline.tsx, PaperHeatmapPanelComparison.tsx,
PresentationLab.tsx, both Lab locales, paperHeatmapFullFrame.svg,
paperHeatmapInteriorCalibration.test.ts, paperHeatmapOfficial.test.ts,
paperHeatmapPanelComparison.test.ts, and paperHeatmapSilhouette.svg (plus
the Lab renderer-reuse test). It adds exact
@paper-design/shaders-react@0.0.80 -> @paper-design/shaders@0.0.80.

PaperHeatmapOfficialBaseline.tsx:5-17 mounts the official Heatmap with only
the SVG image, Suspense, and 200x200 sizing. The implementation report records
one mutually exclusive Paper canvas, 72/72 focused tests, type-check/lint/
renderer build pass, and no Paper identifier in the production bundle; it also
states no production integration or visual decision. The official public-prop
geometry is perimeter-dominant for the Ameow target, so it is not a required
Product prerequisite. Treat 922 as rejected for current integration.

#### Interior derivative (77eb5611178a06f7079db29563c9ef75197d7af8)

Date 2026-08-23T21:23:37+08:00; parent a8b1e6333408ec345778a5158181d2d3c3306332,
with 922 in its ancestry (git log motion/mr9-paper-heatmap-official-baseline).
git diff --stat 431114a..77eb561 is 11 additional/modified files (596
insertions, 14 deletions): THIRD_PARTY_NOTICES.md,
src/lab/PaperHeatmapInteriorCandidate.tsx,
PaperHeatmapInteriorComparison.tsx, PresentationLab.tsx, both locales,
paperHeatmapInteriorCalibration.test.ts,
paperHeatmapInteriorCandidate.test.ts,
paperHeatmapInteriorFragment.ts, paperHeatmapOfficial.test.ts, and
paperHeatmapPanelComparison.test.ts.

PaperHeatmapInteriorCandidate.tsx:18-50 uses ShaderMount,
toProcessedHeatmap, a second texture/program path, and a copied source
fragment. paperHeatmapInteriorFragment.ts:1-13 identifies the Apache-2.0
Paper source commit 60467401863c1917dd02016d0c1ff2f791d0b3c8 and one changed
expression. paperHeatmapInteriorCandidate.test.ts:71-91 explicitly keeps the
derivative mutually exclusive from the production preview and asserts that the
Paper dependency is absent from the production entry.

The archived mapping/closure reports are final NO-GO: the source-level
derivative failed the unified-material, 14px-gutter, and second-silhouette
gates; preserve 77eb561, but do not merge its dependency, derivative shader,
notices, or Lab comparison. This is rejected, with 922 as a prerequisite
only for reproducing the rejected research line, never a current Product
prerequisite.

## Working-tree conflict map

The relevant dirty Product paths (from git status --short -- src/lab
src/presentation/main-window) are:

~~~text
src/lab/CompactPreviewStage.tsx
src/lab/PresentationLab.tsx
src/lab/compactPreviewStage.test.ts
src/lab/lab-main.tsx
src/lab/locales/en.json
src/lab/locales/zh-CN.json
src/lab/oneworksAmeowCandidate.test.ts
src/lab/rendererReuse.test.ts
src/lab/scenarios.test.ts
src/lab/scenarios.ts
src/presentation/main-window/CompactMascot.tsx
src/presentation/main-window/compactMascotArchitecture.test.ts
~~~

The current uncommitted hunks are Compact mascot poses/theme and are unrelated
to fullscreen, but they overlap candidate Lab files:

- src/lab/lab-main.tsx:15-20 currently adds ?theme=white handling. Ripple
  also edits this entry (:16-20 in 818), so a future cherry-pick would need
  a manual route/theme combination.
- src/lab/PresentationLab.tsx:454-466,990 adds Compact pose labels/props;
  src/lab/locales/en.json, zh-CN.json, and
  src/lab/rendererReuse.test.ts have matching Compact edits. Paper 922/77
  edits all of these paths and would conflict or overwrite active work.
- src/lab/scenarios.ts:463-505 and its test add Compact scenario IDs; Paper
  changes the same Lab scenario/control graph in its parent line.
- package.json, package-lock.json, and THIRD_PARTY_NOTICES.md are clean
  in the current working tree, but Paper would add dependency/license churn;
  do not let that appear as an incidental resolution.
- LabOverlayStage.tsx and ExpandedPresentationSurface.tsx are clean, so no
  accepted Thermal renderer conflict exists.

The worktree also has a very large set of untracked generated/runtime assets
(over 38,000 status lines). They are outside this task and must not be added
to any candidate integration.

## Minimal safe future integration order

1. Current task: integrate nothing. Let the active Compact mascot change
   finish in its own clean commit/worktree. Record the current git status and
   do not cherry-pick onto this dirty tree.
2. Baseline validation: from the resulting clean main, verify the already
   integrated chain; do not cherry-pick 489, c762, 30e0, e01, 046, 25040, or
   0e24 (all are ancestors of main).
3. Only if a new Ripple decision is approved: start a fresh branch from
   current main, apply the candidate-specific source/test/fixture diff from
   818057f (or cherry-pick the one commit only after deciding whether its
   evidence assets belong), then manually merge lab-main.tsx so both ?theme
   and ?ripple semantics survive. Keep the route mutually exclusive and keep
   all Product imports absent. Do not touch ExpandedPresentationSurface or
   Product scene state.
4. Paper: do not integrate 922 or 77. If a future architecture review
   reverses the final NO-GO, reproduce the isolated line in a new Lab-only
   task, apply the official dependency before the derivative, and re-run legal,
   visual, production-bundle, and Lab-isolation gates. That would be a new
   decision, not a recovery of missing main history.

The minimum commit/diff set for the requested current-main integration is
therefore zero. The minimum conditional Ripple Lab set is the 11 candidate
implementation/test/fixture paths plus the one entry-route edit; the minimum
Paper set cannot be recommended because its closure rejects the behavior and
dependency graph.

## Validation commands for a future clean integration

Baseline (must pass before and after any approved Lab-only work):

~~~text
npm run type-check
npm run lint -- --quiet
npx vitest run src/presentation/main-window src/lab
npm run build:renderer
npm run build
npm run docs:build
git diff --check
~~~

Ripple-specific gates and browser route:

~~~text
npx vitest run src/lab/ripple/rippleController.test.ts src/lab/ripple/rippleSource.test.ts src/lab/ripple/rippleIsolation.test.ts src/lab/rendererReuse.test.ts
npm run dev:lab
# inspect http://127.0.0.1:1421/lab.html?ripple and ?ripple=scene
~~~

The Ripple reports additionally require a one-canvas/WebGL1/context-loss/
restoration probe, source digest/provenance checks, and a production artifact
scan proving no Ripple identifiers enter index.html/the renderer bundle.

Paper-specific checks (only if a new explicit review reopens the rejected line)
would include:

~~~text
npm ls @paper-design/shaders-react @paper-design/shaders --depth=1
npx vitest run src/lab/paperHeatmapOfficial.test.ts src/lab/paperHeatmapPanelComparison.test.ts src/lab/paperHeatmapInteriorCandidate.test.ts src/lab/paperHeatmapInteriorCalibration.test.ts
~~~

The existing MR9 Browser Lab validation command is
node .trellis/tasks/08-15-mr9-fullscreen-activation-fx-progress-visual-refinement/research/run-browser-lab-validation.mjs;
it validates the ordinary production-reuse route, not Ripple or Paper.

## Caveats

- No fetch was allowed. origin/main and origin/motion/presentation-integration
  are stale (2026-08-14); absence of a newer remote branch cannot be proved
  beyond the refs currently present locally.
- Ripple and Paper refs are local historical checkpoints, not proof of current
  upstream availability. Their task reports and evidence are retained under
  .trellis/tasks/archive/2026-08/ and should be read before any new decision.
- Browser evidence for both experiments is Chromium/Windows only. Ripple has
  no macOS/cross-GPU or live Product scene-source proof; Paper's final closure
  is a visual/architecture NO-GO.
- The current dirty working tree and generated untracked assets are preserved
  intentionally; this report is the only file written for this task.
