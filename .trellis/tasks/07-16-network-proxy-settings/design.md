# Technical Design

## Architecture

Add an explicit, user-owned network/proxy mode that can be read from persisted
desktop config and applied consistently across the network layers Ameow owns.
The first release supports manual HTTP(S) proxy only, applies it globally to
covered layers, keeps the feature off by default, and minimizes user
interaction:

1. Electron session requests.
2. Managed runtime asset downloads.
3. Managed Python package bootstrap child processes.
4. yt-dlp/gallery-dl command execution and probes.
5. Network diagnostics and support logs.

Default behavior must remain system/ambient proxy behavior. Ameow must not
silently translate Electron `resolveProxy(...)` output into CLI downloader
arguments.

## Proposed Config Shape

Final names are still open, but the config should express the user decision
directly:

```ts
type NetworkProxyMode = "system" | "manual";

type NetworkProxyConfig = {
  networkProxyMode?: NetworkProxyMode;
  networkProxyUrl?: string;
};
```

Interpretation:

- `system` or missing: Electron uses system proxy; CLI tools use ambient
  environment/tool routing.
- `manual`: Ameow saves a syntactically valid `networkProxyUrl`, validates it
  asynchronously, and treats it as the preferred proxy while manual mode is
  selected. If validation or use shows it is unavailable, Ameow falls back to
  system/ambient behavior until the setting changes or validation succeeds
  again.

Validation should happen at the Electron/main boundary before applying the
setting. The first planned shape supports only `http:` and `https:` URLs
without credentials, path, query, or hash. SOCKS, PAC, per-site routing, and
proxy authentication are explicitly deferred.

The user-facing model has only two modes: system proxy and manual proxy. The
persisted user preference and the effective runtime proxy policy are still
separate internally so Ameow can fall back safely when the preferred manual
proxy is unavailable:

```ts
type EffectiveNetworkProxyPolicy =
  | { mode: "system"; reason: "user_system" | "invalid_manual" | "manual_unverified" | "manual_unavailable" }
  | { mode: "manual"; proxyUrl: string; verifiedAtMs: number };
```

This prevents a saved-but-bad proxy from breaking bootstrap or downloads. If a
manual proxy is syntactically valid, Ameow saves it and treats it as the
preferred proxy across restarts. Startup should try the saved manual proxy first
when the user selected manual mode. If validation or actual use shows that the
manual proxy fails, times out, or is unavailable, Ameow falls back to
system/ambient proxy behavior and surfaces a compact status in Settings.

`manual_unverified` is a short-lived startup/input state, not a user-visible
mode. On startup, a syntactically valid saved manual proxy is attempted first
so returning users get the setting they chose. Automatic validation runs in the
background. If validation fails or times out, Electron session proxy settings
and CLI proxy injection are switched back to system/ambient behavior for future
network work.

Validation freshness:

- Run validation after manual proxy input settles.
- Run validation on app startup when manual mode is selected.
- Treat a successful validation as fresh for the current process for up to
  30 minutes; after that, revalidate quietly before using the manual proxy for
  new bootstrap/download work when practical.
- A proxy-shaped network failure while manual proxy is effective should mark
  the policy suspect, trigger revalidation, and fall back to system/ambient if
  validation fails. Do not classify HTTP 403/404, private content, region
  limits, or auth failures as proxy unavailability.

## Data Flow

### Startup / Config Load

1. Electron reads config through `configStore`.
2. Main process resolves a preferred proxy policy from config.
3. Electron default session applies either system proxy mode or fixed-server
   manual proxy mode. Saved manual mode is attempted first across restarts; the
   effective policy falls back to system only after manual validation/use fails.
4. Manual Electron session proxy must preserve local loopback access with
   bypass rules such as `<local>` and an explicit `127.0.0.1:39527` bypass so
   the browser-extension WebSocket bridge and local app traffic are never routed
   through the manual proxy.
5. Tray/status diagnostics can summarize whether manual proxy is active or the
   configured value is invalid.

