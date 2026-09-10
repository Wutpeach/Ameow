# Research: Live port-1421 normal-cache refresh probe

- Query: Does the long white screen reproduce against the existing `http://127.0.0.1:1421/lab.html` server when Chromium uses a fresh profile with ordinary cache behavior, and is the delay server-side or isolated to the user's browser session?
- Scope: mixed (live localhost HTTP/browser/process observations, repository inspection, comparison with prior isolated-server reports)
- Date: 2026-09-10

## Findings

### Probe conditions and safety

I probed the already-listening user server only; I did not read, control, restart, or stop its terminal/process. The browser was Chromium `148.0.7778.96` via Playwright `1.60.0`, in a new ephemeral browser context with the normal cache path enabled. I did not call `Network.setCacheDisabled`, did not use the user's browser profile, and did not clear or edit any cache, source, configuration, or package. The probe performed one initial navigation and two `page.reload()` calls to the same `/lab.html` URL, while a separate read-only HTTP monitor requested the HTML once per second.

The live listener stayed on `127.0.0.1:1421` as PID `52216` (`node`, started `2026-09-10T11:18:10.078+08:00`, `Responding=True`). A process snapshot at `14:01:16.640+08:00` showed CPU `1816.922 s`; the same PID was still listening at `14:09:43.866+08:00` with CPU `1817.344 s`. This is a liveness/context observation, not a claim about all host contention between those snapshots.

### Three sequential refreshes against the live server

All times in the table are browser `PerformanceNavigationTiming`/MutationObserver milliseconds from that navigation's start. `root` is the first `#root` child; `workspace` is the first `[data-lab-workspace]` node.

| Navigation | HTML `responseStart` / `responseEnd` | DOMContentLoaded / `load` | First root / workspace | Main-frame events |
| --- | ---: | ---: | ---: | --- |
| 1 (`navigate`) | 6.3 / 6.6 ms | 130.1 / 131.0 ms | 150.8 / 150.8 ms | one `framenavigated` to `/lab.html` at 11.9 ms |
| 2 (`reload`) | 3.5 / 3.8 ms | 59.0 / 59.8 ms | 75.3 / 75.3 ms | one `framenavigated` to `/lab.html` at 8.2 ms |
| 3 (`reload`) | 3.2 / 3.6 ms | 53.9 / 54.6 ms | 60.1 / 60.1 ms | one `framenavigated` to `/lab.html` at 7.5 ms |

The Node-side waits (which include Playwright event scheduling) resolved at 154.4, 77.7, and 61.5 ms respectively. There was no timeout, navigation error, extra reload, redirect, or second main-frame navigation. The first root appeared shortly after `load` on each run, consistent with the asynchronous i18n gate in the Lab entry, but there was no long blank interval.

### HTML, `@vite/client`, and `lab-main.tsx`

The browser got HTTP `200` for the document and both key modules on all three runs. Resource timing for the key module bodies was:

| Navigation | `@vite/client` response interval | `src/lab/lab-main.tsx` response interval | transfer observation |
| --- | ---: | ---: | --- |
| 1 | 13.0–13.5 ms | 13.7–13.8 ms | 4xx/5xx absent; normal network transfer |
| 2 | 8.9–9.4 ms | 9.1–9.4 ms | 300-byte transfer accounting for each (Vite `no-cache` revalidation path) |
| 3 | 7.1–7.5 ms | 7.3–7.4 ms | 300-byte transfer accounting for each (same path) |

The independent direct GETs after the browser run also returned `200`: `/lab.html` 587 bytes in 10.1 ms, `/@vite/client` 209,937 bytes in 8.4 ms, and `/src/lab/lab-main.tsx` 4,210 bytes in 8.5 ms. The concurrent HTML monitor saw two successful samples during the navigation sequence (12.0 ms and 6.0 ms, both `200`, 587 bytes). Every observed response advertised `Cache-Control: no-cache`, as expected for Vite dev responses.

### Module count, status, and cache delivery

