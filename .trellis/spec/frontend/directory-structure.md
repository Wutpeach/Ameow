# Directory Structure

> How frontend code is organized in FlowSelect.

---

## Overview

The frontend follows a flat, feature-light structure suitable for a small desktop application. Components are organized by type rather than feature.

---

## Directory Layout

```
src/
├── App.tsx                 # Application facts + business content; issues presentation intents
├── main.tsx               # React entry point + router setup
├── index.css              # Global styles (TailwindCSS)
├── vite-env.d.ts          # Vite type declarations
│
├── presentation/          # Main Window presentation module (feature-scoped)
│   └── main-window/
│       ├── lifecycle.ts            # Pure lifecycle reducer (only writable authority)
│       ├── projections.ts          # Pure visual/interaction/native projections
│       ├── effectContracts.ts      # Effect discriminated union
│       ├── effectExecutor.ts       # Injected timer/native/focus execution
│       ├── reactAdapter.ts         # Thin React reducer binding
│       ├── MainWindowPresentationSurface.tsx  # DOM/Motion host + pointer/drop/drag wiring
│       ├── geometry.ts             # Spatial policy only
│       ├── motionRecipes.ts        # Renderer choreography only
│       ├── pointerField.ts         # Continuous pointer coordinate authority
│       └── magnetic.ts             # Full-mode Magnetic visual consumer
│
├── pages/                 # Route-level components
│   └── SettingsPage.tsx   # Settings window UI
│
├── lab/                   # Browser-only dev visual/state playground
│   ├── lab-main.tsx       # zh-CN-first Vite entry; no desktop bridge
│   ├── PresentationLab.tsx # Registry-driven scenario/preview/Inspector shell
│   ├── scenarios.ts       # Finite scenario registry shared by UI and capture
│   ├── scenarioUrl.ts     # Pure allow-listed URL state contract
│   └── stateFixtures.ts   # Typed synthetic preview fixtures only
│
├── components/            # Reusable components
│   └── ui/                # Custom UI primitives
│       ├── shared-styles.ts
│       ├── index.ts       # Barrel export
│       └── ...
│
├── contexts/              # React Context providers
│   └── ThemeContext.tsx   # Theme state management
│
└── utils/                 # Pure utility functions
    ├── mainPanelInteractions.ts    # Panel drag/double-click helpers
    ├── compactPointerHotspot.ts    # Hotspot hysteresis
    ├── centerOverlayState.ts       # Center overlay reducer (application)
    ├── startupWindowState.ts       # Startup environment detection
    └── ...
```

---

## Module Organization

### Pages (`src/pages/`)
- One file per route/window
- Named with `Page` suffix: `SettingsPage.tsx`

### Browser Lab (`src/lab/`)
- Dev-only plain-browser entry served through `vite.lab.config.ts` and `lab.html`
- Must not be registered as an Electron route/window or imported by the production entry
- Synthetic fixtures use production state/payload types and flow through the applicable production selectors/helpers/projections and shared production presentation components; visual fixtures do not replay event ingestion merely to simulate authority
- Must not import `src/desktop/**` or `electron/**`, write product state, or recreate a renderer/runtime/shader

#### Lab Vite development contract

##### 1. Scope / Trigger

- This contract covers the isolated browser-Lab dev server: its entry, optimizer-cache identity, native watcher boundary, and capture cleanup. Sources of truth are [`vite.lab.config.ts`](../../../vite.lab.config.ts), [`package.json`](../../../package.json), and [`scripts/capture-lab-smoke.mjs`](../../../scripts/capture-lab-smoke.mjs).
- It does not change the production Vite server, Electron runtime, or the Lab's renderer ownership rules above.

##### 2. Signatures

```text
npm run dev:lab
  -> vite --config vite.lab.config.ts --open /lab.html

optimizeDeps.entries -> ["lab.html"]  # initial dependency scan only
build.rollupOptions.input -> lab.html

serve-only lab-port-cache config hook
  -> cacheDir = join(LAB_TEST_CACHE_ROOT ?? "node_modules/.vite-lab", String(config.server?.port ?? 1421))
```

