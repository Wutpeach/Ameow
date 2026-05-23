(function initAmeowCaptureEvidence(root) {
  "use strict";

  const CONTENT_ID_PATH_RE = /\/(?:video|note|gallery)\/(\d{15,20})(?:[/?#]|$)/i;

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
    } catch {
      return contentIds;
    }

    return contentIds;
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
    const contentIds = mergeContentIds(
      extractContentIds(pageUrl),
      extractContentIds(canonicalUrl),
      extractContentIds(ogUrl),
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