The CDP `Network` stream saw exactly 86 non-data JavaScript/module requests per navigation. Each navigation had `200 x 86` module responses and zero failed requests. No response was marked `fromServiceWorker`; CDP's `fromDiskCache`/`fromPrefetchCache` flags were false because Vite's `no-cache` responses still traverse the request/revalidation path.

`PerformanceResourceTiming` provides the useful cache split for this normal-cache context:

| Navigation | script/module requests | transfer size `0` (browser cache delivery) | non-zero transfer |
| --- | ---: | ---: | ---: |
| 1 | 86 | 0 | 86 |
| 2 | 86 | 14 | 72 |
| 3 | 86 | 14 | 72 |

Thus ordinary cache behavior did not eliminate module requests (the source graph is served `no-cache`), but it did deliver 14 optimized modules without bytes on the second and third refreshes. Even the 72 non-zero source-module responses completed within the 54–60 ms DCL window; there was no tens-of-seconds server wait.

### Console, runtime, and reload evidence

Each run logged the expected Vite `connecting...` / `connected...`, React DevTools, and i18next informational messages. The only diagnostics were:

- React's known unsupported style-property message for `-electron-corner-smoothing` (reported as a console error, but no `pageerror` and no render failure).
- Chromium's non-fatal WebGL `GPU stall due to ReadPixels` warning after the page mounted.

There were zero `pageerror` events and zero `requestfailed` events on all three runs. No `vite:deps` optimized-dependency-change message, HMR reload, or extra navigation was observed. The root/workspace marker was present on every run.

### Server boundary versus browser-profile boundary

At the time of measurement, the server-side path was healthy: HTML response headers arrived in 3–7 ms in the browser; direct GETs for the document, Vite client, and Lab entry were all under 11 ms; the listener and PID remained stable; and a fresh normal-cache context rendered in 60–151 ms. This rules out a currently persistent port-1421 HTML/transform stall or a reload loop in the static Lab graph.

The fresh context cannot prove that the user's existing Chromium profile behaves identically. If the same user tab still shows a long white screen while this exact server remains fast in a fresh context, the narrowest next boundary is the browser-profile/session request path (or a transient condition that has cleared), not `RippleCanvas`, React mount, or a repository-level optimizer loop. No evidence here supports attributing the gap to antivirus or extensions.

### Comparison with prior isolated-server results

The shape agrees with the earlier isolated evidence:

| Condition | First / second / third first-workspace time |
| --- | ---: |
| Current live 1421, fresh normal-cache context | 151 / 75 / 60 ms |
| Prior isolated 1437 after transform backlog settled, cache enabled | 293 / 164 / 201 ms |
| Prior isolated 1438 with CDP cache forcibly disabled | 106.2 / 56.0 / 71.7 s |
| Prior cold-ish Lab isolated starts (1422/1423) | ~25.9 s / ~39.2 s first navigation |

The old 25–39 s cold measurements and the 56–106 s cache-disabled measurements demonstrate that Vite transforms can be expensive while a server already says `ready`; they do not explain this live normal-cache probe. The current `node_modules/.vite/deps/_metadata.json` had browser hash `12233d1e`, 16 optimized package entries, and zero discovered entries when inspected after the probe, with no late package discovery during the three refreshes.

### Code-path evidence

- `vite.lab.config.ts:5-12,17-32` defines a dedicated browser Lab server on port 1421, with no dev `open` target or explicit `optimizeDeps.entries`.
- `lab.html:9-11` mounts `/src/lab/lab-main.tsx` in a plain `<div id="root">`.
- `src/lab/lab-main.tsx:13-25` awaits `initializeLabI18n("zh-CN")` before `createRoot(...).render(...)`; this bounded local await explains why the first root marker can follow `load` by about 20 ms.
- `src/lab/i18n.ts:23-29` initializes statically bundled locale resources and adds Lab bundles; it does not fetch the network.
- `src/lab/ripple/RippleCanvas.tsx:103-188` loads the fixture and initializes WebGL inside `useEffect`, after React has mounted. The WebGL warning therefore cannot explain an empty root before module evaluation.