- The hook returns no cache override for `command !== "serve"`. `LAB_TEST_CACHE_ROOT` is a **root**, never the final port directory: controlled tests create a unique root under `node_modules/.vite-lab/` and the hook appends the fixed port.
- The capture script invokes Vite directly with loopback and its reserved positive port; it deliberately has no `--open`, so the npm opener does not create a second browser during capture.

##### 3. Contracts

- Supported Lab instances use loopback, `strictPort: true`, and distinct positive fixed ports. Their effective cache directories are `<root>/<port>`, so distinct ports get distinct optimizer writers while a normal restart on the same port reuses its cache.
- The configured default is `127.0.0.1:1421`; the opener must target `/lab.html`, and `optimizeDeps.entries` limits the **initial** dependency scan to `lab.html`. It is not a route restriction: deliberate navigation to `/` remains possible and can load the production entry graph.
- Do not claim support for same-port/different-host instances (identity is port-only), `--port 0` (the hook runs before a dynamically assigned port is known), or `strictPort: false` (a fallback bind can diverge from the cache identity).
- Cache separation prevents writer contention only. Native watcher setup over irrelevant repository trees can still block serving after Vite reports ready; `server.watch.ignored` may therefore contain only these proven non-Lab-input roots: `.cindy-worktrees`, `.cindy-upstream`, `.p2v-release-evidence`, `.trellis`, `desktop-assets`, `build`, `dist-release`, `agentation-placement-package-output`, and `spike-package-output`. Keep `src`, `locales`, `public`, `lab.html`, and config files (including `vite.lab.config.ts` and `postcss.config.js`) watched; do not disable HMR or broadly ignore dependencies/source trees.
- Capture cleanup owns only its newly created default cache: it must first stop and await its Vite child, require a valid reserved port, and prove the resolved cache equals exactly `node_modules/.vite-lab/<port>`. Preserve a pre-existing cache or any caller-supplied `LAB_TEST_CACHE_ROOT`; never clean a parent or arbitrary override path.

##### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| `command === "serve"`, fixed positive loopback port, `strictPort: true` | Resolve `<root>/<port>` and permit one Lab instance for that port. |
| A second Lab uses a distinct fixed port | Resolve a distinct cache and test overlapping optimizer work. |
| Build command | Leave the serve-only cache hook inactive. |
| Same port on another host, port `0`, or `strictPort: false` | Reject as an unsupported cache-identity test/setup; do not infer isolation. |
| Proposed ignored path reaches Lab input/assets/runtime config | Keep it watched; exclusion is invalid. |
| Capture cache existed or `LAB_TEST_CACHE_ROOT` is set | Preserve it. |
| Capture child has not exited, port/path validation fails | Do not remove cache; fail cleanup. |

##### 5. Good / Base / Bad Cases

- **Good:** `npm run dev:lab` opens `http://127.0.0.1:1421/lab.html`; two fixed-port Labs use separate `<root>/<port>` caches, serve an interactive preview, and refresh without cache-swap errors.
- **Base:** a capture reserves a loopback port, uses the default cache child only when it was absent, waits for its child to exit, then removes that exact child; a restart on the normal Lab port reuses optimizer metadata.
- **Bad:** setting `LAB_TEST_CACHE_ROOT` to a port child, accepting Vite's fallback port, excluding `src`/`locales`/`public`, or recursively cleaning an inherited/parent cache path.

##### 6. Tests Required

- Assert the resolved `entries`, opener, host/port/strict-port defaults, effective cache path, and direct-capture no-opener behavior. The capture cleanup self-check must reject a parent path and preserve inherited/pre-existing cache roots.
- Regression evidence must record browser navigation timing plus the first observed visible preview and completed scenario interaction; ready logging or HTML response alone is insufficient. Test two normal cached refreshes, HMR from a temporary owned source CSS fixture, same-port restart metadata reuse, and ordinary-Vite-plus-Lab plus two-Lab overlapping forced optimizer runs. Assert no `EPERM`/`EACCES`, missing optimized module, unexpected document navigation, or browser failure.
- Keep one-run timing history, environment, cache state, and artifact paths in task-local evidence reports rather than this permanent spec. The permanent regression assertions remain: source-CSS HMR reaches the browser, a same-port restart retains optimizer metadata and reports `Hash is consistent. Skipping`, and concurrent fixed-port Labs remain visible, interactive, and free of cache/refresh failures.
- For a prose-only spec edit, do not rerun the Lab matrix: check factual consistency against the three sources and run a whitespace diff check.

