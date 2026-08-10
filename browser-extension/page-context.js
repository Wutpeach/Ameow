// Ameow Browser Extension - Page/Frame/Document Identity
//
// Normalizes the browser message context once (tabId + frameId +
// documentId + pageUrl) and derives a PageContextKey that survives only as
// long as the page it describes. When Chrome supplies a stable
// `documentId` it is authoritative; otherwise the key is the normalized
// page URL plus an explicit navigation generation advanced by the browser
// adapter on navigation/loading. Tab removal removes all page-scoped state.
//
// Pure module: no `chrome.*`, DOM, or transport references; the background
// composition root wires the tab lifecycle listeners.

(function (root) {
  "use strict";

  const isRecord = function (value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  };

  const normalizeString = function (value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };

  const normalizeHttpUrl = function (rawUrl) {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) {
      return null;
    }
    try {
      const resolved = new URL(rawUrl.trim()).toString();
      return /^https?:\/\//i.test(resolved) ? resolved : null;
    } catch {
      return null;
    }
  };

  // One authoritative normalization of a content-originated message
  // sender. Never replace it with a later active-tab lookup.
  const normalizeBrowserMessageContext = function (sender, fallback = {}) {
    const tabId = Number.isInteger(sender?.tab?.id) ? sender.tab.id : null;
    const frameId = Number.isInteger(sender?.frameId) ? sender.frameId : null;
    const documentId = normalizeString(sender?.documentId);
    const pageUrl = normalizeHttpUrl(
      sender?.tab?.url
      || sender?.url
      || fallback.pageUrl,
    );
    return { tabId, frameId, documentId, pageUrl };
  };

  const createPageContextStore = function () {
    // tabId -> navigation generation (advanced on navigation/loading)
    const navigationGenerations = new Map();

    const advanceNavigation = function (tabId) {
      if (!Number.isInteger(tabId) || tabId < 0) {
        return null;
      }
      const next = (navigationGenerations.get(tabId) || 0) + 1;
      navigationGenerations.set(tabId, next);
      return next;
    };

    const getNavigationGeneration = function (tabId) {
      if (!Number.isInteger(tabId) || tabId < 0) {
        return null;
      }
      return navigationGenerations.get(tabId) || 0;
    };

    const removeTab = function (tabId) {
      if (!Number.isInteger(tabId)) {
        return;
      }
      navigationGenerations.delete(tabId);
    };

    const pageContextKey = function (context) {
      if (!isRecord(context) || !Number.isInteger(context.tabId)) {
        return null;
      }
      const frameId = Number.isInteger(context.frameId) ? context.frameId : 0;
      if (context.documentId) {
        return `${context.tabId}:${frameId}:doc:${context.documentId}`;
      }
      const pageUrl = normalizeHttpUrl(context.pageUrl);
      if (!pageUrl) {
        return null;
      }
      const navigationGeneration = getNavigationGeneration(context.tabId) || 0;
      return `${context.tabId}:${frameId}:${pageUrl}#${navigationGeneration}`;
    };

    return {
      advanceNavigation,
      getNavigationGeneration,
      normalizeBrowserMessageContext,
      pageContextKey,
      removeTab,
    };
  };

  // A page-scoped operation (scan/capture) may only commit when the tab it
  // ran against is still the active tab, its page context key still matches
  // the snapshot, and its own generation is still current. Navigation,
  // same-URL reload, tab switch, or a newer operation of the same kind all
  // fail this check. `getActiveTab` and the store are injected; the module
  // stays chrome-free.
  const createPageSnapshotValidator = function ({ getActiveTab, pageContextStore }) {
    const isStillCurrent = async function (tab, pageContextKey, generation, { generationOf }) {
      if (!tab || !Number.isInteger(tab.id)) {
        return false;
      }
      if (typeof generationOf === "function" && generationOf(tab.id) !== generation) {
        return false;
      }
      const current = await getActiveTab();
      if (!current || current.id !== tab.id) {
        return false;
      }
      if (!pageContextKey || !pageContextStore?.pageContextKey) {
        return false;
      }
      const currentKey = pageContextStore.pageContextKey({
        tabId: tab.id,
        frameId: 0,
        pageUrl: current.url,
      });
      return Boolean(currentKey && currentKey === pageContextKey);
    };

    return { isStillCurrent };
  };

  root.AmeowPageContext = {
    createPageContextStore,
    createPageSnapshotValidator,
    normalizeBrowserMessageContext,
  };
})(typeof self !== "undefined" ? self : globalThis);
