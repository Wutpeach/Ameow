# Research: Ripple Lab cleanup and integration plan

- Query: Make the approved 818057f Ripple checkpoint the maintained Vite Lab Full experience, remove the superseded Intake and Heatmap experiment UI, and later retire only proven fullscreen experiment branches.
- Scope: internal code, specs, archived task reports, and the read-only branch/ref inventory.
- Date: 2026-09-09 (Asia/Shanghai)
- Active task: .trellis/research/archive/2026-09/09-09-integrate-fullscreen-branch-work

## Decision summary

The approved source is 818057f664c7474ec1722b143fcc84dcf3ec67e9 on
lab/mr9-ripple-source-fidelity. Its one-scene repair is a Lab-only WebGL1
source-fidelity checkpoint, not a replacement for the production
ExpandedPresentationSurface. Integrate only the ten src/lab/ripple
implementation/test files plus the Ameow-owned fixture, and manually resolve
the Lab entry/UI changes; do not copy review videos, HTML, screenshots, or
upstream A/B images.

The least surprising maintained shape is one normal lab.html route. Keep the
existing PresentationLab shell and Compact target, make a Ripple chip the
default Full lane, and retain Download, Transcode, and Mixed as business-state
fixture lanes (they are not fullscreen experiments). Render the Ripple leaf
instead of LabOverlayStage for that chip, so a Full preview never mounts two
canvases. Remove the candidate bare ?ripple A/B route and its ?ripple=scene
opt-in branch after the one-scene lane is integrated; retain only the existing
?theme=white query. If the product owner instead means “Ripple must be the
only Full chip,” that is a separate scope decision listed at the end.

Remove Intake and Heatmap from the Lab scenario strip and from Lab-only
activation/heatmap state, copy, and tests. Keep every production surface,
policy, runtime, and test that still serves the Electron main window. In
particular, production Heatmap scheduling and production Intake/Folder
priority are not obsolete merely because their Lab experiment controls are.

## Evidence anchors

### Current main and accepted production chain

- The inspected main tip is ff53f9749aa095c69f8a84d6537838d46ce3037c.
- The accepted chain (48987f7 substrate, c762c143 MR9 activation,
  30e0e545 Lab consolidation, e01be015 material/edge repair, 046f228c
  derived Refraction, 25040db Lab shell, and 0e24a7a localized boundary
  response) is already an ancestor of main.
- There is no missing production fullscreen implementation to import. The
  current production renderer is the one ExpandedPresentationSurface mounted
  by MainWindowPresentationSurface.tsx:1140-1148.
- main is 115 commits ahead of the inspected origin/main tracking ref. That
  tracking ref is stale (2026-08-14); this is not evidence that the server has
  no newer refs.

### Approved Ripple checkpoint

- Branch/ref: refs/heads/lab/mr9-ripple-source-fidelity.
- Commit: 818057f664c7474ec1722b143fcc84dcf3ec67e9, 2026-08-24.
- Upstream visual source: m1ckc3s/ripple commit
  99ee6e4412bcab34bcb4337f5f21845ae87c12d5.
- The archived repair report records an Ameow-owned
  src/lab/ripple/ameow-download-active-200.png fixture captured at exactly
  200x200 CSS pixels from the existing Download-active Lab scene. The same
  fixture is bound to both logical Ripple texture roles in one-scene mode.
- Runtime shape: one fixed 200x200/r16 WebGL1 canvas, one program and draw,
  two sampler roles (the same texture in one-scene mode), bounded controller
  scheduling, resize/context-loss restoration, and explicit resource cleanup.
- Controls in the checkpoint are Forward, Reverse, Cancel-to-start,
  Cancel-to-target, raw-phase scrub, click origin, and Pinch ON/OFF. The
  source-fidelity baseline is 1.4 seconds, sigma .15, frequency 5, push .155,
  chromatic separation .0225, glow .37, noise warp .70, power3.out, Pinch ON
  with strength .14.
- Archived evidence says Ripple tests 10/10, rendererReuse 25/25, type
  check/lint/renderer build, source digest/provenance, WebGL lifecycle, and
  production-artifact scans passed. The repaired evidence WebMs have their
  first encoded white frame removed; those files are review evidence only.
- The closure is explicitly a Browser Lab feasibility checkpoint. It has no
  live Product scene-source contract, no Electron capture contract, and no
  macOS or cross-GPU evidence. Do not import Ripple into
  ExpandedPresentationSurface or the Electron path.

### Rejected Paper line

92219275e07ebe2eca4b0f0486cb406faf0312c7 and its derivative
77eb5611178a06f7079db29563c9ef75197d7af8 add the Paper dependency,
second-texture/program paths, and comparison UI. Their archived mapping and
closure reports are final NO-GO for the target geometry and unified-material
contract. Do not import their dependency, shader, notices, SVGs, or Lab
comparison files.

## Current Vite Lab information architecture