## Immediately actionable checks

1. While the user's white screen is visible, run these read-only probes from a separate PowerShell window and record the same timestamp as the DevTools waterfall:

   ```powershell
   $urls = @(
     'http://127.0.0.1:1421/lab.html',
     'http://127.0.0.1:1421/@vite/client',
     'http://127.0.0.1:1421/src/lab/lab-main.tsx'
   )
   foreach ($u in $urls) {
     $sw = [Diagnostics.Stopwatch]::StartNew()
     try {
       $r = Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 30
       $sw.Stop()
       "{0} {1} {2:N1} ms" -f $u, $r.StatusCode, $sw.Elapsed.TotalMilliseconds
     } catch {
       $sw.Stop()
       "{0} ERROR {1:N1} ms {2}" -f $u, $sw.Elapsed.TotalMilliseconds, $_.Exception.Message
     }
   }
   ```

   If these direct requests are fast while DevTools shows a long `Stalled`/`Waiting (TTFB)` interval, repeat `/lab.html` in an Incognito/Guest context with DevTools `Disable cache` still unchecked; that cleanly partitions the user's profile/session path without claiming a particular extension or security product. If the direct requests stall at the same time, capture `DEBUG=vite:deps,vite:transform` output for that server run and correlate the delayed module URL with the browser waterfall.

2. In the slow tab, enable Network **Preserve log**, leave **Disable cache** unchecked, reload once, and save a HAR (or screenshot the waterfall) containing `/lab.html`, `/@vite/client`, and `src/lab/lab-main.tsx`. Record whether there is one navigation or an unexpected second navigation, and whether the delay is before module response headers or after all modules have arrived.

3. Do not clear caches, reinstall packages, or change the Lab config based on this probe. A repository change is not indicated unless a fresh capture reproduces slow transforms on port 1421 while the independent HTTP probes are also slow.

## Files found

- `vite.lab.config.ts:5-32` — dedicated Vite Lab server, port 1421, browser-only dev entry.
- `lab.html:9-11` — Lab HTML and module entry.
- `src/lab/lab-main.tsx:13-25` — async i18n gate before React mount.
- `src/lab/i18n.ts:23-29` — local static i18n initialization.
- `src/lab/ripple/RippleCanvas.tsx:103-188` — post-mount fixture/WebGL initialization.
- `node_modules/.vite/deps/_metadata.json` — observed hash `12233d1e`, 16 optimized entries, zero discovered entries.
- `.trellis/tasks/09-10-diagnose-slow-vite-lab-loading/research/repeated-lab-refresh-white-screen.md` — prior warm/cache-disabled refresh measurements.
- `.trellis/tasks/09-10-diagnose-slow-vite-lab-loading/research/vite-lab-loading-diagnosis.md` — prior cold/production-entry diagnosis.
- `.trellis/spec/frontend/directory-structure.md` and `.trellis/spec/frontend/quality-guidelines.md` — Browser Lab boundaries and frontend quality contracts.

## External references

- Vite dependency pre-bundling guide: <https://vite.dev/guide/dep-pre-bundling.html>
- Vite dependency optimization options (`entries`, `exclude`): <https://vite.dev/config/dep-optimization-options>
- Installed versions observed read-only: `vite@8.0.16`, `playwright@1.60.0`.

## Caveats / Not Found

- This probe used a clean ephemeral browser context, not the user's existing profile, so it cannot reproduce profile-local state that was absent from the context.
- The server was already warm when measured; the prior isolated runs show that a cold transform backlog can still delay a first request even after Vite prints `ready`.
- Vite's `Cache-Control: no-cache` means ordinary refreshes still issue source-module requests; the cache conclusion is based on the 14 zero-transfer optimized responses, not on assuming every module is disk-cached.
- No antivirus, extension, file-watcher, or security-product instrumentation was run; none is claimed as a cause.
- No files outside this task's `research/` directory were modified.
