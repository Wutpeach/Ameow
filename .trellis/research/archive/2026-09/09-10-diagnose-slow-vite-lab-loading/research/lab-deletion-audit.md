# Research: Vite Lab deletion-first audit

- Query: Audit the current Browser Presentation Lab against the narrowed goal of previewing production-faithful Ameow Compact states with pointer interaction and production-faithful Fullscreen Download, Transcode/multi-task, runtime/error, and other complete application states; classify Lab dependencies, imports, chrome, scenarios, export/debug seams, assets, and tests for retention or deletion.
- Scope: internal repository and task-history audit; no Vite/browser start, cache change, dependency install/removal, code/config/spec edit, or git operation in this pass.
- Date: 2026-09-10

## Executive decision

Keep the dedicated `http://127.0.0.1:1421/lab.html` entry and reduce it to one human-facing control panel over two production-faithful hosts:

1. Compact: `CompactPreviewStage` → production `CompactMascot`, with the Lab-local pointer field and the six existing Compact poses.
2. Fullscreen: `LabOverlayStage` → one production `ExpandedPresentationSurface`, the shared center overlay, queue popover, and runtime indicator, driven by typed fixtures and the existing production selectors/helpers/projections.

Delete Agentation, the OneWorks inspector/candidate path, and the Ripple WebGL1 experiment from the maintained Lab. Keep the production `@bible-strong/avatar-core` Compact path, production WebGL2 host, fixture/projection layers, i18n, Motion, queue interaction, Reduced Motion, and the central scenario controls. Keep PNG export and the backdrop/scale/facts panel only as final manual-acceptance aids until a deterministic Playwright/readback capture policy replaces them.

The current largest correctness gap is not an obsolete fixture: the registry has seven useful Fullscreen fixtures, but `PresentationLab` exposes only three production fixture lanes (plus Ripple), maps only active variants, hard-codes `showRuntimeOverlay={false}`, and therefore cannot render runtime/error, queued, or transcode-failure states. The next implementation should use one finite scenario registry for both the panel and URL automation rather than deleting those fixtures.

## Loading context and what deletion can (and cannot) fix

This report does not start a server or browser. The following measurements are already recorded in the task-local loading reports and are used only to estimate graph impact:

| Condition from existing reports | Evidence | Meaning for this audit |
| --- | --- | --- |
| Cold-ish Lab navigation | Lab-only dependency metadata, then first DOM at about 25.9 s; a second isolated first request reached about 39.2 s | Vite `ready` is server startup, not transformed-module or React mount readiness. Removing eager Lab-only graph branches should lower graph work, but does not make cold transforms zero-cost. |
| Settled warm refreshes | Three refreshes on one long-lived process reached the first workspace in about 293 ms, 164 ms, and 201 ms; module spans were about 99 ms, 45 ms, and 44 ms | There is no per-refresh optimizer loop once the graph is settled. |
| Cache-disabled synthetic refreshes | Existing probe reached about 106.2 s, 56.0 s, and 71.7 s | Browser cache policy can expose server transform/backlog cost; this is not evidence that Compact, Ripple, or WebGL is blocking initial React mount. |
| Production-root request | Requesting `/` discovered `react-router-dom`, `clsx`, `tailwind-merge`, and `image-max-url`, changed the dependency hash, and reloaded clients | The root URL is the production entry, not the Lab. The shared optimizer/cache transition explains late package discovery and a reload; deleting Lab code does not make `/` a Lab. |
| Windows cache contention | Task notes record an `EPERM` swap of `node_modules/.vite/deps` while a production graph was active; isolated research servers shared that cache while the user process was alive | Treat concurrent-process contention as test-induced/external evidence. Do not add a cache-dir abstraction as speculative Lab cleanup. |

The current Lab statically imports optional branches through `PresentationLab`: Agentation in `lab-main.tsx`, OneWorks in `PresentationLab.tsx`, Ripple in `PresentationLab.tsx`, and the exporter module in `PresentationLab.tsx`. Even when their buttons are not used, static imports make those modules visible to the Vite graph. `html2canvas` itself is dynamically imported only inside the export path (`src/lab/exportPng.ts:155-165`), so it is not fetched for the first paint, although the existing optimizer metadata and archived build show it as a Lab-side chunk. No exact seconds-per-deletion claim is justified without a new controlled build; the source and archived artifact counts below are the defensible cost measures.

## Inventory and cost snapshot

Repository evidence (counted from the current `src/lab` tree without running Vite):

| Inventory | Count / size | Notes |
| --- | ---: | --- |
| Files under `src/lab` | 45 | 43 TypeScript/TSX/JSON files, one `lab.css`, and one PNG. |
| TypeScript/TSX/JSON | 43 files / 5,125 lines / 216,091 B | Includes implementation, locale JSON, and tests. |
| Lab CSS | 1 file / 52 lines / 1,518 B | Focus/scroll rules plus Agentation placement block. |
| Tests | 17 files / 1,179 lines / 54,697 B | Fixture/projection, renderer-boundary, Compact, controls, exporter, OneWorks, and Ripple tests. |
| Manifest | 4 runtime + 32 dev dependencies | `package.json:49-87`; the four obvious Lab-only entries are `agentation`, `@oneworks/avatar`, `@oneworks/avatar-react`, and `html2canvas` (all dev dependencies). |
| OneWorks path | 6 files / 1,255 lines / 51,611 B | The six are the inspector, candidate, mascot fixture, and three focused tests; tests are 246 lines / 11,865 B. |
| Ripple path | 9 text files / 821 lines / 35,534 B + 7,267 B PNG | Three implementation hosts/helpers and three tests; the PNG is `src/lab/ripple/ameow-download-active-200.png`. |
| PNG exporter | 2 files / 620 lines / 24,771 B | `exportPng.ts` is 502 lines and its test is 118 lines. |

