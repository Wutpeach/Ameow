export const GLOBAL_PROXY_ENABLED_CONFIG_KEY = "globalProxyEnabled";
export const GLOBAL_PROXY_URL_CONFIG_KEY = "globalProxyUrl";

const ALLOWED_PROXY_PROTOCOLS = new Set([
  "http:",
  "https:",
  "socks4:",
  "socks5:",
]);

export type GlobalProxyValidationErrorCode =
  | "missing_url"
  | "invalid_url"
  | "unsupported_protocol"
  | "auth_unsupported"
  | "path_unsupported";

export type GlobalProxyValidationResult = {
  enabled: boolean;
  normalizedUrl: string | null;
  errorCode: GlobalProxyValidationErrorCode | null;
};

export const normalizeGlobalProxyUrlInput = (value: unknown): string => (
  typeof value === "string" ? value.trim() : ""
);

export const resolveGlobalProxyEnabled = (config: Record<string, unknown>): boolean => (
  config[GLOBAL_PROXY_ENABLED_CONFIG_KEY] === true
);

export const resolveStoredGlobalProxyUrl = (config: Record<string, unknown>): string => (
  normalizeGlobalProxyUrlInput(config[GLOBAL_PROXY_URL_CONFIG_KEY])
);

export const validateGlobalProxySettings = (
  config: Record<string, unknown>,
): GlobalProxyValidationResult => {
  const enabled = resolveGlobalProxyEnabled(config);
  if (!enabled) {
    return {
      enabled: false,
      normalizedUrl: null,
      errorCode: null,
    };
  }

  const rawUrl = resolveStoredGlobalProxyUrl(config);
  if (!rawUrl) {
    return {
      enabled: true,
      normalizedUrl: null,
      errorCode: "missing_url",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      enabled: true,
      normalizedUrl: null,
      errorCode: "invalid_url",
    };
  }

  if (!ALLOWED_PROXY_PROTOCOLS.has(parsed.protocol)) {
    return {
      enabled: true,
      normalizedUrl: null,
      errorCode: "unsupported_protocol",
    };
  }

  if (parsed.username || parsed.password) {
    return {
      enabled: true,
      normalizedUrl: null,
      errorCode: "auth_unsupported",
    };
  }

  if (!parsed.hostname) {
    return {
      enabled: true,
      normalizedUrl: null,
      errorCode: "invalid_url",
    };
  }

  if (
    (parsed.pathname && parsed.pathname !== "/")
    || parsed.search
    || parsed.hash
  ) {
    return {
      enabled: true,
      normalizedUrl: null,
      errorCode: "path_unsupported",
    };
  }

  return {
    enabled: true,
    normalizedUrl: `${parsed.protocol}//${parsed.host}`,
    errorCode: null,
  };
};

export const describeGlobalProxyValidationError = (
  errorCode: GlobalProxyValidationErrorCode,
): string => {
  switch (errorCode) {
    case "missing_url":
      return "Global proxy URL is required when custom proxy is enabled.";
    case "invalid_url":
      return "Global proxy URL must be a valid absolute URL.";
    case "unsupported_protocol":
      return "Global proxy URL must use http, https, socks4, or socks5.";
    case "auth_unsupported":
      return "Proxy usernames and passwords are not supported in the current global proxy setting.";
    case "path_unsupported":
      return "Global proxy URL cannot include a path, query string, or hash fragment.";
    default:
      return "Invalid global proxy configuration.";
  }
};