### Route and shell

lab.html is the dedicated Vite input from vite.lab.config.ts; production
vite.config.ts still builds index.html only. The entry
src/lab/lab-main.tsx:1-24 initializes the lab i18n namespace in zh-CN, reads
the Lab-only ?theme=white query, mounts ThemeProvider, then mounts
PresentationLab and the Agentation toolbar. The current main route has no
Ripple import.

PresentationLab.tsx has two first-level regions:

1. Main Workspace: a scenario strip header, dominant 200x200 Full or Compact
   preview stage, and a footer containing target, Auto/1x/2x/3x scale, and
   contextual actions.
2. Persistent Dev Tools: target/scale/background/Reduced Motion facts,
   origin/progress or fixture facts, and collapsed Advanced Diagnostics.

The Compact target is an existing mascot renderer lane. It must not receive
Full business scenarios or a second synthetic renderer. The shell, theme
query, shared Lab control styles, Focus-visible ring, background picker, reset,
and existing Compact inspector are not part of the Intake/Heatmap cleanup.

### Full scenario strip and exact Intake meaning

The current Full strip is rendered in PresentationLab.tsx:884-946 and has
five chips:

| Chip | Entry point | Exact meaning |
| --- | --- | --- |
| Intake | selectScenario("intake") around 663-675; initial state also dispatches activate with intake-local around 515-523 | Lab synthetic activation. LAB_ACTIVATION_PRESETS in scenarios.ts:38-93 includes pointer-origin local Intake, center fallback, Folder, and reduced-motion variants. Activation carries source, opportunity id, origin, start time, and the current progress underlay into an ExpandedPresentationTarget activation. |
| Heatmap | selectScenario("heatmap") around 663-675 | Lab-only clean-room Heatmap spike. LAB_HEATMAP_PRESETS in scenarios.ts:114-162 also exposes reduced, Refraction, and localized boundary-halo variants. |
| Download | selectScenario("download") | download-active fixture projected by overlayProjection.ts into shared production queue/center overlay and progress target. |
| Transcode | selectScenario("transcode") | transcode-active fixture projected through shared production center overlay and transcode helpers. |
| Mixed | selectScenario("mixed") | mixed-busy fixture combining Download and Transcode projections. |

Intake's visible origin affordances are all Lab-only:

- PresentationLab stores pointerOrigin, clamps pointer clicks through
  clampNormalizedOrigin, and shows numeric origin X/Y inputs and a determinate
  progress slider when no overlay fixture is active (approximately
  1170-1245).
- LabOverlayStage renders the marker and forwards no-op Lab click callbacks;
  the marker is visible when activeScenarioId is intake or an origin input has
  focus (approximately 820-850 and 250-280).
- handleReplay re-issues the current activation. readShaderReadout inspects
  production activation uniforms uActivationKind, uActivationAge, and
  uActivationOrigin for this Lab lane.

After cleanup, Ripple owns its own origin/controller facts. The old Intake
origin marker, numeric fields, activation replay, and activation shader
readout must not remain as invisible or misleading controls.

### Exact Heatmap meaning and production boundary

LAB_HEATMAP_PRESETS is not the production Heatmap policy. In
scenarios.ts:174-200 the Lab state has heatmap, forced Reduced Motion,
refraction, and boundaryHalo; the reducer setHeatmap/clearHeatmap cases are
around 288-308. composeLabInput around 392-410 makes the Lab Heatmap flag
override the semantic target while retaining a valid progress/idle underlay.
PresentationLab.tsx:968-970 forwards heatmapMode, refractionMode, and
boundaryHaloMode into LabOverlayStage, which forwards them to the production
surface around 316-326.

The following production ownership is independent and must remain:

- ExpandedPresentationSurface.tsx:203-296 computes the accepted analytic
  full-surface field and palette; :256-278 contains localized boundary
  response; :297-378 contains derived Refraction; :470-477 dispatches output;
  :482-524 declares public props; :570-717 owns WebGL2 compilation/uniforms/
  draw; :741-865 owns runtime, resize, context recovery, and disposal.
- expandedPresentationRuntime.ts owns bounded interpolation and scheduling.
  Its Heatmap moving/reduced-motion tests at approximately 213-245 must
  remain even when Lab Heatmap controls disappear.
- expandedPresentationPolicy.ts resolves production Intake versus Folder
  priority and progress. It is still called by production composition.
- MainWindowPresentationSurface.tsx still passes production heatmap, refraction,
  and boundaryHalo.
- Production tests that remain required are
  expandedPresentationSurface.test.ts, expandedPresentationRuntime.test.ts,
  expandedPresentationPolicy.test.ts, downloadIntakePresentation.test.ts,
  folderActivationPresentation.test.ts, and
  presentationCompositionContract.test.ts.

## End-to-end caller and dependency map

### Existing graph

