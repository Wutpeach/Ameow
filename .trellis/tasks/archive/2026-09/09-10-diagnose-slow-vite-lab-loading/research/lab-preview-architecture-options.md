# Research: UI Lab preview architecture options

- Query: Evaluate the long-term developer architecture for Ameow's UI Lab: a browser-only way to preview and switch among realistic integrated application UI states without launching Electron or performing real downloads. Compare the existing `/lab.html` Vite entry with a dedicated Lab root, a production `/lab` route, and Storybook (or a similar component workbench), then recommend the smallest architecture that fits now.
- Scope: internal / mixed (repository and Trellis-spec inspection; Vite/Storybook architecture references)
- Date: 2026-09-10

## Findings

### What the Lab is today

The Lab is an integrated presentation harness, not a component catalog and not a second application runtime:

- `vite.lab.config.ts:5-16,17-32` defines a separate browser-only Vite server on port 1421 and documents `http://127.0.0.1:1421/lab.html`. Its build input is `lab.html`; it has no `root`, `server.open`, or explicit `optimizeDeps.entries` setting.
- `lab.html:1-13` is a minimal document that mounts `/src/lab/lab-main.tsx`.
- `package.json:9-15,42-44,55-87` has a single `dev:lab` command (`vite --config vite.lab.config.ts`), Vitest tests, and no Storybook/Ladle dependency or configuration.
- `scripts/run-electron-dev.mjs:16-20,271-297` is the separate production/Electron launcher: it starts Vite on port 1420, waits for the compiled Electron entries, then starts Electron. It never starts or routes the Lab. `scripts/dev-preflight.mjs:65-120` handles locale/Python preflight for the Electron `dev` flow; `dev:lab` has no equivalent desktop preflight, which is appropriate for a pure browser harness.
- `src/lab/lab-main.tsx:9-25` is intentionally bridge-free: it initializes the `lab` locale, reads only the `theme` query parameter, mounts a browser-safe `ThemeProvider`, the `PresentationLab`, and the dev-only Agentation toolbar. It does not import the production router, `App`, or desktop runtime.
- `src/lab/PresentationLab.tsx:39-82,95-123,125-156` owns finite Lab chrome state (Full lanes, Compact scenarios, target, display scale, backdrop, Reduced Motion, queue popover, runtime hover, inspector, and PNG capture). It composes the retained production `ExpandedPresentationSurface`, production overlays, and `CompactMascot`; the Ripple experiment is explicitly Lab-local.
- `src/lab/stateFixtures.ts:1-12,23-37,39-206` describes the intended fixture boundary: synthetic values are existing production queue, transcode, runtime-gate, and center-overlay types with stable Lab trace IDs. Factories have no durable state, event bus, downloader, or desktop side effect.
- `src/lab/overlayProjection.ts:1-9,42-81,83-170,172-180,267-300` projects those fixtures through production selectors, view helpers, progress targets, center-overlay selection, and runtime-gate helpers. `src/lab/LabOverlayStage.tsx:8-17,118-162` then mounts one production WebGL2 host plus the shared DOM overlays with no-op callbacks.
- `src/lab/CompactPreviewStage.tsx:1-13,21-38,65-81,110-159` reuses only the production `CompactMascot` leaf with a Lab-owned pointer field; it deliberately avoids the native `MainWindowPresentationSurface`.

This gives the current Lab high production fidelity for the exact surfaces it previews while keeping Electron/native behavior out of the browser. It does not attempt to reproduce the full `App` event-ingestion path, downloads, IPC, native window geometry, or runtime installation; those remain outside the Lab's purpose.

### Production entry and isolation boundary

- `vite.config.ts:8-16,22-35` keeps production base URLs `file://`-safe and pins the production build input to `index.html`, explicitly excluding `lab.html`/`src/lab` from the packaged renderer.
- `src/main.tsx:1-22,75-103,133-160` statically imports the production `App`, settings/context pages, desktop bridge helpers, i18n runtime bridge, and router. Electron uses `HashRouter`; ordinary browser development uses `BrowserRouter`; the Electron path also signals renderer readiness and expects `window.ameow`.
- `.trellis/spec/frontend/directory-structure.md` requires the Browser Lab to remain a dev-only plain-browser entry, not an Electron route/window or production import, and forbids desktop/electron imports, product-state writes, and renderer/runtime recreation.
- `src/contexts/ThemeContext.tsx:269-300` explicitly keeps theme persistence optional and supplied by Electron-owned entry code so browser consumers, including the Lab, remain bridge-free.
- `src/lab/rendererReuse.test.ts:12-38` statically guards the boundary: production input contains `index.html` but not `src/lab`; Ripple stays Lab-only; one production Expanded host remains; Download/Transcode/Mixed/Compact lanes and the preview-pose seam remain present.

