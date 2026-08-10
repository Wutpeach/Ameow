import { DownloadRuntimeError } from "../core/index.js";
import {
  NETWORK_FAILURE_CLASSIFICATIONS,
  redactNetworkCredentials,
  routeReasonLabel,
  sanitizeOrigin,
  type NetworkConsumer,
  type NetworkFailureClassification,
  type NetworkProxyProtocol,
  type NetworkRoute,
  type NetworkRouteResolution,
} from "../config/networkRoute.js";

/**
 * Engine-specific mapping of one resolved NetworkRoute to CLI arguments and a
 * deterministic child environment. Adapters own capability validation and
 * conversion; NetworkRouteService never builds engine arguments.
 */

/**
 * Actual per-attempt route application outcome reported by an engine.
 * Infrastructure-owned; the runtime attaches it to per-download diagnostics.
 */
export type NetworkApplicationOutcome = {
  engine: string;
  appliedToEngine: boolean;
  reason: string;
  failureClassification: NetworkFailureClassification | null;
};

export type EngineNetworkApplicationDiagnostic = {
  engine: string;
  appliedToEngine: boolean;
  proxyArgCount: number;
  proxyProtocol: NetworkProxyProtocol | null;
  /** Proxy env keys that were actually present in the base environment. */
  envProxyKeysRemoved: string[];
  resolvedFor: string;
  reason: string;
  failureClassification: NetworkFailureClassification | null;
};

export type EngineNetworkApplication = {
  /** Proxy-related args to append to the engine command line. */
  args: string[];
  /** Child environment with every upper/lower proxy key removed. */
  env: NodeJS.ProcessEnv;
  diagnostic: EngineNetworkApplicationDiagnostic;
};

export const PROXY_ENV_KEYS = [
  "HTTP_PROXY",
  "http_proxy",
  "HTTPS_PROXY",
  "https_proxy",
  "ALL_PROXY",
  "all_proxy",
  "NO_PROXY",
  "no_proxy",
] as const;

export const scrubProxyEnvKeys = (
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv => {
  const next: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if ((PROXY_ENV_KEYS as readonly string[]).includes(key)) {
      continue;
    }
    if (value === undefined) {
      continue;
    }
    next[key] = value;
  }
  return next;
};

export const removedProxyEnvKeys = (
  env: NodeJS.ProcessEnv,
): string[] => PROXY_ENV_KEYS.filter((key) => env[key] !== undefined);

export const buildUnsupportedRouteError = (
  route: NetworkRoute,
  scope: string,
): DownloadRuntimeError => new DownloadRuntimeError(
  "E_EXECUTION_FAILED",
  `Unsupported network route (${routeReasonLabel(route)}) for ${scope}; the route is not applied.`,
  {
    // Explicit classification preserves the pre-P1 behavior: an engine that
    // cannot consume the resolved route (e.g. yt-dlp + SOCKS download) stops
    // the candidate chain and surfaces the P0 NETWORK_PROXY_UNSUPPORTED
    // failure instead of silently falling through to another engine. Core no
    // longer derives this from the message text.
    classification: "retry_same_engine",
    context: {
      networkFailureClassification: NETWORK_FAILURE_CLASSIFICATIONS.UNSUPPORTED,
      networkResolvedFor: sanitizeOrigin(route.resolvedFor) ?? "[invalid-target]",
      networkRouteMode: route.mode,
      networkRouteSource: route.source,
    },
  },
);

export const logNetworkApplication = (
  diagnostic: EngineNetworkApplicationDiagnostic,
): void => {
  console.log(`>>> [NetworkRoute] applied: ${JSON.stringify(diagnostic)}`);
};

const buildDiagnostic = (
  engine: string,
  route: NetworkRoute,
  proxyArgCount: number,
  envProxyKeysRemoved: string[],
): EngineNetworkApplicationDiagnostic => ({
  engine,
  appliedToEngine: true,
  proxyArgCount,
  proxyProtocol: route.mode === "proxy" ? route.protocol : null,
  envProxyKeysRemoved,
  resolvedFor: sanitizeOrigin(route.resolvedFor) ?? "[invalid-target]",
  reason: route.mode === "proxy" ? `${route.source}:${route.protocol}` : route.reason,
  failureClassification: null,
});

/** Application diagnostic emitted when a complex route is rejected before spawn. */
export const buildRejectedNetworkApplicationDiagnostic = (
  engine: string,
  route: NetworkRoute,
): EngineNetworkApplicationDiagnostic => ({
  engine,
  appliedToEngine: false,
  proxyArgCount: 0,
  proxyProtocol: route.mode === "proxy" ? route.protocol : null,
  envProxyKeysRemoved: [],
  resolvedFor: sanitizeOrigin(route.resolvedFor) ?? "[invalid-target]",
  reason: routeReasonLabel(route),
  failureClassification: NETWORK_FAILURE_CLASSIFICATIONS.UNSUPPORTED,
});

/**
 * Builds the engine network application for one attempt and reports the
 * actual applied/rejected outcome through the optional callback, so the
 * runtime can record per-download diagnostics without re-resolving the route.
 * The concrete yt-dlp/gallery-dl CLI mapping stays locally closed here;
 * an unknown engine fails closed instead of falling through to yt-dlp.
 */
