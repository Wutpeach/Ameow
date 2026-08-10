// Ameow Browser Extension - Drag Token Lifecycle Operations
//
// Registration binding and page-context revalidation for drag-resolution
// tokens. A token is bound to the page context (tab/frame/document or
// URL + navigation generation) AND the navigation generation captured at
// registration time, so a same-URL reload or document replacement makes
// the token stale even though the tab URL is unchanged.
//
// Pure module: `chrome.*`/DOM are injected (getTab, pageContextStore);
// registries are injected and stay the single token authority.

(function (root) {
  "use strict";

  const createDragTokenOps = function (options = {}) {
    const getTab = typeof options.getTab === "function" ? options.getTab : async () => null;
    const pageContextStore = options.pageContextStore;
    const normalizeHttpUrl = typeof options.normalizeHttpUrl === "function"
      ? options.normalizeHttpUrl
      : (value) => (typeof value === "string" && value.trim() ? value.trim() : null);

    // Binds registration facts to the current page context key and
    // navigation generation. Both are immutable authority fields: a later
    // Desktop payload or navigation cannot replace them.
    const buildRegistration = function (context, facts) {
      const tabId = Number.isInteger(context?.tabId) ? context.tabId : null;
      if (!tabId || !facts || typeof facts !== "object") {
        return { success: false, code: "drag_token_invalid" };
      }
      const pageContextKey = pageContextStore?.pageContextKey
        ? pageContextStore.pageContextKey({
            tabId,
            frameId: Number.isInteger(context.frameId) ? context.frameId : 0,
            documentId: typeof context.documentId === "string" && context.documentId.trim()
              ? context.documentId.trim()
              : undefined,
            pageUrl: context.pageUrl,
          })
        : null;
      const navigationGeneration = pageContextStore?.getNavigationGeneration
        ? pageContextStore.getNavigationGeneration(tabId) || 0
        : 0;
      return {
        success: true,
        facts: {
          ...facts,
          tabId,
          pageContextKey,
          navigationGeneration,
        },
      };
    };

    // Revalidates a consumed token entry against the live page. A same-URL
    // reload advances the navigation generation even though the tab URL is
    // unchanged, so URL equality alone is not enough: the registration
    // generation must still be current.
    const revalidateEntry = async function (entry) {
      if (!entry || !Number.isInteger(entry.tabId)) {
        return false;
      }
      try {
        const tab = await getTab(entry.tabId);
        if (!tab) {
          return false;
        }
        const tabUrl = normalizeHttpUrl(tab.url);
        if (!tabUrl) {
          return false;
        }
        if (normalizeHttpUrl(entry.pageUrl) !== tabUrl) {
          return false;
        }
        const currentGeneration = pageContextStore?.getNavigationGeneration
          ? pageContextStore.getNavigationGeneration(entry.tabId) || 0
          : entry.navigationGeneration;
        return currentGeneration === entry.navigationGeneration;
      } catch (error) {
        return false;
      }
    };

    return {
      buildRegistration,
      revalidateEntry,
    };
  };

  root.AmeowDragTokenOps = {
    createDragTokenOps,
  };
})(typeof self !== "undefined" ? self : globalThis);
