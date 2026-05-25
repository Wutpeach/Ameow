(function initAmeowMediaScanCache(root) {
  "use strict";

  function isRecord(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function pruneMediaScanCacheEntries(cache, currentKey, currentResult, options = {}) {
    const ttlMs = Number(options.ttlMs);
    const totalLimit = Number(options.totalLimit);
    const now = Number(options.now);
    const effectiveTtlMs = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 5 * 60 * 1000;
    const effectiveTotalLimit = Number.isFinite(totalLimit) && totalLimit > 0
      ? Math.floor(totalLimit)
      : 24;
    const effectiveNow = Number.isFinite(now) ? now : Date.now();

    const entries = isRecord(cache) ? Object.entries(cache) : [];
    const retainedEntries = entries
      .filter(([entryKey, entry]) => {
        if (entryKey === currentKey) {
          return false;
        }
        const scannedAt = Number(entry?.scannedAt || 0);
        return effectiveNow - scannedAt <= effectiveTtlMs;
      })
      .sort((left, right) => Number(right[1]?.scannedAt || 0) - Number(left[1]?.scannedAt || 0))
      .slice(0, Math.max(0, effectiveTotalLimit - 1));

    const nextCache = Object.fromEntries(retainedEntries);
    nextCache[currentKey] = currentResult;
    return nextCache;
  }

  root.AmeowMediaScanCache = {
    pruneMediaScanCacheEntries,
  };
})(typeof self !== "undefined" ? self : globalThis);
