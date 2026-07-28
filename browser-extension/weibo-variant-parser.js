(function initAmeowWeiboVariantParser(root) {
  "use strict";

  const SCRIPT_SCAN_LIMIT = 80;
  const SCRIPT_TEXT_LIMIT = 200000;
  const MAX_JSON_FRAGMENTS = 24;
  const MAX_SCAN_NODES = 5000;
  const MAX_VARIANTS = 24;
  const MAX_RECURSION_DEPTH = 12;
  const WEIBO_HOST_RE = /(?:^|\.)weibo\.(?:com|cn)$/i;
  const WEIBO_EXTRA_HOST_RE = /(?:^|\.)m\.weibo\.(?:com|cn)$|(?:^|\.)video\.weibo\.com$/i;
  const VIDEO_URL_RE = /https?:\\?\/\\?\/[^"'<>\\\s]+?\.(?:mp4|m3u8)(?:\?[^"'<>\\\s]*)?/gi;

  function normalizeHttpUrl(rawUrl, baseUrl) {
    const genericUtils = root.AmeowGenericVideoSelectionUtils;
    if (genericUtils?.normalizeHttpUrl) {
      return genericUtils.normalizeHttpUrl(rawUrl, baseUrl);
    }
    if (typeof rawUrl !== "string") {
      return null;
    }
    try {
      const resolved = new URL(rawUrl.trim(), baseUrl || root.location?.href).toString();
      return /^https?:\/\//i.test(resolved) ? resolved : null;
    } catch {
      return null;
    }
  }

  function cleanEscapedUrl(rawUrl) {
    if (typeof rawUrl !== "string") {
      return "";
    }
    return rawUrl
      .replace(/\\\//g, "/")
      .replace(/\\u0026/gi, "&")
      .replace(/&amp;/gi, "&")
      .trim();
  }

  function isWeiboPageUrl(rawUrl = root.location?.href) {
    const normalized = normalizeHttpUrl(rawUrl);
    if (!normalized) {
      return false;
    }
    try {
      const host = new URL(normalized).hostname;
      return WEIBO_HOST_RE.test(host) || WEIBO_EXTRA_HOST_RE.test(host);
    } catch {
      return false;
    }
  }

  function normalizeWeiboStatusId(value) {
    return typeof value === "string" && /^[A-Za-z0-9]+$/.test(value.trim())
      ? value.trim()
      : "";
  }

  function extractWeiboStatusId(rawUrl = root.location?.href) {
    const normalized = normalizeHttpUrl(rawUrl);
    if (!normalized) {
      return "";
    }
    try {
      const parsed = new URL(normalized);
      for (const key of ["layerid", "mid", "id"]) {
        const resolved = normalizeWeiboStatusId(parsed.searchParams.get(key));
        if (resolved) {
          return resolved;
        }
      }
      const segments = parsed.pathname.split("/").filter(Boolean);
      if ((segments[0] === "detail" || segments[0] === "status") && segments[1]) {
        return normalizeWeiboStatusId(segments[1]);
      }
      if (/^\d+$/.test(segments[0] || "") && segments[1]) {
        return normalizeWeiboStatusId(segments[1]);
      }
    } catch {
      return "";
    }
    return "";
  }

  function canonicalWeiboPageUrl(rawUrl = root.location?.href) {
    const normalized = normalizeHttpUrl(rawUrl);
    const statusId = extractWeiboStatusId(normalized);
    if (statusId) {
      return `https://weibo.com/detail/${statusId}`;
    }
    if (!normalized) {
      return "";
    }
    try {
      const parsed = new URL(normalized);
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return normalized;
    }
  }

  function hashString(value) {
    const input = typeof value === "string" ? value : "";
    let hash = 0;
    for (let index = 0; index < input.length; index += 1) {
      hash = ((hash << 5) - hash + input.charCodeAt(index)) | 0;
    }
    return Math.abs(hash).toString(36);
  }

  function firstMetaContent(documentRef, selectors) {
    for (const selector of selectors) {
      const value = documentRef?.querySelector?.(selector)?.getAttribute?.("content")?.trim();
      if (value) {
        return value;
      }
    }
    return "";
  }

  function normalizeTitle(documentRef) {
    const title = firstMetaContent(documentRef, [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
    ]) || documentRef?.title || "";
    return typeof title === "string"
      ? title.replace(/\s+/g, " ").replace(/\s*[-_]\s*微博\s*$/i, "").trim().slice(0, 140)
      : "";
  }

  function previewUrl(documentRef) {
    return normalizeHttpUrl(firstMetaContent(documentRef, [
      'meta[property="og:image"]',
      'meta[property="og:image:secure_url"]',
      'meta[name="twitter:image"]',
      'meta[itemprop="image"]',
    ])) || "";
  }

  function numberFromUnknown(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const match = value.match(/\d+(?:\.\d+)?/);
      if (match) {
        const parsed = Number(match[0]);
        return Number.isFinite(parsed) ? parsed : null;
      }
    }
    return null;
  }

  function stringFromKeys(object, keys) {
    if (!object || typeof object !== "object") {
      return "";
    }
    for (const key of keys) {
      const value = object[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return "";
  }

  function numberFromKeys(object, keys) {
    if (!object || typeof object !== "object") {
      return null;
    }
    for (const key of keys) {
      const value = numberFromUnknown(object[key]);
      if (value !== null) {
        return value;
      }
    }
    return null;
  }

  function deriveVariantMetadata(object, ancestors, rawUrl) {
    const scopes = [object, ...ancestors].filter((item) => item && typeof item === "object");
    let label = "";
    let qualityIndex = null;
    let width = null;
    let height = null;
    let bitrate = null;
    for (const scope of scopes) {
      label ||= stringFromKeys(scope, ["label", "quality", "quality_label", "definition", "name", "display_name"]);
      qualityIndex ??= numberFromKeys(scope, ["quality_index", "qualityIndex", "quality", "definition"]);
      width ??= numberFromKeys(scope, ["width", "w"]);
      height ??= numberFromKeys(scope, ["height", "h", "short_edge"]);
      bitrate ??= numberFromKeys(scope, ["bitrate", "bit_rate", "bandwidth"]);
    }
    const urlQuality = String(rawUrl || "").match(/(?:^|[^\d])([1-9]\d{2,3})p?(?:[^\d]|$)/i)?.[1];
    const labelQuality = label.match(/([1-9]\d{2,3})p?/i)?.[1];
    height ??= numberFromUnknown(labelQuality || urlQuality);
    qualityIndex ??= numberFromUnknown(labelQuality || urlQuality);
    if (!label && height) {
      label = `${Math.round(height)}p`;
    }
    return {
      label,
      qualityIndex,
      width,
      height,
      bitrate,
    };
  }

  function variantScore(variant) {
    return (
      (Number(variant.qualityIndex) || 0) * 1000000
      + (Number(variant.height) || 0) * 1000
      + (Number(variant.width) || 0)
      + Math.round((Number(variant.bitrate) || 0) / 1000)
    );
  }

  function normalizeVariant(rawVariant) {
    const url = normalizeHttpUrl(cleanEscapedUrl(rawVariant?.url), root.location?.href);
    if (!url || !/\.(?:mp4|m3u8)(?:[?#]|$)/i.test(url)) {
      return null;
    }
    const extension = (() => {
      try {
        return new URL(url).pathname.match(/\.([a-z0-9]{2,8})$/i)?.[1]?.toLowerCase() || "";
      } catch {
        return "";
      }
    })();
    const type = extension === "m3u8" ? "manifest_m3u8" : "direct_mp4";
    const height = Number(rawVariant.height);
    const width = Number(rawVariant.width);
    const bitrate = Number(rawVariant.bitrate);
    const qualityIndex = Number(rawVariant.qualityIndex);
    const label = typeof rawVariant.label === "string" && rawVariant.label.trim()
      ? rawVariant.label.trim()
      : Number.isFinite(height) && height > 0
        ? `${Math.round(height)}p`
        : type === "direct_mp4"
          ? "MP4"
          : "HLS";
    return {
      url,
      label,
      type,
      source: "weibo_variant_parser",
      confidence: "high",
      mediaType: "video",
      ...(Number.isFinite(qualityIndex) && qualityIndex > 0 ? { qualityIndex: Math.round(qualityIndex) } : {}),
      ...(Number.isFinite(width) && width > 0 ? { width: Math.round(width) } : {}),
      ...(Number.isFinite(height) && height > 0 ? { height: Math.round(height) } : {}),
      ...(Number.isFinite(bitrate) && bitrate > 0 ? { bitrate: Math.round(bitrate) } : {}),
    };
  }

  function addVariant(variantsByUrl, rawVariant) {
    const variant = normalizeVariant(rawVariant);
    if (!variant) {
      return;
    }
    const existing = variantsByUrl.get(variant.url);
    if (!existing || variantScore(variant) > variantScore(existing)) {
      variantsByUrl.set(variant.url, variant);
    }
  }

  function scanObjectForVariants(value, variantsByUrl, state, ancestors = [], depth = 0) {
    if (!value || typeof value !== "object" || depth > MAX_RECURSION_DEPTH || state.nodes > MAX_SCAN_NODES) {
      return;
    }
    state.nodes += 1;
    if (Array.isArray(value)) {
      value.forEach((item) => scanObjectForVariants(item, variantsByUrl, state, ancestors, depth + 1));
      return;
    }
    Object.entries(value).forEach(([key, item]) => {
      if (typeof item === "string") {
        const cleaned = cleanEscapedUrl(item);
        if (/^https?:\/\//i.test(cleaned) && /\.(?:mp4|m3u8)(?:[?#]|$)/i.test(cleaned)) {
          addVariant(variantsByUrl, {
            url: cleaned,
            ...deriveVariantMetadata(value, ancestors, cleaned),
          });
        }
        return;
      }
      if (item && typeof item === "object") {
        scanObjectForVariants(item, variantsByUrl, state, [value, ...ancestors].slice(0, 4), depth + 1);
      }
      void key;
    });
  }

  function findBalancedJsonEnd(text, startIndex) {
    const opener = text[startIndex];
    const closer = opener === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = startIndex; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }
      if (char === "\"") {
        inString = true;
      } else if (char === opener) {
        depth += 1;
      } else if (char === closer) {
        depth -= 1;
        if (depth === 0) {
          return index + 1;
        }
      }
    }
    return -1;
  }

  function collectJsonFragments(text) {
    const fragments = [];
    const source = typeof text === "string" ? text.trim().slice(0, SCRIPT_TEXT_LIMIT) : "";
    if (!source) {
      return fragments;
    }
    if (source.startsWith("{") || source.startsWith("[")) {
      fragments.push(source);
    }
    const patterns = [
      /(?:window\.[A-Za-z0-9_$]+|var\s+[A-Za-z0-9_$]+|let\s+[A-Za-z0-9_$]+|const\s+[A-Za-z0-9_$]+)\s*=\s*([\[{])/g,
      /"playback_list"\s*:\s*(\[)/g,
      /"media_info"\s*:\s*(\{)/g,
    ];
    for (const pattern of patterns) {
      let match = null;
      while ((match = pattern.exec(source)) && fragments.length < MAX_JSON_FRAGMENTS) {
        const start = match.index + match[0].lastIndexOf(match[1]);
        const end = findBalancedJsonEnd(source, start);
        if (end > start) {
          fragments.push(source.slice(start, end));
        }
      }
    }
    return fragments;
  }

  function collectUrlRegexVariants(text, variantsByUrl) {
    const source = typeof text === "string" ? text.slice(0, SCRIPT_TEXT_LIMIT) : "";
    let match = null;
    while ((match = VIDEO_URL_RE.exec(source)) && variantsByUrl.size < MAX_VARIANTS) {
      const rawUrl = cleanEscapedUrl(match[0]);
      const windowText = source.slice(Math.max(0, match.index - 160), Math.min(source.length, match.index + rawUrl.length + 160));
      const quality = windowText.match(/(?:quality_index|quality|definition|label)["']?\s*[:=]\s*["']?([1-9]\d{2,3}p?|[1-9]\d{2,3})/i)?.[1] || "";
      const numericQuality = numberFromUnknown(quality);
      addVariant(variantsByUrl, {
        url: rawUrl,
        label: numericQuality ? `${Math.round(numericQuality)}p` : "",
        qualityIndex: numericQuality,
        height: numericQuality,
      });
    }
  }

  function parseDocumentVariants(documentRef) {
    const variantsByUrl = new Map();
    const scripts = Array.from(documentRef?.querySelectorAll?.("script") || []).slice(0, SCRIPT_SCAN_LIMIT);
    scripts.forEach((script) => {
      const text = String(script?.textContent || "");
      collectJsonFragments(text).forEach((fragment) => {
        try {
          scanObjectForVariants(JSON.parse(fragment), variantsByUrl, { nodes: 0 });
        } catch {
          // Weibo embeds some script data as JavaScript, not strict JSON.
        }
      });
      collectUrlRegexVariants(text, variantsByUrl);
    });
    return Array.from(variantsByUrl.values())
      .sort((left, right) => variantScore(right) - variantScore(left))
      .slice(0, MAX_VARIANTS);
  }

  function buildWeiboCandidates(options = {}) {
    const documentRef = options.document || root.document;
    const pageUrl = canonicalWeiboPageUrl(options.pageUrl || root.location?.href);
    if (!isWeiboPageUrl(pageUrl || options.pageUrl || root.location?.href)) {
      return [];
    }
    const variants = parseDocumentVariants(documentRef);
    if (variants.length === 0) {
      return [];
    }
    const best = variants[0];
    const statusId = extractWeiboStatusId(pageUrl || options.pageUrl || root.location?.href);
    const canonicalId = statusId || hashString(pageUrl || best.url);
    const title = normalizeTitle(documentRef);
    const cover = previewUrl(documentRef);
    return [{
      id: `video-weibo-${hashString(canonicalId)}`,
      mediaType: "video",
      url: pageUrl || best.url,
      pageUrl: pageUrl || undefined,
      title: title || "Weibo video",
      host: "weibo.com",
      source: "site_extractor",
      type: "weibo_variants",
      confidence: "high",
      siteHint: "weibo",
      groupId: `weibo:${canonicalId}`,
      canonicalId,
      variants,
      preferredVariantUrl: best.url,
      preferredVariantLabel: best.label,
      ...(cover ? { previewUrl: cover } : {}),
      ...(best.width ? { width: best.width } : {}),
      ...(best.height ? { height: best.height } : {}),
    }];
  }

  root.AmeowWeiboVariantParser = {
    id: "weibo",
    matches: isWeiboPageUrl,
    collectCandidates: buildWeiboCandidates,
  };

  root.AmeowWeiboVariantParserTestHooks = {
    buildWeiboCandidates,
    canonicalWeiboPageUrl,
    collectJsonFragments,
    extractWeiboStatusId,
    isWeiboPageUrl,
    parseDocumentVariants,
    variantScore,
  };
})(typeof window !== "undefined" ? window : globalThis);
