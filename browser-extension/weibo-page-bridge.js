(function initAmeowWeiboPageBridge(root) {
  "use strict";

  const PAGE_BRIDGE_FLAG = "__ameowWeiboPageBridgeInstalled";
  const PAGE_MESSAGE_SOURCE = "ameow-weibo-page";
  const PAGE_EVENT_TYPE = "AMEOW_WEIBO_VIDEO_VARIANTS";
  const RESPONSE_TEXT_LIMIT = 300000;
  const MAX_SCAN_NODES = 6000;
  const MAX_RECURSION_DEPTH = 12;
  const MAX_VARIANTS = 24;
  const MAX_RECORDS = 12;
  const VIDEO_URL_RE = /https?:\\?\/\\?\/[^"'<>\\\s]+?\.(?:mp4|m3u8)(?:\?[^"'<>\\\s]*)?/gi;
  const WEIBO_HOST_RE = /(?:^|\.)weibo\.(?:com|cn)$/i;
  const WEIBO_EXTRA_HOST_RE = /(?:^|\.)video\.weibo\.com$/i;

  if (root[PAGE_BRIDGE_FLAG]) {
    return;
  }
  root[PAGE_BRIDGE_FLAG] = true;

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

  function normalizeHttpUrl(rawUrl, baseUrl = root.location?.href) {
    if (typeof rawUrl !== "string") {
      return null;
    }
    const trimmed = cleanEscapedUrl(rawUrl);
    if (!trimmed || /^(?:blob|data|file|about|javascript|mailto):/i.test(trimmed)) {
      return null;
    }
    try {
      const resolved = new URL(trimmed, baseUrl).toString();
      return /^https?:\/\//i.test(resolved) ? resolved : null;
    } catch (_) {
      return null;
    }
  }

  function isWeiboUrl(rawUrl) {
    const normalized = normalizeHttpUrl(rawUrl);
    if (!normalized) {
      return false;
    }
    try {
      const host = new URL(normalized).hostname;
      return WEIBO_HOST_RE.test(host) || WEIBO_EXTRA_HOST_RE.test(host);
    } catch (_) {
      return false;
    }
  }

  function normalizeStatusId(value) {
    return typeof value === "string" && /^[A-Za-z0-9]{5,40}$/.test(value.trim())
      ? value.trim()
      : "";
  }

  function statusIdFromUrl(rawUrl) {
    const normalized = normalizeHttpUrl(rawUrl);
    if (!normalized) {
      return "";
    }
    try {
      const parsed = new URL(normalized);
      for (const key of ["layerid", "mid", "id"]) {
        const resolved = normalizeStatusId(parsed.searchParams.get(key));
        if (resolved) {
          return resolved;
        }
      }
      const segments = parsed.pathname.split("/").filter(Boolean);
      if ((segments[0] === "detail" || segments[0] === "status") && segments[1]) {
        return normalizeStatusId(segments[1]);
      }
      if (/^\d+$/.test(segments[0] || "") && segments[1]) {
        return normalizeStatusId(segments[1]);
      }
    } catch (_) {
      // Ignore malformed URLs.
    }
    return "";
  }

  function canonicalWeiboPageUrl(rawUrl) {
    const normalized = normalizeHttpUrl(rawUrl);
    const statusId = statusIdFromUrl(normalized);
    if (statusId) {
      return `https://weibo.com/detail/${statusId}`;
    }
    if (!normalized || !isWeiboUrl(normalized)) {
      return "";
    }
    try {
      const parsed = new URL(normalized);
      parsed.hash = "";
      return parsed.toString();
    } catch (_) {
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

  function isStatusRecordBoundary(object) {
    return Boolean(
      object
      && typeof object === "object"
      && (
        object.page_info
        || object.pageInfo
        || object.retweeted_status
        || object.retweetedStatus
      )
    );
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

  function deriveStatusId(object, ancestors) {
    const scopes = [object, ...ancestors].filter((item) => item && typeof item === "object");
    for (const scope of scopes) {
      const fromUrl = [
        scope.pageUrl,
        scope.page_url,
        scope.status_url,
        scope.url,
        scope.scheme,
      ].map((candidate) => typeof candidate === "string" ? statusIdFromUrl(candidate) : "").find(Boolean);
      if (fromUrl) {
        return fromUrl;
      }

      for (const key of ["mblogid", "mid", "idstr", "status_id", "statusId", "object_id", "id"]) {
        const resolved = normalizeStatusId(scope[key]);
        if (resolved) {
          return resolved;
        }
      }

      if (isStatusRecordBoundary(scope)) {
        return null;
      }
    }
    return "";
  }

  function derivePageUrl(object, ancestors) {
    const scopes = [object, ...ancestors].filter((item) => item && typeof item === "object");
    for (const scope of scopes) {
      for (const key of ["pageUrl", "page_url", "status_url", "url", "scheme"]) {
        if (typeof scope[key] !== "string") {
          continue;
        }
        const normalized = canonicalWeiboPageUrl(scope[key]);
        if (normalized) {
          return normalized;
        }
      }

      if (isStatusRecordBoundary(scope)) {
        return null;
      }
    }
    return "";
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
    const url = normalizeHttpUrl(rawVariant?.url);
    if (!url || !/\.(?:mp4|m3u8)(?:[?#]|$)/i.test(url)) {
      return null;
    }
    const extension = (() => {
      try {
        return new URL(url).pathname.match(/\.([a-z0-9]{2,8})$/i)?.[1]?.toLowerCase() || "";
      } catch (_) {
        return "";
      }
    })();
    const type = extension === "m3u8" ? "manifest_m3u8" : "direct_mp4";
    const height = Number(rawVariant.height);
    const width = Number(rawVariant.width);
    const bitrate = Number(rawVariant.bitrate);
    const qualityIndex = Number(rawVariant.qualityIndex);
    const label = typeof rawVariant.label === "string" && rawVariant.label.trim()
      ? rawVariant.label.trim().slice(0, 40)
      : Number.isFinite(height) && height > 0
        ? `${Math.round(height)}p`
        : type === "direct_mp4"
          ? "MP4"
          : "HLS";
    return {
      url,
      label,
      type,
      source: "weibo_api_observer",
      confidence: "high",
      mediaType: "video",
      ...(Number.isFinite(qualityIndex) && qualityIndex > 0 ? { qualityIndex: Math.round(qualityIndex) } : {}),
      ...(Number.isFinite(width) && width > 0 ? { width: Math.round(width) } : {}),
      ...(Number.isFinite(height) && height > 0 ? { height: Math.round(height) } : {}),
      ...(Number.isFinite(bitrate) && bitrate > 0 ? { bitrate: Math.round(bitrate) } : {}),
    };
  }

  function addVariant(groupsByKey, rawVariant, object, ancestors, responseUrl) {
    const variant = normalizeVariant(rawVariant);
    if (!variant) {
      return;
    }
    const scopedStatusId = deriveStatusId(object, ancestors);
    const scopedPageUrl = derivePageUrl(object, ancestors);
    const statusId = scopedStatusId || (scopedStatusId === "" ? statusIdFromUrl(responseUrl) : "");
    const pageUrl = scopedPageUrl || (scopedPageUrl === "" ? canonicalWeiboPageUrl(responseUrl) : "");
    const groupKey = statusId || pageUrl || `response:${hashString(responseUrl || variant.url)}`;
    const existingGroup = groupsByKey.get(groupKey) || {
      groupKey,
      statusId,
      pageUrl,
      variantsByUrl: new Map(),
    };
    const existing = existingGroup.variantsByUrl.get(variant.url);
    if (!existing || variantScore(variant) > variantScore(existing)) {
      existingGroup.variantsByUrl.set(variant.url, variant);
    }
    groupsByKey.set(groupKey, existingGroup);
  }

  function scanObjectForVariants(value, groupsByKey, state, responseUrl, ancestors = [], depth = 0) {
    if (!value || typeof value !== "object" || depth > MAX_RECURSION_DEPTH || state.nodes > MAX_SCAN_NODES) {
      return;
    }
    state.nodes += 1;
    if (Array.isArray(value)) {
      value.forEach((item) => scanObjectForVariants(item, groupsByKey, state, responseUrl, ancestors, depth + 1));
      return;
    }
    Object.entries(value).forEach(([, item]) => {
      if (typeof item === "string") {
        const cleaned = cleanEscapedUrl(item);
        if (/^https?:\/\//i.test(cleaned) && /\.(?:mp4|m3u8)(?:[?#]|$)/i.test(cleaned)) {
          addVariant(groupsByKey, {
            url: cleaned,
            ...deriveVariantMetadata(value, ancestors, cleaned),
          }, value, ancestors, responseUrl);
        }
        return;
      }
      if (item && typeof item === "object") {
        scanObjectForVariants(item, groupsByKey, state, responseUrl, [value, ...ancestors].slice(0, 5), depth + 1);
      }
    });
  }

  function collectRegexVariants(text, groupsByKey, responseUrl) {
    const source = typeof text === "string" ? text.slice(0, RESPONSE_TEXT_LIMIT) : "";
    let match = null;
    while ((match = VIDEO_URL_RE.exec(source))) {
      const rawUrl = cleanEscapedUrl(match[0]);
      const windowText = source.slice(Math.max(0, match.index - 160), Math.min(source.length, match.index + rawUrl.length + 160));
      const quality = windowText.match(/(?:quality_index|quality|definition|label)["']?\s*[:=]\s*["']?([1-9]\d{2,3}p?|[1-9]\d{2,3})/i)?.[1] || "";
      const numericQuality = numberFromUnknown(quality);
      addVariant(groupsByKey, {
        url: rawUrl,
        label: numericQuality ? `${Math.round(numericQuality)}p` : "",
        qualityIndex: numericQuality,
        height: numericQuality,
      }, null, [], responseUrl);
    }
  }

  function buildRecords(groupsByKey) {
    return Array.from(groupsByKey.values())
      .map((group) => {
        const variants = Array.from(group.variantsByUrl.values())
          .sort((left, right) => variantScore(right) - variantScore(left))
          .slice(0, MAX_VARIANTS);
        const pageUrl = group.pageUrl || (group.statusId ? `https://weibo.com/detail/${group.statusId}` : null);
        return {
          groupKey: group.groupKey,
          statusId: group.statusId || null,
          pageUrl,
          variants,
          updatedAtMs: Date.now(),
        };
      })
      .filter((record) => record.variants.length > 0 && (record.statusId || record.pageUrl))
      .slice(0, MAX_RECORDS);
  }

  function collectVariantRecords(value, responseUrl = root.location?.href) {
    const groupsByKey = new Map();
    scanObjectForVariants(value, groupsByKey, { nodes: 0 }, responseUrl);
    return buildRecords(groupsByKey);
  }

  function collectVariantRecordsFromText(text, responseUrl = root.location?.href) {
    const source = typeof text === "string" ? text.slice(0, RESPONSE_TEXT_LIMIT).trim() : "";
    if (!source) {
      return [];
    }
    try {
      return collectVariantRecords(JSON.parse(source), responseUrl);
    } catch (_) {
      const groupsByKey = new Map();
      collectRegexVariants(source, groupsByKey, responseUrl);
      return buildRecords(groupsByKey);
    }
  }

  function publishRecords(records) {
    if (!Array.isArray(records) || records.length === 0) {
      return;
    }
    root.postMessage({
      source: PAGE_MESSAGE_SOURCE,
      type: PAGE_EVENT_TYPE,
      records,
    }, "*");
  }

  async function inspectFetchResponse(response, responseUrl) {
    const url = normalizeHttpUrl(responseUrl || response?.url);
    if (!url || !isWeiboUrl(url)) {
      return;
    }
    const contentType = String(response?.headers?.get?.("content-type") || "").toLowerCase();
    if (!/json|text|javascript/.test(contentType)) {
      return;
    }
    try {
      const text = await response.clone().text();
      publishRecords(collectVariantRecordsFromText(text, url));
    } catch (_) {
      // Ignore unreadable response bodies.
    }
  }

  function inspectXhrResponse(xhr, fallbackUrl) {
    const responseType = xhr.responseType;
    if (responseType && responseType !== "text" && responseType !== "") {
      return;
    }
    const url = normalizeHttpUrl(xhr.responseURL || fallbackUrl);
    if (!url || !isWeiboUrl(url)) {
      return;
    }
    try {
      const text = typeof xhr.responseText === "string" ? xhr.responseText : "";
      publishRecords(collectVariantRecordsFromText(text, url));
    } catch (_) {
      // Ignore malformed or unavailable response text.
    }
  }

  const originalFetch = root.fetch;
  if (typeof originalFetch === "function") {
    root.fetch = async function ameowWeiboFetch(...args) {
      const response = await originalFetch.apply(this, args);
      Promise.resolve().then(() => inspectFetchResponse(response, typeof args[0] === "string" ? args[0] : args[0]?.url));
      return response;
    };
  }

  const OriginalXHR = root.XMLHttpRequest;
  if (typeof OriginalXHR === "function") {
    const open = OriginalXHR.prototype.open;
    const send = OriginalXHR.prototype.send;

    OriginalXHR.prototype.open = function ameowWeiboOpen(method, url, ...rest) {
      this.__ameowWeiboResponseUrl = typeof url === "string" ? url : null;
      return open.call(this, method, url, ...rest);
    };

    OriginalXHR.prototype.send = function ameowWeiboSend(...args) {
      this.addEventListener("load", () => {
        inspectXhrResponse(this, this.__ameowWeiboResponseUrl);
      }, { once: true });
      return send.apply(this, args);
    };
  }

  root.AmeowWeiboPageBridgeTestHooks = {
    collectVariantRecords,
    collectVariantRecordsFromText,
  };
})(typeof window !== "undefined" ? window : globalThis);