An archived OneWorks Lab build gives a historical artifact-size reference, not a current build measurement: `lab-N8-nYQ4w.js` 1,356,671 B, CSS 65,368 B, and the lazy `html2canvas-7hLxsghc.js` chunk 199,566 B (`.trellis/tasks/archive/2026-08/08-25-oneworks-ameow-mascot-visual-candidate/implementation-report.md`). These numbers support removing the eager inspector branch, but should not be treated as a post-deletion forecast.

## Top-level import and dependency graph

### Entry and shell

| Import / module | Current evidence | Classification and action |
| --- | --- | --- |
| `lab.html` → `/src/lab/lab-main.tsx` | `lab.html:9-11`; `vite.lab.config.ts:5-32` documents the dedicated browser page, port 1421, and Lab-only build input. | **(1) Core entry.** Keep the separate entry; it is the Electron-isolation boundary required by `.trellis/spec/frontend/directory-structure.md`. |
| React/ReactDOM/`StrictMode` | `src/lab/lab-main.tsx:1-2,18-25`; production also uses React. | **(1) Core support.** Not Lab-only and not removable. StrictMode effect replay is development behavior, not a Lab feature to delete. |
| `ThemeProvider` | `lab-main.tsx:4,20`; provider is explicitly bridge-free (`src/contexts/ThemeContext.tsx:269-300`). | **(1) Core support.** Keep; it supplies production theme tokens to both hosts. |
| `initializeLabI18n` and `lab.css` | `lab-main.tsx:6-7,14`; i18n implementation is `src/lab/i18n.ts:14-30`. | **(1) Core support.** Keep i18n and accessibility CSS; delete only the Agentation CSS block described below. |
| Agentation | Static import and mount at `lab-main.tsx:3,22`; placement CSS at `lab.css:42-52`. | **(4) Remove.** It is a Lab-only annotation toolbar with no production-fidelity value, no state bridge, and no current acceptance contract. Remove the package, import, mount, CSS block, and any source-level assertions in a follow-up implementation. |
| `PresentationLab` | `lab-main.tsx:5,21`; shell implementation `PresentationLab.tsx:1-173`. | **(1) Core shell after deletion.** Retain the central panel and reduce its optional chrome; do not replace it with parallel URL-only scenario definitions. |

### `PresentationLab` static graph

`PresentationLab.tsx:10-37` statically imports all of the following. The import itself is evidence of graph cost; a component being conditionally rendered does not make its module lazy.

| Branch | Current import / use | Classification |
| --- | --- | --- |
| Compact | `CompactPreviewStage` (`PresentationLab.tsx:13,135`) | **(1) Core renderer.** Keep. |
| Fullscreen production host | `LabOverlayStage` (`PresentationLab.tsx:14,135`) | **(1) Core renderer.** Keep. |
| Scenario controls | `LabSegmentedControl`, `labControls`, Compact scenario registry (`PresentationLab.tsx:15,19,36`) | **(1) Core visible controls.** Keep, with one registry replacing duplicated lane/fixture mapping. |
| OneWorks inspector | `OneWorksMascotInspector` (`PresentationLab.tsx:16,125,151`) | **(4) Remove from maintained Lab.** The conditional render does not prevent its static package graph from being traversed. Preserve archived evidence; details below. |
| Backdrop picker | `PreviewEnvironmentPicker` (`PresentationLab.tsx:17,138`) | **(3) Manual aid / (2) environment seam.** Keep but hide or bypass in automation mode. |
| PNG exporter | `capturePreviewPng`, `downloadCapturedPng`, `ExportLayerFailure` (`PresentationLab.tsx:18,110-123,145`) | **(3) Manual aid.** Keep until capture policy moves to Playwright/readback; then delete the exporter, test, dependency, and readback props as one unit. |
| Projection and fixture models | `overlayProjection`, `previewTargets`, `previewEnvironment`, `stateFixtures` (`PresentationLab.tsx:20-37`) | **(1) Core data path.** Keep; these are the production-fidelity seams, not duplicate renderers. |
| Ripple | `RippleLab` (`PresentationLab.tsx:35,135`) | **(4) Remove from the maintained production-faithful Lab.** It is an independent WebGL1 experiment, not an Ameow application state. |
| React hooks / `react-i18next` / shared styles / theme | `PresentationLab.tsx:2-12` | **(1) Core support.** Keep; these are used by production-reuse components and the central controls. |

### Shared and Lab-only package decisions

