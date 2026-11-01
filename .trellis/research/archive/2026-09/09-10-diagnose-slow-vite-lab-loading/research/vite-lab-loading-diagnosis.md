# Research: Vite Lab loading diagnosis

- Query: Why `npm run dev:lab` reports Vite ready quickly while the Lab page appears to spend tens of seconds scanning/bundling, discovers `react-router-dom`, `clsx`, `image-max-url`, and `tailwind-merge` late, and reloads.
- Scope: mixed (repository/config inspection, isolated Vite runs, browser network/console/runtime evidence)
- Date: 2026-09-10

## Findings

### Executive diagnosis

The slow path is primarily an entry-point mix-up, amplified by Vite's normal on-demand dependency optimizer. `vite.lab.config.ts` documents `/lab.html`, but the server still serves the repository root `/`, whose `index.html` imports the production `src/main.tsx`. Loading `/` pulls in the production router and the much larger App graph; those bare imports are then discovered and optimized after the server has already printed `ready`. The observed dependency hash change and one follow-up request/reload are an optimizer transition, not a persistent reload loop.

The intended `/lab.html` path has a separate, finite graph. On this machine a cold first request still has a large one-time cost (about 26–39 seconds in the isolated runs), but after the optimizer/transform cache is warm it rendered in about 1.2 seconds. No fatal Lab runtime error was observed. Therefore no repository code change is required if the user opens the documented URL and accepts the normal first-run optimization; the smallest ergonomic improvement would be making the dev command open `/lab.html` automatically.

### Repository/config evidence

| File | Evidence |
| --- | --- |
| `vite.lab.config.ts:5-16` | Calls this a dedicated browser Lab and explicitly tells users to open `http://127.0.0.1:1421/lab.html`. |
| `vite.lab.config.ts:17-32` | Dev config sets the React plugin, root-relative dev base, and port 1421. It has no `optimizeDeps.entries`, `optimizeDeps.exclude`, or dev `open` setting. `build.rollupOptions.input` at lines 23-26 affects builds only. |
| `lab.html:9-11` | Lab HTML mounts `/src/lab/lab-main.tsx`. |
| `src/lab/lab-main.tsx:1-7,13-25` | Lab entry imports React, `agentation`, `ThemeProvider`, `PresentationLab`, Lab i18n, and Lab CSS; it does not import the production router or `App`. |
| `src/main.tsx:1-22,141-155` | Root production entry statically imports `react-router-dom`, `App`, `SettingsPage`, `ContextMenuPage`, desktop bridges, and production CSS, then renders all routes. |
| `src/App.tsx:1-4,43-45,80-95,131-151` | The production graph imports the UI barrel and `upgradeImageUrl`, then many download/presentation modules. |
| `src/components/ui/index.ts:1-10` | The barrel re-exports every Neon primitive even though `App` requests only `NeonIconButton`; traversal reaches the other primitive modules. |
| `src/components/ui/neon-card.tsx:1`, `neon-field-button.tsx:1-4`, `neon-hint.tsx:1-3`, `neon-input.tsx:1-4`, `neon-section.tsx:1-4` | These modules import `../../lib/utils`. |
| `src/lib/utils.ts:1-5` | `cn()` imports `clsx` and `tailwind-merge`. |
| `src/utils/maxurlAdapter.ts:1-2,99-105`, `src/utils/imageQualityUpgrade.ts:1`, `src/App.tsx:44-45` | App reaches the MaxURL adapter; the adapter has a dynamic `import("image-max-url")`. The installed package's `main` is the 3.2 MB `userscript.user.js`. |

The late package set is therefore explainable by the production entry graph:

```text
index.html -> src/main.tsx -> react-router-dom
                         -> App -> components/ui barrel -> lib/utils -> clsx, tailwind-merge
                              -> imageQualityUpgrade -> maxurlAdapter -> dynamic image-max-url
```

The Lab graph does not contain these edges. It does intentionally include `agentation`, `motion/react`, `html2canvas` (dynamic export path), OneWorks/avatar packages, i18next, and the production presentation components used by the preview.

### Isolated server/browser measurements