### Bootstrap

1. Managed binary downloads continue to use `fetchWithDesktopSession(...)`.
2. Managed Python package installation receives proxy environment variables
   only when manual proxy mode is the current effective policy.
3. Bootstrap activity/error reporting includes the affected component and
   sanitized proxy mode metadata.

### Download / Probe

1. Runtime selects an engine and target URL.
2. Proxy diagnostics record sampled state for support logs.
3. If manual proxy mode is valid and engine supports explicit proxy routing,
   runtime passes `proxyUrl` into the execution context. Saved manual config
   alone is not enough; the effective policy must be manual.
4. yt-dlp command planning uses the existing `--proxy <url>` path.
5. gallery-dl is in first-release scope through child-process proxy environment
   variables (`HTTP_PROXY` / `HTTPS_PROXY`) while manual proxy is effective.
   If implementation evidence shows gallery-dl needs a CLI-specific proxy
   option for reliable behavior, add it explicitly or document the narrow
   deferral before task start is revisited.

### Diagnostics

Network diagnostics should report layer-specific status without asking users to
paste arbitrary content URLs into Settings. First-release validation should run
automatically after the user finishes editing a manual proxy URL and should
probe fixed infrastructure targets Ameow itself depends on:

- Electron/session fetch path.
- Managed runtime asset download path.
- pip child-process path.
- yt-dlp path if a low-cost infrastructure probe is available.
- Optional gallery-dl path if a low-cost infrastructure probe is available.

Diagnostic output must avoid raw credentials, cookies, full sensitive URLs, and
unparsed proxy rules.

Initial validation target contract:

- Use fixed infrastructure targets derived from Ameow-owned dependencies, not
  user-provided content links.
- Candidate targets:
  - `https://github.com/` for GitHub release/update/runtime fallback access.
  - `https://dl.deno.land/` for Deno runtime asset access.
  - `https://pypi.org/simple/yt-dlp/` for pip/PyPI package access.
- Prefer lightweight `HEAD` requests where supported; fall back to bounded
  `GET` with a small read limit when a target rejects `HEAD`.
- Treat HTTP 2xx/3xx as target success.
- Use short timeouts, initially around 8 seconds per target, and run probes
  concurrently.
- The manual proxy is considered unavailable when all validation probes fail,
  or when failures clearly indicate the local proxy cannot be reached
  (`ECONNREFUSED`, timeout connecting to proxy, malformed proxy behavior).
  Single-target failures should be reported as partial diagnostics without
  necessarily disabling the manual proxy if other infrastructure targets work.

Manual proxy diagnostics should include the effective policy source. When
manual proxy is active, support logs should report the sanitized manual scheme,
host, and port in addition to any Electron/environment proxy samples, so logs
do not misleadingly imply system proxy resolution is the active CLI path.

### Proxy Failure Feedback Loop

The Electron main process should own a small proxy policy controller rather
than scattering fallback decisions across download/bootstrap modules. The
controller should expose:

```ts
type ProxyFailureSignal = {
  layer: "electron_fetch" | "managed_bootstrap" | "pip" | "yt_dlp" | "gallery_dl";
  targetHost: string | null;
  reason: string;
};

interface NetworkProxyPolicyController {
  getEffectivePolicy(): EffectiveNetworkProxyPolicy;
  markManualProxySuspect(signal: ProxyFailureSignal): void;
}
```

When manual proxy is the effective policy, bootstrap and downloader boundaries
report only proxy-shaped failures to `markManualProxySuspect(...)`. The
controller then:

1. Marks manual proxy as suspect for support logs and Settings status.
2. Temporarily uses system/ambient proxy behavior for future work while
   revalidation runs, so the same broken manual proxy does not cause repeated
   immediate failures.
3. Runs the fixed infrastructure validation against the saved manual proxy using
   an isolated validation path, such as a dedicated Electron session/partition
   configured with the saved manual proxy. Validation must not accidentally test
   the already-fallback system proxy.