~~~text
lab.html
  -> vite.lab.config.ts
  -> src/lab/lab-main.tsx
  -> ThemeProvider + PresentationLab
  -> scenario strip / reducer (src/lab/scenarios.ts)
  -> composeLabInput or projectLabOverlayFixture
  -> LabOverlayStage
  -> production ExpandedPresentationSurface (WebGL2) + shared DOM overlays

production Electron path (independent)
  -> MainWindowPresentationSurface
  -> ExpandedPresentationSurface
  -> expandedPresentationRuntime + expandedPresentationPolicy
  -> production Intake/Folder/Heatmap tests
~~~

### Proposed removal and what replaces it

| Lab node to remove | Current callers/dependents | Replacement/result | Production code that must remain |
| --- | --- | --- | --- |
| activeScenarioId default intake and selectScenario("intake") | PresentationLab initial reducer activation, Intake chip, origin-marker policy, replay disabled state, renderer-reuse assertions | Default Full chip becomes ripple; Ripple controller owns forward/reverse/cancel/scrub/replacement and its origin. | expandedPresentationPolicy.ts, activation target types, and production Intake/Folder tests. |
| selectScenario("heatmap") and all Heatmap chip attributes | Full strip, activeScenarioId, origin-marker comments, Lab renderer props, static test assertions | Remove from the visible strip and reducer path. Ripple is the only fullscreen experiment lane. | ExpandedPresentationSurface Heatmap/refraction/halo shader code, runtime Heatmap scheduling, and MainWindow production props. |
| LAB_ACTIVATION_PRESETS, LabActivationPreset, LabActivationState, activation reducer actions/cases, resolveActivationPreset, and Lab clampNormalizedOrigin | scenarios.test.ts, productionRuntimeSemantics.test.ts, PresentationLab origin/replay code | Delete Lab-only activation authority. Keep generic progress state only if still used by fixture diagnostics. | ExpandedPresentationTarget activation type, downloadIntakePresentation.ts, folderActivationPresentation.ts, policy, runtime, and all production tests. |
| LAB_HEATMAP_PRESETS, LabHeatmapPreset, LabHeatmapState, heatmap reducer actions/cases, and Heatmap compose override | scenarios.test.ts, PresentationLab, LabOverlayStage, category availability | Delete Lab-only Heatmap experiment state. Retain progress/idle composition for non-Ripple fixture plumbing. | Production Heatmap uniforms, shader, runtime heatmap input, and Electron mount. |
| Lab origin marker, preview click handler, numeric origin X/Y controls, activation replay, and activation/Heatmap shader readout fields | LabOverlayStage, PresentationLab Dev Tools and Footer | Ripple canvas host handles origin; add accessible origin readout/inputs in Ripple control group. Hide generic WebGL2 Export/Replay when Ripple is selected unless a WebGL1 readback is proven. | Production pointer/origin derivation and target policy. |
| LabOverlayStage Heatmap/refraction/boundary props and outer-domain branch | PresentationLab only; all three flags are Lab gates | Simplify Lab stage to normal 200x200 production surface for Download/Transcode/Mixed fixtures. Do not alter production surface optional props. | MainWindow outer gutter and production boundary-halo behavior. |
| Ripple candidate ?ripple A/B route and singleScene=false lane | Candidate lab-main.tsx, rippleIsolation.test.ts, RippleLab prop | Set one-scene mode unconditionally from maintained Full chip; remove query route branching and A/B copy. Keep ?theme=white. | Production Vite input remains index.html; no Ripple identifiers in production artifacts. |
| Paper official/derivative route, dependency, shader, SVG, and comparison controls | Only rejected Paper branch and task-local evidence | Do not transplant. Keep branch/report as historical recovery evidence. | No Paper package or production notice is required. |

### Maintained route and mutual exclusion

1. Start from a clean, current main-derived branch after the concurrent Compact
   work is committed elsewhere. Do not cherry-pick into the dirty main
   worktree.
2. Add the Ripple leaf and fixture, then make PresentationLab use
   activeScenarioId = ripple for the default Full state.
3. The Full strip should read Ripple, Download, Transcode, and Mixed. The
   latter three continue to use LabOverlayStage and shared production DOM
   projections. Ripple uses only RippleCanvas and its controller.
4. If candidate RippleLab currently returns its own page shell, keep its
   shader/controller code but adapt it to an embedded leaf/control group. Do
   not nest a second page shell, duplicate Dev Tools, or mount both canvases in
   one Full preview. Existing Workspace/Dev Tools is the maintained navigation.
5. Remove both query branches from lab-main.tsx; there is no hidden legacy
   Intake/Heatmap page and no A/B Ripple alias. The normal URL is
   http://127.0.0.1:1421/lab.html; ?theme=white remains a Lab theme override.
   If a separate deep link is later required, add one documented canonical
   route in a new decision, not two aliases.
