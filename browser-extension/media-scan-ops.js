// Ameow Browser Extension - Media Scan Operations
//
// Page media discovery policy: runs the in-tab scan, guards the commit
// (an old scan that completes after a newer scan, navigation, same-URL
// reload, or tab switch must not write the cache or become current), and
// reads the cache only when the stored snapshot still matches the current
// page context and scan generation.
//
// Pure module: `chrome.*`/storage/DOM are injected (getActiveTab,
// sendMessageToTab, storageGet, extensionStore, pageContextStore,
// mediaScanCache, mediaNetworkCache, generation helpers).

(function (root) {
  "use strict";

  const createMediaScanOps = function (options = {}) {
    const getActiveTab = options.getActiveTab || (async () => null);
    const sendMessageToTab = options.sendMessageToTab || (async () => null);
    const storageGet = options.storageGet || (async () => ({}));
    const getNetworkMediaEntriesForTab = options.getNetworkMediaEntriesForTab || (async () => []);
    const extensionStore = options.extensionStore;
    const mediaScanCache = options.mediaScanCache;
    const mediaNetworkCache = options.mediaNetworkCache;
    const pageContextStore = options.pageContextStore;
    const pageSnapshotValidator = options.pageSnapshotValidator;
    const nextScanGeneration = options.nextScanGeneration || (() => 0);
    const getScanGeneration = options.getScanGeneration || (() => 0);
    const nextSelectionGeneration = options.nextSelectionGeneration || (() => 0);
    const normalizeHttpUrl = options.normalizeHttpUrl || ((value) => value);
    const hashString = options.hashString || ((value) => String(value));
    const storageKey = options.storageKey;
    const ttlMs = Number(options.ttlMs) > 0 ? Number(options.ttlMs) : 60 * 1000;
    const cacheTtlMs = Number(options.cacheTtlMs) > 0 ? Number(options.cacheTtlMs) : ttlMs * 5;
    const totalLimit = Number(options.totalLimit) > 0 ? Number(options.totalLimit) : 24;
    const scanTotalLimit = Number(options.scanTotalLimit) > 0 ? Number(options.scanTotalLimit) : 100;
    const scanTimeoutMs = Number(options.scanTimeoutMs) > 0 ? Number(options.scanTimeoutMs) : 5000;

    const isRecord = function (value) {
      return Boolean(value && typeof value === "object" && !Array.isArray(value));
    };

    const mediaScanCacheKey = function (tab) {
      const tabId = typeof tab?.id === "number" ? tab.id : "none";
      const url = typeof tab?.url === "string" ? tab.url : "";
      return `${tabId}-${hashString(url)}`;
    };

    const isRestrictedTabUrl = function (rawUrl) {
      if (typeof rawUrl !== "string" || !rawUrl.trim()) {
        return true;
      }
      return /^(?:about|chrome|chrome-extension|edge|moz-extension|opera|vivaldi):/i.test(rawUrl.trim());
    };

    const normalizeMediaScanResponse = function (response, tab) {
      if (!response?.success) {
        return {
          success: false,
          reason: response?.reason || "scan_failed",
          pageUrl: tab?.url || null,
          pageTitle: tab?.title || "",
          videos: [],
          audios: [],
          images: [],
          scannedAt: Date.now(),
          scanDurationMs: 0,
        };
      }
      const videos = Array.isArray(response.videos)
        ? response.videos.slice(0, scanTotalLimit)
        : [];
      const audios = Array.isArray(response.audios)
        ? response.audios.slice(0, Math.max(0, scanTotalLimit - videos.length))
        : [];
      const images = Array.isArray(response.images)
        ? response.images.slice(0, Math.max(0, scanTotalLimit - videos.length - audios.length))
        : [];
      const inputTotal =
        (Array.isArray(response.videos) ? response.videos.length : 0)
        + (Array.isArray(response.audios) ? response.audios.length : 0)
        + (Array.isArray(response.images) ? response.images.length : 0);
      return {
        success: true,
        pageUrl: normalizeHttpUrl(response.pageUrl) || tab?.url || null,
        pageTitle: typeof response.pageTitle === "string" ? response.pageTitle : tab?.title || "",
        pagePreviewUrl: normalizeHttpUrl(response.pagePreviewUrl) || undefined,
        videos,
        audios,
        images,
        scannedAt: typeof response.scannedAt === "number" ? response.scannedAt : Date.now(),
        scanDurationMs: typeof response.scanDurationMs === "number" ? response.scanDurationMs : 0,
        truncated: response.truncated === true || videos.length + audios.length + images.length < inputTotal,
      };
    };

    const mergeNetworkMediaCandidates = function (normalized, networkEntries) {
      if (!normalized?.success || !mediaNetworkCache?.mergeNetworkCandidatesIntoScanResult) {
        return normalized;
      }
      return mediaNetworkCache.mergeNetworkCandidatesIntoScanResult(normalized, networkEntries, {
        totalLimit: scanTotalLimit,
      });
    };

    const storeMediaScanCache = async function (tab, result) {
      const key = mediaScanCacheKey(tab);
      if (!extensionStore || !mediaScanCache?.pruneMediaScanCacheEntries) {
        return;
      }
      await extensionStore.update(storageKey, (cache) => {
        const currentCache = isRecord(cache) ? cache : {};
        return mediaScanCache.pruneMediaScanCacheEntries(currentCache, key, result, {
          now: Date.now(),
          ttlMs: cacheTtlMs,
          totalLimit,
        });
      });
    };

    const getMediaScanCacheForActiveTab = async function () {
      const tab = await getActiveTab();
      if (!tab?.id) {
        return { success: false, reason: "no_active_tab" };
      }

      const pageContextKey = pageContextStore?.pageContextKey
        ? pageContextStore.pageContextKey({ tabId: tab.id, frameId: 0, pageUrl: tab.url })
        : null;
      const generation = getScanGeneration(tab.id);
      const result = await storageGet(storageKey).catch(() => ({}));
      const storedCache = result?.[storageKey];
      const cache = isRecord(storedCache) ? storedCache : {};
      const key = mediaScanCacheKey(tab);
      const entry = cache[key] || null;

      // The stored snapshot is only current when it was written for this
      // page context at the current scan generation. A same-URL reload or a
      // newer scan changes one of the two, so the old snapshot cannot be
      // served.
      const snapshotMatches = Boolean(
        entry
        && normalizeHttpUrl(entry.pageUrl) === normalizeHttpUrl(tab.url)
        && (!entry.pageContextKey || entry.pageContextKey === pageContextKey)
        && (typeof entry.generation !== "number" || entry.generation === generation),
      );
      if (!snapshotMatches) {
        return {
          success: true,
          cached: false,
          pageUrl: tab.url || null,
          pageTitle: tab.title || "",
          generation,
          pageContextKey,
          ttlMs,
        };
      }

      const ageMs = Date.now() - Number(entry.scannedAt || 0);
      return {
        success: true,
        cached: true,
        stale: ageMs > ttlMs,
        ageMs,
        generation,
        selectionGeneration: typeof entry.selectionGeneration === "number"
          ? entry.selectionGeneration
          : generation,
        pageContextKey,
        ttlMs,
        result: entry,
      };
    };

    const mediaScanInFlight = new Map();

    const scanPageMediaForActiveTab = async function () {
      const tab = await getActiveTab();
      if (!tab?.id) {
        return { success: false, reason: "no_active_tab" };
      }

      if (isRestrictedTabUrl(tab.url)) {
        return {
          success: false,
          reason: "scan_restricted_page",
          pageUrl: tab.url || null,
          pageTitle: tab.title || "",
          videos: [],
          audios: [],
          images: [],
          scannedAt: Date.now(),
          scanDurationMs: 0,
          ttlMs,
        };
      }

      const cacheKey = mediaScanCacheKey(tab);
      const existingScan = mediaScanInFlight.get(cacheKey);
      if (existingScan) {
        return existingScan;
      }

      const scanGeneration = nextScanGeneration(tab.id);
      const selectionGeneration = nextSelectionGeneration(tab.id);
      const pageContextKey = pageContextStore?.pageContextKey
        ? pageContextStore.pageContextKey({ tabId: tab.id, frameId: 0, pageUrl: tab.url })
        : null;

      const scanPromise = (async () => {
      let timeoutId = null;
      try {
        const response = await Promise.race([
          sendMessageToTab(
            tab.id,
            { type: "ameow_scan_page_media" },
            { frameId: 0 },
          ).catch((error) => ({
            success: false,
            reason: error?.message || "scan_unavailable",
          })),
          new Promise((resolve) => {
            timeoutId = setTimeout(() => resolve({
              success: false,
              reason: "scan_timeout",
            }), scanTimeoutMs);
          }),
        ]);
        const normalized = normalizeMediaScanResponse(response, tab);
        const networkEntries = normalized.success
          ? await getNetworkMediaEntriesForTab(tab).catch(() => [])
          : [];
        const merged = mergeNetworkMediaCandidates(normalized, networkEntries);

        // Commit guard: an old scan that completes after a newer scan, a
        // navigation (including same-URL reload), or a tab switch must
        // neither write the current cache nor become the current result.
        if (merged.success && !(await pageSnapshotValidator?.isStillCurrent(
          tab,
          pageContextKey,
          scanGeneration,
          { generationOf: getScanGeneration },
        ))) {
          return {
            success: false,
            reason: "stale_page_context",
            pageUrl: tab?.url || null,
            pageTitle: tab?.title || "",
            videos: [],
            audios: [],
            images: [],
            scannedAt: Date.now(),
            scanDurationMs: 0,
            ttlMs,
          };
        }

        if (merged.success) {
          await storeMediaScanCache(tab, {
            ...merged,
            generation: scanGeneration,
            selectionGeneration,
            pageContextKey,
          }).catch((error) => {
            console.warn("[Ameow] Failed to cache media scan result:", error);
          });
        }
        return {
          ...merged,
          generation: scanGeneration,
          selectionGeneration,
          pageContextKey,
          ttlMs,
        };
      } finally {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
      }
      })();

      mediaScanInFlight.set(cacheKey, scanPromise);
      try {
        return await scanPromise;
      } finally {
        mediaScanInFlight.delete(cacheKey);
      }
    };

    return {
      getMediaScanCacheForActiveTab,
      scanPageMediaForActiveTab,
    };
  };

  root.AmeowMediaScanOps = {
    createMediaScanOps,
  };
})(typeof self !== "undefined" ? self : globalThis);