| Package / asset | Evidence and reachability | Decision |
| --- | --- | --- |
| `@bible-strong/avatar-core` | Production Compact imports `renderAvatarDefinition` at `src/presentation/main-window/CompactMascot.tsx:5-20`; behavior runtime imports the same core at `compactMascotBehaviorRuntime.ts:1-20`; Lab mounts that leaf at `CompactPreviewStage.tsx:146-155`. | **(1) Cannot remove.** This is the actual Compact fidelity path. Removing it would remove the production mascot, not merely Lab tooling. |
| `@oneworks/avatar` | Only the Lab OneWorks data modules import it (`src/lab/oneworksMascot.ts:8-13`; `oneworksAmeowCandidate.ts:19-34`). | **(4) Remove from Lab and manifest** after deleting the inspector path. It is not used by production Compact. Keep archived canonical JSON/reports/screenshots, which are data/evidence rather than runtime imports. |
| `@oneworks/avatar-react` and its package stylesheet | Static import at `OneWorksMascotInspector.tsx:10-16`; Inspector renders `Avatar` at lines 308, 314, 326, 379, 384, 396 and `AvatarEditor` at lines 409-412. | **(4) Remove from Lab and manifest** with the Inspector. The package stylesheet is an eager asset edge, not a production Compact dependency. |
| `agentation` | One static import/mount only (`lab-main.tsx:3,22`). | **(4) Remove from Lab and manifest.** No fidelity loss. |
| `html2canvas` | Dynamic import only in `exportPng.ts:155-165`; invoked by the non-Ripple Fullscreen export action (`PresentationLab.tsx:110-123,145`). | **(3) Keep provisionally.** It is not part of first-paint rendering, but it can be removed later with the whole exporter once Playwright/readback is the capture source of truth. |
| `playwright` | Manifest entry at `package.json:76`; no current source test or package script consumes it (the existing task architecture report explicitly records no browser screenshot suite). | **(2) Automation-only seam.** Keep if the next Lab task adds the promised deterministic scenario smoke/visual checks; otherwise it is a dead dev dependency and can be removed after that decision. |
| React, ReactDOM, `motion`, `i18next`, `react-i18next` | React is the Lab runtime; Motion is used by the picker and shared production overlays; i18n is used by both production and Lab components. | **(1) Core support; not Lab-only.** Do not delete to chase graph size. |
| `vite`, `@vitejs/plugin-react`, `vitest` | `vite.lab.config.ts` and production `vite.config.ts` both use the Vite/React plugin; Vitest covers repo tests. | **(2) Shared dev/test infrastructure.** Keep. |
| `react-router-dom`, `clsx`, `tailwind-merge`, `image-max-url`, `ws`, `zod` | These are production/package entries (`package.json:50-53,81-82`) and are not imported by the Lab entry graph; the prior loading report ties the first four late discoveries to the production `/` graph. | **Not Lab deletion candidates.** Retain for production; do not pre-include them in the Lab. |
| Lab locale JSON | `src/lab/i18n.ts:16-17,27-28`; `src/lab/locales/en.json` and `zh-CN.json` are approximately 3,041 B and 2,985 B. | **(1) Core support.** Keep the `lab` namespace. |
| Production locale resources transitively loaded by shared `src/i18n` | `src/i18n/resources.ts:3-25` statically imports eight common/desktop/extension/native JSON files (about 62,672 B total from the current tree). | **(1) Copy-fidelity support, not repo deletion.** Lab uses production `desktop` strings through shared components; deleting extension/native resources would break other consumers. A future supported resource-slicing seam could reduce Lab cold work, but is not a deletion-only change and should follow measurement. |
| Ripple PNG | `RippleCanvas.tsx:12`, loaded before WebGL1 initialization (`RippleCanvas.tsx:53-58,103-160`). | **(4) Remove with Ripple.** It is a 7,267 B experiment fixture, not a production application asset. |
| OneWorks archived assets | Canonical JSON, protected baseline, and screenshots are under `.trellis/research/archive/2026-08/08-25-oneworks-ameow-mascot-visual-candidate`. They are not imported by current production/Lab runtime. | **Preserve.** Do not delete historical evidence while removing runtime packages/files. |

## OneWorks/avatar end-to-end trace

The dependency is removable without losing Compact fidelity:

```text
PresentationLab (static import)
  -> OneWorksMascotInspector
      -> @oneworks/avatar-react + package style.css
      -> oneworksAmeowCandidate
          -> @oneworks/avatar parse/serialize types and APIs
          -> production compactMascotRecipe (attention facts only)
      -> oneworksMascot
          -> @oneworks/avatar createDefaultAvatarDefinition
```

Evidence:

- `PresentationLab.tsx:16,125,151` imports and exposes the inspector even though it is closed by default.
- `OneWorksMascotInspector.tsx:10-43` imports the upstream React renderer/editor plus both Lab candidate/fixture modules. The inspector owns candidate pose, action, sweep, visibility, export, and editor controls (`OneWorksMascotInspector.tsx:94-212,236-427`).
- `oneworksMascot.ts:8-13,48-167` creates a source-pinned three-part cone-ear cat fixture through `createDefaultAvatarDefinition`; it does not provide the production mascot.
- `oneworksAmeowCandidate.ts:8-34,128-229` patches that fixture and maps production eye-attention facts into a Lab-only conservative head-pose envelope; this mapping is explicitly not production authority (`oneworksAmeowCandidate.ts:39-47,304-325`).
- Production Compact instead calls `renderAvatarDefinition(COMPACT_MASCOT_DEFINITION)` from `@bible-strong/avatar-core` (`CompactMascot.tsx:5-20,57-89`) and the Lab directly mounts that production leaf (`CompactPreviewStage.tsx:146-155`).
- The focused isolation test confirms production `main.tsx`, `index.html`, and `vite.config.ts` contain no OneWorks/Inspector/candidate imports (`OneWorksMascotInspector.test.ts:58-65`). This proves package removal does not cross the production build boundary.
- The archived implementation report records a visual GO only for a Lab candidate, explicitly says it is not a production migration/package-adoption approval, and records the canonical checksum, source revision, screenshots, and protected-baseline evidence. Keep those files immutable as historical review evidence.

