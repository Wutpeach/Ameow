export const CLI_PROXY_ENV_KEYS = [
  "HTTPS_PROXY",
  "https_proxy",
  "HTTP_PROXY",
  "http_proxy",
  "ALL_PROXY",
  "all_proxy",
] as const;

export type CliProxyDiagnosticKind =
  | "direct"
  | "http"
  | "socks_unsupported"
  | "mixed_or_pac"
  | "environment"
  | "malformed"
  | "resolution_failed"
  | "skipped_non_ytdlp";

export type CliProxyDiagnostic = {
  kind: CliProxyDiagnosticKind;
  source: "electron" | "environment" | "runtime";
  targetUrl: string | null;
  targetHost: string | null;
  proxyScheme: "http" | "https" | "socks4" | "socks5" | null;
  proxyHost: string | null;
  proxyPort: string | null;
  reason: string;
};

const summarizeTargetHost = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).host || null;
  } catch {
    return null;
  }
};

export const normalizeHttpProxyUrl = (value: string): string | null => {
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

export const parseProxyAddress = (
  scheme: "http" | "https" | "socks4" | "socks5",
  hostPort: string,
): Pick<CliProxyDiagnostic, "proxyScheme" | "proxyHost" | "proxyPort"> | null => {
  let parsed: URL;
  try {
    parsed = new URL(`${scheme}://${hostPort.trim()}`);
  } catch {
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
  return {
    proxyScheme: scheme,
    proxyHost: parsed.hostname,
    proxyPort: parsed.port || null,
  };
};

const createDiagnostic = (
  diagnostic: Pick<CliProxyDiagnostic, "kind" | "source" | "targetUrl" | "reason">
    & Partial<Pick<CliProxyDiagnostic, "proxyScheme" | "proxyHost" | "proxyPort">>,
): CliProxyDiagnostic => ({
  kind: diagnostic.kind,
  source: diagnostic.source,
  targetUrl: diagnostic.targetUrl,
  targetHost: summarizeTargetHost(diagnostic.targetUrl),
  proxyScheme: diagnostic.proxyScheme ?? null,
  proxyHost: diagnostic.proxyHost ?? null,
  proxyPort: diagnostic.proxyPort ?? null,
  reason: diagnostic.reason,
});

export const parseElectronProxyEntries = (proxyRules: string | null | undefined): string[] => (
  proxyRules
    ? proxyRules.split(";").map((entry) => entry.trim()).filter(Boolean)
    : []
);

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

export const buildCliProxyDiagnosticFromElectronProxyRules = (
  proxyRules: string | null | undefined,
  targetUrl: string | null = null,
): CliProxyDiagnostic => {
  const entries = parseElectronProxyEntries(proxyRules);
  if (entries.length === 0 || entries.every((entry) => /^DIRECT$/i.test(entry))) {
    return createDiagnostic({
      kind: "direct",
      source: "electron",
      targetUrl,
      reason: "Electron resolved direct network access for the sampled URL.",
    });
  }

  const proxyEntries = entries.filter((entry) => !/^DIRECT$/i.test(entry));
  const parsedEntries = proxyEntries.map((entry) => {
    const match = /^(PROXY|HTTP|HTTPS|SOCKS4|SOCKS5)\s+(.+)$/i.exec(entry);
    if (!match) {
      return null;
    }
    const rawScheme = match[1]?.toUpperCase();
    const scheme = rawScheme === "HTTPS"
      ? "https"
      : rawScheme === "SOCKS4"
        ? "socks4"
        : rawScheme === "SOCKS5"
          ? "socks5"
          : "http";
    const proxy = parseProxyAddress(scheme, match[2] ?? "");
    return proxy ? { ...proxy, rawScheme } : null;
  });

  if (proxyEntries.length > 1) {
    return createDiagnostic({
      kind: "mixed_or_pac",
      source: "electron",
      targetUrl,
      reason: "Electron returned multiple proxy candidates; Ameow will not collapse rule-based proxy output into one CLI proxy.",
    });
  }

  const parsed = parsedEntries[0] ?? null;
  if (!parsed) {
    return createDiagnostic({
      kind: "malformed",
      source: "electron",
      targetUrl,
      reason: "Electron returned a proxy rule that Ameow could not safely parse.",
    });
  }

  if (parsed.proxyScheme === "socks4" || parsed.proxyScheme === "socks5") {
    return createDiagnostic({
      kind: "socks_unsupported",
      source: "electron",
      targetUrl,
      proxyScheme: parsed.proxyScheme,
      proxyHost: parsed.proxyHost,
      proxyPort: parsed.proxyPort,
      reason: "Electron resolved a SOCKS proxy; Ameow leaves CLI downloads to the user's proxy tool instead of translating it.",
    });
  }

  return createDiagnostic({
    kind: "http",
    source: "electron",
    targetUrl,
    proxyScheme: parsed.proxyScheme,
    proxyHost: parsed.proxyHost,
    proxyPort: parsed.proxyPort,
    reason: "Electron resolved an HTTP(S) proxy for the sampled URL; Ameow records it as diagnostics only.",
  });
};

export const buildCliProxyDiagnosticFromEnvironment = (
  env: Record<string, string | undefined>,
  targetUrl: string | null = null,
): CliProxyDiagnostic => {
  let malformedProxySeen = false;
  for (const key of CLI_PROXY_ENV_KEYS) {
    const rawValue = env[key] ?? "";
    const normalized = normalizeHttpProxyUrl(rawValue);
    if (!rawValue.trim()) {
      continue;
    }
    if (!normalized) {
      let parsed: URL | null = null;
      try {
        parsed = new URL(rawValue.trim());
      } catch {
        malformedProxySeen = true;
      }
      if (parsed?.protocol === "socks4:" || parsed?.protocol === "socks5:") {
        return createDiagnostic({
          kind: "socks_unsupported",
          source: "environment",
          targetUrl,
          proxyScheme: parsed.protocol === "socks4:" ? "socks4" : "socks5",
          proxyHost: parsed.hostname,
          proxyPort: parsed.port || null,
          reason: `Environment variable ${key} contains a SOCKS proxy; Ameow leaves CLI downloads to the user's proxy tool instead of translating it.`,
        });
      }
      malformedProxySeen = true;
      continue;
    }
    const parsed = new URL(normalized);
    return createDiagnostic({
      kind: "environment",
      source: "environment",
      targetUrl,
      proxyScheme: parsed.protocol === "https:" ? "https" : "http",
      proxyHost: parsed.hostname,
      proxyPort: parsed.port || null,
      reason: `Environment variable ${key} contains an HTTP(S) proxy; Ameow records it as diagnostics only.`,
    });
  }

  if (malformedProxySeen) {
    return createDiagnostic({
      kind: "malformed",
      source: "environment",
      targetUrl,
      reason: "Proxy environment variables were present but could not be safely parsed as HTTP(S) proxies.",
    });
  }

  return createDiagnostic({
    kind: "direct",
    source: "environment",
    targetUrl,
    reason: "No supported HTTP(S) proxy environment variable was detected.",
  });
};

export const buildSkippedNonYtdlpProxyDiagnostic = (
  targetUrl: string | null = null,
): CliProxyDiagnostic => createDiagnostic({
  kind: "skipped_non_ytdlp",
  source: "runtime",
  targetUrl,
  reason: "Proxy diagnostics were skipped because the selected engine is not yt-dlp.",
});

export const buildProxyResolutionFailedDiagnostic = (
  targetUrl: string | null,
  error: unknown,
): CliProxyDiagnostic => createDiagnostic({
  kind: "resolution_failed",
  source: "electron",
  targetUrl,
  reason: error instanceof Error && error.message
    ? error.message
    : String(error ?? "Proxy resolution failed."),
});