6. Set singleScene to true in the integrated leaf. The controller still owns
   generation/phase/reversal/cancel/settlement, but the visual leaf has no
   Product import, GSAP timeline, A/B swap visible to users, or second canvas.

## Minimal Ripple transplant

These are the only candidate source paths needed for the approved one-scene
lane. The implementation files are copied from 818057f, then the control
wrapper is adapted to existing Lab i18n and shared styles.

| Path | Role and integration constraint |
| --- | --- |
| src/lab/ripple/RippleLab.tsx | Full-lane control wrapper. Force one-scene mode, use useTranslation("lab"), getLabChipStyle/existing focus styles, and expose the six approved control concepts without A/B wording. If embedded, return a stage/control fragment rather than a second page shell. |
| src/lab/ripple/RippleCanvas.tsx | One fixed 200x200 WebGL1 canvas, one program/draw, two sampler roles with the same fixture texture in one-scene mode, bounded resize and context recovery. It must remain free of ExpandedPresentationSurface and GSAP imports. |
| src/lab/ripple/rippleController.ts | Ameow-owned generation, raw phase, forward/reverse/cancel/replace/scrub, one pending rAF, and settlement. Keep stale-generation and bounded scheduling guards. |
| src/lab/ripple/rippleSource.ts | Pinned normalized GLSL and parameter constants. Preserve commit/blob provenance and normalized digest guards; keep MIT/source-modification header. |
| src/lab/ripple/rippleResourceCleanup.ts | Shared/partial WebGL resource cleanup, including one-scene shared texture deletion exactly once. |
| src/lab/ripple/rippleTextureUpload.ts | Clamp-to-edge/linear fixture upload and deterministic texture creation; no upstream Pinterest images. |
| src/lab/ripple/rippleController.test.ts | Keep controller tests for one pending frame, generation invalidation, reverse, cancel, replacement, scrub, and settlement. |
| src/lab/ripple/rippleSource.test.ts | Keep source digest/provenance, parameter, easing, and Pinch .14 assertions. |
| src/lab/ripple/rippleIsolation.test.ts | Update route assertions for the single maintained route and retain checks that Ripple has no production import, uses WebGL1, and preserves production index.html isolation. |
| src/lab/ripple/ameow-download-active-200.png | Add the Ameow-owned 200x200/r16 static scene fixture. Do not add upstream image-a.png/image-b.png or evidence copies. |
| src/lab/lab-main.tsx | The one entry edit: remove ?ripple/?ripple=scene branching while preserving ?theme=white and the normal PresentationLab mount. |

No candidate evidence under evidence/mr9-ripple belongs in the product diff.
The WebM/HTML/PNG review artifacts remain task-local evidence in the isolated
worktree/archive and must not be copied into the Lab bundle.

## File-by-file action table

The table describes the future implementation diff, not changes made during
this planning task.

### Keep unchanged

| Path | Reason |
| --- | --- |
| lab.html | Dedicated Vite Lab entry; keep existing document and zh-CN language. |
| vite.config.ts | Production input remains index.html; this is the production isolation boundary. |
| src/lab/stateFixtures.ts | Download, Transcode, Mixed, and Runtime fixture factories remain useful business-state Lab coverage. |
| src/lab/overlayProjection.ts | Projects those fixtures through production selectors/helpers; no Intake/Heatmap experiment authority lives here. |
| src/lab/CompactPreviewStage.tsx | Existing Compact renderer leaf and current mascot work are unrelated. |
| src/lab/previewTargets.ts | Full/Compact logical geometry and Auto/1x/2x/3x scale contract remain. |
| src/lab/previewEnvironment.ts | Screen-only background layer remains outside Ripple and production export. |
| src/lab/LabSegmentedControl.tsx | Native button/aria-pressed keyboard pattern remains the navigation primitive. |
| src/lab/PreviewEnvironmentPicker.tsx | Familiar background picker remains. |
| src/lab/labControls.ts | Reuse existing Lab chip/focus styles; no new styling system. |
| src/lab/OneWorksMascotInspector.tsx | Unrelated Compact inspector remains reachable. |
| src/lab/exportPng.ts | Keep for WebGL2 production fixture lane; do not claim it captures Ripple until WebGL1 readback is implemented and tested. |
| src/lab/lab.css | Keep scrollbar and Focus-visible rules; add no Ripple-specific global styling unless a tested token requires it. |
| src/presentation/main-window/ExpandedPresentationSurface.tsx | Production renderer, Heatmap, Refraction, boundary halo, WebGL2 lifecycle, and optional Lab gates remain unchanged. |
| src/presentation/main-window/expandedPresentationRuntime.ts | Production bounded scheduling and Heatmap/reduced-motion semantics remain. |
| src/presentation/main-window/expandedPresentationPolicy.ts | Production Intake/Folder priority remains. |
| src/presentation/main-window/MainWindowPresentationSurface.tsx | Production mount and outer-gutter geometry remain. |
| src/presentation/main-window/expandedPresentationSurface.test.ts | Production renderer contract remains. |
| src/presentation/main-window/expandedPresentationRuntime.test.ts | Includes Heatmap scheduling and Reduced Motion assertions that must survive Lab cleanup. |
| src/presentation/main-window/expandedPresentationPolicy.test.ts | Production activation priority contract remains. |
| src/presentation/main-window/downloadIntakePresentation.test.ts | Production Intake presentation contract remains. |
| src/presentation/main-window/folderActivationPresentation.test.ts | Production Folder contract remains. |
| src/presentation/main-window/presentationCompositionContract.test.ts | Production composition and mount ownership remain. |