Therefore:

1. Remove the Inspector, `oneworksMascot.ts`, `oneworksAmeowCandidate.ts`, and their three focused tests from the maintained Lab.
2. Remove `@oneworks/avatar` and `@oneworks/avatar-react` from the manifest/lockfile in the implementation task.
3. Do not remove `@bible-strong/avatar-core`, `CompactMascot`, `CompactPreviewStage`, Compact definitions, or Compact pointer tests.
4. Do not remove archived canonical JSON, reports, protected hashes, or screenshots; they are the reproducibility record for the earlier candidate decision and are not live dependencies.

## Production-faithful hosts and data flow

### Compact

`CompactPreviewStage.tsx:4-12` states the intended contract: an 80×80 outer frame, 60×60 shell, 56×56 mascot, one Lab-local pointer pair, no canvas/shader/runtime/native shell. It uses production geometry and theme values (`CompactPreviewStage.tsx:103-155`) and updates the pointer field from client coordinates (`CompactPreviewStage.tsx:83-101`; `compactPointerField.ts:31-89`). This directly satisfies the narrowed mouse/pointer requirement and must remain.

The six finite Compact scenarios are defined at `scenarios.ts:13-45`: `compact-neutral`, `compact-pointer`, `compact-reduced`, `compact-surprised`, `compact-curious`, and `compact-playful`. The scenario test pins the exact set and frozen pose mapping (`scenarios.test.ts:8-22`). They are not duplicate stories: live pointer attention, forced Reduced Motion, and deterministic action stills exercise distinct existing renderer capabilities.

### Fullscreen production host

`LabOverlayStage.tsx:8-18` imports the production `ExpandedPresentationSurface`, shared center overlay, queue popover, runtime indicator, palette, and production target types. It renders exactly one WebGL2 production host (`LabOverlayStage.tsx:118-128`) and the shared DOM overlays (`LabOverlayStage.tsx:129-162`). No Lab shader or alternate graphics backend is introduced here.

`stateFixtures.ts:1-37` defines a discriminated union containing only production model values (`DownloadQueueState`, `VideoTranscodeTaskPayload[]`, runtime gate payload, and `CenterOverlayState`). `overlayProjection.ts:1-9,172-212` documents and implements the same pure selectors/helpers/projections used by `App`; it does not read or write Product, lifecycle, config, or desktop authority. Keep both layers.

The production-only Motion imports used by shared overlays are not optional Lab decoration: `MainWindowQueuePopover.tsx:15-37`, `MainWindowCenterOverlay.tsx:13-24`, and `MainWindowRuntimeIndicator.tsx:10-16` all use `motion/react` and production theme/i18n. Remove neither Motion nor the shared components.

### WebGL host matrix

| Host | Current role | Classification |
| --- | --- | --- |
| `CompactPreviewStage` → `CompactMascot` SVG | Production Compact mascot and pointer attention; no canvas/shader (`compactPreviewStage.test.ts:8-20`). | **(1) Core.** |
| `LabOverlayStage` → `ExpandedPresentationSurface` | One production WebGL2 host with semantic `ExpandedPresentationTarget`; read-only fixture-driven progress/activation material. | **(1) Core.** |
| `WebglReadback` in `LabOverlayStage` | Reads the production WebGL2 canvas at capture epoch (`LabOverlayStage.tsx:44-60`) for PNG export. | **(3) Manual capture seam.** Remove only with exporter. |
| `RippleCanvas` | Separate WebGL1 shader, texture upload, context-loss recovery, and PNG fixture (`ripple/RippleCanvas.tsx:1-12,103-190`). | **(4) Remove.** It is not a production Fullscreen application state and has separate lifecycle/controls. |

## Fixture and scenario audit

### Registry versus visible lanes

`LAB_OVERLAY_FIXTURES` contains seven factories (`stateFixtures.ts:198-212`), all covered by construction/projection tests (`stateFixtures.test.ts:22-110,113-182`):

| Fixture ID | Current reachability | Goal fit / action |
| --- | --- | --- |
| `download-active` | Visible through `fullLane="download"` via `fixtureOfLane` (`PresentationLab.tsx:54-57,130,135`). | **(1) Core.** Keep and retain the determinate production arc. |
| `download-queued` | Registry/test only; no visible lane maps to it. | **(1) Core complete state.** Expose it through the single next scenario registry; it exercises queued/multi-task rows and idle WebGL. |
| `transcode-active` | Visible through `fullLane="transcode"`. | **(1) Core.** Keep. |
| `transcode-failed` | Registry/test only; `deriveTranscodeView` intentionally ignores failed tasks as active primary, while the center outcome remains available (`overlayProjection.ts:110-124,230-252`). | **(1) Core error state.** Expose it; do not delete it as “unused.” |
| `mixed-busy` | Visible through `fullLane="mixed"`. | **(1) Core multi-task state.** Keep. |
| `runtime-auto-config` | Registry/test only; `fixtureOfLane` never returns runtime fixtures. | **(1) Core runtime state.** Expose it and wire the runtime indicator. |
| `runtime-failed` | Registry/test only; same unreachable path. | **(1) Core runtime/error state.** Expose it and retain manual recheck/hover presentation with no-op callbacks. |

