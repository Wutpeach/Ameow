# Research: Repeated Lab refresh white-screen diagnosis

- Query: Why do repeated refreshes of `/lab.html` in one real browser session still show a long white screen before the Lab UI, despite a prior ~1.2 s warm measurement?
- Scope: mixed (isolated long-lived Vite 8.0.16 server, Playwright browser instrumentation, repository inspection)
- Date: 2026-09-10

## Findings

### Reproduction and measurement conditions

I started a fresh isolated Vite process with the repository's `vite.lab.config.ts` on `http://127.0.0.1:1437` using `vite --config vite.lab.config.ts --port 1437 --host 127.0.0.1`. This was a separate port/process; no user-owned Vite or push terminal was reused or interrupted. Existing `node_modules/.vite/deps` files were left in place, and I did not clear caches, install packages, edit source/config/specs, or run git commands.

The first browser probe accidentally exercised a server still in its initial transform/optimizer backlog: Chromium waited about 100.4 s for the first Lab DOM, then ~59.7 s and ~41.3 s for the next two refreshes. The browser timing showed the HTML headers themselves arriving around 1.3 s, but `@vite/client` and `lab-main.tsx` responses were delayed until ~35.3 s; subsequent module batches were delayed to ~93 s. This reproduces the reported white-screen shape, but those delays were server-side transform contention rather than browser execution (the root was empty until the module graph arrived). It also demonstrates that a “warm” dependency metadata file does not imply warm transformed source modules.

I then kept the same long-lived process and same browser context and ran three refreshes after its transform backlog settled. The repeatable warm run was:

| Refresh | HTML response / navigation | first React DOM (`[data-lab-workspace]`) | module/resource evidence |
| --- | ---: | ---: | --- |
| 1 | 14 ms response start; navigation load 152 ms | 293 ms wall time | 86–87 script/module requests, all network; transformed modules complete by ~99 ms; PNG request at 217–221 ms |
| 2 | 6 ms response start; navigation load 132 ms | 164 ms wall time | 86–87 requests, all browser cache; module span ~45 ms; PNG cache request ~144–148 ms |
| 3 | 8 ms response start; navigation load 99 ms | 201 ms wall time | 86–87 requests, all browser cache; module span ~44 ms; PNG cache request ~51–55 ms |

The warm refreshes therefore do **not** reproduce a long white screen. They are materially faster than the prior 1.216 s warm result (different machine/process/browser state and a narrower readiness marker account for part of the difference), but agree on the important shape: once transformed modules and browser cache are warm, Lab mount is sub-second and repeated navigation is finite.

To test the user's reported behavior without deleting anything, I repeated three refreshes against another long-lived process on port 1438 with Chromium CDP `Network.setCacheDisabled({cacheDisabled:true})`. This setting is the programmatic equivalent of DevTools' “Disable cache”; the browser still used the same Vite process and no dependency/cache files were removed. The result was 106.2 s to first workspace, 56.0 s to the second, and 71.7 s to the third. All 86 module requests were network requests by design. On refresh 1, HTML headers arrived at 18.5 s, source/optimized resources spanned 87.4 s, and the root appeared at 106.1 s; refresh 2 had an HTML response at 52.5 s and a 3.4 s module span; refresh 3 had an HTML response at 5.7 s but a 65.9 s module span. Thus cache-disabled browser settings can reproduce the long white screen even with stable dependency metadata, and the slow interval remains server response/transform queue time rather than WebGL.

### Timing breakdown (warm refreshes)

The probe recorded `PerformanceNavigationTiming`, resource timing, DOM mutations, WebGL calls, and Vite console messages. Values below are relative to each navigation's `performance.timeOrigin` / start.

