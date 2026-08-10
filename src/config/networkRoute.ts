import {
  parseElectronProxyEntries,
  parseProxyAddress,
} from "./cliProxy.js";

/**
 * Framework-neutral network route model.
 *
 * The route is the single authoritative routing decision a download/runtime
 * consumer may apply to a child process. It is resolved for one canonical
 * `resolvedFor` target URL and must never be described as a global route for
 * every downstream host (especially for system/PAC results).
 */

/**
 * Transport diagnostic / route consumer label. Known built-in values
 * (electron, yt-dlp, gallery-dl, runtime-bootstrap) stay valid; opaque
 * engines carry their own canonical non-blank consumer label so a new engine
 * never requires editing this module. Composition points validate the label
 * (see EngineRuntimeBindingRegistry.register).
 */
export type NetworkConsumer =
  | "electron"
  | "yt-dlp"
  | "gallery-dl"
  | "runtime-bootstrap"
  | (string & {});

export type NetworkProxyProtocol = "http" | "https" | "socks4" | "socks5";

export type ProxyCandidate = {
  protocol: NetworkProxyProtocol;
  host: string;
  port: string | null;
};

export type NetworkRoute =
  | {
      mode: "direct";
      source: "system" | "environment" | "direct" | "fallback";
      reason:
        | "resolved_direct"
        | "no_proxy_match"
        | "no_proxy_source"
        | "resolution_fallback";
      resolvedFor: string;
    }
  | {
      mode: "proxy";
      source: "manual" | "system" | "environment";
      protocol: NetworkProxyProtocol;
      /** Runtime-only sensitive value. Never serialize directly; use sanitizers. */
      proxyUrl: string;
      resolvedFor: string;
    }
  | {
      mode: "complex";
      source: "system" | "environment";
      reason: "pac_or_multiple" | "multiple_candidates" | "malformed" | "unsupported";
      candidates?: ProxyCandidate[];
      resolvedFor: string;
    };

export type NetworkRouteSource = NetworkRoute["source"];

export type NetworkResolutionTier = "manual" | "system" | "environment" | "direct";

export type NetworkResolutionStep = {
  tier: NetworkResolutionTier;
  outcome: "applied" | "direct" | "complex" | "unavailable" | "failed";
  detail: string;
};

export type NetworkRouteResolution = {
  preference: "manual" | "system";
  effectivePolicyReason: string | null;
  consumer: NetworkConsumer;
  /** Internal canonical target used for system/environment resolution. */
  targetUrl: string;
  route: NetworkRoute;
  status: "resolved" | "fallback" | "failed";
  trace: NetworkResolutionStep[];
  failure?: NetworkFailure;
};

export const NETWORK_FAILURE_CLASSIFICATIONS = {
  RESOLUTION_FAILED: "NETWORK_PROXY_RESOLUTION_FAILED",
  UNSUPPORTED: "NETWORK_PROXY_UNSUPPORTED",
  CONNECTION_FAILED: "NETWORK_PROXY_CONNECTION_FAILED",
  AUTH_FAILED: "NETWORK_PROXY_AUTH_FAILED",
  TIMEOUT: "NETWORK_TIMEOUT",
  DNS_FAILED: "NETWORK_DNS_FAILED",
  TLS_FAILED: "NETWORK_TLS_FAILED",
  UNKNOWN: "NETWORK_UNKNOWN",
} as const;

export type NetworkFailureClassification =
  (typeof NETWORK_FAILURE_CLASSIFICATIONS)[keyof typeof NETWORK_FAILURE_CLASSIFICATIONS];

export type NetworkFailure = {
  classification: NetworkFailureClassification;
  message: string;
};

export type NetworkDiagnosticSnapshot = {
  preference: "manual" | "system";
  effectivePolicyReason: string | null;
  source: NetworkRouteSource;
  /** Sanitized target: origin only, no userinfo/query/hash. */
  resolvedFor: string;
  routeMode: NetworkRoute["mode"];
  proxyProtocol: NetworkProxyProtocol | null;
  proxyHost: string | null;
  proxyPort: string | null;
  resolutionStatus: NetworkRouteResolution["status"];
  consumer: NetworkConsumer;
  engine: string | null;
  appliedToEngine: boolean;
  reason: string;
  failureClassification: NetworkFailureClassification | null;
  candidateCount: number;
};