### Add from 818057f, then adapt

| Path | Required treatment |
| --- | --- |
| src/lab/ripple/RippleLab.tsx | Add, force one-scene, translate all labels/status text, and fit existing Workspace shell. Preserve native button/range controls and add a keyboard-adjustable origin readout if click-only origin is otherwise inaccessible. |
| src/lab/ripple/RippleCanvas.tsx | Add unchanged visual math/lifecycle except props needed to embed; retain fixed 200x200/r16 and WebGL1. |
| src/lab/ripple/rippleController.ts | Add unchanged controller semantics; no GSAP or Product state. |
| src/lab/ripple/rippleSource.ts | Add unchanged pinned source formulas/digests and attribution header. |
| src/lab/ripple/rippleResourceCleanup.ts | Add cleanup helper and preserve partial-init tests. |
| src/lab/ripple/rippleTextureUpload.ts | Add deterministic Ameow fixture upload helper. |
| src/lab/ripple/rippleController.test.ts | Add focused controller tests. |
| src/lab/ripple/rippleSource.test.ts | Add source/provenance tests. |
| src/lab/ripple/rippleIsolation.test.ts | Add/update isolation and route tests; assert no A/B route survives. |
| src/lab/ripple/ameow-download-active-200.png | Add only this Ameow-owned fixture. |

### Edit existing Lab files

| Path | Edit and boundary |
| --- | --- |
| src/lab/lab-main.tsx | Remove candidate query routing and singleScene URL modes. Keep ?theme=white, initialize i18n once, and mount maintained PresentationLab. |
| src/lab/PresentationLab.tsx | Add ripple Full lane and default; remove Intake/Heatmap chips, activation initialization, origin marker policy, activation replay, Heatmap flags, and obsolete WebGL2 uniform readout fields. Render Ripple mutually exclusively from LabOverlayStage; keep Compact and Download/Transcode/Mixed fixture lanes. Use translated Ripple controls and hide generic WebGL2 Export for Ripple unless proven. |
| src/lab/LabOverlayStage.tsx | Remove Lab-only heatmapMode, refractionMode, boundaryHaloMode, origin marker, and click-origin props. Keep one production Expanded surface and shared queue/runtime/center overlays for business fixtures at 200x200. |
| src/lab/scenarios.ts | Remove activation/Heatmap types, presets, resolvers, reducer cases, forced flags, pointer-origin state, and activation/heatmapSpike category entries. Keep generic progress/idle state needed by fixture diagnostics, Compact scenarios, and target compatibility; add a Full-only ripple category if the availability map remains. |
| src/lab/scenarios.test.ts | Delete Intake/Folder activation and all Heatmap preset tests. Retain progress/idle, trace replacement, Compact, target compatibility, and Reduced Motion tests that still exercise maintained Lab behavior. |
| src/lab/productionRuntimeSemantics.test.ts | Remove Lab activation bridge cases that only exist for Intake; retain progress interpolation, downward revision, replacement trace, indeterminate, and other production runtime semantics. Do not delete production runtime tests. |
| src/lab/rendererReuse.test.ts | Replace assertions requiring selectScenario("intake")/("heatmap") and activation marker/flags with Ripple presence, one-scene/isolation, no obsolete labels, mutual exclusion, and retained production fixture reuse assertions. |
| src/lab/locales/en.json | Remove Intake/Folder and Heatmap preset/category copy and obsolete origin/Heatmap-only labels. Add translated Ripple labels, control names, status strings, provenance hint, Pinch ON/OFF, and accessible origin/phase hints. Preserve Download/Transcode/Mixed, Compact, theme, reset, scale, and diagnostics keys. |
| src/lab/locales/zh-CN.json | Mirror the English key shape and semantics in Chinese; no fallback-only English strings in maintained route. |
| vite.lab.config.ts | Update only comments/URL examples if they describe ?ripple or the old five-chip route; keep port 1421 and Lab-only build input. |
| THIRD_PARTY_NOTICES.md | Add pinned m1ckc3s/ripple MIT attribution and source-modification notice if copied source is distributed; do not add Paper or GSAP. Keep statement that no Paper-derived source is active. |

### Delete or explicitly do not transplant