| Stage | Refresh 1 | Refresh 2 | Refresh 3 | Interpretation |
| --- | ---: | ---: | ---: | --- |
| HTML request headers (`responseStart`) | 11 ms | 6 ms | 8 ms | Server HTML is not the white-screen bottleneck once ready |
| HTML complete (`responseEnd` / `load`) | 15 / 152 ms | 8 / 132 ms | 8 / 99 ms | `DOMContentLoaded` waits for module graph/evaluation |
| `@vite/client` + `lab-main.tsx` | ~14–26 ms | ~10–21 ms | ~13–16 ms | Network on first warm run; browser cache thereafter |
| Vite optimized modules / source transforms | first requests through ~99 ms | cached, through ~60 ms | cached, through ~57 ms | No multi-second transform after backlog settled |
| React root/workspace first DOM | ~183–293 ms | ~135–164 ms | ~117–201 ms | `initializeLabI18n()` resolves before `createRoot().render()`; this is first visible UI |
| Ripple WebGL setup | `getContext` ~270 ms, compile/link/upload/draw ~274–277 ms | ~168–176 ms | ~151–159 ms | Runs after React DOM; not responsible for initial blank interval |
| PNG fixture network request | ~217–221 ms | ~110–115 ms | ~144–148 ms | `RippleCanvas` waits for fixture before WebGL; image is tiny (7,267 B) |

The probe intentionally let React StrictMode expose the development effect replay: two WebGL contexts/program setup sequences appear per load. Each compile/link/upload/draw sequence took only a few milliseconds. No page errors or failed requests occurred. The root text contained the expected Ripple controls and Lab UI on every run.

### Vite optimizer/HMR behavior

The long-lived process printed a single startup message:

```text
[vite] (client) Re-optimizing dependencies because vite config has changed
VITE v8.0.16 ready in 1067 ms
[optimizer] scanning dependencies...
[optimizer] bundling dependencies...
```

The generated metadata at `node_modules/.vite/deps/_metadata.json` retained one stable `browserHash` (`2ad1ef26`) and the Lab-side optimized set (React/ReactDOM, `agentation`, i18next/react-i18next, `motion/react`, and avatar packages). During the settled three-refresh probe there were no `vite:deps new dependencies found`, “optimized dependencies changed”, HMR invalidation, or reload messages. Playwright recorded exactly one `framenavigated` event per explicit refresh (`/lab.html` at ~11:45:24, ~11:45:27, ~11:45:30 local process time), with no extra navigation. Thus no optimizer reload loop or HMR invalidation occurs on every refresh.

The earlier ~100/60/41 s refresh sequence occurred while the same server was still serially transforming a large first-request module graph. Its browser evidence separates the stages: HTML headers were available around 1.3 s, but `@vite/client` and `lab-main.tsx` did not return until ~35.3 s; React DOM did not appear until ~100.3 s. On a subsequent probe after the backlog settled, all source/optimized resources arrived within ~100 ms. “Vite ready” only measures server startup; a ready server can still queue expensive first transforms. A generated dependency metadata file is likewise not proof that every source transform is cached.

### Entry/runtime code that can delay first paint

The Lab entry is asynchronous before React mounts: `src/lab/lab-main.tsx:13-25` calls `await initializeLabI18n("zh-CN")`, then calls `createRoot(...).render(...)`. The i18n initializer (`src/lab/i18n.ts:23-29`) awaits `initializeI18n()`, which initializes the statically imported locale resource graph (`src/i18n/index.ts:12-61`), then registers Lab bundles. This is a bounded startup await, not a loop; there are no network fetches in the initializer.

After React mounts, `RippleCanvas` (`src/lab/ripple/RippleCanvas.tsx:45-61, 85-174`) asynchronously loads `/src/lab/ripple/ameow-download-active-200.png`, obtains a WebGL1 context, compiles/links two small shaders, uploads the fixture, and draws. Instrumentation confirms this work occurs after the first React DOM and completes within milliseconds on warm runs. The only console evidence was the known non-fatal React warning for `-electron-corner-smoothing` and Chromium's non-fatal `GPU stall due to ReadPixels`; neither blocks Lab mount. No top-level synchronous WebGL, asset, or Ripple work runs before module evaluation/React mount.

`src/lab/PresentationLab.tsx:70-95` computes fixtures, projections, and state synchronously during render, but the mounted shell appeared within ~0.1–0.3 s in the settled run. The page imports a broad production presentation graph (about 86 script/module resources), which explains first-transform sensitivity but not repeated warm delays.

### Why this differs from the previous 1.2 s warm result

