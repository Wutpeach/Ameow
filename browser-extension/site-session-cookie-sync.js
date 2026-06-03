(function initAmeowSiteSessionCookieSync(root) {
  "use strict";

  // Phase 1 keeps this local allowlist in sync with desktop seed registry data.
  // Phase 2 replaces it with registry entries pushed from the desktop app.
  const SUPPORTED_SITES = {
    douyin: {
      siteId: "douyin",
      cookieDomains: ["douyin.com"],
      cookieUrls: [
        "https://www.douyin.com/",
      ],
    },
    bilibili: {
      siteId: "bilibili",
      cookieDomains: ["bilibili.com", "b23.tv"],
      cookieUrls: [
        "https://www.bilibili.com/",
        "https://b23.tv/",
      ],
    },
    xiaohongshu: {
      siteId: "xiaohongshu",
      cookieDomains: ["xiaohongshu.com", "xhslink.com"],
      cookieUrls: [
        "https://www.xiaohongshu.com/",
        "https://xhslink.com/",
      ],
    },
    youtube: {
      siteId: "youtube",
      cookieDomains: ["youtube.com", "google.com"],
      cookieUrls: [
        "https://www.youtube.com/",
        "https://accounts.google.com/",
        "https://www.google.com/",
      ],
    },
    instagram: {
      siteId: "instagram",
      cookieDomains: ["instagram.com"],
      cookieUrls: [
        "https://www.instagram.com/",
      ],
    },
  };

  let registryEntries = [];

  function isRecord(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function normalizeString(value) {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed || null;
  }

  function normalizeDomain(value) {
    const domain = normalizeString(value);
    return domain ? domain.replace(/^\./, "").toLowerCase() : null;
  }

  function normalizeUrl(value) {
    const url = normalizeString(value);
    if (!url) {
      return null;
    }
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:"
        ? parsed.toString()
        : null;
    } catch {
      return null;
    }
  }

  function normalizeRegistryEntry(value) {
    if (!isRecord(value)) {
      return null;
    }

    const siteId = normalizeString(value.siteId || value.site_id);
    const displayName = normalizeString(value.displayName || value.display_name) || siteId;
    const primaryUrl = normalizeUrl(value.primaryUrl || value.primary_url);
    const primaryHost = normalizeDomain(value.primaryHost || value.primary_host);
    const cookieDomains = Array.isArray(value.cookieDomains || value.cookie_domains)
      ? (value.cookieDomains || value.cookie_domains).map(normalizeDomain).filter(Boolean)
      : [];
    if (!siteId || cookieDomains.length === 0) {
      return null;
    }

    return {
      siteId,
      displayName,
      primaryUrl,
      primaryHost,
      cookieDomains: Array.from(new Set(cookieDomains)),
      requiredCookieKeys: Array.isArray(value.requiredCookieKeys || value.required_cookie_keys)
        ? (value.requiredCookieKeys || value.required_cookie_keys).map(normalizeString).filter(Boolean)
        : [],
      loginCookieKeys: Array.isArray(value.loginCookieKeys || value.login_cookie_keys)
        ? (value.loginCookieKeys || value.login_cookie_keys).map(normalizeString).filter(Boolean)
        : [],
      syncAuthorization: normalizeString(value.syncAuthorization || value.sync_authorization) || "seeded",
      autoSyncAllowed: value.autoSyncAllowed === true || value.auto_sync_allowed === true,
      discoverySources: Array.isArray(value.discoverySources || value.discovery_sources)
        ? (value.discoverySources || value.discovery_sources).map(normalizeString).filter(Boolean)
        : [],
      visibility: normalizeString(value.visibility) || "visible",
      icon: isRecord(value.icon) ? value.icon : { kind: "placeholder" },
    };
  }

  function domainMatches(cookieDomain, allowedDomain) {
    const normalizedCookieDomain = normalizeDomain(cookieDomain);
    const normalizedAllowedDomain = normalizeDomain(allowedDomain);
    return Boolean(
      normalizedCookieDomain
      && normalizedAllowedDomain
      && (
        normalizedCookieDomain === normalizedAllowedDomain
        || normalizedCookieDomain.endsWith(`.${normalizedAllowedDomain}`)
      ),
    );
  }

  function hostMatchesDomain(host, domain) {
    return domainMatches(host, domain);
  }

  function setRegistryEntries(entries) {
    registryEntries = Array.isArray(entries)
      ? entries.map(normalizeRegistryEntry).filter(Boolean)
      : [];
    return registryEntries;
  }

  function upsertRegistryEntry(entry) {
    const normalized = normalizeRegistryEntry(entry);
    if (!normalized) {
      return null;
    }
    registryEntries = [
      ...registryEntries.filter((item) => item.siteId !== normalized.siteId),
      normalized,
    ];
    return normalized;
  }

  function getRegistryEntries() {
    return registryEntries.slice();
  }

  function findRegistryEntryBySiteId(siteId) {
    const normalizedSiteId = normalizeString(siteId);
    if (!normalizedSiteId) {
      return null;
    }
    return registryEntries.find((entry) => entry.siteId === normalizedSiteId) || null;
  }

  function findRegistryEntryForUrl(rawUrl) {
    const normalizedUrl = normalizeUrl(rawUrl);
    if (!normalizedUrl) {
      return null;
    }
    try {
      const host = new URL(normalizedUrl).hostname.toLowerCase();
      return registryEntries.find((entry) => (
        hostMatchesDomain(host, entry.primaryHost)
        || entry.cookieDomains.some((domain) => hostMatchesDomain(host, domain))
      )) || null;
    } catch {
      return null;
    }
  }

  function isCookieForAllowedDomains(cookie, allowedDomains) {
    const domain = normalizeString(cookie?.domain);
    if (!domain) {
      return false;
    }
    return allowedDomains.some((allowedDomain) => domainMatches(domain, allowedDomain));
  }

  function resolveSiteSessionCookieSyncRequest(data) {
    const requestId = normalizeString(data?.requestId || data?.request_id);
    const siteId = normalizeString(data?.siteId || data?.site_id);
    if (!requestId) {
      return {
        success: false,
        code: "missing_request_id",
        error: "Missing site session cookie sync request id",
      };
    }
    const registrySite = findRegistryEntryBySiteId(siteId);
    if (registrySite) {
      return {
        success: true,
        requestId,
        site: registrySite,
      };
    }

    if (!siteId || !SUPPORTED_SITES[siteId]) {
      return {
        success: false,
        requestId,
        siteId,
        code: "unsupported_site_session",
        error: `Unsupported site session cookie sync: ${siteId || "unknown"}`,
      };
    }
    return {
      success: true,
      requestId,
      site: SUPPORTED_SITES[siteId],
    };
  }

  function buildCookieQueries(site) {
    if (!isRecord(site)) {
      return [];
    }

    const queries = [];
    const seen = new Set();
    for (const domain of site.cookieDomains || []) {
      const normalizedDomain = normalizeDomain(domain);
      if (!normalizedDomain) {
        continue;
      }
      const key = `domain:${normalizedDomain}`;
      if (!seen.has(key)) {
        seen.add(key);
        queries.push({ domain: normalizedDomain });
      }
    }

    for (const url of site.cookieUrls || []) {
      const normalizedUrl = normalizeString(url);
      if (!normalizedUrl) {
        continue;
      }
      const key = `url:${normalizedUrl}`;
      if (!seen.has(key)) {
        seen.add(key);
        queries.push({ url: normalizedUrl });
      }
    }

    return queries;
  }

  function normalizeCookieRecord(cookie, allowedDomains) {
    if (!isRecord(cookie) || !isCookieForAllowedDomains(cookie, allowedDomains)) {
      return null;
    }

    const domain = normalizeString(cookie.domain);
    const name = normalizeString(cookie.name);
    if (!domain || !name || typeof cookie.value !== "string") {
      return null;
    }

    const expirationDate = Number(cookie.expirationDate);
    return {
      domain,
      expirationDate: Number.isFinite(expirationDate) ? expirationDate : undefined,
      httpOnly: cookie.httpOnly === true,
      name,
      path: normalizeString(cookie.path) || "/",
      secure: cookie.secure === true,
      value: cookie.value,
    };
  }

  function normalizeCookieRecords(cookies, allowedDomains) {
    const records = Array.isArray(cookies)
      ? cookies
        .map((cookie) => normalizeCookieRecord(cookie, allowedDomains))
        .filter(Boolean)
      : [];
    const deduped = new Map();
    for (const record of records) {
      deduped.set(`${record.domain}|${record.path}|${record.name}`, record);
    }
    return Array.from(deduped.values());
  }

  root.AmeowSiteSessionCookieSync = {
    SUPPORTED_SITES,
    buildCookieQueries,
    domainMatches,
    findRegistryEntryBySiteId,
    findRegistryEntryForUrl,
    getRegistryEntries,
    normalizeCookieRecords,
    setRegistryEntries,
    upsertRegistryEntry,
    resolveSiteSessionCookieSyncRequest,
  };
})(typeof self !== "undefined" ? self : globalThis);