export const applyNetworkRouteForContext = (
  engine: string,
  network: NetworkRouteResolution | undefined,
  fallbackRoute: NetworkRoute,
  onApplication?: (diagnostic: EngineNetworkApplicationDiagnostic) => void,
  options?: { mayDelegateRemoteNetwork?: boolean },
): EngineNetworkApplication => {
  const route = network?.route ?? fallbackRoute;
  try {
    let application: EngineNetworkApplication;
    if (engine === "yt-dlp") {
      application = buildYtDlpNetworkApplication(route, process.env, options);
    } else if (engine === "gallery-dl") {
      application = buildGalleryDlNetworkApplication(route, process.env);
    } else {
      throw buildUnsupportedRouteError(route, `engine ${engine}`);
    }
    onApplication?.(application.diagnostic);
    return application;
  } catch (error) {
    onApplication?.(buildRejectedNetworkApplicationDiagnostic(engine, route));
    throw error;
  }
};

/**
 * Locally closed engine -> NetworkConsumer mapping used when no explicit
 * composition resolver is injected. Unknown engines fail closed instead of
 * silently defaulting to yt-dlp.
 */
export const resolveEngineNetworkConsumer = (
  engineId: string | undefined,
): NetworkConsumer => {
  if (engineId === "yt-dlp") {
    return "yt-dlp";
  }
  if (engineId === "gallery-dl") {
    return "gallery-dl";
  }
  throw new DownloadRuntimeError(
    "E_ENGINE_NOT_FOUND",
    `No network consumer binding for engine ${engineId ?? "unknown"}`,
    {
      classification: "terminal_for_site",
    },
  );
};

/**
 * Rebuilds a DownloadRuntimeError with a redacted message and an attached
 * network failure classification. Used at the engine failure boundary: raw
 * stderr-derived text never reaches ordinary error/log surfaces unredacted.
 */
export const withNetworkFailureClassification = (
  error: DownloadRuntimeError,
  classification: NetworkFailureClassification | null,
): DownloadRuntimeError => new DownloadRuntimeError(
  error.code,
  redactNetworkCredentials(error.message),
  {
    classification: error.classification,
    cause: error.cause,
    context: classification
      ? { ...error.context, networkFailureClassification: classification }
      : error.context,
  },
);

/**
 * yt-dlp mapping:
 * - direct: explicit `--proxy ""` (missing --proxy is not a direct decision).
 * - proxy: exactly one `--proxy <url>` for HTTP/HTTPS/SOCKS4/SOCKS5.
 * - complex/unsupported: fails before spawn with NETWORK_PROXY_UNSUPPORTED.
 * - SOCKS routes fail closed when `mayDelegateRemoteNetwork` is set: yt-dlp
 *   may hand the remote download to FFmpegFD (live HLS, `m3u8` protocol,
 *   native-HLS fallback, or --download-sections) without any pre-spawn signal,
 *   and ffmpeg cannot use SOCKS proxies (yt-dlp only forwards HTTP(S) proxy
 *   env to ffmpeg; with ambient env scrubbed ffmpeg would silently go direct).
 *   Faithful mapping is impossible, so such invocations reject SOCKS before
 *   spawn. Non-downloading invocations (advanced-quality probe) keep native
 *   SOCKS support.
 * Every invocation scrubs all ambient proxy environment keys.
 */
export const buildYtDlpNetworkApplication = (
  route: NetworkRoute,
  baseEnv: NodeJS.ProcessEnv = process.env,
  options: { mayDelegateRemoteNetwork?: boolean } = {},
): EngineNetworkApplication => {
  if (route.mode === "complex") {
    throw buildUnsupportedRouteError(route, "yt-dlp");
  }
  if (
    options.mayDelegateRemoteNetwork
    && route.mode === "proxy"
    && (route.protocol === "socks4" || route.protocol === "socks5")
  ) {
    throw buildUnsupportedRouteError(route, "yt-dlp download");
  }
  const env = scrubProxyEnvKeys(baseEnv);
  const removedKeys = removedProxyEnvKeys(baseEnv);
  if (route.mode === "direct") {
    return {
      args: ["--proxy", ""],
      env,
      diagnostic: buildDiagnostic("yt-dlp", route, 1, removedKeys),
    };
  }
  return {
    args: ["--proxy", route.proxyUrl],
    env,
    diagnostic: buildDiagnostic("yt-dlp", route, 1, removedKeys),
  };
};

/**
 * gallery-dl mapping:
 * - Every invocation includes `-o extractor.*.proxy-env=false` so Requests
 *   cannot discover a second routing authority from the environment or the
 *   Windows Registry after a route is resolved.
 * - direct: `--proxy ""` plus proxy-env=false.
 * - proxy: exactly one `--proxy <url>` plus proxy-env=false.
 * - complex/unsupported: fails before spawn with NETWORK_PROXY_UNSUPPORTED.
 */
export const buildGalleryDlNetworkApplication = (
  route: NetworkRoute,
  baseEnv: NodeJS.ProcessEnv = process.env,
): EngineNetworkApplication => {
  if (route.mode === "complex") {
    throw buildUnsupportedRouteError(route, "gallery-dl");
  }
  const env = scrubProxyEnvKeys(baseEnv);
  const removedKeys = removedProxyEnvKeys(baseEnv);
  const args = ["-o", "extractor.*.proxy-env=false"];
  if (route.mode === "direct") {
    args.push("--proxy", "");
  } else {
    args.push("--proxy", route.proxyUrl);
  }
  return {
    args,
    env,
    diagnostic: buildDiagnostic("gallery-dl", route, 1, removedKeys),
  };
};