The prior report's 1.216 s measurement was taken after the production-root experiment changed the dependency metadata/hash (`2ad1ef26` → `b46c9cd2`) and with a new browser navigation. The current same-process probe used the already settled Lab hash and measured readiness at the first `[data-lab-workspace]` mutation rather than a later wall-clock condition; it also used a headless Chromium context with `serviceWorkers: "block"`. Those methodological differences explain why the current stable warm values are 0.16–0.29 s (or ~0.1–0.15 s navigation load) rather than exactly 1.216 s; they do not indicate a new regression.

The important discrepancy is the user's long white screens: the cache-disabled run reproduces them, while the cache-enabled run does not. In the normal warm run I did not enable DevTools “Disable cache” (the browser explicitly reported `deliveryType: "cache"` for refreshes 2–3); forcing network requests caused each refresh to revisit the Vite transform/response path, with 56–106 s gaps despite unchanged `browserHash`. Vite debug output from the first 1438 request recorded individual transforms blocked for 58–61 s (`lab.css`, React runtime/client, and related modules), confirming server-side contention/queueing rather than React or Ripple work. There is no direct evidence here for Windows Defender/antivirus or concurrent file writers, and neither should be claimed without an external process/file-watcher trace.

## Ranked minimal remediation / next diagnostics

1. **Check DevTools cache mode first.** Leave “Disable cache” unchecked for ordinary Lab iteration; the cache-enabled same-session run was 99–152 ms navigation load and 164–293 ms first workspace. If cache must be disabled for another investigation, expect each refresh to exercise Vite transforms and potentially reproduce the white screen.
2. **Capture the user's exact slow session.** Run `DEBUG=vite:deps,vite:transform npm run dev:lab` (PowerShell: `$env:DEBUG='vite:deps,vite:transform'; npm run dev:lab`) on an unused port and save timestamps for every `vite:transform` request while refreshing `/lab.html` twice. In Chromium Performance/Network, record `responseStart`, request blocking/queueing, `DOMContentLoaded`, and first `#root` child; note whether “Disable cache” is checked.
3. **If slow transforms recur with unchanged source/config, inspect host contention.** Correlate the Vite timeline with Windows Resource Monitor/Defender and file-watcher activity; only then consider an antivirus exclusion or writer fix. This was not proven in this run.
4. **Optional ergonomics only:** add an explicit dev open target `/lab.html` to prevent accidental `/` production-entry requests. Do not prebundle the production graph for the Lab; that would increase first startup and is unrelated to the settled repeated-refresh path.

## Files found

- `vite.lab.config.ts:5-32` — dedicated Vite Lab server, port 1421, no `optimizeDeps.entries` or dev `open` setting.
- `lab.html:9-11` — module entry `/src/lab/lab-main.tsx`.
- `src/lab/lab-main.tsx:13-25` — async i18n gate before `createRoot().render()`.
- `src/lab/i18n.ts:23-29`, `src/i18n/index.ts:12-61` — local, statically bundled i18n initialization.
- `src/lab/PresentationLab.tsx:70-95` — synchronous shell/projection setup and Ripple selection.
- `src/lab/ripple/RippleCanvas.tsx:45-61,85-174` — fixture load and WebGL initialization after mount.
- `node_modules/.vite/deps/_metadata.json` — stable Lab optimizer metadata (`browserHash: 2ad1ef26`) during settled run.
- `.trellis/spec/frontend/directory-structure.md`, `.trellis/spec/frontend/quality-guidelines.md` — Browser Lab boundaries and frontend quality contracts.

## Caveats / Not Found

- The first same-process probe observed 100/60/41 s transform waits, but because the server was still completing its initial transform backlog; it is evidence of queued server work, not proof that every refresh always takes that long.
- Browser timing does not expose Vite's internal transform duration directly; resource response delays plus server debug output are the available proxy. A fresh user-session `DEBUG=vite:transform` capture is needed to identify a specific source file if the delay persists after the server is idle.
- No Windows antivirus/file-writer instrumentation was run, and no claim about those causes is made.
- The isolated Vite processes on ports 1437 and 1438 were stopped after their probes; neither was user-owned.