`fixtureOfLane` is the current duplicate identity seam: `FullLane` has four lane names (`PresentationLab.tsx:39`), but only three names map to fixture IDs and one (`ripple`) maps to `null` (`PresentationLab.tsx:54-57`). Replace this mapping with one finite scenario registry whose entries carry target, fixture ID, and any Compact pose; do not maintain a second URL registry.

### Runtime indicator and queue popover coverage

- `projectLabOverlayFixture` derives `showRuntimeIndicator` for runtime fixtures (`overlayProjection.ts:254-291`), and tests prove both runtime-active and runtime-failed projections (`stateFixtures.test.ts:156-170`).
- `PresentationLab` passes `showRuntimeOverlay={false}` unconditionally (`PresentationLab.tsx:135`). Consequently `runtimeHovered` state (`PresentationLab.tsx:69`) and `onRuntimeHoverChange` are currently dead from a user perspective, even though `MainWindowRuntimeIndicator` supports hover-driven popover behavior (`MainWindowRuntimeIndicator.tsx:48-57,106-140`). This is a coverage bug to fix, not a deletion candidate.
- Queue props are assembled from the projection and rendered when `showQueueOverlay` is true (`LabOverlayStage.tsx:93-116,142`). The badge toggles `queueOpen`, and the same state is surfaced in `ScenarioFacts` (`PresentationLab.tsx:68,145,170-172`). Keep this as a core visible interaction for queued/multi-task fidelity. The no-op cancel/retry callbacks are intentional browser-safe boundaries, not a second command authority.
- The `showRuntimeIndicator` projection field is currently asserted by tests but not consumed by `LabOverlayStage`; the next implementation should use it (or a registry-derived visibility fact) rather than a hard-coded `false` prop.

### Obsolete, duplicate, or dead seams

| Seam | Evidence | Recommendation |
| --- | --- | --- |
| Ripple lane and Ripple tests | `rendererReuse.test.ts:13-29` and `ripple/rippleIsolation.test.ts:9-70` explicitly assert the Lab-only Ripple branch; `rippleController.test.ts` and `rippleSource.test.ts` cover only that experiment. | Delete with Ripple and rewrite the renderer-boundary test to assert one production WebGL2 host plus Compact reuse. |
| OneWorks tests | Three focused tests cover the inspector/candidate only (`oneworksMascot.test.ts`, `oneworksAmeowCandidate.test.ts`, `OneWorksMascotInspector.test.ts`). | Delete with the path; preserve archived evidence tests/artifacts conceptually, not live. |
| `createEmptyDownloadQueueFixture` | Exported at `stateFixtures.ts:194-196`, but no current Lab caller; `overlayProjection.ts:201-204` instead builds an inline empty queue for non-download fixtures. | Either use it when adding explicit runtime/transcode scenarios or remove it as dead code. Do not keep an unused export merely for a future hypothetical. |
| `selectAdvancedQualitySelectionTask` Lab re-export | Imported solely at `overlayProjection.ts:13` and re-exported at line 323; no current Lab consumer. Queue props explicitly set advanced-quality state to `false`/`null` (`LabOverlayStage.tsx:105-110`). | Remove the unused import/re-export unless a concrete advanced-quality fixture is added to the finite registry. Production `App` keeps its own selector use. |
| `showRuntimeIndicator` / `runtimeHovered` disconnected path | Projection computes it and tests it, but the host receives hard-coded `showRuntimeOverlay={false}`. | Wire it in the next implementation; do not delete runtime fixtures or hover state. |
| Active lane names versus fixture IDs | `fullLane`/`fixtureOfLane` duplicates the registry IDs and omits four fixtures. | Replace with one finite registry; this is a small structural cleanup, not a new generic story framework. |
| Compact scenario IDs | Six IDs are each pinned in tests and map to distinct pointer/Reduced Motion/pose behavior. | Not obsolete or duplicate; retain. |
| Production runtime semantic test | `productionRuntimeSemantics.test.ts:19-27` checks Download/Mixed progress reuse only. | Retain and extend with the newly reachable queued/error/runtime semantics; do not delete as redundant with fixture tests. |
| Geometry/pointer/control tests | `previewTargets.test.ts`, `compactPointerField.test.ts`, `compactPreviewStage.test.ts`, `LabSegmentedControl.test.ts`, `labControls.test.ts`, and `previewEnvironment.test.ts` pin production dimensions, pointer conversion, browser-safe hosts, keyboard semantics, and CSS backdrop behavior. | Retain; these are the smallest regression seams for the narrowed goal. |

## Controls, chrome, export, and automation classification

Category legend: **(1)** core visible control/renderer behavior; **(2)** automation-only URL/environment/readiness seam; **(3)** final manual-acceptance aid; **(4)** remove.

