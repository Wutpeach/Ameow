# Technical Design

## Design intent

Evolve the existing proxy preference/effective-policy code into one target-specific network resolution pipeline. Keep `electron/main.mts` as the composition root, `src/electron-runtime/service.ts` as the download lifecycle owner, and the existing shared process runner. The change introduces only abstractions with concrete responsibilities: a route value, one resolver, one task context, two engine mappings, and a sanitized diagnostic/error representation.

## Confirmed migration baseline

- Keep persisted `networkProxyMode` / `networkProxyUrl` and the current manual validation/fallback controller unchanged in meaning.
- Keep manual user configuration limited to credential-free HTTP(S). SOCKS support applies only when a system/environment route already resolves to SOCKS; this task does not add a manual SOCKS setting.
- Keep Electron system/manual `session.setProxy(...)` behavior and loopback bypass.
- Replace the current split `diagnoseNetworkProxy()` plus `resolveNetworkProxy(): string | null` path. Do not delete working manual/session/bootstrap code until its caller has moved to the unified route.
- Update the old Trellis contract that says system/environment proxy samples are diagnostics-only. The new contract permits deterministic application only for an explicit parsed route; complex results remain non-applicable to CLI.

## Core contracts

The framework-neutral model should live near existing runtime/core types, not in Electron-specific code:

```ts
type NetworkConsumer =
  | "electron"
  | "yt-dlp"
  | "gallery-dl"
  | "runtime-bootstrap";

type NetworkProxyProtocol = "http" | "https" | "socks4" | "socks5";

type NetworkRoute =
  | {
      mode: "direct";
      source: "system" | "environment" | "direct" | "fallback";
      reason: "resolved_direct" | "no_proxy_match" | "no_proxy_source" | "resolution_fallback";
      resolvedFor: string;
    }
  | {
      mode: "proxy";
      source: "manual" | "system" | "environment";
      protocol: NetworkProxyProtocol;
      proxyUrl: string; // runtime-only sensitive value; never serialized directly
      resolvedFor: string;
    }
  | {
      mode: "complex";
      source: "system" | "environment";
      reason: "pac_or_multiple" | "multiple_candidates" | "malformed" | "unsupported";
      candidates?: ProxyCandidate[];
      resolvedFor: string;
    };

type NetworkRouteResolution = {
  preference: "manual" | "system";
  effectivePolicyReason: string;
  consumer: NetworkConsumer;
  targetUrl: string; // internal only; diagnostic serializer emits safe host/origin
  route: NetworkRoute;
  status: "resolved" | "fallback" | "failed";
  trace: NetworkResolutionStep[];
  failure?: NetworkFailure;
};

type DownloadExecutionContext = {
  network: NetworkRouteResolution;
  diagnostics: {
    executionId: string;
    createdAtMs: number;
  };
};
```

`NetworkRouteResolution` is the authoritative result. `route.resolvedFor` is the exact internal canonical target used for system/environment resolution. A separate serializer produces a credential-free `NetworkDiagnosticSnapshot` whose `resolvedFor` strips userinfo/query/hash and other sensitive components; logs and telemetry must never serialize the internal route object or `proxyUrl` directly. Neither representation may describe the entry-URL decision as a guarantee for every downstream host.

## NetworkRouteService

Create one Electron-composed service/function with injected dependencies:

```ts
interface NetworkRouteService {
  resolveRoute(input: {
    targetUrl: string;
    consumer: NetworkConsumer;
  }): Promise<NetworkRouteResolution>;
}
```

Dependencies are the current effective proxy-policy state, `session.resolveProxy(targetUrl)`, and a snapshot of relevant process environment variables. Runtime/core modules do not import Electron.

### Parsing rules

