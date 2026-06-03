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
    normalizeCookieRecords,
    resolveSiteSessionCookieSyncRequest,
  };
})(typeof self !== "undefined" ? self : globalThis);
