export const KNOWN_SHORT_LINK_HOSTS = new Set([
  "t.cn",
  "t.co",
  "bit.ly",
  "tinyurl.com",
  "is.gd",
  "ow.ly",
  "buff.ly",
  "reurl.cc",
  "b23.tv",
  "xhslink.com",
  "v.douyin.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
  "pin.it",
]);

export const normalizeHttpUrl = (value: string | null | undefined): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const normalized = new URL(trimmed).toString();
    return /^https?:\/\//i.test(normalized) ? normalized : undefined;
  } catch {
    return undefined;
  }
};

export const resolveUrlHostname = (value: string | null | undefined): string | undefined => {
  const normalized = normalizeHttpUrl(value);
  if (!normalized) {
    return undefined;
  }

  try {
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    return undefined;
  }
};

export const isKnownShortLinkHost = (hostname: string | null | undefined): boolean => (
  typeof hostname === "string" && KNOWN_SHORT_LINK_HOSTS.has(hostname.toLowerCase())
);

export const isLikelyShortLinkUrl = (value: string | null | undefined): boolean => {
  const hostname = resolveUrlHostname(value);
  return typeof hostname === "string" && isKnownShortLinkHost(hostname);
};
