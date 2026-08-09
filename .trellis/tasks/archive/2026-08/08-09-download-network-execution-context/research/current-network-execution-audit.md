# Current Network and Download Execution Audit

Date: 2026-08-09

## Scope and method

Read-only audit of persisted proxy config, Electron session proxy application and resolution, downloader/runtime process entry points, ambient proxy variables, failure diagnostics, telemetry, and existing tests. `fff` MCP was unavailable in this session, so repository searches used `rg` as the permitted fallback. Historical task `.trellis/tasks/archive/2026-07/07-16-network-proxy-settings/` and relevant Trellis contracts were also reviewed.

Baseline focused validation before product-code edits:

```text
npm test -- src/config/networkProxy.test.ts src/config/cliProxy.test.ts electron/desktopProxy.test.mts electron/networkProxyPolicy.test.mts electron/managedRuntimeBootstrap.test.mts src/electron-runtime/service.test.ts src/electron-runtime/ytDlpCommandPlan.test.ts src/electron-runtime/galleryDlDownload.test.ts
8 files passed, 94 tests passed.
```

## Confirmed current model

- Persisted preference is `networkProxyMode?: "system" | "manual"` plus `networkProxyUrl?: string` (`src/config/networkProxy.ts:1-12`). Missing/unknown modes normalize to system.
- Manual config accepts only credential-free HTTP(S) URLs without path/query/hash (`src/config/networkProxy.ts:69-112`). SOCKS/PAC/auth remain unsupported user-config formats.
- Saved preference and effective policy are separate. A valid manual preference is applied immediately, validated against GitHub/Deno/PyPI, and can fall back to system when unavailable (`electron/networkProxyPolicy.mts:172-252`).
- Switching to system leaves a historical manual URL inert. Stale legacy proxy keys are not activated.

## Electron network path

- System mode is real application, not diagnostics-only: startup/config reconfiguration reaches `session.defaultSession.setProxy({ mode: "system" })` (`electron/main.mts:936-990`, `electron/desktopProxy.mts:31-39`).
- Manual mode applies `fixed_servers` and preserves loopback/`127.0.0.1:39527` bypass (`electron/desktopProxy.mts:16-59`).
- Electron-owned fetches use the active Chromium session (`electron/main.mts:1063`), including managed binary assets; therefore system/manual session routing is actually used for those requests.
- `session.resolveProxy(targetUrl)` is URL-specific, but its result is currently used only for sampled CLI diagnostics (`electron/main.mts:1030-1051`).

## CLI and execution-context path

- `EngineExecutionContext` expresses proxy state only as `proxyUrl?: string | null` (`src/core/types/engine.ts:7-21`); direct, resolution failure, system/environment source, SOCKS, multiple/PAC, and unsupported cannot be represented.
- Main's runtime resolver returns only a verified manual URL. System returns `null` (`electron/main.mts:1514-1516`, `electron/networkProxyPolicy.mts:260-263`).
- Normal task execution separately performs diagnostics and resolution, then constructs an engine context (`src/electron-runtime/service.ts:1117-1183`). Resolution exceptions are logged and collapsed to null.
- The orchestrator calls context construction per candidate engine (`src/orchestration/download-orchestrator.ts:117-142`); auth recovery reruns the orchestrator (`src/electron-runtime/service.ts:1360-1402`). One queued task can therefore change network routes during fallback/recovery.
- Advanced-quality probing has a separate context path and direct yt-dlp proxy argument handling (`src/electron-runtime/service.ts:524-646`, `src/electron-runtime/advancedQualityProbe.ts:291-334`).

## Engine execution behavior

- yt-dlp spawn: `src/electron-runtime/ytDlpDownload.ts:257-264` through shared `processRunner.ts:104-117`. Manual `proxyUrl` becomes one `--proxy` argument (`ytDlpCommandPlan.ts:204-238`). Internal transient/format retries reuse that captured value.
- gallery-dl spawn: `src/electron-runtime/galleryDlDownload.ts:161-178`. Manual proxy becomes upper/lower HTTP(S) environment variables.
- Both engines still inherit the ambient process environment. yt-dlp explicitly spreads `process.env`; gallery-dl inherits it when no env is supplied. Thus `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY` and lowercase forms can affect the real route even when diagnostics say direct or a manual route is explicit.
- `buildManualProxyEnv()` overlays only HTTP(S) variables and does not remove `ALL_PROXY` or `NO_PROXY` (`src/config/networkProxy.ts:124-133`). Multiple sources can therefore remain active.
- gallery-dl error wrapping can discard an existing `DownloadRuntimeError.context` (`galleryDlDownload.ts:217-227`).

## Runtime bootstrap behavior

- Deno/FFmpeg artifact fetch uses the Electron session path (`electron/managedRuntimeBootstrap.mts:490-632`; injection in `electron/main.mts:1452-1462`).
- yt-dlp/gallery-dl package installation uses pip child processes (`managedRuntimeBootstrap.mts:727-776`). Manual overlays HTTP(S) env; system relies only on ambient child env (`:433-441`).
- A single bootstrap can therefore use Chromium system/PAC routing for assets and unrelated ambient environment routing for pip.

## Diagnostics and failure taxonomy

