(function (root) {
  "use strict";

  const DEFAULT_TTL_MS = 30 * 60 * 1000;
  const DEFAULT_TOTAL_LIMIT = 50;

  function safeNow(value) {
    return Number.isFinite(Number(value)) ? Number(value) : Date.now();
  }

  function normalizeState(value) {
    return typeof value === "string" && value.trim() ? value.trim() : "";
  }

  function createBrowserDownloadTracker(options = {}) {
    const ttlMs = Number.isFinite(Number(options.ttlMs)) && Number(options.ttlMs) > 0
      ? Number(options.ttlMs)
      : DEFAULT_TTL_MS;
    const totalLimit = Number.isFinite(Number(options.totalLimit)) && Number(options.totalLimit) > 0
      ? Math.floor(Number(options.totalLimit))
      : DEFAULT_TOTAL_LIMIT;
    const states = new Map();

    function prune(now = Date.now()) {
      const cutoff = safeNow(now) - ttlMs;
      for (const [downloadId, state] of states.entries()) {
        const updatedAt = Number(state?.updatedAt || state?.createdAt || 0);
        if (updatedAt < cutoff) {
          states.delete(downloadId);
        }
      }

      if (states.size <= totalLimit) {
        return;
      }

      const retained = Array.from(states.entries())
        .sort((left, right) => Number(right[1]?.updatedAt || 0) - Number(left[1]?.updatedAt || 0))
        .slice(0, totalLimit);
      states.clear();
      retained.forEach(([downloadId, state]) => {
        states.set(downloadId, state);
      });
    }

    function recordAccepted(download) {
      const downloadId = Number(download?.downloadId);
      if (!Number.isInteger(downloadId)) {
        return null;
      }

      const now = safeNow(download?.createdAt);
      const state = {
        downloadId,
        url: typeof download?.url === "string" ? download.url : "",
        filename: typeof download?.filename === "string" ? download.filename : "",
        status: "accepted",
        createdAt: now,
        updatedAt: now,
      };
      states.set(downloadId, state);
      prune(now);
      return { ...state };
    }

    function handleChanged(delta) {
      const downloadId = Number(delta?.id);
      if (!Number.isInteger(downloadId) || !states.has(downloadId)) {
        return null;
      }

      const state = states.get(downloadId);
      const currentState = normalizeState(delta?.state?.current);
      if (currentState !== "complete" && currentState !== "interrupted") {
        return { ...state };
      }

      const now = Date.now();
      const nextState = {
        ...state,
        status: currentState === "complete" ? "complete" : "interrupted",
        error: normalizeState(delta?.error?.current) || undefined,
        updatedAt: now,
        completedAt: currentState === "complete" ? now : state.completedAt,
        interruptedAt: currentState === "interrupted" ? now : state.interruptedAt,
      };
      states.set(downloadId, nextState);
      prune(now);
      return { ...nextState };
    }

    function getState(downloadId) {
      const normalizedId = Number(downloadId);
      if (!Number.isInteger(normalizedId)) {
        return null;
      }
      const state = states.get(normalizedId);
      return state ? { ...state } : null;
    }

    function snapshot() {
      return Array.from(states.values()).map((state) => ({ ...state }));
    }

    // Reconstructs tracked state after an MV3 service-worker restart from
    // bounded persisted metadata. `restarted: true` marks every
    // rehydrated record so callers can distinguish a reconstructed state
    // from one observed live.
    function rehydrateStored(records, options = {}) {
      const now = safeNow(options.now);
      const recordsList = Array.isArray(records) ? records : [];
      for (const record of recordsList) {
        const downloadId = Number(record?.downloadId);
        if (!Number.isInteger(downloadId)) {
          continue;
        }
        const status = normalizeState(record?.status) || "accepted";
        states.set(downloadId, {
          downloadId,
          url: typeof record?.url === "string" ? record.url : "",
          filename: typeof record?.filename === "string" ? record.filename : "",
          status,
          error: normalizeState(record?.error) || undefined,
          createdAt: safeNow(record?.createdAt || now),
          updatedAt: safeNow(record?.updatedAt || now),
          restarted: options.restarted === true,
        });
      }
      prune(now);
      return snapshot();
    }

    return {
      getState,
      handleChanged,
      prune,
      recordAccepted,
      rehydrateStored,
      snapshot,
    };
  }

  root.AmeowBrowserDownloadLifecycle = {
    createBrowserDownloadTracker,
  };
})(typeof self !== "undefined" ? self : globalThis);