The current split is therefore a deliberate product boundary, not just a convenient second page. An architecture that moves the Lab into `src/main.tsx` would require revisiting this spec and its import/build guards.

### State, scenario, and regression evidence already present

The Lab has finite, typed scenario coverage rather than arbitrary story data:

- `src/lab/scenarios.ts:10-45` defines the 200px Full geometry and six Compact scenario IDs (`neutral`, `pointer`, `reduced`, `surprised`, `curious`, `playful`) with only existing renderer capabilities and frozen preview poses.
- `src/lab/previewTargets.ts:1-17,29-82` keeps the `full | compact` target and display magnification separate from production geometry; tests pin the 200px Full and 80/60/56px Compact dimensions (`src/lab/previewTargets.test.ts:23-105`).
- `src/lab/scenarios.test.ts`, `stateFixtures.test.ts`, `productionRuntimeSemantics.test.ts`, `rendererReuse.test.ts`, `previewEnvironment.test.ts`, `compactPreviewStage.test.ts`, and the Ripple/controller tests cover fixture construction, production projection semantics, import/build boundaries, geometry, keyboard controls, and the Lab-only WebGL experiment.
- `PresentationLab` and child hosts expose stable `data-lab-*` markers (`src/lab/PresentationLab.tsx:129-145`, `src/lab/LabOverlayStage.tsx:119`, `src/lab/CompactPreviewStage.tsx:113-126`), and `exportPng.ts` plus the WebGL readback seam support deterministic-ish center-frame capture when Reduced Motion/backing scale are fixed. There is no browser screenshot suite today; the existing `playwright` dependency in `package.json:73-80` could support one without adopting a workbench.
- URL state is intentionally minimal today: `lab-main.tsx:15-17` reads only `?theme=white`; lane, fixture, target, scale, backdrop, queue, and Reduced Motion are React-local state (`PresentationLab.tsx:62-75`). Thus `/lab.html` is bookmarkable as an entry point, but a particular scenario is not yet a reproducible URL.

### Loading and cache behavior relevant to architecture

The earlier task-local Vite measurements (`research/vite-lab-loading-diagnosis.md` and `research/repeated-lab-refresh-white-screen.md`) separate three effects:

1. Opening the dedicated `/lab.html` path gives a Lab-only graph, but the first source transform/optimizer pass is broad (production presentation code plus Motion, avatars, Agentation, i18next, and capture code). Vite's `ready` message only measures server startup; the first browser transform can still be slow. Warm, cache-enabled navigations were sub-second in the settled probes.
2. Opening `/` on the same port resolves the repository `index.html` and pulls `src/main.tsx`/`App`/router. That late production graph discovers `react-router-dom`, `clsx`, `tailwind-merge`, and the large `image-max-url` dynamic package, changing Vite's dependency hash and reloading clients. This is the main ergonomic failure of the current URL, not a Lab rendering failure.
3. Vite's default `node_modules/.vite/deps` cache is shared by processes. The task notes an `EPERM` cache-directory swap while a production graph was active; concurrent Vite processes can amplify Windows cache contention. A different root/index prevents accidental `/` navigation but does not by itself remove cold transforms or shared-cache contention.

The architecture should therefore remove accidental entry ambiguity first and only add cache isolation/optimizer tuning if an implementation task reproduces contention after using the correct entry. Prebundling the production graph into the Lab would trade one visible transition for a larger Lab startup and would weaken the very isolation this tool needs.

## Concrete options

Ratings below are relative to the Lab's actual goal (integrated 200px Full/Compact presentation states with realistic interactions, no Electron, no real downloads), not to building a general design-system catalog.

