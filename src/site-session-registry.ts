import { SITE_SESSION_CONFIGS } from "./site-sessions.js";
import type {
  SiteSessionEngineHint,
  SiteSessionRegistryEntry,
} from "./types/siteSession.js";

const STATIC_ENGINE_HINTS: Record<string, SiteSessionEngineHint[]> = {
  douyin: ["douyin-dl"],
  bilibili: ["yt-dlp"],
  xiaohongshu: ["yt-dlp"],
  youtube: ["yt-dlp"],
  instagram: ["yt-dlp", "gallery-dl"],
};

const normalizeHostFromUrl = (url: string): string => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
};

export const createSeedSiteSessionRegistryEntry = (
  config: typeof SITE_SESSION_CONFIGS[number],
  nowMs: number,
): SiteSessionRegistryEntry => ({
  siteId: config.id,
  displayName: config.displayName,
  labelKey: config.labelKey,
  primaryUrl: config.loginUrl,
  primaryHost: normalizeHostFromUrl(config.loginUrl),
  cookieDomains: [...config.cookieDomains],
  requiredCookieKeys: [...config.requiredCookieKeys],
  loginCookieKeys: [...config.loginCookieKeys],
  syncAuthorization: "seeded",
  autoSyncAllowed: true,
  discoverySources: ["seed"],
  engineHints: STATIC_ENGINE_HINTS[config.id] ?? [],
  visibility: "visible",
  icon: {
    kind: "known",
    key: config.id,
  },
  createdAtMs: nowMs,
  updatedAtMs: nowMs,
});

export const createSeedSiteSessionRegistryEntries = (
  nowMs: number,
): SiteSessionRegistryEntry[] => SITE_SESSION_CONFIGS.map((config) => (
  createSeedSiteSessionRegistryEntry(config, nowMs)
));