| Feature | Current evidence | Classification / decision |
| --- | --- | --- |
| Full/Compact target switch | `PresentationLab.tsx:95-101,143` and `previewTargets.ts:29-69` | **(1) Core visible control.** Keep; it selects the two production targets. |
| Scenario strip | `PresentationLab.tsx:129-130`; currently Ripple + three Full lanes or six Compact IDs | **(1) Core visible control.** Keep the central panel, remove Ripple, and drive both branches from one registry. |
| Compact pointer interaction | `CompactPreviewStage.tsx:83-122`; stable markers at lines 113-126 | **(1) Core.** Keep; required by the narrowed goal. The Lab-local pointer field is intentionally a separate browser input, not a duplicate production authority (`compactPointerField.ts:1-10`). |
| Queue badge/popover and queue-open toggle | `LabOverlayStage.tsx:93-116,142`; production badge click/rows at `MainWindowQueuePopover.tsx:89-125` | **(1) Core visible interaction.** Keep and expose queued/mixed fixtures. |
| Runtime indicator hover/popover | State/callback path at `PresentationLab.tsx:69,135`; production hover/popover at `MainWindowRuntimeIndicator.tsx:48,127-140`; currently hidden by `showRuntimeOverlay={false}` | **(1) Core complete-state interaction once wired.** Keep; add runtime scenarios and use projection visibility. |
| Reduced Motion checkbox | `PresentationLab.tsx:49-52,67,82,153`; passes one value to Compact and Full hosts | **(1) Visible control + (2) environment seam.** Keep. It is both a manual acceptance switch and an automation input; add an allow-listed query value later. |
| OS `prefers-reduced-motion` default | `prefersReducedMotion()` at `PresentationLab.tsx:49-52`; reset follows it at line 102 | **(2) Environment seam.** Keep as a deterministic default source; tests/capture should set it explicitly. |
| Theme | `lab-main.tsx:15-17` accepts only `?theme=white`, defaulting to black; `ThemeProvider` drives all production tokens | **(2) URL/environment parameter.** Keep. The next URL contract should preserve theme without document navigation and may add a visible toggle only if manual review needs it. |
| Backdrop picker | `PreviewEnvironmentPicker.tsx:1-25,76-145`; dark/light/checkerboard CSS in `previewEnvironment.ts:4-31` | **(3) Manual aid, optionally (2) environment parameter.** Keep for final contrast/alpha review; hide in automation mode. It is outside the production renderer/export root. |
| Display scale Auto/1×/2×/3× | `previewTargets.ts:75-130`; controls at `PresentationLab.tsx:95-101,144` | **(3) Manual aid, optionally (2) capture parameter.** Keep because 60 px Compact and 200 px Full need readable review sizes, but do not let it alter production geometry. Auto is already bounded to 1–3×. |
| Reset button | `PresentationLab.tsx:102,137-140` | **(3) Manual aid.** Keep in the central panel; automation should select state directly. |
| Dev Tools facts panel | `PresentationLab.tsx:149-155,165-172` | **(3) Manual acceptance aid.** Keep a compact facts view for final review, but make it hideable/bypassable in automation mode. It is not required to render the scenario. |
| OneWorks Mascot Inspector button/panel | `PresentationLab.tsx:125,151`; full editor and sweep in `OneWorksMascotInspector.tsx:345-412` | **(4) Remove.** Historical candidate work is complete and archived; this is not part of the narrowed production-faithful target. |
| Agentation toolbar | `lab-main.tsx:3,22`, `lab.css:42-52` | **(4) Remove.** It is annotation chrome, not a required acceptance or automation seam. |
| Export 4× PNG | `PresentationLab.tsx:110-123,145`; exporter contract at `exportPng.ts:341-484` | **(3) Manual acceptance aid.** Keep provisionally; remove only as a complete unit after Playwright/readback capture is the agreed evidence path. |
| WebGL readback epoch/backing scale | `LabOverlayStage.tsx:44-60,124-128`; `captureScale`/`captureEpoch` in `PresentationLab.tsx:72-109` | **(3) Export support seam.** Keep with exporter; otherwise delete the props and readback component to shrink the host API. |
| Ripple Forward/Reverse/Cancel/Scrub/origin/Pinch controls | `ripple/RippleLab.tsx:17-98` | **(4) Remove.** They exercise only the WebGL1 experiment and have no production application-state meaning. |
| Lab locale strings | `src/lab/locales/en.json:1-47`, `zh-CN.json:1-47` | **(1) Core support.** Keep; use the shared `desktop` namespace for production components and the dedicated `lab` namespace for chrome. |
| Stable selectors | `data-lab-workspace`, `data-lab-preview-frame`, `data-lab-compact-stage`, `data-lab-compact-shell`, `data-lab-preset`, and `data-lab-compact-preset` in `PresentationLab.tsx:128-145`, `LabOverlayStage.tsx:119`, `CompactPreviewStage.tsx:113-126` | **(2) Automation/readiness seam.** Keep. Add one small `data-lab-ready` marker only if the Playwright smoke runner needs it; do not make tests drive the manual panel. |
| URL state beyond theme | Target, lane/fixture, scale, backdrop, queue, and Reduced Motion are React-local (`PresentationLab.tsx:62-75`) | **(2) Missing automation seam.** Add one allow-listed query contract for target/scenario/theme/reduced-motion (and capture mode if needed), update it with the History API, and use the same registry as the panel. No document navigation or optimizer restart should occur on selection. |