The user's terminals were not reused. I used the same `vite.lab.config.ts` through isolated Vite processes on ports 1422–1424 (the script is `vite --config vite.lab.config.ts`), left existing caches intact, and stopped only those isolated processes afterward. No dependency installation, cache deletion, source/config/spec edit, or git operation was performed.

#### Cold-ish Lab entry (cache had no `node_modules/.vite/deps` entries before the run)

At 10:34:20 the server printed:

```text
Re-optimizing dependencies because vite config has changed
VITE v8.0.16 ready in 416 ms
Local: http://127.0.0.1:1422/
```

The optimizer began bundling at 10:34:22. The first browser navigation to `http://127.0.0.1:1422/lab.html` returned 200 and rendered the Lab DOM at about 25.9 s. The generated `node_modules/.vite/deps/_metadata.json` (10:34:26) had browser hash `2ad1ef26` and only the Lab-side optimized set: React/ReactDOM, `agentation`, i18next/react-i18next, `motion/react`, html2canvas, and the avatar packages. It did **not** contain `react-router-dom`, `clsx`, `image-max-url`, or `tailwind-merge`.

A second isolated server with the same warm cache reported ready in 181 ms. Its first Lab browser navigation completed at about 39.2 s; `vite:transform` output showed large batches of first-request transforms (for example `agentation.js` around 28.7 s and several Lab/presentation modules around 31.5 s). This variance means the visible cold delay is not solely the dependency optimizer; file/module transformation and machine contention are also material. The page eventually rendered normally.

#### Warm Lab navigation after the production graph was cached

After the production-entry test below completed, a new browser navigation to `/lab.html` used the new `?v=b46c9cd2` dependency URLs and completed in 1.216 s. The DOM had one `#root` child and the expected Lab text. A four-second observation recorded exactly one main-frame navigation and no reload/optimized-dependency console message. Console output was limited to:

