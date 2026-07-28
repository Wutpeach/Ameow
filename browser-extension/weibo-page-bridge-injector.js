(function initAmeowWeiboPageBridgeInjector(root) {
  "use strict";

  const PAGE_BRIDGE_SCRIPT_PATH = "weibo-page-bridge.js";
  const PAGE_BRIDGE_MESSAGE_SOURCE = "ameow-weibo-page";
  const PAGE_BRIDGE_EVENT_TYPE = "AMEOW_WEIBO_VIDEO_VARIANTS";
  const VARIANT_CACHE_KEY = "__AMEOW_WEIBO_VARIANT_CACHE";
  const MAX_RECORDS = 24;
  const MAX_VARIANTS = 24;
  const WEIBO_HOST_RE = /(?:^|\.)weibo\.(?:com|cn)$/i;
  const WEIBO_EXTRA_HOST_RE = /(?:^|\.)video\.weibo\.com$/i;

  let pageBridgeInjected = false;
  let pageBridgeInjectionPromise = null;

  function isWeiboHost() {
    const host = root.location?.hostname || "";
    return WEIBO_HOST_RE.test(host) || WEIBO_EXTRA_HOST_RE.test(host);
  }

  function normalizeString(value, limit = 120) {
    return typeof value === "string" && value.trim()
      ? value.trim().slice(0, limit)
      : "";
  }

  function normalizeHttpUrl(rawUrl) {
    if (typeof rawUrl !== "string") {
      return "";
    }
    try {
      const resolved = new URL(rawUrl.trim(), root.location?.href).toString();
      return /^https?:\/\//i.test(resolved) ? resolved : "";
    } catch (_) {
      return "";
    }
  }

  function normalizeVariant(rawVariant) {
    if (!rawVariant || typeof rawVariant !== "object") {
      return null;
    }
    const url = normalizeHttpUrl(rawVariant.url);
    if (!url || !/\.(?:mp4|m3u8)(?:[?#]|$)/i.test(url)) {
      return null;
    }
    const variant = {
      url,
      label: normalizeString(rawVariant.label, 40),
      type: normalizeString(rawVariant.type, 40) || "direct_mp4",
      source: normalizeString(rawVariant.source, 40) || "weibo_api_observer",
      confidence: normalizeString(rawVariant.confidence, 16) || "high",
      mediaType: "video",
    };
    for (const key of ["qualityIndex", "width", "height", "bitrate"]) {
      const value = Number(rawVariant[key]);
      if (Number.isFinite(value) && value > 0) {
        variant[key] = Math.round(value);
      }
    }
    return variant;
  }

  function normalizeRecord(rawRecord) {
    if (!rawRecord || typeof rawRecord !== "object") {
      return null;
    }
    const variants = Array.isArray(rawRecord.variants)
      ? rawRecord.variants.map(normalizeVariant).filter(Boolean).slice(0, MAX_VARIANTS)
      : [];
    if (variants.length === 0) {
      return null;
    }
    return {
      groupKey: normalizeString(rawRecord.groupKey, 160),
      statusId: normalizeString(rawRecord.statusId, 80),
      pageUrl: normalizeHttpUrl(rawRecord.pageUrl),
      variants,
      updatedAtMs: Date.now(),
    };
  }

  function getVariantCache() {
    const existing = root[VARIANT_CACHE_KEY];
    if (existing && typeof existing === "object" && Array.isArray(existing.records)) {
      return existing;
    }
    const created = { records: [] };
    root[VARIANT_CACHE_KEY] = created;
    return created;
  }

  function upsertRecords(records) {
    if (!Array.isArray(records) || records.length === 0) {
      return;
    }
    const cache = getVariantCache();
    const byKey = new Map();
    cache.records.forEach((record) => {
      const key = record.statusId || record.pageUrl || record.groupKey;
      if (key) {
        byKey.set(key, record);
      }
    });
    records.map(normalizeRecord).filter(Boolean).forEach((record) => {
      const key = record.statusId || record.pageUrl || record.groupKey || record.variants.map((variant) => variant.url).join("|");
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, record);
        return;
      }
      const variantsByUrl = new Map(existing.variants.map((variant) => [variant.url, variant]));
      record.variants.forEach((variant) => variantsByUrl.set(variant.url, variant));
      byKey.set(key, {
        ...existing,
        ...record,
        variants: Array.from(variantsByUrl.values()).slice(0, MAX_VARIANTS),
        updatedAtMs: Date.now(),
      });
    });
    cache.records = Array.from(byKey.values())
      .sort((left, right) => Number(right.updatedAtMs || 0) - Number(left.updatedAtMs || 0))
      .slice(0, MAX_RECORDS);
  }

  function injectPageBridge() {
    if (pageBridgeInjected) {
      return Promise.resolve();
    }
    if (pageBridgeInjectionPromise) {
      return pageBridgeInjectionPromise;
    }
    pageBridgeInjectionPromise = new Promise((resolve, reject) => {
      const parent = document.documentElement || document.head || document.body;
      if (!parent) {
        reject(new Error("Weibo page bridge injection target was not available"));
        return;
      }
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL(PAGE_BRIDGE_SCRIPT_PATH);
      script.async = false;
      script.onload = () => {
        script.remove();
        pageBridgeInjected = true;
        pageBridgeInjectionPromise = null;
        resolve();
      };
      script.onerror = () => {
        script.remove();
        pageBridgeInjectionPromise = null;
        reject(new Error("Weibo page bridge failed to load"));
      };
      parent.appendChild(script);
    });
    return pageBridgeInjectionPromise;
  }

  function handlePageBridgeMessage(event) {
    if (event.source !== root) {
      return;
    }
    const data = event.data;
    if (
      !data
      || data.source !== PAGE_BRIDGE_MESSAGE_SOURCE
      || data.type !== PAGE_BRIDGE_EVENT_TYPE
    ) {
      return;
    }
    upsertRecords(data.records);
  }

  root.addEventListener("message", handlePageBridgeMessage, true);

  if (isWeiboHost()) {
    void injectPageBridge().catch((error) => {
      console.warn("[Ameow Weibo] Failed to inject page bridge:", error);
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
