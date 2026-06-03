import type { SiteSessionEngineHint, SiteSessionRegistryEntry } from "./types/siteSession.js";

type GalleryDlCookieCatalogSite = {
  siteId: string;
  displayName: string;
  primaryUrl: string;
  cookieDomains: string[];
  iconKey?: string;
};

export const GALLERY_DL_COOKIE_CATALOG_SITES = [
  {
    siteId: "boosty",
    displayName: "Boosty",
    primaryUrl: "https://www.boosty.to/",
    cookieDomains: ["boosty.to"],
  },
  {
    siteId: "facebook",
    displayName: "Facebook",
    primaryUrl: "https://www.facebook.com/",
    cookieDomains: ["facebook.com"],
  },
  {
    siteId: "fantia",
    displayName: "Fantia",
    primaryUrl: "https://fantia.jp/",
    cookieDomains: ["fantia.jp"],
  },
  {
    siteId: "furaffinity",
    displayName: "Fur Affinity",
    primaryUrl: "https://www.furaffinity.net/",
    cookieDomains: ["furaffinity.net"],
  },
  {
    siteId: "instagram",
    displayName: "Instagram",
    primaryUrl: "https://www.instagram.com/",
    cookieDomains: ["instagram.com"],
    iconKey: "instagram",
  },
  {
    siteId: "patreon",
    displayName: "Patreon",
    primaryUrl: "https://www.patreon.com/",
    cookieDomains: ["patreon.com"],
  },
  {
    siteId: "pinterest",
    displayName: "Pinterest",
    primaryUrl: "https://www.pinterest.com/",
    cookieDomains: ["pinterest.com"],
  },
  {
    siteId: "fanbox",
    displayName: "pixivFANBOX",
    primaryUrl: "https://www.fanbox.cc/",
    cookieDomains: ["fanbox.cc"],
  },
  {
    siteId: "poipiku",
    displayName: "Poipiku",
    primaryUrl: "https://poipiku.com/",
    cookieDomains: ["poipiku.com"],
  },
  {
    siteId: "tiktok",
    displayName: "TikTok",
    primaryUrl: "https://www.tiktok.com/",
    cookieDomains: ["tiktok.com"],
  },
  {
    siteId: "twitter",
    displayName: "Twitter / X",
    primaryUrl: "https://x.com/",
    cookieDomains: ["x.com", "twitter.com"],
  },
] as const satisfies readonly GalleryDlCookieCatalogSite[];

const GALLERY_DL_ENGINE_HINTS: SiteSessionEngineHint[] = ["gallery-dl"];

const normalizeHostFromUrl = (url: string): string => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
};

export const createGalleryDlCookieCatalogEntry = (
  site: GalleryDlCookieCatalogSite,
  nowMs: number,
): SiteSessionRegistryEntry => ({
  siteId: site.siteId,
  displayName: site.displayName,
  primaryUrl: site.primaryUrl,
  primaryHost: normalizeHostFromUrl(site.primaryUrl),
  cookieDomains: [...site.cookieDomains],
  requiredCookieKeys: [],
  loginCookieKeys: [],
  syncAuthorization: "seeded",
  autoSyncAllowed: true,
  discoverySources: ["gallery-dl-supported-sites"],
  engineHints: [...GALLERY_DL_ENGINE_HINTS],
  visibility: "hidden_catalog",
  icon: site.iconKey
    ? {
        kind: "known",
        key: site.iconKey,
      }
    : {
        kind: "placeholder",
      },
  createdAtMs: nowMs,
  updatedAtMs: nowMs,
});

export const createGalleryDlCookieCatalogEntries = (
  nowMs: number,
): SiteSessionRegistryEntry[] => GALLERY_DL_COOKIE_CATALOG_SITES.map((site) => (
  createGalleryDlCookieCatalogEntry(site, nowMs)
));