- React warning for the Electron-only CSS property `-electron-corner-smoothing` (non-fatal in a browser).
- One Chromium WebGL driver warning about a `ReadPixels` GPU stall (the Lab's Ripple canvas path; non-fatal and unrelated to module loading).

#### Root `/` request that introduces the late packages

With the Lab-only metadata in place, I loaded `http://127.0.0.1:1424/` (the production `index.html`) in a separate browser page. The HTML response itself arrived in about 5 ms. The browser then requested `src/main.tsx`, `react-router-dom.js?v=2ad1ef26`, `App.tsx`, settings/context routes, and the desktop/presentation graph. The Vite debug log recorded:

```text
vite:deps new dependencies found: react-router-dom
vite:deps creating package.json in node_modules/.vite/deps_temp_55e57c42
```

While that optimizer pass was running, the production modules were held for roughly 54 seconds (`src/desktop/runtime.ts`, `src/index.css`, `App.tsx`, SettingsPage, and related files all completed around the 54.2 s mark). The browser remained `interactive` with an empty root for the observation window and then emitted the expected no-Electron-bridge errors from the production entry; those errors are a consequence of opening the desktop renderer in a plain browser, not a Lab failure.

The resulting `node_modules/.vite/deps/_metadata.json` was written at 10:54:45 with browser hash `b46c9cd2` (changed from `2ad1ef26`) and now contained all four late packages:

| Optimized file | Size | Why it is reached |
| --- | ---: | --- |
| `react-router-dom.js` | 398,512 B (+ 761,063 B map) | `src/main.tsx:3` |
| `clsx.js` | 598 B (+ 1,006 B map) | `src/lib/utils.ts:1` through Neon barrel consumers |
| `tailwind-merge.js` | 88,709 B (+ 142,325 B map) | `src/lib/utils.ts:2` |
| `image-max-url.js` | 3,262,295 B (+ 9,465,009 B map) | `src/utils/maxurlAdapter.ts:101` dynamic import |

The browser subsequently re-requested `@vite/client` and `src/main.tsx` after the optimizer hash transition. This is consistent with Vite's one-time dependency-update reload. A later warm `/lab.html` load had one navigation only, so there is no evidence of an ongoing reload loop.

### Cold vs warm conclusion

| Path/state | Server ready | Page/module result |
| --- | ---: | --- |
| Lab, first run with empty deps cache | 416 ms | Lab rendered around 25.9 s; optimizer wrote Lab-only metadata |
| Lab, another first request with warm deps but uncached transforms | 181 ms | Rendered around 39.2 s in the isolated run; large first-request transforms dominated |
| Lab, warm after all optimizer metadata settled | (already ready) | 1.216 s, one navigation, root rendered |
| Production `/` after Lab-only metadata | (already ready) | Root HTML ~5 ms, then ~54 s graph/optimizer wait; late deps and hash update |

The exact wall time is environment-sensitive, but the shape is stable: “Vite ready” measures server startup, not browser graph transformation; the first optimization/transform is expected once; the late four-package update is caused by requesting the production root; the warm Lab path does not loop.

## Ranked minimal remediation options

1. **No repository change (recommended now).** After `npm run dev:lab`, open the documented `http://127.0.0.1:1421/lab.html`, not the root URL printed by Vite. Close or ignore any `/` tab. Allow one cold optimizer/transform pass, then reload the Lab URL. This is the lowest-risk fix and matches the existing config comment.

2. **Ergonomic command-only improvement.** Start Vite with an explicit open target (`vite --config vite.lab.config.ts --open /lab.html`, or an equivalent script invocation) so a browser cannot silently land on `/`. Validate that the first navigation URL is `/lab.html` and that the warm reload remains under a few seconds. This changes developer ergonomics only.

3. **Narrow config guard if accidental root requests remain a problem.** Set `optimizeDeps.entries` to `lab.html` in the Lab config (and/or add a dev-only open target). This documents the intended optimizer entry and prevents the Lab startup from pre-scanning unrelated HTML. It does not make `/` a valid Lab page; validate both `/lab.html` and an intentional production-root request before adopting it.

4. **Consider excluding `image-max-url` only if production-root startup must be optimized.** `image-max-url` is dynamically imported and is by far the largest late artifact. `optimizeDeps.exclude: ["image-max-url"]` could avoid its 3.2 MB prebundle, but it changes when/how that module is transformed; validate image-drag quality upgrades and the production build. Do not add this solely to improve the correctly opened Lab URL.

5. **Do not pre-include all four packages for the Lab.** `optimizeDeps.include` would remove the visible late discovery at the cost of eagerly bundling the production graph (including the 3.2 MB MaxURL userscript), making the Lab's first start heavier. It is the wrong tradeoff for a Lab-only server.

## External references

- Vite dependency pre-bundling guide (dev-only optimizer, cache/hash behavior): <https://vite.dev/guide/dep-pre-bundling.html>
- Vite shared options reference (`optimizeDeps.entries`, `optimizeDeps.exclude`): <https://vite.dev/config/dep-optimization-options>
- Local installed version: `vite@8.0.16` (`node_modules/vite/package.json`); package manager lockfile records the same major/minor.

## Related specs

- `.trellis/spec/frontend/directory-structure.md`: Browser Lab is a dev-only plain-browser entry served through `vite.lab.config.ts` and `lab.html`; it must not be an Electron route and must not import desktop runtime modules.
- `.trellis/spec/frontend/quality-guidelines.md`: packaged/Electron bridge and browser-only behavior are separate concerns; no source/config edit was made for this diagnosis.

## Caveats / Not Found

- The isolated Vite runs naturally populated/updated `node_modules/.vite/deps`; I did not delete or manually clear that cache. It is an ignored generated cache, not an application/configuration change.
- I did not inspect or interrupt any user-owned Vite/push terminal. The temporary servers used alternate ports and were stopped after each measurement.
- The browser console showed the expected Electron-bridge errors only when testing the production `/` entry in a plain browser. They are not evidence of a Lab runtime failure.
- No repeat reload loop was reproduced after the dependency hash settled. If the user's original terminal still reports repeated “optimized dependencies changed” messages while staying on `/lab.html`, capture a fresh `DEBUG=vite:deps,vite:transform` log and the browser's `framenavigated`/network timeline; that would indicate an external file/config watcher or a changing lock/config hash rather than this static import-graph issue.