| Option | Production fidelity and state/interaction coverage | Electron isolation | Dev startup and cache behavior | Deep-linkability | Visual regression potential | Maintenance / migration cost |
| --- | --- | --- | --- | --- | --- | --- |
| **1. Keep dedicated Vite `/lab.html` (recommended)** | **High** for current scope: shared production WebGL2/DOM overlays, Compact mascot, selectors, projections, queue interaction, Reduced Motion, Ripple controls, inspector, and export are already wired. It intentionally does not replay App/IPC/download ingestion. | **Strong**: separate `lab-main.tsx`, no desktop bridge, and production build input excludes Lab. This matches the frontend directory/spec contract and existing boundary tests. | **Medium today, low after ergonomics**: correct `/lab.html` still has a one-time broad transform; accidental `/` invokes the production graph and hash transition. Add an explicit open target and, if needed after measurement, pin the Lab optimizer entry. Keep one Vite process per cache; only introduce a separate cache directory when concurrent-process contention is demonstrated. | **Good entry deep link** (`/lab.html`, plus `?theme`), but scenario state is local React state. A finite optional fixture query can be added later without changing the architecture. | **Good**: stable `data-lab-*` markers, fixture factories, Reduced Motion, WebGL readback, and PNG export already provide test seams. A small Playwright screenshot smoke suite can target this URL directly. | **Lowest**: no dependency, router, Electron, or fixture migration. Ergonomic change is confined to `vite.lab.config.ts`/`package.json` in a follow-up implementation task. |
| **2. Dedicated Lab server with Lab at `/`** | **Same high fidelity/coverage** as option 1; only the HTML/root shape changes. | **Strong**, assuming the server's `root` is a genuinely Lab-only directory/index and does not fall back to repository `index.html`. | **Better against the specific wrong-URL failure** because the printed root is the Lab. It does **not** eliminate first-run source transforms or default `.vite` cache sharing; an isolated root alone is not a performance fix. | **Best ergonomics for a single Lab** (`http://127.0.0.1:1421/`); query/deep links can remain. Existing `/lab.html` bookmarks need redirect/compatibility if retained. | **Same good potential** as option 1; root URLs are slightly simpler for test runners. | **Low–medium**: add/move a Lab `index.html`, set Vite `root`/filesystem allowance, update relative source/base paths, tests/docs, and decide whether `/lab.html` remains. This is justified only if the root URL confusion persists after `open /lab.html`. |
| **3. Add `/lab` to the production SPA/router** | **High in pixels but mixed in architecture**: it can render `PresentationLab`, yet the current Lab bootstrap/bridge-free i18n and the production bootstrap are different contracts. Static importing it would pull Agentation/Lab code into the production graph; lazy importing defers that cost but still couples the route to `src/main.tsx`. | **Weak unless heavily guarded**: the route is in the Electron bundle and is reachable via `#/lab`; any future Lab import can accidentally cross the desktop boundary. It directly contradicts the current spec's “not an Electron route/window or production import” rule and would require new guards/contract decisions. | **Worst of the four for this use case** if statically imported (the already-large production graph loads before the route); lazy loading improves first paint but can trigger another dev transform/dependency pass when the route is opened. It removes the second server, but pays with production graph coupling. | **Good browser `/lab`** under `BrowserRouter`; packaged Electron would be `#/lab` because `HashRouter`. Static hosting/file URLs need the existing router/base rules. The two URL semantics make shareable links less uniform than `/lab.html`. | **Medium**: one origin and route help automation, but production bootstrap/bridge checks, Electron hash routing, global CSS, and production startup introduce more flake. The route would need explicit “browser-only” test coverage. | **Medium–high**: route and lazy-boundary changes, production bundle/dependency review, Electron gating, import/build guard/spec updates, and likely a separate bridge-free bootstrap. It solves URL unification, not the integrated-state fidelity problem that the Lab already solves. |
| **4. Storybook or another component workbench** | **Variable for this goal**: excellent for isolated component variants/args, but integrated Download + Transcode + Runtime + Compact/Full composition would require decorators and stories that recreate the existing fixture/projection contract. WebGL/native-adjacent surfaces still need browser-only wrappers. | **Strong by default** when stories use browser-safe providers/mocks, but Electron behavior is intentionally absent; it cannot validate the actual preload/native route. | **Separate tool/cache and another dev process**. Modern workbenches can optimize story chunks, but manager/preview startup and dependency upgrades add cost; it does not fix production Vite's `/`/`/lab.html` confusion. | **Excellent story URLs** (`path`/story IDs) and per-variant navigation. This is the one option with a mature built-in story-addressability model. | **Strongest ecosystem**: interaction tests, story snapshots, and hosted visual-regression services are available, but WebGL/readback and app-level composition still need project-specific stabilization. | **Highest**: add Storybook packages/config, stories/decorators, provider mocks, CI/build ownership, and upgrade maintenance. No Storybook files/dependencies exist today (`package.json:55-87`; `.storybook` not found). Migration would be incremental, not a drop-in replacement for the Lab. |

### Option-specific conclusions

#### 1. Keep `/lab.html` and make the entry unambiguous