4. Restores manual proxy if validation succeeds, or keeps system/ambient
   fallback if validation fails.

Proxy-shaped failures include:

- Electron/Chromium proxy errors such as `ERR_PROXY_CONNECTION_FAILED`,
  `ERR_TUNNEL_CONNECTION_FAILED`, or proxy certificate/tunnel setup failures.
- Child-process stderr that explicitly names proxy failure, such as
  `ProxyError`, `Unable to connect to proxy`, `Tunnel connection failed`, or
  `407 Proxy Authentication Required`.
- Connection refused or timeout that is clearly against the configured proxy
  endpoint, not just the remote content host.

Do not trigger proxy fallback for:

- HTTP 403/404/412/416/429 from the content site.
- Private/unavailable/deleted/region-limited content.
- Login/cookie/auth-required downloader messages.
- yt-dlp extractor errors, requested format errors, or generic site-rule
  changes.
- ffmpeg merge/remux/transcode failures after media bytes were already
  downloaded.

If classification is ambiguous, log it as network evidence but do not switch
proxy policy automatically. The fallback should prefer avoiding false positives
that silently disable a user-selected proxy.

Content-site failures remain part of the download troubleshooting flow. A
YouTube/BiliBili/X/etc. link can fail because of login state, region limits,
account/access rights, anti-bot challenges, or extractor changes. Testing that
link from Settings would often produce an answer Ameow cannot automatically
repair, so the proxy settings surface should stay focused on whether the
configured proxy can reach the infrastructure needed for Ameow operation.

## UI Boundaries

- Settings > System is the likely home for a compact Network / Proxy section.
- The UI should not look like a developer-only form. It should expose:
  - current mode,
  - manual proxy URL field only in manual mode,
  - validation/error state,
  - automatic compact status after input settles.
- The UI state machine should be explicit but not verbose:
  - `system_active`: system/ambient proxy is active.
  - `manual_editing`: user is typing; validation is debounced.
  - `manual_invalid`: URL syntax is unsupported or incomplete.
  - `manual_validating`: saved manual proxy is being checked.
  - `manual_active`: manual proxy is preferred and currently effective.
  - `manual_fallback`: manual proxy is saved but unavailable; system proxy is
    currently being used.
- Main/floating window status may reuse existing proxy status copy only if the
  underlying state is real and not merely a stale config flag.
- Download/bootstrap failure screens should not gain a direct Settings deep
  link in this task. Broader mapping of internal/downloader error codes into
  clearer user-facing explanations is a separate future task. This proxy task
  may add only lightweight proxy wording where it is naturally part of the
  network feature or docs.

## Compatibility

- Missing config keys preserve current behavior.
- Stale historical proxy keys, if any, should not silently enable manual mode.
- Invalid manual proxy config should not break app startup. It should fall back
  to system/ambient behavior and surface an actionable settings error.
- Existing explicit `proxyUrl` tests should remain meaningful; default runtime
  behavior changes only when the persisted manual mode is enabled.

## Trade-Offs

- Manual HTTP(S)-only support does not help users whose proxy tool exposes only
  SOCKS without HTTP relay. The benefit is lower risk and simpler validation.
- Applying manual proxy globally across Ameow-owned network layers is easier to
  explain and support than separate bootstrap/download scopes, but it can
  overroute domestic sites if users intended only YouTube/GitHub traffic. This
  trade-off is accepted for the first release.
- Automatic validation reduces interaction cost, but it also means Settings
  needs debouncing, cancellation, and quiet failure states so typing into the
  field does not feel noisy.
- Per-site proxy rules and PAC support are intentionally deferred because they
  would recreate the unsafe implicit translation problem.
- Keeping failure-message improvements mostly out of scope preserves this task
  as a network/proxy capability instead of turning it into the broader download
  error UX overhaul.

## Rollback

If manual proxy mode causes regressions, config can be switched back to
`system`, and the runtime should behave like current builds. Implementation
should keep the current system/ambient path as the default and avoid destructive
runtime migration.