## PNG export and inspector/debug path

`exportPng.ts` is a deliberate, careful manual-capture implementation: it rasterizes the DOM layer through a dynamic `html2canvas` import, reads the WebGL2 layer, resolves the production shadow token, clips to the rounded shell, composites shadow → WebGL → DOM, and rejects missing layers rather than downloading a partial image (`exportPng.ts:149-182,341-484`). Its 118-line test pins geometry, transparency, layer ordering, and failure contracts (`exportPng.test.ts:9-117`).

This is valuable for final human evidence but is not needed for scenario rendering or first paint. The smallest safe choice is to retain it until the next task adds deterministic Playwright screenshots/readback. If it is removed, delete together:

- `src/lab/exportPng.ts` and `exportPng.test.ts`;
- the `html2canvas` manifest/lock entry;
- `capturePreviewPng`/download state and the export button in `PresentationLab.tsx`;
- `WebglReadback`, `captureScale`, `captureEpoch`, and related props in `LabOverlayStage.tsx`;
- exporter-only locale keys and any export-specific assertions.

Do not remove just the package or just the button: that would leave a broken dynamic import or dead readback API. Conversely, do not treat the OneWorks Inspector's JSON export as a substitute for the production Fullscreen capture; it exports a historical upstream avatar definition and is removed with that inspector path.

## Ripple experiment audit

Ripple is a fully separate mini-application:

- `RippleLab.tsx` owns origin, phase, pinch, settlement, status, and controls (`ripple/RippleLab.tsx:17-98`).
- `RippleCanvas.tsx` creates a WebGL1 context, loads the 7,267 B fixture image, compiles a separate shader, handles context loss/restoration, and owns resource cleanup (`ripple/RippleCanvas.tsx:48-190`).
- `rippleController.ts` is a second Lab-local animation authority with generations, scheduling, cancellation, reversal, and Reduced Motion (`ripple/rippleController.ts:47-134`).
- `rippleSource.ts` is 162 lines of pinned GLSL/source-fidelity math with its own source digest tests (`ripple/rippleSource.ts:1-162`; `ripple/rippleSource.test.ts:14-34`).
- Nine text files, three tests, and a PNG are dedicated to this branch; no production `ExpandedPresentationSurface` or application fixture consumes it.

The production-faithful goal has no Ripple state. Remove the entire branch from the maintained Lab, including the Ripple lane, controls, locale block, tests, source, resource helpers, and PNG. Leave production WebGL2 files untouched. If the team later wants to keep Ripple as an experiment, put it behind a separately named optional experiment entry; do not make the core `dev:lab` graph pay for it or present it as a Fullscreen application scenario.

## Smallest next-Lab surface

The minimum useful surface after deletion is:

1. A central panel with a finite scenario strip, Full/Compact target selection, Reduced Motion, reset, and optional scale/backdrop controls.
2. Compact production mascot preview with live pointer approach and frozen accepted poses.
3. Full production WebGL2 + center overlay + queue popover + runtime indicator, with explicit active, queued/multi-task, transcode-failure, runtime-active, runtime-failed, and mixed fixtures.
4. One shared registry consumed by both the panel and an allow-listed URL query contract. Invalid IDs fall back to a sensible default; URL changes use `history.replaceState`/`pushState` and do not reload the document.
5. A readiness marker and deterministic environment controls for Playwright; manual Dev Tools facts/backdrop/scale/export remain optional final-review aids.

Keep `lab.html` as the documented entry for now. A dedicated Lab root `/` is an ergonomic alternative only if users repeatedly open the Vite-printed root URL; it does not eliminate cold transforms. Do not move the Lab into the production router or adopt Storybook for this goal: both would couple or recreate an integrated application-state preview that the current production-reuse path already provides.

## Staged deletion and safety checks

The order below minimizes the chance of deleting a fidelity seam or historical artifact:

### Stage 0 — snapshot consumers and evidence

- Confirm the active source consumers listed above with an active-source zero-consumer scan (exclude archived task directories and generated caches).
- Confirm the archived OneWorks canonical JSON, protected baseline, implementation report, calibration notes, and screenshots remain present and untouched.
- Record the current fixture IDs and Compact scenario IDs before changing the registry.

### Stage 1 — remove Agentation

- Delete the `agentation` import/mount and the `.lab-agentation-toolbar` CSS block.
- Remove the manifest/lock entry only after the active-source scan is zero.
- Verify the Lab still mounts through `lab-main.tsx`, theme/i18n initialize, and stable workspace selectors remain.

### Stage 2 — remove OneWorks runtime path

- Delete `OneWorksMascotInspector.tsx`, `oneworksMascot.ts`, `oneworksAmeowCandidate.ts`, and the three focused tests.
- Remove both `@oneworks/avatar` packages from manifest/lock.
- Verify `CompactPreviewStage` still imports `CompactMascot`, the production Compact tests and avatar-core definition tests pass, and archived OneWorks evidence is unchanged.

### Stage 3 — remove Ripple experiment