This is the smallest architecture that already meets the requirement. The Lab's current fixture/projection path is more faithful to Ameow's integrated surface than a generic component workbench would be, and its build/import guards make Electron isolation explicit. The practical follow-up is ergonomic, not structural:

1. Have `dev:lab` open or print `/lab.html` explicitly so Vite's root URL cannot be mistaken for the Lab.
2. Consider `optimizeDeps.entries: ["lab.html"]` only to document/pre-scan the intended graph. Do not include production-only dependencies in the Lab optimizer.
3. If two Vite processes still race over `node_modules/.vite/deps`, measure that case and then consider a Lab-specific `cacheDir`; it duplicates a small cache but is a targeted contention fix, not a default abstraction.
4. Add URL fixture state only when a screenshot/bug report needs a reproducible scenario; keep the current finite unions and factories as the source of truth.

#### 2. Dedicated root `/` is an ergonomic alternative, not a new rendering architecture

This option is reasonable if the team repeatedly opens the URL printed by Vite and does not want a special filename. It should use a Lab-only root/index (not a server rewrite that still exposes repository `index.html`) and keep the production Vite config untouched. It offers no inherent warm-start or transform-speed improvement, so it should follow option 1's open-target experiment rather than precede it.

#### 3. `/lab` in the production router is the wrong boundary now

The route would conflate “browser-only developer fixture” with “packaged Electron renderer route.” It would make the production graph responsible for a tool whose raison d'être is to avoid that graph and its bridge. If chosen despite the conflict, it needs an explicit browser-only route gate, a lazy Lab chunk, production bundle-size review, Electron hash-route behavior, and updated directory/import-guard specs; that is a separate architecture project, not a slow-loading fix.

#### 4. Storybook should be a later, additive tool

Storybook becomes justified when the problem changes from “preview integrated application states” to “catalog and regress many independent component states.” Signals include a growing number of components needing per-variant links, multiple contributors reviewing isolated states, required CI interaction/screenshot coverage for those variants, or a need for designer-facing hosted stories. Even then, keep the integrated UI Lab for the 200px Full/Compact composition and production selector/projection contract; add stories for stable leaves/overlays rather than rewriting the Lab into Storybook stories.

## Recommended scenario / fixture contract

Keep this contract concrete and finite; do not add a generic scene/layer/args framework:

1. **Scenario identity:** use the existing discriminated IDs (`LAB_COMPACT_SCENARIOS` and `LAB_OVERLAY_FIXTURES`). A scenario selects one target (`full` or `compact`) and one existing fixture; it does not encode arbitrary JSON or a new event stream.
2. **Fixture payload:** each factory returns only production model/payload values already consumed by the relevant selectors/projections (`DownloadQueueState`, `VideoTranscodeTaskPayload[]`, runtime-gate payload, and, where needed, `CenterOverlayState`). Keep stable IDs prefixed `lab-`; never call a downloader, write Product state, persist config, or invoke `window.ameow`.
3. **Projection:** feed the fixture through the same pure selectors/helpers/projections used by `App`, then pass one `ExpandedPresentationTarget` and the existing production component props to the host. Do not infer transitions from timers, React commits, animation completion, or fixture length.
4. **Interactions:** callbacks that would issue desktop/product commands are no-ops in the Lab; local controls may open the queue, toggle Reduced Motion, change a Compact pointer pose, or capture a frame. The Lab chrome is not production state.
5. **Reproducible URL (only when needed):** preserve `/lab.html` as the stable entry. If visual-regression or bug-sharing needs a deep link, add a small allow-listed query contract such as `?fixture=download-active&target=full&reducedMotion=1` mapped to the existing unions. Invalid values fall back to the default scenario; do not serialize all local chrome state or create a second scenario registry.
6. **Regression evidence:** every new fixture gets one projection/semantic test and, when the pixels matter, one browser screenshot/readback case at a fixed target, theme, scale, and Reduced Motion setting. Keep the existing source-level `rendererReuse`/import guards; they are what prevent “realistic” fixtures from drifting into Electron or a duplicate renderer.

This contract preserves production fidelity while keeping the Lab cheap to run and safe to open in an ordinary browser. It also gives a future Storybook migration a clean seam: stories can consume the same finite fixture factories without making Storybook the owner of application authority.

## Recommendation

Adopt **option 1: retain the dedicated Vite multi-page `/lab.html` entry**. It is the smallest architecture that satisfies integrated-state fidelity, interaction coverage, and Electron isolation today; the slow-load evidence points to entry ambiguity and cold/shared Vite transforms, not to a missing component-workbench capability. Apply only ergonomic/config changes in a separate implementation task, then revisit option 2 if the filename remains a repeated source of operator error; do not move the Lab into the production router or add Storybook until the stated trigger conditions appear.

