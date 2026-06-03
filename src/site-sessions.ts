export type SiteSessionConfig = {
  id: string;
  displayName: string;
  labelKey: string;
  loginUrl: string;
  cookieDomains: string[];
  requiredCookieKeys: string[];
  loginCookieKeys: string[];
};

export const SITE_SESSION_CONFIGS = [
  {
    id: "douyin",
    displayName: "Douyin",
    labelKey: "desktop:settings.siteSessions.sites.douyin",
    loginUrl: "https://www.douyin.com/",
    cookieDomains: ["douyin.com"],
    requiredCookieKeys: [
      "ttwid",
      "odin_tt",
      "passport_csrf_token",
    ],
    loginCookieKeys: [
      "sessionid",
      "sid_tt",
      "sid_guard",
    ],
  },
  {
    id: "bilibili",
    displayName: "Bilibili",
    labelKey: "desktop:settings.siteSessions.sites.bilibili",
    loginUrl: "https://www.bilibili.com/",
    cookieDomains: ["bilibili.com", "b23.tv"],
    requiredCookieKeys: ["SESSDATA"],
    loginCookieKeys: ["SESSDATA"],
  },
  {
    id: "xiaohongshu",
    displayName: "Xiaohongshu",
    labelKey: "desktop:settings.siteSessions.sites.xiaohongshu",
    loginUrl: "https://www.xiaohongshu.com/",
    cookieDomains: ["xiaohongshu.com", "xhslink.com"],
    requiredCookieKeys: ["web_session"],
    loginCookieKeys: ["web_session"],
  },
  {
    id: "youtube",
    displayName: "YouTube",
    labelKey: "desktop:settings.siteSessions.sites.youtube",
    loginUrl: "https://www.youtube.com/",
    cookieDomains: ["youtube.com", "google.com"],
    requiredCookieKeys: [],
    loginCookieKeys: [
      "LOGIN_INFO",
      "__Secure-1PSID",
      "__Secure-3PSID",
      "SID",
    ],
  },
  {
    id: "instagram",
    displayName: "Instagram",
    labelKey: "desktop:settings.siteSessions.sites.instagram",
    loginUrl: "https://www.instagram.com/",
    cookieDomains: ["instagram.com"],
    requiredCookieKeys: [],
    loginCookieKeys: ["sessionid"],
  },
] as const satisfies readonly SiteSessionConfig[];

export const SUPPORTED_SITE_SESSION_IDS: readonly string[] = SITE_SESSION_CONFIGS.map((site) => site.id);

export const isSupportedSiteSessionId = (
  value: unknown,
): value is string => (
  typeof value === "string" && SUPPORTED_SITE_SESSION_IDS.includes(value)
);

export const getSiteSessionConfig = (
  siteId: string,
): SiteSessionConfig => {
  const config = SITE_SESSION_CONFIGS.find((site) => site.id === siteId);
  if (!config) {
    throw new Error(`Missing site session config for ${siteId}`);
  }
  return config;
};