##### 7. Wrong vs Correct

```text
Wrong:  node node_modules/vite/bin/vite.js --config vite.lab.config.ts --host 0.0.0.0 --port 0
        # or override server.strictPort to false, then treat a runtime port as isolated

Correct: node node_modules/vite/bin/vite.js --config vite.lab.config.ts --host 127.0.0.1 --port 55321 --strictPort
         # cache root is <LAB_TEST_CACHE_ROOT-or-default>/55321

Wrong:  ignore src/** or clean resolve(cacheDir, "..") after capture
Correct: ignore only the proven root list; await owned Vite exit and clean only
         the exact absent-at-start default node_modules/.vite-lab/<port> child
```

### Components (`src/components/`)
- Reusable UI components
- UI primitives in `ui/` subdirectory
- PascalCase naming: `MaterialGrid.tsx`

### Contexts (`src/contexts/`)
- React Context providers
- Named with `Context` suffix: `ThemeContext.tsx`

### Utils (`src/utils/`)
- Pure utility functions
- camelCase naming: `videoUrl.ts`

---

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `NeonButton.tsx` |
| Pages | PascalCase + Page | `SettingsPage.tsx` |
| Contexts | PascalCase + Context | `ThemeContext.tsx` |
| Utils | camelCase | `videoUrl.ts` |
| CSS | kebab-case | `index.css` |

---

## Examples

**Well-organized component**: `src/components/ui/neon-button.tsx`
- Single responsibility
- Props interface defined
- Uses ThemeContext for theming
## Motion / Presentation Foundation (MR0)

### Renderer-local motion modules

Renderer-local motion leaves live flat in `src/presentation/main-window/` — one focused module per concern, with a matching `*.test.ts`:

- `lifecycle.ts` — sole full/compact/transition writer (reducer)
- `projections.ts` — read-only phase/interaction/native projections
- `effectContracts.ts` / `effectExecutor.ts` — declarative effects and their injected executor
- `geometry.ts` — spatial policy
- `motionRecipes.ts` — shell/compact choreography
- `pointerField.ts` — sole continuous pointer runtime
- `magnetic.ts` — renderer-only Magnetic consumer
- `panelHover.ts` / `presentationCompletion.ts` — focused input/completion helpers

There is NO shared runtime hierarchy: no `motion/runtime/`, no `animators/`, no manager/bus directory. Future stages add consumer-local modules the same way:

- MR7 Expanded Presentation: one concrete `ExpandedPresentationSurface` WebGL2
  host plus consumer-local frame execution and neutral Progress/Terminal target
  types. The retired Dot Field modules must not return; there is no shared
  engine or alternate graphics backend.
- MR2 Character: a consumer-local expressive module consuming the Pointer Field values (never a second pointer authority).

### Composition and projection modules

- `src/utils/centerOverlayState.ts` — center presentation policy (request-id guarded transients/terminal opportunity).
- `src/components/ui/motion.ts` — shared MOTION tokens leaf (easing/duration/presence presets only; no recipe or scheduling logic).
- Test-only contract vocabulary lives in `src/presentation/main-window/presentationCompositionContract.test.ts`; production types are added only when two real consumers share a data contract.

### Placement rules

- Motion leaves may import: react, `motion/react`, sibling pure helpers, shared token constants.
- Motion leaves must not import: `src/features/**`, `src/desktop/**`, `electron/**`, lifecycle/pointer authority modules (except the designated Pointer Field consumer), or `centerOverlayState` (guarded by `src/architecture/import-guard.test.ts`).
- `MainWindowPresentationSurface.tsx` is the single wiring/composition boundary that may touch the desktop runtime and lifecycle shapes.