| Candidate material | Action |
| --- | --- |
| evidence/mr9-ripple/** (review HTML, repaired WebM, screenshots, machine JSON/CSV) | Do not add to main or the Lab build. If an implementation cherry-pick stages them, remove them before the integration commit; archived task evidence is the recovery record. |
| Upstream public/image-a.png and public/image-b.png | Do not copy. The upstream report says those Pinterest assets are not owned by the upstream author; the Ameow fixture is the only texture input. |
| ?ripple A/B route, singleScene=false, and A/B labels such as ready: A | Delete from the maintained route/control surface. The one-scene controller may retain internal logical roles only where required by the pinned shader contract. |
| LAB_ACTIVATION_PRESETS / LAB_HEATMAP_PRESETS and their locale keys | Delete symbols/keys during Lab file edits above; do not delete production policy/shader equivalents. |
| Paper branch files (PaperHeatmap*, SVGs, @paper-design dependency and notices) | Never transplant; final closure is NO-GO. |

## Focused validation and integration order

Do not run these commands in the current dirty main worktree while the other
Codex window owns concurrent changes. They are gates for a fresh main-derived
integration branch.

### Ordered implementation gates

1. Record/snapshot dirty paths, wait for the concurrent main push, and create
   a clean branch/worktree from resulting main. Do not touch the isolated
   mr9-ripple-source-fidelity worktree or its running Vite server.
2. Apply only the ten Ripple paths above, then edit maintained route and Lab
   cleanup files. Keep current Compact mascot edits in their own commit/worktree.
3. Run focused suites:

~~~text
npx vitest run \
  src/lab/ripple/rippleController.test.ts \
  src/lab/ripple/rippleSource.test.ts \
  src/lab/ripple/rippleIsolation.test.ts \
  src/lab/scenarios.test.ts \
  src/lab/productionRuntimeSemantics.test.ts \
  src/lab/rendererReuse.test.ts
~~~

4. Run repository gates:

~~~text
npm run type-check
npm run lint -- --quiet
npx vitest run src/presentation/main-window src/lab
npm run build:renderer
npm run build
npm run docs:build
git diff --check
~~~

5. Start the Lab only in the clean integration worktree and inspect
   http://127.0.0.1:1421/lab.html in default and ?theme=white:

~~~text
npm run dev:lab
~~~

   Browser assertions should prove: Ripple is the first Full chip and is
   selected by default; no Intake or Heatmap chip/label/data attribute exists;
   Ripple has exactly one 200x200/r16 WebGL1 canvas; Download/Transcode/Mixed
   still project shared production overlays; Compact still has zero canvases;
   one Full selection never mounts both Ripple and ExpandedPresentationSurface;
   keyboard Tab reaches every control and Focus-visible is visible.

6. Exercise Ripple lifecycle at center, off-center, edge, and corner origins:
   Forward, Reverse, both Cancel destinations (translated as start/target),
   scrub equivalence, replacement generation, Pinch ON/OFF, context loss and
   restoration, resize, disposal, and one pending rAF. Verify the same texture
   object is bound to both sampler roles in one-scene mode.
7. Verify Reduced Motion from prefers-reduced-motion and the Lab toggle: no
   continuing Ripple frames, a stable static snapshot, and no stale controller
   callback after cancel/unmount. Verify failed WebGL setup fails closed with
   an accessible inline message.
8. Scan production output to prove Ripple, data-ripple-* and Lab locale
   identifiers do not enter index.html or the renderer bundle. Keep existing
   production Heatmap/Refraction artifacts and tests green.
9. Commit integration and cleanup only after all gates. Preserve the candidate
   commit hash in the integration report/commit message or as a recoverable
   tag before deleting its local branch.

The historical MR9 Browser Lab command
node .trellis/research/archive/2026-08/08-15-mr9-fullscreen-activation-fx-progress-visual-refinement/research/run-browser-lab-validation.mjs
still validates the ordinary production-reuse fixture route. It does not
replace the Ripple WebGL1 lifecycle and one-scene checks above.

## Impeccable product UI assessment

The Lab is a product-register developer tool, not a marketing page. Keep the
existing compact, intentional, polished Ameow shell, two macro regions,
system UI typography, token-led surfaces, and restrained blue
focus/selection language. The cleanup is a navigation correction, not a
redesign.

### Information architecture and familiar controls

- Remove obsolete Intake and Heatmap choices rather than relabeling or hiding
  them behind an Advanced disclosure. Their presence currently implies that
  the Lab still evaluates rejected fullscreen experiments.
- Put Ripple first and selected by default in the existing flat scenario strip.
  Keep Download, Transcode, and Mixed as understood fixture choices if the
  product decision accepts them; they exercise business overlays, not
  alternate fullscreen shaders.
- Keep the existing Full/Compact segmented target control, Auto/1x/2x/3x
  scale, Preview background picker, circular Reset, Dev Tools disclosure,
  and existing Compact inspector. Do not add a left nav, page title, nested
  cards, modal, or second toolbar.
- Ripple controls should be a quiet existing Lab control group: Forward,
  Reverse, Cancel, raw phase scrub, origin, and Pinch ON/OFF. Cancel-to-start
  and Cancel-to-target are clearer one-scene labels than from/to A/B. Keep the
  fixed 200x200 visual geometry and source parameters as a compact fact line,
  not a tuning dashboard.

### i18n, keyboard, focus, and accessibility

- Every Ripple label, hint, status, parameter fact, error, canvas description,
  and provenance note belongs in both Lab locale files; use
  useTranslation("lab"), not hard-coded candidate English.
- Use native buttons and a native range input. Preserve aria-pressed for Pinch
  and selected scenario chips, an explicit aria-label/label for raw phase, and
  an accessible region name such as Ripple controls.
- Click origin is useful but cannot be the only origin mechanism. Provide
  keyboard-adjustable normalized X/Y fields or equivalent labeled buttons,
  clamped to [0,1]; announce current origin and settlement without relying on
  color or motion. The origin marker is Lab chrome, not shader content, and
  should be aria-hidden.
- Preserve .lab-control:focus-visible, visible contrast in both themes,
  logical Tab order (scenario strip, preview controls, Ripple controls, then
  Dev Tools), and no pointer-event trap around the canvas. Context-loss/error
  text must be reachable and readable by keyboard users.

### Motion and Reduced Motion

- Keep pinned Ripple visual math and power3.out timing for normal lane. Do not
  add CSS layout animation, bounce, or a second autonomous clock.
- Honor system prefers-reduced-motion and the Lab Reduced Motion toggle:
  freeze to a deterministic snapshot, cancel pending frames, and avoid Pinch
  movement while reduced. Controller remains bounded and cancel-safe.
- Pinch OFF is an explicit comparison control, not a new motion mode. Do not
  silently change the .14 source baseline or invent a blend-strength parameter.

### Responsive and visual restraint

- Keep persistent Dev Tools rail and horizontal overflow behavior at narrow
  widths. The 200x200 canvas remains centered; scaling is the existing
  Auto/1x/2x/3x Lab display choice, not a shader resize.
- Reuse ThemeColors, getLabChipStyle, and existing shared style factories.
  Avoid local neon backgrounds, side stripes, gradient text, generic card
  grids, or an all-new control vocabulary.
- Do not include evidence review page or videos in the UI. They are historical
  proof, not runtime content.

## Branch cleanup table

The following is the complete local/remote-tracking inventory from
fullscreen-branch-inventory.md. “Delete-after-merge” means a conditional
future action, never an action in this planning task. Recovery evidence is the
full tip hash in that inventory plus cited task reports; a branch is not
deletable merely because it has an experiment-sounding name.

| Ref | Tip | Classification | Reason and recovery evidence |
| --- | --- | --- | --- |
| refs/heads/main | ff53f9749aa095c69f8a84d6537838d46ce3037c | Retain | Current truth and protected integration base. Recovery is normal branch plus all accepted production ancestors. |
| refs/heads/lab/mr9-ripple-source-fidelity | 818057f664c7474ec1722b143fcc84dcf3ec67e9 | Delete-after-merge | Approved Ripple source-fidelity experiment. Delete locally only after selected source/tests/fixture are integrated and validated, tip hash is recoverable in main history or a retained tag/report, and git branch -d (not -D) confirms it is merged. Closure and repair reports preserve full hash and behavior evidence. |
| refs/heads/motion/mr9-paper-heatmap-official-baseline | 77eb5611178a06f7079db29563c9ef75197d7af8 | Retain | Rejected Paper research line with official prerequisite 92219275e07ebe2eca4b0f0486cb406faf0312c7; final NO-GO is valuable recovery/decision evidence. No merge occurred, so do not delete it as if superseded by Ripple. |
| refs/remotes/origin/motion/presentation-integration | 48987f7f65bcf5bba7547152441b14cf8853809c | Delete-after-merge (remote, conditional) | Accepted Expanded substrate predecessor; descendants are in main. Delete only after fresh fetch/update proves exact server ref still points to inspected tip and has no unique commits. Hash and accepted-chain reports provide recovery. |
| refs/remotes/origin/main | 5619ba031163c3dab7071f67ad4739d49b1f095f | Retain | Stale pre-Lab baseline and server branch tracking ref. Do not delete or rewrite the default branch. |
| refs/remotes/origin/HEAD | 5619ba031163c3dab7071f67ad4739d49b1f095f | Retain | Stale symbolic default pointer. It is not an experiment branch and must remain aligned with server default. |
| refs/heads/feat/compact-mascot-depth-occlusion | b9a00ab93f15bbaf301e2b129406b0b5f16c69fb | Retain | Unrelated active mascot work, including current dirty paths. No unique fullscreen paths; recovery is its branch tip and current worktree ownership. |
| refs/heads/chore/trellis-tooling-0.6.15 | 40d31d38c4e140f389bbb1ba066b58fba3e43a91 | Retain | Unrelated tooling branch. No fullscreen dependency; retain for its own work/recovery. |
| refs/heads/cindy/auto-o3p8cr | 342991724502ff067583d56fd877de9d1e536943 | Retain | Unrelated automation branch. No unique Lab/fullscreen paths. |
| refs/heads/history/m3-auto-o3p8cr-raw-snapshot | b4acb4addc98964b6d019c9874f6b20bd6093da8 | Retain | Historical M3 DownloadIntake/MainWindow snapshot, superseded but useful recovery/history evidence. Not proven disposable fullscreen experiment branch. |
| refs/heads/recovery/main-pre-phase4-2b46f91 | 2b46f91496214a85162593557f38c04267524deb | Retain | Recovery pointer. Deleting it would reduce rollback safety and is outside fullscreen cleanup. |
| refs/heads/repair/diagnostics-readability-export-cleanup | 353a7984174a3d3d6e56a7944b7cb33b1ce5707f | Retain | Diagnostics-only repair with no unique fullscreen implementation. Preserve independent recovery point. |

### Remote deletion authorization boundary

No fetch was allowed for this task. Origin tracking refs are stale as of
2026-08-14, and absence of an origin/lab/mr9-ripple-source-fidelity or
origin/motion/mr9-paper-heatmap-official-baseline ref locally does not prove
the server has never had one or has already deleted it. The only candidate
remote deletion is accepted predecessor origin/motion/presentation-integration;
it cannot be authorized until a future owner:

1. fetches/prunes origin in a safe, clean worktree;
2. confirms current server ref tip and compares it with main ancestry;
3. checks that no unique commits, open review, or release automation refer to
   the ref; and
4. obtains the user's explicit local-versus-remote cleanup decision.

Only then may an approved owner use a targeted remote-delete command. Never
delete origin/main or origin/HEAD, and never infer remote state from this stale
inventory.

## Dirty-worktree and concurrency risks

The inventory recorded these dirty Product paths:

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

The current changes are Compact mascot poses/theme and overlap exactly the
candidate's lab-main.tsx, PresentationLab.tsx, both Lab locales,
rendererReuse.test.ts, and scenarios.ts/test. A blind cherry-pick can
overwrite theme handling or mascot labels. LabOverlayStage.tsx and
ExpandedPresentationSurface.tsx are clean in the inventory, so there is no
reason to replay the accepted production renderer chain.

The worktree also contains more than 38,000 lines of untracked generated or
runtime assets. They are not Ripple source and must not be staged. Another
Codex window may still be committing/pushing main changes; do not inspect,
reset, stash, merge, or push from this task. Do not touch the isolated
mr9-ripple-source-fidelity worktree or its running Vite server.

Additional technical risks are the static fixture's lack of live Product scene
ownership, WebGL1 portability/context-loss behavior, only Windows Chromium
evidence, and the existing WebGL2-only export transaction. These are reasons
to keep Ripple Lab-only and gate any export adaptation separately, not reasons
to alter production code.

## Remaining decisions for the Lead to ask the user

1. Full-strip scope: This plan assumes Download, Transcode, and Mixed remain as
   business fixture lanes while Ripple becomes the only fullscreen experiment.
   Ask whether “sole fullscreen experience” instead means the Full strip must
   contain Ripple only. If so, remove those three chips and their Lab-only
   fixture UI in a separately scoped change; production selectors/components/
   tests still remain unless explicitly retired.
2. Route alias policy: The recommendation removes both candidate query routes
   and makes normal lab.html Full lane Ripple. Ask only if a documented
   ?ripple=scene deep link is required for external review; do not retain the
   obsolete A/B ?ripple alias.
3. Destructive branch scope: After validation, ask whether to delete proven
   local Ripple branch only, or also authorize deletion of accepted remote
   predecessor after a fresh fetch. Keep Paper, mascot, tooling, history,
   recovery, diagnostics, origin/main, and origin/HEAD refs.
4. Ripple export: Existing export reads a WebGL2 buffer. Decide later whether
   Ripple needs a tested WebGL1 readback/export adapter; until then, hide or
   disable that Lab-only button for Ripple rather than produce a partial or
   misleading PNG.

## Caveats / not found

- This artifact is planning-only. No Git operation, branch operation, product
  edit, fetch, server inspection, or isolated-worktree edit was performed.
- The approved Ripple checkpoint is visually accepted for Browser Lab but is
  not evidence of production scene capture, macOS behavior, or cross-GPU
  portability.
- No current remote ref proves availability of a future Ripple branch on the
  server; fetch/update is required before any remote deletion decision.
- Archived evidence and reports are the recovery record for the candidate;
  review media is intentionally excluded from the maintained Lab bundle.