- Existing `cliProxy.ts` parsing can distinguish DIRECT, HTTP/HTTPS, SOCKS4/5, multiple/PAC-like, malformed, environment, and resolution failure. Multiple candidates are not silently collapsed (`src/config/cliProxy.ts:10-305`).
- Helpers that could convert Electron/environment rules to a URL have no production consumers; current messages explicitly call those samples diagnostics-only.
- gallery-dl is skipped entirely by current proxy diagnostics (`electron/main.mts:1030-1035`).
- Diagnostics and resolution are separate operations, so logs cannot prove the recorded route was applied.
- Telemetry contains generic error fields but no network route/applied metadata (`src/download-capabilities/telemetry.ts:41-64,118-142`).
- Stable business classifications cover retry/fallback/terminal/input/auth/cancelled, not proxy resolution/auth/connection, DNS, TLS, or timeout (`src/core/constants/error-classifications.ts:3-94`).
- Debug yt-dlp logs include raw args. Manual URLs reject credentials today, but environment/system routes may contain userinfo; production mapping therefore requires centralized redaction before any args/evidence log.

## Confirmed architecture problems

1. System proxy is applied to Electron but only diagnosed for CLI; it is not applied to yt-dlp/gallery-dl.
2. Environment proxy variables affect CLI execution implicitly, while diagnostics describe them as non-applied samples.
3. There is no unique precedence. Manual, system and ambient environment semantics vary by consumer and can coexist.
4. The task context is rebuilt per engine/recovery and is not stable for the task lifecycle.
5. Bootstrap asset fetch and pip execution can take different routes.
6. `string | null` collapses direct, unsupported, resolution failure, and missing proxy into the same value.
7. Failure evidence remains mostly stderr/text classification rather than typed network failures with applied-route context.

## Suspicions disproved

- Manual proxy is not UI/diagnostics-only; it is already applied to Electron, yt-dlp, gallery-dl, and pip.
- System proxy is not diagnostics-only for Electron; session fetches actually use it.
- Engines do not call Electron resolution or read Ameow config themselves. The hidden source is inherited child environment.
- PAC/multiple candidates are not currently forced into a CLI proxy; they remain diagnostic-only.
- Old proxy config keys are not silently reactivated.
- Metadata probe helpers that directly inherit environment currently have no production callers, so they are potential rather than active bypasses.

## Compatibility constraints and smallest seams

- Preserve the existing persisted config and effective manual validation/fallback controller.
- Promote the existing parser responsibilities into a production-grade route result instead of deleting them.
- Inject Electron `resolveProxy(targetUrl)` at the composition root; keep `src/electron-runtime` Electron-free.
- Resolve once in the queued-task lifecycle and pass one stable `DownloadExecutionContext` through engine fallback/auth recovery.
- Keep `processRunner` generic. Put mapping/validation in pure yt-dlp and gallery-dl adapters.
- Reuse the yt-dlp adapter for advanced-quality probe.
- Make child proxy environment deterministic: remove all upper/lower HTTP(S)/ALL/NO proxy keys, then add only the selected adapter representation.
- Preserve current manual HTTP(S) behavior and loopback bypass; do not expand user config to manual SOCKS/auth/PAC.
- Update the old Trellis proxy contract: it deliberately prohibits system/environment-to-CLI mapping, which the new P0 requirement intentionally supersedes only for explicit, safely parsed outcomes.

## Planning boundary discovered

Electron `session.resolveProxy` returns the evaluated proxy list, not reliable provenance. A PAC script that returns a single proxy for the sampled URL is indistinguishable from a fixed system proxy, and yt-dlp/gallery-dl may contact additional hosts. P0 can truthfully guarantee only that a route was resolved for the canonical target and applied consistently to the engine; it cannot prove equivalent PAC behavior for every downstream media host without a PAC engine or per-request downloader integration. Diagnostics and the final report must state this limitation rather than claim complete PAC detection.

## Additional P0 evidence: explicit direct and gallery-dl auto-discovery

- Ameow pins gallery-dl 1.32.8 (`electron/managedPythonPackageManifest.mts:21-24`).
- Its command plan already uses `--config-ignore`, which prevents user config loading but does not disable Requests proxy discovery (`src/electron-runtime/engineManifest.ts:204-208`).
- Upstream gallery-dl 1.32.8 defines `extractor.*.proxy-env` with default `true`; documentation states it collects `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`, and Windows Registry proxy settings.
- The pinned implementation sets `session.trust_env` from `proxy-env`. Therefore the executable control that removes environment/Registry as a second authority is `-o extractor.*.proxy-env=false` on every gallery-dl invocation.
- Pinned gallery-dl exposes `--proxy URL`; an empty value produces no configured proxy. Explicit direct must combine `--proxy ""`, `proxy-env=false`, and a scrubbed child environment.
- Pinned yt-dlp documents `--proxy ""` as its explicit direct-connection override. A missing `--proxy` is not sufficient because ambient/tool-specific discovery may still occur.
- Consequently environment variables must be evaluated by `NetworkRouteService` for the canonical `targetUrl`, including NO_PROXY matching, and converted to a final direct/proxy/complex route before either Engine starts.
