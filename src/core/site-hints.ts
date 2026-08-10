export type KnownSiteHint =
  | "youtube"
  | "bilibili"
  | "twitter-x"
  | "douyin"
  | "xiaohongshu"
  | "pinterest"
  | "weibo"
  | "generic";

/**
 * Safe charset for an opaque site hint carried across transports: site ids in
 * this codebase are lowercase `[a-z0-9_-]` (e.g. `twitter-x`). Anything else
 * is rejected so a new Site never needs to enumerate aliases here while
 * log/telemetry consumers still receive a bounded safe value.
 */
const SAFE_OPAQUE_SITE_HINT_PATTERN = /^[a-z0-9_-]{1,64}$/;

export const normalizeSiteHint = (
  value: string | null | undefined,
): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  switch (normalized) {
    case "youtube":
    case "youtu":
    case "yt":
    case "youtu.be":
      return "youtube";
    case "bilibili":
    case "bili":
    case "b23":
      return "bilibili";
    case "twitter":
    case "x":
    case "twitter-x":
      return "twitter-x";
    case "douyin":
      return "douyin";
    case "xiaohongshu":
    case "xhs":
      return "xiaohongshu";
    case "pinterest":
      return "pinterest";
    case "weibo":
    case "weibo.cn":
      return "weibo";
    case "generic":
      return "generic";
    default:
      // Preserve an explicit unknown hint as a safe opaque id so a new Site
      // can be matched by its own provider without editing this module.
      return SAFE_OPAQUE_SITE_HINT_PATTERN.test(normalized) ? normalized : undefined;
  }
};

export const detectSiteHintFromUrl = (
  value: string | null | undefined,
): KnownSiteHint | undefined => {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const lower = value.toLowerCase();

  if (lower.includes("youtube.com/") || lower.includes("youtu.be/")) {
    return "youtube";
  }
  if (
    lower.includes("bilibili.com/")
    || lower.includes("b23.tv/")
    || lower.includes("bilivideo.com/")
  ) {
    return "bilibili";
  }
  if (lower.includes("twitter.com/") || lower.includes("x.com/")) {
    return "twitter-x";
  }
  if (
    lower.includes("douyin.com/")
    || lower.includes("douyinvod.com/")
    || lower.includes("douyincdn.com/")
    || lower.includes("bytecdn")
    || lower.includes("bytedance")
  ) {
    return "douyin";
  }
  if (
    lower.includes("xiaohongshu.com/")
    || lower.includes("xhslink.com/")
  ) {
    return "xiaohongshu";
  }
  if (
    lower.includes("pinterest.com/")
    || lower.includes("pinimg.com/")
  ) {
    return "pinterest";
  }
  if (
    lower.includes("weibo.com/")
    || lower.includes("weibo.cn/")
    || lower.includes("m.weibo.com/")
    || lower.includes("m.weibo.cn/")
    || lower.includes("video.weibo.com/")
  ) {
    return "weibo";
  }

  return undefined;
};

export const resolveSiteHint = (
  ...values: Array<string | null | undefined>
): string | undefined => {
  for (const value of values) {
    const normalized = normalizeSiteHint(value);
    if (normalized) {
      return normalized;
    }
  }

  for (const value of values) {
    const detected = detectSiteHintFromUrl(value);
    if (detected) {
      return detected;
    }
  }

  return undefined;
};
