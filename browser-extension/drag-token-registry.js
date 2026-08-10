// Ameow Browser Extension - Drag Token Registry
//
// One authority for drag-resolution tokens (protected images and
// Xiaohongshu drags). Tokens are:
//   - bounded: hard TTL and total limit, pruned on every access;
//   - page-context-bound: immutable authority fields (tab/frame/document/
//     page identity) are captured at registration and cannot be replaced
//     by a later Desktop payload;
//   - one-shot: `consume` removes the token atomically before any work, so
//     duplicate Desktop commands cannot repeat downloads or tab creation;
//   - worker-restart-explicit: a fresh registry has never seen a token, so
//     a consume miss reports `workerRestarted` when the registry is empty.
//
// Memory-only by design: transient operations fail explicitly after an MV3
// worker restart instead of persisting page-sensitive material. Pure
// module: clock injection for tests, no `chrome.*` or DOM access.

(function (root) {
  "use strict";

  const createDragTokenRegistry = function (options = {}) {
    const ttlMs = Number(options.ttlMs) > 0 ? Number(options.ttlMs) : 2 * 60 * 1000;
    const totalLimit = Number(options.totalLimit) > 0 ? Math.floor(Number(options.totalLimit)) : 20;
    const now = typeof options.now === "function" ? options.now : () => Date.now();
    const tokens = new Map();
    let registrationCount = 0;

    const prune = function (currentTime = now()) {
      for (const [token, entry] of tokens.entries()) {
        if (!entry || typeof entry.createdAt !== "number" || currentTime - entry.createdAt > ttlMs) {
          tokens.delete(token);
        }
      }
      if (tokens.size <= totalLimit) {
        return;
      }
      // Keep the most recent registrations within the total limit.
      const retained = Array.from(tokens.entries())
        .sort((left, right) => Number(right[1]?.createdAt || 0) - Number(left[1]?.createdAt || 0))
        .slice(0, totalLimit);
      tokens.clear();
      retained.forEach(([token, entry]) => {
        tokens.set(token, entry);
      });
    };

    // facts: immutable authority fields captured at registration time.
    // Desktop request data may add compatible options but cannot replace
    // these fields.
    const register = function (token, facts) {
      const normalizedToken = typeof token === "string" && token.trim() ? token.trim() : null;
      if (!normalizedToken || !facts || typeof facts !== "object") {
        return { success: false, code: "drag_token_invalid" };
      }
      prune();
      if (tokens.has(normalizedToken)) {
        return { success: false, code: "drag_token_already_registered" };
      }
      if (tokens.size >= totalLimit) {
        return { success: false, code: "drag_token_limit_reached" };
      }
      const createdAt = now();
      tokens.set(normalizedToken, {
        ...facts,
        createdAt,
      });
      registrationCount += 1;
      return { success: true, token: normalizedToken };
    };

    // Atomic one-shot consumption. Returns the registered entry (with the
    // authoritative fields) or a stable failure. A miss in a registry that
    // has never seen a registration implies a worker restart.
    const consume = function (token, expectedPageContextKey = null) {
      const normalizedToken = typeof token === "string" && token.trim() ? token.trim() : null;
      if (!normalizedToken) {
        return { success: false, code: "drag_token_invalid" };
      }
      prune();
      const entry = tokens.get(normalizedToken);
      if (!entry) {
        return {
          success: false,
          code: "drag_token_missing",
          workerRestarted: registrationCount === 0,
        };
      }
      tokens.delete(normalizedToken);
      if (expectedPageContextKey && entry.pageContextKey && entry.pageContextKey !== expectedPageContextKey) {
        return { success: false, code: "drag_token_page_context_mismatch" };
      }
      return { success: true, entry };
    };

    const removeByPageContext = function (pageContextKey) {
      if (!pageContextKey) {
        return 0;
      }
      let removed = 0;
      for (const [token, entry] of tokens.entries()) {
        if (entry?.pageContextKey === pageContextKey) {
          tokens.delete(token);
          removed += 1;
        }
      }
      return removed;
    };

    // Tab removal invalidates every token of that tab. Keyed by the
    // immutable registration tabId so removal can never touch another tab's
    // tokens.
    const removeByTab = function (tabId) {
      if (!Number.isInteger(tabId)) {
        return 0;
      }
      let removed = 0;
      for (const [token, entry] of tokens.entries()) {
        if (entry?.tabId === tabId) {
          tokens.delete(token);
          removed += 1;
        }
      }
      return removed;
    };

    const size = function () {
      prune();
      return tokens.size;
    };

    const has = function (token) {
      prune();
      return tokens.has(token);
    };

    return {
      consume,
      has,
      register,
      removeByPageContext,
      removeByTab,
      size,
    };
  };

  root.AmeowDragTokenRegistry = {
    createDragTokenRegistry,
  };
})(typeof self !== "undefined" ? self : globalThis);