/** Origin-only sanitizer: strips userinfo, query, hash, and path. */
export const sanitizeOrigin = (value: string): string | null => {
  try {
    const parsed = new URL(value);
    return parsed.host
      ? `${parsed.protocol}//${parsed.host}`
      : null;
  } catch {
    return null;
  }
};

/**
 * Redacts embedded proxy credentials, cookies, and token values in arbitrary
 * text (error messages, stderr tails, command args). Applied at every ordinary
 * logging/telemetry boundary introduced by the network refactor. Classification
 * keywords survive because they do not sit in value positions.
 */
export const redactNetworkCredentials = (value: string): string => {
  if (!value) {
    return value;
  }
  return value
    // Userinfo ends at the final "@" before the host, so consume everything up
    // to that delimiter; a raw userinfo containing an extra "@" must not leak
    // the remaining password fragment.
    .replace(/\b([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^/\s]*@/g, "$1***@")
    .replace(/\b(bearer|basic)\s+[a-z0-9._~+/=-]+/gi, "$1 ***")
    .replace(
      /\b(access[_-]?token|refresh[_-]?token|api[_-]?key|apikey|token|secret|password|passwd|authorization|proxy-authorization)(\s*[=:]\s*)([^\s;"']+)/gi,
      "$1$2***",
    )
    .replace(/\bcookie(?:s)?(\s*[=:]\s*)([^\s;"']+)/gi, "cookie$1***");
};

const summarizeError = (error: unknown): string => (
  redactNetworkCredentials(
    error instanceof Error && error.message ? error.message : String(error ?? ""),
  )
);

export const routeReasonLabel = (route: NetworkRoute): string => {
  switch (route.mode) {
    case "direct":
      return route.reason;
    case "proxy":
      return `${route.source}:${route.protocol}`;
    case "complex":
      return route.reason;
  }
};

export const toNetworkDiagnosticSnapshot = (
  resolution: NetworkRouteResolution,
  options: {
    engine?: string | null;
    appliedToEngine?: boolean;
  } = {},
): NetworkDiagnosticSnapshot => {
  const route = resolution.route;
  const proxy = route.mode === "proxy"
    ? (() => {
        try {
          const parsed = new URL(route.proxyUrl);
          return {
            host: parsed.hostname || null,
            port: parsed.port || null,
          };
        } catch {
          return { host: null, port: null };
        }
      })()
    : { host: null, port: null };
  const candidateCount = route.mode === "complex"
    ? route.candidates?.length ?? 0
    : 0;

  return {
    preference: resolution.preference,
    effectivePolicyReason: resolution.effectivePolicyReason,
    source: route.source,
    resolvedFor: sanitizeOrigin(route.resolvedFor) ?? "[invalid-target]",
    routeMode: route.mode,
    proxyProtocol: route.mode === "proxy" ? route.protocol : null,
    proxyHost: proxy.host,
    proxyPort: proxy.port,
    resolutionStatus: resolution.status,
    consumer: resolution.consumer,
    engine: options.engine ?? null,
    appliedToEngine: options.appliedToEngine ?? false,
    reason: routeReasonLabel(route),
    failureClassification: resolution.failure?.classification ?? null,
    candidateCount,
  };
};

/** Final fallback used when the injected resolver is unavailable or throws. */
export const buildResolutionFailureFallbackRoute = (
  targetUrl: string,
  consumer: NetworkConsumer,
  error: unknown,
): NetworkRouteResolution => ({
  preference: "system",
  effectivePolicyReason: "user_system",
  consumer,
  targetUrl,
  route: {
    mode: "direct",
    source: "fallback",
    reason: "resolution_fallback",
    resolvedFor: targetUrl,
  },
  status: "failed",
  trace: [
    {
      tier: "system",
      outcome: "failed",
      detail: "Route resolution failed; direct fallback used.",
    },
  ],
  failure: {
    classification: NETWORK_FAILURE_CLASSIFICATIONS.RESOLUTION_FAILED,
    message: summarizeError(error) || "Route resolution failed",
  },
});

export const buildDirectRouteResolution = (
  targetUrl: string,
  consumer: NetworkConsumer,
  options: {
    source: "system" | "direct" | "fallback";
    reason: "resolved_direct" | "no_proxy_source" | "resolution_fallback";
    preference?: "manual" | "system";
    effectivePolicyReason?: string | null;
    status?: "resolved" | "fallback" | "failed";
    trace?: NetworkResolutionStep[];
    failure?: NetworkFailure;
  },
): NetworkRouteResolution => ({
  preference: options.preference ?? "system",
  effectivePolicyReason: options.effectivePolicyReason ?? null,
  consumer,
  targetUrl,
  route: {
    mode: "direct",
    source: options.source,
    reason: options.reason,
    resolvedFor: targetUrl,
  },
  status: options.status ?? "resolved",
  trace: options.trace ?? [],
  ...(options.failure ? { failure: options.failure } : {}),
});

/**
 * Environment proxy resolution for a specific target URL.
 *
 * Precedence (uppercase first, single authoritative value):
 * - NO_PROXY / no_proxy is evaluated first; a match produces an explicit
 *   direct route before any proxy variable is considered.
 * - HTTPS targets: HTTPS_PROXY > https_proxy > ALL_PROXY > all_proxy
 *   > HTTP_PROXY > http_proxy.
 * - HTTP targets: HTTP_PROXY > http_proxy > ALL_PROXY > all_proxy.
 * - Other schemes: ALL_PROXY > all_proxy.
 * - The first non-empty variable at the applicable precedence level is
 *   authoritative. A malformed/unsupported authoritative value produces a
 *   complex route instead of silently choosing a lower-priority variable.
 *
 * Credentials are allowed for compatibility but live only in the in-memory
 * route; every diagnostic/error representation redacts them.
 */
export const resolveEnvironmentRouteForTarget = (
  env: Record<string, string | undefined>,
  targetUrl: string,
): NetworkRoute => {
  const noProxyValue = (env.NO_PROXY ?? env.no_proxy ?? "").trim();
  if (noProxyValue && matchesNoProxy(targetUrl, noProxyValue)) {
    return {
      mode: "direct",
      source: "environment",
      reason: "no_proxy_match",
      resolvedFor: targetUrl,
    };
  }

  let scheme = "";
  try {
    scheme = new URL(targetUrl).protocol;
  } catch {
    scheme = "";
  }

  const httpsKeys = [
    "HTTPS_PROXY",
    "https_proxy",
    "ALL_PROXY",
    "all_proxy",
    "HTTP_PROXY",
    "http_proxy",
  ] as const;
  const httpKeys = [
    "HTTP_PROXY",
    "http_proxy",
    "ALL_PROXY",
    "all_proxy",
  ] as const;
  const fallbackKeys = ["ALL_PROXY", "all_proxy"] as const;

  const chain = scheme === "https:"
    ? httpsKeys
    : scheme === "http:"
      ? httpKeys
      : fallbackKeys;

  for (const key of chain) {
    const rawValue = (env[key] ?? "").trim();
    if (!rawValue) {
      continue;
    }
    const parsed = parseEnvironmentProxyValue(rawValue);
    if (parsed) {
      return {
        mode: "proxy",
        source: "environment",
        protocol: parsed.protocol,
        proxyUrl: parsed.proxyUrl,
        resolvedFor: targetUrl,
      };
    }
    return {
      mode: "complex",
      source: "environment",
      reason: isSocksLikeEnvironmentValue(rawValue) ? "unsupported" : "malformed",
      resolvedFor: targetUrl,
    };
  }

  return {
    mode: "direct",
    source: "environment",
    reason: "no_proxy_source",
    resolvedFor: targetUrl,
  };
};

const isSocksLikeEnvironmentValue = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "socks4:" || parsed.protocol === "socks5:"
      ? false
      : parsed.protocol === "ftp:" || parsed.protocol === "socks:";
  } catch {
    return false;
  }
};

/**
 * Parses an environment proxy value. Supports http/https/socks4/socks5 with
 * optional credentials (kept in-memory only). Rejects scheme-less values,
 * ftp/other schemes, and values with path/query/hash.
 */
export const parseEnvironmentProxyValue = (
  value: string,
): { protocol: NetworkProxyProtocol; proxyUrl: string } | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  let protocol: NetworkProxyProtocol | null = null;
  if (parsed.protocol === "http:") {
    protocol = "http";
  } else if (parsed.protocol === "https:") {
    protocol = "https";
  } else if (parsed.protocol === "socks4:") {
    protocol = "socks4";
  } else if (parsed.protocol === "socks5:") {
    protocol = "socks5";
  }
  if (!protocol || !parsed.hostname) {
    return null;
  }
  if (
    (parsed.pathname && parsed.pathname !== "/")
    || parsed.search
    || parsed.hash
  ) {
    return null;
  }

  // The URL parser already percent-encodes userinfo (e.g. "user%40corp");
  // re-encoding would double-encode it and break proxy auth. Emit the
  // normalized encoded form exactly once, keeping the delimiter for each
  // partial form (username-only, password-only, both). Encoded ":"/"@" can
  // never act as delimiters again.
  const username = parsed.username;
  const password = parsed.password;
  const credentials = username && password
    ? `${username}:${password}@`
    : username
      ? `${username}@`
      : password
        ? `:${password}@`
        : "";
  return {
    protocol,
    proxyUrl: `${parsed.protocol}//${credentials}${parsed.host}`,
  };
};

const normalizeNoProxyHost = (value: string): string => {
  const trimmed = value.trim().replace(/^\./, "").toLowerCase();
  return trimmed.startsWith("[") && trimmed.endsWith("]")
    ? trimmed.slice(1, -1)
    : trimmed;
};

/**
 * NO_PROXY / no_proxy matching for the target URL host/port/domain.
 * Supports "*", host, ".domain", subdomain matching, IPv6 literals, and
 * optional :port entries.
 */
export const matchesNoProxy = (targetUrl: string, noProxyValue: string): boolean => {
  let target: URL;
  try {
    target = new URL(targetUrl);
  } catch {
    return false;
  }
  if (!target.hostname) {
    return false;
  }
  const targetHost = normalizeNoProxyHost(target.hostname);
  const targetPort = target.port || (target.protocol === "https:" ? "443" : target.protocol === "http:" ? "80" : "");

  const entries = noProxyValue
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of entries) {
    if (entry === "*") {
      return true;
    }
    let hostPart = entry;
    let portPart = "";
    if (entry.startsWith("[")) {
      const closingBracket = entry.indexOf("]");
      if (closingBracket < 0) {
        continue;
      }
      hostPart = entry.slice(0, closingBracket + 1);
      const remainder = entry.slice(closingBracket + 1);
      if (remainder.startsWith(":")) {
        portPart = remainder.slice(1);
      }
    } else {
      const colonIndex = entry.lastIndexOf(":");
      if (colonIndex > 0 && entry.indexOf(":") === colonIndex) {
        hostPart = entry.slice(0, colonIndex);
        portPart = entry.slice(colonIndex + 1);
      }
    }
    if (portPart && portPart !== targetPort) {
      continue;
    }
    const normalizedHost = normalizeNoProxyHost(hostPart);
    if (!normalizedHost) {
      continue;
    }
    if (
      normalizedHost === targetHost
      || targetHost.endsWith(`.${normalizedHost}`)
    ) {
      return true;
    }
  }

  return false;
};

/**
 * Parses Electron `session.resolveProxy(targetUrl)` output into a route.
 *
 * - All-DIRECT entries produce a direct outcome.
 * - Exactly one PROXY/HTTP/HTTPS/SOCKS4/SOCKS5/SOCKS directive (DIRECT
 *   fallbacks ignored) is mappable to a proxy route for the canonical target.
 * - Multiple proxy directives are never collapsed; they produce a complex
 *   route.
 * - Malformed addresses or unrecognized directives produce a complex route.
 * - Credentials in system rules are rejected (Chromium output never carries
 *   them; treating them as malformed avoids credential-bearing routes).
 */
export const parseElectronProxyRulesToRoute = (
  proxyRules: string | null | undefined,
  targetUrl: string,
): { kind: "direct" }
  | { kind: "proxy"; route: Extract<NetworkRoute, { mode: "proxy" }> }
  | { kind: "complex"; route: Extract<NetworkRoute, { mode: "complex" }> } => {
  const entries = parseElectronProxyEntries(proxyRules);
  if (entries.length === 0 || entries.every((entry) => /^DIRECT$/i.test(entry))) {
    return { kind: "direct" };
  }

  type ParsedSystemEntry =
    | { kind: "direct" }
    | {
        kind: "proxy";
        rawScheme: string;
        protocol: NetworkProxyProtocol;
        host: string;
        port: string | null;
      }
    | { kind: "unsupported"; rawScheme: string }
    | { kind: "malformed" };

  const parsedEntries: ParsedSystemEntry[] = entries.map((entry) => {
    if (/^DIRECT$/i.test(entry)) {
      return { kind: "direct" };
    }
    const match = /^([A-Za-z0-9]+)\s+(.+)$/.exec(entry);
    if (!match) {
      return { kind: "malformed" };
    }
    const rawScheme = match[1]?.toUpperCase() ?? "";
    const scheme = rawScheme === "HTTPS"
      ? "https"
      : rawScheme === "SOCKS4"
        ? "socks4"
        : rawScheme === "SOCKS5"
          ? "socks5"
          : rawScheme === "SOCKS"
            ? "socks4"
            : rawScheme === "PROXY" || rawScheme === "HTTP"
              ? "http"
              : null;
    if (!scheme) {
      return { kind: "unsupported", rawScheme };
    }
    const address = parseProxyAddress(scheme, match[2] ?? "");
    if (!address) {
      return { kind: "malformed" };
    }
    return {
      kind: "proxy",
      rawScheme,
      protocol: scheme,
      host: address.proxyHost ?? "",
      port: address.proxyPort,
    };
  });

  const proxyEntries = parsedEntries.filter(
    (entry): entry is Extract<ParsedSystemEntry, { kind: "proxy" }> => entry.kind === "proxy",
  );
  const malformed = parsedEntries.some((entry) => entry.kind === "malformed");
  const unsupported = parsedEntries.some((entry) => entry.kind === "unsupported");

  if (proxyEntries.length > 1) {
    return {
      kind: "complex",
      route: {
        mode: "complex",
        source: "system",
        reason: "multiple_candidates",
        candidates: proxyEntries.map((entry) => ({
          protocol: entry.protocol,
          host: entry.host,
          port: entry.port,
        })),
        resolvedFor: targetUrl,
      },
    };
  }

  if (proxyEntries.length === 0) {
    return {
      kind: "complex",
      route: {
        mode: "complex",
        source: "system",
        reason: unsupported ? "unsupported" : "malformed",
        resolvedFor: targetUrl,
      },
    };
  }

  const candidate = proxyEntries[0];
  if (!candidate || malformed || unsupported) {
    return {
      kind: "complex",
      route: {
        mode: "complex",
        source: "system",
        reason: malformed ? "malformed" : "unsupported",
        resolvedFor: targetUrl,
      },
    };
  }

  const endpoint = candidate.port ? `${candidate.host}:${candidate.port}` : candidate.host;
  return {
    kind: "proxy",
    route: {
      mode: "proxy",
      source: "system",
      protocol: candidate.protocol,
      proxyUrl: `${candidate.protocol}://${endpoint}`,
      resolvedFor: targetUrl,
    },
  };
};

/**
 * Content-level failure markers that must never be classified as proxy
 * failures: HTTP 403/404/412/416/429, login/cookie/auth-required content,
 * region/private/unavailable content, extractor failures, or ffmpeg merge
 * failures.
 */
const NON_PROXY_FAILURE_PATTERNS = [
  /\bHTTP Error (?:403|404|412|416|429)\b/i,
  /\b(?:403|404|412|416|429)\s+(?:Forbidden|Not Found|Too Many Requests)\b/i,
  /\bSign in to confirm you're not a bot\b/i,
  /\bcookies? required\b/i,
  /\blogin required\b/i,
  /\bauth(?:entication|orization)? required\b/i,
  /\bregion(?:al)? (?:restricted|locked|unavailable)\b/i,
  /\bprivate (?:video|account|content)\b/i,
  /\bffmpeg\b.*\b(?:merge|transcode|error)\b/i,
];

const PROXY_AUTH_PATTERNS = [
  /\b407\b/,
  /\bProxy Authentication Required\b/i,
  /\bproxy authentication\b/i,
  /\bauthentication.*proxy\b/i,
];

const PROXY_CONNECTION_PATTERNS = [
  /\bERR_PROXY_CONNECTION_FAILED\b/i,
  /\bERR_TUNNEL_CONNECTION_FAILED\b/i,
  /\bUnable to connect to proxy\b/i,
  /\btunnel connection failed\b/i,
  /\btunneling socket could not be established\b/i,
  /\bproxy connect aborted\b/i,
  /\bproxy connection failed\b/i,
  /\bproxy server refused\b/i,
  /\bCannot connect to proxy\b/i,
  /\bProxyError\b/i,
  /\bCannot determine proxy settings\b/i,
];

const TLS_PATTERNS = [
  /\bCERT_[A-Z_]+/i,
  /\bcertificate (?:verify )?failed\b/i,
  /\bself[- ]signed certificate\b/i,
  /\bSSL(?:Error|_ERROR)\b/i,
  /\bTLS[A-Z0-9_]*/i,
  /\bunable to get local issuer certificate\b/i,
];

const TIMEOUT_PATTERNS = [
  /\btimed? ?out\b/i,
  /\bETIMEDOUT\b/i,
  /\bERR_TIMED_OUT\b/i,
  /\bstalled\b/i,
];

const DNS_PATTERNS = [
  /\bENOTFOUND\b/i,
  /\bEAI_AGAIN\b/i,
  /\bCould not resolve host\b/i,
  /\bName or service not known\b/i,
  /\bgetaddrinfo\b/i,
  /\bERR_NAME_NOT_RESOLVED\b/i,
];

const CONNECTION_PATTERNS = [
  /\bECONNREFUSED\b/i,
  /\bECONNRESET\b/i,
  /\bEPIPE\b/i,
  /\bconnection refused\b/i,
  /\bconnection reset\b/i,
  /\bnetwork is unreachable\b/i,
  /\bENETUNREACH\b/i,
  /\bEHOSTUNREACH\b/i,
];

const textMatchesAny = (text: string, patterns: readonly RegExp[]): boolean => (
  patterns.some((pattern) => pattern.test(text))
);

/**
 * Classifies a network failure from structured error evidence first, and
 * narrowed stderr evidence second. Content-level failures (403/404/412/416/
 * 429, login/cookie/region/private, extractor, ffmpeg merge) are never
 * classified as proxy failures.
 */
export const classifyNetworkFailure = (
  error: unknown,
  stderrLines: readonly string[] = [],
): NetworkFailureClassification => {
  const errorText = summarizeError(error);
  const evidence = [errorText, ...stderrLines].filter(Boolean).join("\n");
  if (!evidence.trim()) {
    return NETWORK_FAILURE_CLASSIFICATIONS.UNKNOWN;
  }

  // Proxy authentication markers (407 / "Proxy Authentication Required") are
  // checked before the content-level non-proxy markers so a proxy 407 is not
  // swallowed by the generic auth-required-content pattern.
  if (textMatchesAny(evidence, PROXY_AUTH_PATTERNS)) {
    return NETWORK_FAILURE_CLASSIFICATIONS.AUTH_FAILED;
  }
  if (textMatchesAny(evidence, NON_PROXY_FAILURE_PATTERNS)) {
    return NETWORK_FAILURE_CLASSIFICATIONS.UNKNOWN;
  }
  if (textMatchesAny(evidence, PROXY_CONNECTION_PATTERNS)) {
    return NETWORK_FAILURE_CLASSIFICATIONS.CONNECTION_FAILED;
  }
  if (textMatchesAny(evidence, TLS_PATTERNS)) {
    return NETWORK_FAILURE_CLASSIFICATIONS.TLS_FAILED;
  }
  if (textMatchesAny(evidence, TIMEOUT_PATTERNS)) {
    return NETWORK_FAILURE_CLASSIFICATIONS.TIMEOUT;
  }
  if (textMatchesAny(evidence, DNS_PATTERNS)) {
    return NETWORK_FAILURE_CLASSIFICATIONS.DNS_FAILED;
  }
  if (textMatchesAny(evidence, CONNECTION_PATTERNS)) {
    return NETWORK_FAILURE_CLASSIFICATIONS.CONNECTION_FAILED;
  }
  return NETWORK_FAILURE_CLASSIFICATIONS.UNKNOWN;
};