- Electron results: exact DIRECT; one PROXY/HTTP; one HTTPS; one SOCKS/SOCKS4; one SOCKS5; multiple directives; malformed/unsupported directive.
- Preserve candidate order for diagnostics, but never select the first candidate from a multi-candidate result.
- Environment URL schemes: HTTP, HTTPS, SOCKS4, SOCKS5. Allow runtime credentials for compatibility, but keep them only in the in-memory route and redact every diagnostic/error/log representation.
- Capture upper/lower `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, and `NO_PROXY` once. Adapters do not read `process.env` to decide routing.
- Resolve environment policy completely for `targetUrl`, not to a raw proxy string or rule bundle. `NO_PROXY`/`no_proxy` is evaluated first for the target host/port/domain; a match produces an explicit direct route with source environment. Otherwise HTTPS targets use `HTTPS_PROXY > https_proxy > ALL_PROXY > all_proxy > HTTP_PROXY > http_proxy`; HTTP targets use `HTTP_PROXY > http_proxy > ALL_PROXY > all_proxy`. `NO_PROXY` precedes `no_proxy`, matching the existing uppercase-first convention.
- The first non-empty variable at the applicable precedence level is authoritative. A malformed/unsupported authoritative value produces a complex/unsupported resolution instead of silently choosing a lower-priority variable.
- Every final environment result contains `resolvedFor: targetUrl`. Raw environment values and bypass rules are not passed to engines or logs after resolution.

### Precedence policy

One policy applies to every resolver call:

1. Effective manual proxy.
2. URL-specific Electron/Chromium system result.
3. Captured environment route.
4. Direct.

Detailed behavior:

- Effective manual returns immediately. Saved-but-invalid/unverified/unavailable manual preference already resolves to effective system through the existing controller; diagnostics retain both preference and fallback reason.
- A single supported system directive wins and becomes the route.
- A system multiple/malformed/unsupported result becomes `complex`; it does not silently fall through to environment.
- An explicit system DIRECT is a final direct route with source system and status resolved; the environment tier is never evaluated after it. This is distinct from system-unavailable fallback (source fallback, status fallback, `NETWORK_PROXY_RESOLUTION_FAILED`) and from the default direct route.
- If system resolution throws or is unavailable, evaluate environment as a compatibility fallback and record `status: "fallback"` plus `NETWORK_PROXY_RESOLUTION_FAILED`. If no safe fallback exists, return direct source fallback with the failed step still visible; consumers may choose to fail closed where correctness requires it.

This preserves existing environment-proxy users while eliminating hidden simultaneous sources. The selected final route is the only routing decision an adapter may pass to a child.

### PAC limitation

Electron exposes evaluated directives, not reliable PAC provenance. Multi-candidate results are explicitly complex. A PAC script returning one proxy for the canonical URL is indistinguishable from a fixed system proxy. P0 therefore records `targetUrl` scope and applies that single result consistently to the engine, but does not claim that downstream media hosts would have received the same PAC decision. A sentinel URL does not prove this and is not used. Full host-aware PAC parity is deferred.

## DownloadExecutionContext lifecycle

`ElectronDownloadRuntimeService` creates one lazy route-resolution promise in the queued Job closure. The first engine context request resolves it; engine retry, engine fallback, and auth recovery reuse the same `DownloadExecutionContext`/network object even if the global proxy policy becomes suspect during that Job. Each engine receives an execution view with the same route plus its own application result. Network resolution is refreshed for the next Job, never globally cached.

P0 exposes no implicit refresh path. A future refresh must be an explicit `refreshExecutionContext()` / `rebuildExecutionContext()` operation with observable diagnostics and a new context identity; callers may not hide a second `resolveRoute()` inside retry/recovery code.

Advanced-quality probing must use the same task context and yt-dlp adapter. Existing cookies/user-data `buildExecutionContext` hooks remain separate and are merged after network context creation; they do not re-resolve network state.

## Engine adapters

Adapters own only capability validation and conversion:

```ts
type EngineNetworkApplication = {
  args: string[];
  env: NodeJS.ProcessEnv;
  diagnostic: NetworkEngineApplicationDiagnostic;
};
```

Before adding the selected route, every adapter builds a child environment with all upper/lower HTTP(S)/ALL/NO proxy keys removed. This prevents ambient sources from bypassing the resolved context.

### yt-dlp

- direct: always pass `--proxy ""` (the pinned yt-dlp explicit direct override) and scrub proxy env. Omitting `--proxy` is not a direct decision.
- HTTP/HTTPS: one `--proxy <url>`; scrub proxy env.
- Actual downloads (invocations that may delegate the remote transfer to FFmpegFD — live HLS, `m3u8` protocol, native-HLS fallback, or `--download-sections` are all selected inside yt-dlp after spawn) fail closed on SOCKS4/SOCKS5 before spawn with `NETWORK_PROXY_UNSUPPORTED`: ffmpeg cannot use SOCKS proxies (yt-dlp only forwards HTTP(S) proxy env to ffmpeg), and with ambient env scrubbed ffmpeg would silently go direct. Since protocol/live/fallback selection is unknowable before the command without a metadata preflight, the safe boundary is every actual `runYtDlpDownload` execution.
- Non-downloading invocations (advanced-quality probe `--dump-single-json`) keep yt-dlp-native SOCKS support and call the same adapter without the delegation capability.
- environment source has already become a final direct/proxy route for `resolvedFor`; map it exactly like other final routes and do not pass raw proxy variables or `NO_PROXY`.
- complex/unsupported: fail before spawn with `NETWORK_PROXY_UNSUPPORTED`.

### gallery-dl

- Pinned gallery-dl 1.32.8 exposes `--proxy` and `extractor.*.proxy-env`; upstream documents that `proxy-env=true` collects `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` and Windows Registry settings. Existing `--config-ignore` does not disable this Requests behavior.
- Every gallery-dl execution therefore includes `-o extractor.*.proxy-env=false`, for both direct and proxy routes, so gallery-dl cannot discover a second routing authority from environment or Windows Registry.
- direct additionally passes `--proxy ""`; HTTP/HTTPS/SOCKS4/SOCKS5 passes exactly one `--proxy <url>`. In every case proxy env is scrubbed. Omitting proxy options or only clearing env is invalid.
- complex/unsupported fails before spawn.

No network policy moves into `processRunner`; it remains the generic hidden-process/cancellation boundary.

## Runtime bootstrap

- Managed asset fetch and pip bootstrap reuse the same `NetworkRouteService`, parser, precedence, redaction, and failure taxonomy, but they do not receive or retain a `DownloadExecutionContext`.
- Each bootstrap lifecycle creates its own `RuntimeBootstrapExecutionContext` (or equivalently named context) with its own identity and `resolvedFor`. Asset and package targets resolve at their concrete URL boundary according to that lifecycle; a download Job remains separately stable for the entire Job.
- Managed asset fetch remains Electron-session based. Diagnostics record the route Electron actually applied. When the chosen source is environment after system unavailability/failure, use a small injected route-aware Electron fetch adapter rather than Node global fetch. Unrelated Electron fetch paths are not migrated in P0.
- Pip/bootstrap receives its own `NetworkRouteResolution`, not `manualProxyUrl`. HTTP(S) routes map deterministically; unsupported SOCKS/complex routes fail with a typed bootstrap diagnostic instead of being ignored.

## Diagnostics and errors

Add stable network failure classifications (final spelling may follow existing constants):

- `NETWORK_PROXY_RESOLUTION_FAILED`
- `NETWORK_PROXY_UNSUPPORTED`
- `NETWORK_PROXY_CONNECTION_FAILED`
- `NETWORK_PROXY_AUTH_FAILED`
- `NETWORK_TIMEOUT`
- `NETWORK_DNS_FAILED`
- `NETWORK_TLS_FAILED`
- `NETWORK_UNKNOWN`

Classify from structured process/network errors first and narrow stderr evidence second. Do not treat content 403/404/412/416/429, login/cookie/auth-required content, region/private/unavailable content, extractor failures, or ffmpeg merge/transcode failures as proxy failures.

Each attempt emits a sanitized snapshot containing preference, effective-policy reason, source, safe target host/origin, route mode, protocol, resolution status, engine, applied flag, adapter reason, failure classification, and candidate count. It never contains full proxy URL, userinfo, raw NO_PROXY, cookies, tokens, or unredacted command args/stderr. Existing user-facing coarse `network_proxy` copy may remain; this task changes runtime business diagnostics rather than redesigning UI.

## Telemetry and terminal behavior

- Extend existing telemetry with optional network resolution/application fields to preserve old records/readers.
- Preserve one terminal completion event for success, failure, and cancellation.
- Preserve existing retries and fallback decisions, but attach the stable route and typed network failure to each attempt.
- Preserve raw stderr only as redacted evidence attached to the typed error.

## Expected file responsibilities

Exact names may follow repository conventions, but the minimum responsibility split is:

- framework-neutral route model/parser/redaction with tests;
- Electron route service/resolver wiring with tests;
- `DownloadExecutionContext` integration in existing runtime contracts/service;
- yt-dlp adapter and gallery-dl adapter with tests;
- existing bootstrap, probe, telemetry and error modules updated at their current seams;
- current proxy diagnostics evolved or delegated to the new model, not duplicated;
- relevant public docs and Trellis proxy contracts updated in place.

## Compatibility and rollback

- No persisted config migration and no new user-visible mode.
- Missing config remains system preference. Existing verified manual behavior remains first priority.
- Environment proxy use remains possible, but becomes captured, reported, and deterministic instead of ambient.
- Direct becomes an explicit adapter decision for both engines; gallery-dl Registry/environment discovery is always disabled after route resolution.
- Existing CLI args, cookies, retries, output naming, progress, cancellation, and runtime paths remain owned by current modules.
- Keep changes separable at the route-service/context boundary so reverting the injected resolver restores the previous `proxyUrl` path without touching config storage or UI.
- Do not add a permanent feature flag unless executable evidence shows staged rollout is required.

## Explicitly deferred

- Complete PAC execution/provenance, per-downstream-host route resolution, manual SOCKS/auth settings, proxy credential storage, unrelated Electron fetch migration, full AuthContext, UI redesign, Electron main decomposition, Browser Extension refactor, and directory reorganization.
