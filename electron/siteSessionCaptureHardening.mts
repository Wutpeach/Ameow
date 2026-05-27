export type SupplementalCookieRecord = Record<string, string>;

type RequestHeaderMap = Record<string, string | string[] | undefined>;

export type SiteSessionCapturePartitionSetupState = {
  configuredPartitions: Set<string>;
  supplementalCookiesByPartition: Map<string, SupplementalCookieRecord>;
};

export const prepareSiteSessionCapturePartition = (
  state: SiteSessionCapturePartitionSetupState,
  partition: string,
): { supplementalCookies: SupplementalCookieRecord; shouldConfigureSession: boolean } => {
  const supplementalCookies: SupplementalCookieRecord = {};
  state.supplementalCookiesByPartition.set(partition, supplementalCookies);

  if (state.configuredPartitions.has(partition)) {
    return {
      supplementalCookies,
      shouldConfigureSession: false,
    };
  }

  state.configuredPartitions.add(partition);
  return {
    supplementalCookies,
    shouldConfigureSession: true,
  };
};

export const shouldAllowSiteSessionCapturePermission = (): boolean => false;

export const resolveSiteSessionCaptureUserAgent = (rawUserAgent: unknown): string => {
  const fallbackChromeUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
  const sanitized = String(rawUserAgent || "")
    .replace(/\sElectron\/[^\s)]+/gi, "")
    .replace(/\sAmeow\/[^\s)]+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized && /Chrome\//i.test(sanitized) ? sanitized : fallbackChromeUserAgent;
};

export const resolveSiteSessionCaptureAcceptLanguages = (locale: unknown): string => {
  const normalized = String(locale || "").trim();
  if (/^zh/i.test(normalized)) {
    return "zh-CN,zh;q=0.9,en;q=0.8";
  }
  if (/^en/i.test(normalized)) {
    return "en-US,en;q=0.9,zh-CN;q=0.7,zh;q=0.6";
  }
  return "zh-CN,zh;q=0.9,en;q=0.8";
};

export const isUrlForSiteCookieDomains = (
  url: unknown,
  cookieDomains: readonly string[],
): boolean => {
  try {
    const hostname = new URL(String(url || "")).hostname.toLowerCase();
    return cookieDomains.some((domain) => {
      const normalized = String(domain || "").trim().replace(/^\./, "").toLowerCase();
      return normalized.length > 0 && (hostname === normalized || hostname.endsWith(`.${normalized}`));
    });
  } catch {
    return false;
  }
};

export const parseCookieHeader = (cookieHeader: unknown): Array<[string, string]> => (
  String(cookieHeader || "")
    .split(";")
    .map((part) => part.trim())
    .map((part): [string, string] | null => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex <= 0) {
        return null;
      }
      const name = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      return name && value ? [name, value] : null;
    })
    .filter((entry): entry is [string, string] => entry !== null)
);

export const findHeaderValue = (
  headers: RequestHeaderMap | undefined,
  expectedName: string,
): string | null => {
  if (!headers || typeof headers !== "object") {
    return null;
  }
  const expected = expectedName.toLowerCase();
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() !== expected) {
      continue;
    }
    if (typeof value === "string") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.find((item) => typeof item === "string" && item.trim().length > 0) ?? null;
    }
  }
  return null;
};

export const collectSupplementalCookiesFromRequest = (
  options: {
    url: string;
    requestHeaders?: RequestHeaderMap;
    cookieDomains: readonly string[];
    supplementalCookies: SupplementalCookieRecord;
  },
): void => {
  if (!isUrlForSiteCookieDomains(options.url, options.cookieDomains)) {
    return;
  }

  const cookieHeader = findHeaderValue(options.requestHeaders, "cookie");
  for (const [name, value] of parseCookieHeader(cookieHeader)) {
    if (!options.supplementalCookies[name] && value.trim()) {
      options.supplementalCookies[name] = value;
    }
  }

  const url = new URL(options.url);
  const msToken = url.searchParams.get("msToken")?.trim();
  if (msToken && !options.supplementalCookies.msToken) {
    options.supplementalCookies.msToken = msToken;
  }
};
