const CLI_PROXY_ENV_KEYS = [
  "HTTPS_PROXY",
  "https_proxy",
  "HTTP_PROXY",
  "http_proxy",
  "ALL_PROXY",
  "all_proxy",
] as const;

const normalizeHttpProxyUrl = (value: string): string | null => {
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

export const resolveCliProxyUrlFromElectronProxyRules = (
  proxyRules: string | null | undefined,
): string | null => {
  if (!proxyRules) {
    return null;
  }

  for (const rawEntry of proxyRules.split(";")) {
    const entry = rawEntry.trim();
    if (!entry || /^DIRECT$/i.test(entry)) {
      continue;
    }

    const match = /^(PROXY|HTTP|HTTPS)\s+(.+)$/i.exec(entry);
    if (!match) {
      continue;
    }

    const scheme = match[1]?.toUpperCase() === "HTTPS" ? "https" : "http";
    const hostPort = match[2]?.trim();
    if (!hostPort) {
      continue;
    }

    const normalized = normalizeHttpProxyUrl(`${scheme}://${hostPort}`);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

export const resolveCliProxyUrlFromEnvironment = (
  env: Record<string, string | undefined>,
): string | null => {
  for (const key of CLI_PROXY_ENV_KEYS) {
    const normalized = normalizeHttpProxyUrl(env[key] ?? "");
    if (normalized) {
      return normalized;
    }
  }
  return null;
};