## Files found

- `vite.lab.config.ts` — dedicated port-1421 Vite config, Lab build input, and current URL comment.
- `lab.html` — standalone Lab document.
- `package.json` — `dev:lab`, test/lint/type-check scripts, current dependency set, and absence of Storybook packages.
- `vite.config.ts` — production `index.html`-only build input and `file://`-safe base.
- `src/lab/lab-main.tsx` — bridge-free Lab bootstrap and current `theme` query behavior.
- `src/lab/PresentationLab.tsx` — integrated scenario/target/inspector shell and local chrome state.
- `src/lab/stateFixtures.ts` — typed synthetic production-state fixtures.
- `src/lab/overlayProjection.ts` — production selector/helper/projection reuse.
- `src/lab/LabOverlayStage.tsx`, `src/lab/CompactPreviewStage.tsx`, `src/lab/ripple/*` — shared production hosts, compact leaf reuse, and Lab-only Ripple experiment.
- `src/lab/scenarios.ts`, `src/lab/previewTargets.ts`, `src/lab/previewEnvironment.ts` — finite scenario, geometry, and backdrop models.
- `src/lab/*.{test.ts,tsx}` — fixture/projection/renderer/interaction regression evidence.
- `scripts/run-electron-dev.mjs`, `scripts/dev-preflight.mjs` — production/Electron startup and preflight boundaries; neither owns the Lab server.
- `src/main.tsx`, `src/App.tsx`, `src/pages/*` — production bootstrap, router, Electron bridge readiness, and route boundaries.
- `src/contexts/ThemeContext.tsx`, `src/i18n/index.ts`, `src/lab/i18n.ts` — bridge-free theme and Lab i18n setup.
- `.trellis/spec/frontend/directory-structure.md`, `.trellis/spec/frontend/quality-guidelines.md`, `.trellis/spec/frontend/component-guidelines.md`, `.trellis/spec/frontend/state-management.md`, `.trellis/spec/frontend/design-system.md`, `.trellis/spec/frontend/motion-guidelines.md` — relevant frontend contracts.
- `.trellis/tasks/09-10-diagnose-slow-vite-lab-loading/research/vite-lab-loading-diagnosis.md` and `repeated-lab-refresh-white-screen.md` — measured Vite startup, transform, optimizer, and cache behavior.

## External references

- Vite dependency pre-bundling and optimizer cache behavior: <https://vite.dev/guide/dep-pre-bundling.html>
- Vite dependency optimization options (`entries`, `exclude`, cache behavior): <https://vite.dev/config/dep-optimization-options>
- Storybook rationale and component-workbench scope: <https://storybook.js.org/docs/get-started/why-storybook>
- Storybook stories and URL-addressable variants: <https://storybook.js.org/docs/writing-stories>
- Storybook interaction testing: <https://storybook.js.org/docs/writing-tests/interaction-testing>

## Related specs

- `.trellis/spec/frontend/directory-structure.md` — requires a dev-only plain-browser Lab entry, production fixture/projection reuse, and no desktop/Electron/runtime recreation.
- `.trellis/spec/frontend/quality-guidelines.md` — TypeScript/React quality, cleanup, and `file://`-safe production renderer constraints.
- `.trellis/spec/frontend/component-guidelines.md` and `.trellis/spec/frontend/design-system.md` — shared component/token reuse and production visual language.
- `.trellis/spec/frontend/state-management.md` — browser-safe local state versus Electron-owned persistence/bridge state.
- `.trellis/spec/frontend/motion-guidelines.md` — renderer-local motion, Reduced Motion, bounded frame work, and no authority writes from visual leaves.

## Caveats / Not Found

- No architecture or code was changed; this report is the only new artifact.
- No Storybook/Ladle config or dependency exists in the current worktree. Storybook comparisons are therefore based on its documented workbench model and the repository's existing Vite/React setup, not on a local proof-of-concept.
- This report does not start Vite or browser sessions and does not add a screenshot runner. The loading measurements cited above are from the task-local research reports already present.
- A dedicated root `/` would only improve the wrong-entry failure if its Vite `root`/index is truly Lab-only; changing the URL while continuing to serve repository `index.html` would not be an architecture change.
- A separate Vite `cacheDir` may reduce Windows cache-directory contention but duplicates optimized dependencies; it should be added only after a concurrent-process reproduction, not as speculative cleanup.