- Delete the nine Ripple text files, three Ripple tests, and `ameow-download-active-200.png`.
- Remove the Ripple lane/import and its locale keys; rewrite `rendererReuse.test.ts` to assert one production WebGL2 host and Compact reuse.
- Verify production `ExpandedPresentationSurface` and WebGL2 tests are untouched; no `ripple`, WebGL1, or Ripple asset remains in the Lab graph.

### Stage 4 — collapse the scenario identity seam and restore coverage

- Replace `FullLane`/`fixtureOfLane` with one finite registry that points at all seven existing fixture factories and the six Compact scenarios.
- Expose `download-queued`, `transcode-failed`, `runtime-auto-config`, and `runtime-failed`; retain active and mixed scenarios.
- Wire `showRuntimeIndicator` to `LabOverlayStage` and preserve runtime hover/recheck as no-op browser callbacks.
- Remove the unused `selectAdvancedQualitySelectionTask` re-export and either use or delete `createEmptyDownloadQueueFixture`.
- Add one reachability test: every registered fixture must be selectable and every visible scenario must resolve to a fixture/Compact pose.

### Stage 5 — automation and optional manual aids

- Add the allow-listed URL/environment contract (`target`, scenario/fixture ID, theme, Reduced Motion, and optional capture mode) with History API updates and a readiness marker.
- Hide Dev Tools/backdrop/scale/export in capture mode while rendering the same registry entry; do not create a parallel automation registry.
- Keep `playwright` only if the smoke/visual suite is added. Decide separately whether PNG export remains the final manual artifact; if not, delete the exporter as one unit.

### Stage 6 — quality gate

Run the focused tests first, then the repository checks in the implementation/check task:

```text
npx vitest run src/lab/stateFixtures.test.ts src/lab/scenarios.test.ts src/lab/productionRuntimeSemantics.test.ts src/lab/rendererReuse.test.ts src/lab/compactPointerField.test.ts src/lab/compactPreviewStage.test.ts src/lab/previewTargets.test.ts src/lab/previewEnvironment.test.ts src/lab/LabSegmentedControl.test.ts src/lab/labControls.test.ts
npm run type-check
npm run lint
npm test
npm run build:renderer
npx vite build --config vite.lab.config.ts --outDir <task-local-lab-build>
```

Then add a small Playwright smoke run that selects one Compact pointer state, one Full download/queue state, one transcode-failure state, and one runtime-failed state through the URL/query seam, waits on `data-lab-ready`, and asserts no extra document navigation or optimizer-triggering route change. The last two commands are future validation instructions; they were not run during this research-only pass.

## Related specs and references

Relevant repository contracts:

- `.trellis/spec/frontend/directory-structure.md` — Lab is a dev-only plain-browser entry, must not be an Electron route, and should reuse production fixtures/selectors/presentation components without recreating runtime/shader authority.
- `.trellis/spec/frontend/component-guidelines.md` — shared styles/tokens and production component composition.
- `.trellis/spec/frontend/motion-guidelines.md` — `motion/react` import contract, bounded renderer-local motion, and Reduced Motion behavior.
- `.trellis/spec/frontend/character-motion.md` — Compact mascot geometry, pointer field, preview-pose seam, and Reduced Motion contract.
- `.trellis/spec/frontend/quality-guidelines.md` — browser/Electron boundary, locale source-of-truth, and production build constraints.
- `.trellis/research/archive/2026-09/09-10-diagnose-slow-vite-lab-loading/research/vite-lab-loading-diagnosis.md` — Vite readiness/optimizer/root-entry measurements.
- `.trellis/research/archive/2026-09/09-10-diagnose-slow-vite-lab-loading/research/repeated-lab-refresh-white-screen.md` — repeated warm/cache-disabled refresh and WebGL timing evidence.
- `.trellis/research/archive/2026-09/09-10-diagnose-slow-vite-lab-loading/research/lab-preview-architecture-options.md` — dedicated-entry recommendation, fixture contract, and automation-first follow-up.

External references used by the existing task research:

- Vite dependency pre-bundling: <https://vite.dev/guide/dep-pre-bundling.html>
- Vite dependency optimization options (`entries`, `exclude`): <https://vite.dev/config/dep-optimization-options>
- Installed versions recorded in `package.json`: Vite `^8.0.16`, React `^19.1.0`, Motion `^12.35.2`, Playwright `^1.60.0`, OneWorks `1.0.0-rc.6`.

## Caveats / Not Found

- No Vite process, browser session, cache clear, dependency install/removal, config change, code edit, spec edit, or git operation was performed for this audit.
- The source-size counts are repository measurements; the archived JS/CSS/chunk sizes are historical evidence from the OneWorks candidate task. A post-deletion bundle-size or wall-time claim requires the implementation task's controlled build/refresh measurement.
- The current Lab does not expose an explicit `data-lab-ready` flag or URL-addressable scenario state. Stable `data-lab-*` selectors exist, but target/scenario/scale/backdrop/queue/Reduced Motion are local React state except for the existing `?theme=white` read.
- `playwright` has no current source/script consumer; retaining it is justified only by the narrowed follow-up requirement for deterministic visual verification.
- The `createEmptyDownloadQueueFixture` and `selectAdvancedQualitySelectionTask` findings are source-level dead-seam observations. Confirm no external/generated consumer before deleting them in implementation.
- Archived OneWorks reports may mention packages or source identifiers by design; those historical strings are not active runtime consumers and must not be removed merely to make a text scan globally zero.
