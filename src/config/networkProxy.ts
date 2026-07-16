export type NetworkProxyMode = "system" | "manual";

export type ManualNetworkProxy = {
  url: string;
  scheme: "http" | "https";
  host: string;
  port: string | null;
};

export type NetworkProxyConfig = {
  networkProxyMode?: NetworkProxyMode;
  networkProxyUrl?: string;
};

export type EffectiveNetworkProxyPolicy =
  | {
      mode: "system";
      reason:
        | "user_system"
        | "invalid_manual"
        | "manual_unverified"
        | "manual_unavailable";
    }
  | {
      mode: "manual";
      proxyUrl: string;
      verifiedAtMs: number;
    };

export type NetworkProxyValidationTargetId = "github" | "deno" | "pypi";

export type NetworkProxyValidationTargetResult = {
  id: NetworkProxyValidationTargetId;
  url: string;
  ok: boolean;
  status: number | null;
  error: string | null;
};

export type NetworkProxyValidationStatus =
  | "idle"
  | "validating"
  | "available"
  | "unavailable"
  | "invalid";

export type NetworkProxyStatePayload = {
  preferenceMode: NetworkProxyMode;
  configuredProxy: ManualNetworkProxy | null;
  effectivePolicy: EffectiveNetworkProxyPolicy;
  validationStatus: NetworkProxyValidationStatus;
  validationResults: NetworkProxyValidationTargetResult[];
  updatedAtMs: number;
};

export const NETWORK_PROXY_VALIDATION_TARGETS: Array<{
  id: NetworkProxyValidationTargetId;
  url: string;
}> = [
  { id: "github", url: "https://github.com/" },
  { id: "deno", url: "https://dl.deno.land/" },
  { id: "pypi", url: "https://pypi.org/simple/yt-dlp/" },
];

export const normalizeNetworkProxyMode = (value: unknown): NetworkProxyMode => (
  value === "manual" ? "manual" : "system"
);

export const normalizeManualNetworkProxyUrl = (value: unknown): string | null => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  if (!parsed.hostname || parsed.username || parsed.password) {
    return null;
  }
  if (
    (parsed.pathname && parsed.pathname !== "/")
    || parsed.search
    || parsed.hash
  ) {
    return null;
  }

  return `${parsed.protocol}//${parsed.host}`;
};

export const parseManualNetworkProxy = (value: unknown): ManualNetworkProxy | null => {
  const normalized = normalizeManualNetworkProxyUrl(value);
  if (!normalized) {
    return null;
  }

  const parsed = new URL(normalized);
  return {
    url: normalized,
    scheme: parsed.protocol === "https:" ? "https" : "http",
    host: parsed.hostname,
    port: parsed.port || null,
  };
};

export const resolveNetworkProxyConfig = (
  config: Record<string, unknown>,
): {
  preferenceMode: NetworkProxyMode;
  manualProxy: ManualNetworkProxy | null;
} => ({
  preferenceMode: normalizeNetworkProxyMode(config.networkProxyMode),
  manualProxy: parseManualNetworkProxy(config.networkProxyUrl),
});

export const buildManualProxyEnv = (
  proxyUrl: string,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv => ({
  ...baseEnv,
  HTTP_PROXY: proxyUrl,
  HTTPS_PROXY: proxyUrl,
  http_proxy: proxyUrl,
  https_proxy: proxyUrl,
});

export const summarizeManualNetworkProxy = (
  proxyUrl: string | null | undefined,
): Pick<ManualNetworkProxy, "scheme" | "host" | "port"> | null => {
  const parsed = parseManualNetworkProxy(proxyUrl);
  return parsed
    ? {
        scheme: parsed.scheme,
        host: parsed.host,
        port: parsed.port,
      }
    : null;
};

const PROXY_FAILURE_PATTERNS = [
  "ERR_PROXY_CONNECTION_FAILED",
  "ERR_TUNNEL_CONNECTION_FAILED",
  "ProxyError",
  "Unable to connect to proxy",
  "Tunnel connection failed",
  "407 Proxy Authentication Required",
  "proxy connect aborted",
  "proxy connection failed",
  "proxy server refused",
  "tunneling socket could not be established",
];

const summarizeUnknownError = (error: unknown): string => {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error ?? "");
};

export const isProxyShapedFailure = (
  error: unknown,
  proxyUrl: string | null | undefined = null,
): boolean => {
  const summary = summarizeUnknownError(error);
  if (!summary) {
    return false;
  }

  if (PROXY_FAILURE_PATTERNS.some((pattern) => summary.toLowerCase().includes(pattern.toLowerCase()))) {
    return true;
  }

  const manualProxy = parseManualNetworkProxy(proxyUrl);
  if (!manualProxy) {
    return false;
  }

  const proxyEndpoint = manualProxy.port
    ? `${manualProxy.host}:${manualProxy.port}`
    : manualProxy.host;
  const lowerSummary = summary.toLowerCase();
  return lowerSummary.includes(proxyEndpoint.toLowerCase())
    && (
      lowerSummary.includes("econnrefused")
      || lowerSummary.includes("connection refused")
      || lowerSummary.includes("etimedout")
      || lowerSummary.includes("timed out")
      || lowerSummary.includes("timeout")
    );
};
