(function initAmeowCaptureEvidence(root) {
  "use strict";

  const CONTENT_ID_PATH_RE = /\/(?:video|note|gallery)\/(\d{15,20})(?:[/?#]|$)/i;
  const INSTAGRAM_SHORTCODE_PATH_RE = /^\/(p|reel|tv)\/([A-Za-z0-9_-]{5,})(?:\/)?$/i;
  const JSON_LD_MAX_SCRIPTS = 6;
  const JSON_LD_MAX_CHARS = 30000;
  const STRUCTURED_DATA_URL_LIMIT = 8;
  const STRUCTURED_DATA_URL_KEYS = new Set([
    "@id",
    "url",
    "contentUrl",
    "embedUrl",
    "mainEntityOfPage",
  ]);

  function normalizeHttpUrl(raw, baseUrl) {
    if (typeof raw !== "string") {
      return undefined;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      return undefined;
    }
    try {
      const normalized = new URL(trimmed, baseUrl || root.location?.href).toString();
      return /^https?:\/\//i.test(normalized) ? normalized : undefined;
    } catch {
      return undefined;
    }
  }

  function readMetaContent(selector) {
    const element = root.document?.querySelector?.(selector);
    const content = element?.getAttribute?.("content");
    return typeof content === "string" && content.trim() ? content.trim() : undefined;
  }

  function readPageTitle() {
    const title = root.document?.title;
    return typeof title === "string" && title.trim() ? title.trim() : undefined;
  }

  function extractContentIds(rawUrl) {
    const normalized = normalizeHttpUrl(rawUrl);
    const contentIds = {};
    if (!normalized) {
      return contentIds;
    }

    try {
      const parsed = new URL(normalized);
      const modalId = parsed.searchParams.get("modal_id");
      if (modalId && /^\d{15,20}$/.test(modalId)) {
        contentIds.modal_id = modalId;
      }

      const pathMatch = parsed.pathname.match(CONTENT_ID_PATH_RE);
      if (pathMatch?.[1]) {
        contentIds.content_id = pathMatch[1];
      }

      if (/instagram\.com$/i.test(parsed.hostname) || /(^|\.)instagram\.com$/i.test(parsed.hostname)) {
        const instagramMatch = parsed.pathname.match(INSTAGRAM_SHORTCODE_PATH_RE);
        if (instagramMatch?.[1] && instagramMatch?.[2]) {
          contentIds.instagram_shortcode_path = instagramMatch[1].toLowerCase();
          contentIds.instagram_shortcode = instagramMatch[2];
        }
      }
    } catch {
      return contentIds;
    }

    return contentIds;
  }

  function collectStructuredDataUrls(value, baseUrl, urls, state, depth = 0) {
    if (urls.length >= STRUCTURED_DATA_URL_LIMIT || depth > 6 || state.nodes >= 80) {
      return;
    }
    state.nodes += 1;

    if (Array.isArray(value)) {
      value.forEach((item) => collectStructuredDataUrls(item, baseUrl, urls, state, depth + 1));
      return;
    }

    if (!value || typeof value !== "object") {
      return;
    }

    Object.entries(value).forEach(([key, entryValue]) => {
      if (urls.length >= STRUCTURED_DATA_URL_LIMIT) {
        return;
      }

      if (STRUCTURED_DATA_URL_KEYS.has(key)) {
        const values = Array.isArray(entryValue) ? entryValue : [entryValue];
        values.forEach((item) => {
          if (typeof item !== "string" || urls.length >= STRUCTURED_DATA_URL_LIMIT) {
            return;
          }
          const normalized = normalizeHttpUrl(item, baseUrl);
          if (normalized && !urls.includes(normalized)) {
            urls.push(normalized);
          }
        });
      }

      collectStructuredDataUrls(entryValue, baseUrl, urls, state, depth + 1);
    });
  }

  function readStructuredDataUrls(baseUrl) {
    const scripts = Array.from(
      root.document?.querySelectorAll?.('script[type="application/ld+json"]') || [],
    ).slice(0, JSON_LD_MAX_SCRIPTS);
    const urls = [];

    scripts.forEach((script) => {
      if (urls.length >= STRUCTURED_DATA_URL_LIMIT) {
        return;
      }
      const text = typeof script?.textContent === "string" ? script.textContent.trim() : "";
      if (!text || text.length > JSON_LD_MAX_CHARS) {
        return;
      }
      try {
        collectStructuredDataUrls(JSON.parse(text), baseUrl, urls, { nodes: 0 });
      } catch {
        // Ignore malformed structured data. It is only supporting evidence.
      }
    });

    return urls;
  }

  function mergeContentIds(...groups) {
    return groups.reduce((merged, group) => {
      if (!group || typeof group !== "object") {
        return merged;
      }
      for (const [key, value] of Object.entries(group)) {
        if (typeof value === "string" && value.trim()) {
          merged[key] = value.trim();
        }
      }
      return merged;
    }, {});
  }

  function readTargetUrl(target, attributeName) {
    if (!target || typeof target.closest !== "function") {
      return undefined;
    }

    const elementWithAttribute = target.closest?.(`[${attributeName}]`);
    const rawValue = elementWithAttribute?.getAttribute?.(attributeName);
    return normalizeHttpUrl(rawValue);
  }

  function buildEvidence(action, options = {}) {
    const pageUrl = normalizeHttpUrl(options.pageUrl || root.location?.href);
    if (!pageUrl) {
      return null;
    }

    const targetHref = normalizeHttpUrl(options.targetHref);
    const targetSrc = normalizeHttpUrl(options.targetSrc);
    const canonicalUrl = normalizeHttpUrl(
      options.canonicalUrl || root.document?.querySelector?.('link[rel="canonical"]')?.getAttribute?.("href"),
      pageUrl,
    );
    const ogUrl = normalizeHttpUrl(
      options.ogUrl || readMetaContent('meta[property="og:url"], meta[name="og:url"]'),
      pageUrl,
    );
    const structuredDataUrls = Array.isArray(options.structuredDataUrls)
      ? options.structuredDataUrls.map((value) => normalizeHttpUrl(value, pageUrl)).filter(Boolean)
      : readStructuredDataUrls(pageUrl);
    const contentIds = mergeContentIds(
      extractContentIds(pageUrl),
      extractContentIds(canonicalUrl),
      extractContentIds(ogUrl),
      ...structuredDataUrls.map((value) => extractContentIds(value)),
      extractContentIds(targetHref),
      extractContentIds(targetSrc),
      options.contentIds,
    );

    return {
      version: 1,
      action,
      pageUrl,
      ...(canonicalUrl ? { canonicalUrl } : {}),
      ...(ogUrl ? { ogUrl } : {}),
      ...(readPageTitle() ? { title: readPageTitle() } : {}),
      ...(Object.keys(contentIds).length > 0 ? { contentIds } : {}),
      ...(structuredDataUrls.length > 0 ? { structuredDataUrls } : {}),
      ...(targetHref ? { targetHref } : {}),
      ...(targetSrc ? { targetSrc } : {}),
    };
  }

  function buildCurrentContentPayload() {
    const evidence = buildEvidence("current_content");
    if (!evidence) {
      return null;
    }

    return {
      type: "video_selection",
      url: evidence.pageUrl,
      pageUrl: evidence.pageUrl,
      title: evidence.title,
      selectionScope: "current_item",
      extensionData: {
        ameowCapture: evidence,
      },
    };
  }

  function buildPickDownloadPayload(target) {
    const targetHref = readTargetUrl(target, "href");
    const targetSrc = readTargetUrl(target, "src");
    const evidence = buildEvidence("pick_download", {
      targetHref,
      targetSrc,
    });
    if (!evidence) {
      return null;
    }

    return {
      type: "video_selection",
      url: targetHref || targetSrc || evidence.pageUrl,
      pageUrl: evidence.pageUrl,
      title: evidence.title,
      selectionScope: "current_item",
      extensionData: {
        ameowCapture: evidence,
      },
    };
  }

  root.AmeowCaptureEvidence = {
    normalizeHttpUrl,
    extractContentIds,
    buildEvidence,
    buildCurrentContentPayload,
    buildPickDownloadPayload,
  };
})(typeof window !== "undefined" ? window : globalThis);
