// Ameow Browser Extension - Site Session Operations
//
// Site-session projection policy for the popup drawer and quick actions:
// current-tab status, Desktop summary projection, sync, and enable. The
// Desktop stays the stored-session authority; the extension registry is
// only current for the current connection generation (explicit readiness).
//
// Pure module: chrome/storage/Desktop ports are injected (getActiveTab,
// siteSessionCookieSync, desktopPort, broadcast adapter).

(function (root) {
  "use strict";

  const createSiteSessionOps = function (options = {}) {
    const getActiveTab = options.getActiveTab || (async () => null);
    const normalizeHttpUrl = options.normalizeHttpUrl || ((value) => value);
    const isConnected = options.isConnected || (() => false);
    const siteSessionCookieSync = options.siteSessionCookieSync;
    const desktopPort = options.desktopPort;
    const requestDesktopSiteSessionSync = options.requestDesktopSiteSessionSync || (async () => ({ success: false }));
    const normalizeSiteSessionRegistryEntry = options.normalizeSiteSessionRegistryEntry || ((value) => value);
    const broadcastRegistryUpdate = options.broadcastRegistryUpdate || (() => {});
    const normalizeSynchronizedSiteSummaries = options.normalizeSynchronizedSiteSummaries || (() => []);
    const buildRequestFailure = options.buildRequestFailure || ((code) => ({ success: false, message: code }));
    const requestTimeoutMs = Number(options.requestTimeoutMs) > 0 ? Number(options.requestTimeoutMs) : 7000;

    const buildStatus = async function () {
      const tab = await getActiveTab().catch(() => null);
      const pageUrl = normalizeHttpUrl(tab?.url);
      const currentSiteSession = pageUrl
        ? siteSessionCookieSync?.findRegistryEntryForUrl?.(pageUrl) || null
        : null;
      const canEnableCurrentSite = Boolean(
        isConnected()
        && pageUrl
        && !currentSiteSession,
      );

      return {
        currentTabUrl: pageUrl,
        currentTabTitle: typeof tab?.title === "string" ? tab.title : null,
        currentSiteSession,
        canSyncCurrentSite: Boolean(isConnected() && currentSiteSession),
        canEnableCurrentSite,
        registryReady: siteSessionCookieSync?.isRegistryReady?.() === true,
        registryEntryCount: siteSessionCookieSync?.getRegistryEntries?.().length || 0,
      };
    };

    const getDrawerState = async function () {
      const currentTab = await buildStatus();
      if (!isConnected()) {
        return {
          connected: false,
          currentTab,
          synchronizedSites: [],
          reason: "desktop_offline",
        };
      }

      const response = desktopPort?.getSiteSessionSummary
        ? await desktopPort.getSiteSessionSummary({
            timeoutMs: requestTimeoutMs,
            forceConnect: true,
          })
        : buildRequestFailure("not_connected");

      return {
        connected: response?.success === true && isConnected(),
        currentTab,
        synchronizedSites: response?.success === true
          ? normalizeSynchronizedSiteSummaries(response.data)
          : [],
        reason: response?.success === true
          ? null
          : response?.data?.code || response?.message || "site_session_summary_failed",
      };
    };

    const syncCurrentSite = async function () {
      const status = await buildStatus();
      if (!status.currentSiteSession) {
        return {
          success: false,
          connected: isConnected(),
          reason: status.currentTabUrl ? "site_session_not_enabled" : "unsupported_page",
        };
      }
      // Registry entries are only current for the current connection
      // generation; without a fresh Desktop push the projection is unready.
      if (siteSessionCookieSync?.isRegistryReady?.() !== true) {
        return {
          success: false,
          connected: isConnected(),
          reason: "site_session_unready",
        };
      }
      return requestDesktopSiteSessionSync(status.currentSiteSession);
    };

    const enableCurrentSite = async function () {
      const tab = await getActiveTab();
      const pageUrl = normalizeHttpUrl(tab?.url);
      if (!pageUrl) {
        return {
          success: false,
          connected: isConnected(),
          reason: "unsupported_page",
        };
      }

      const response = desktopPort?.enableCurrentSiteSession
        ? await desktopPort.enableCurrentSiteSession(
            {
              pageUrl,
              displayName: typeof tab?.title === "string" ? tab.title : undefined,
            },
            { timeoutMs: requestTimeoutMs, forceConnect: true },
          )
        : buildRequestFailure("not_connected");
      const entry = normalizeSiteSessionRegistryEntry(response?.data?.entry);
      if (!response?.success || !entry) {
        return {
          success: false,
          connected: isConnected(),
          reason: response?.data?.code || response?.message || "site_session_enable_failed",
        };
      }

      siteSessionCookieSync?.upsertRegistryEntry?.(entry);
      broadcastRegistryUpdate(siteSessionCookieSync?.getRegistryEntries?.() || []);
      return requestDesktopSiteSessionSync(entry);
    };

    return {
      buildStatus,
      enableCurrentSite,
      getDrawerState,
      syncCurrentSite,
    };
  };

  root.AmeowSiteSessionOps = {
    createSiteSessionOps,
  };
})(typeof self !== "undefined" ? self : globalThis);
