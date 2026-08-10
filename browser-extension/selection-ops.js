// Ameow Browser Extension - Selection Operations
//
// Download submission and capture policy for page-scoped media:
//   - `downloadCandidate` validates a SelectionIntent against the current
//     page context and its own selection snapshot generation before routing
//     it to the Desktop queue or a browser fallback download, and
//   - `captureCurrentContent` captures the current item with its own
//     capture generation and rejects the snapshot if the page moved on
//     (navigation, same-URL reload, tab switch, newer capture) before the
//     content script answered.
//
// Pure module: chrome/storage/DOM and the selection payload builders are
// injected (getActiveTab, pageContextStore, capability utils, submit
// functions, browser download adapter).

(function (root) {
  "use strict";

  const createSelectionOps = function (options = {}) {
    const getActiveTab = options.getActiveTab || (async () => null);
    const pageContextStore = options.pageContextStore;
    const pageSnapshotValidator = options.pageSnapshotValidator;
    const getSelectionGeneration = options.getSelectionGeneration || (() => 0);
    const nextCaptureGeneration = options.nextCaptureGeneration || (() => 0);
    const getCaptureGeneration = options.getCaptureGeneration || (() => 0);
    const isConnected = options.isConnected || (() => false);
    const isConnecting = options.isConnecting || (() => false);
    const downloadCapabilityUtils = options.downloadCapabilityUtils;
    const normalizeHttpUrl = options.normalizeHttpUrl || ((value) => value);
    const selectFirstHttpUrl = options.selectFirstHttpUrl || ((...values) => values.find(Boolean) || null);
    const normalizeSelectedVideoVariant = options.normalizeSelectedVideoVariant || ((value) => value);
    const deriveBrowserDownloadFilename = options.deriveBrowserDownloadFilename || ((candidate, url) => url);
    const startBrowserDownload = options.startBrowserDownload || (async (request) => request);
    const isRecoverableDesktopConnectionFailure = options.isRecoverableDesktopConnectionFailure || (() => false);
    const submitVideoSelection = options.submitVideoSelection || (async () => ({ success: false }));
    const submitImageSelection = options.submitImageSelection || (async () => ({ success: false }));
    const submitSelectionPayload = options.submitSelectionPayload || (async () => ({ success: false }));
    const sendMessageToTab = options.sendMessageToTab || (async () => null);
    const captureMessageType = options.captureMessageType || "ameow_capture_current_content";
    const selectionMessageType = options.selectionMessageType || "video_selection";

    const downloadCandidate = async function (candidate) {
      if (!candidate || typeof candidate !== "object") {
        return { success: false, connected: isConnected(), reason: "invalid_candidate" };
      }
      const tab = await getActiveTab();
      if (typeof tab?.id !== "number") {
        return { success: false, connected: isConnected(), reason: "no_active_tab" };
      }

      // SelectionIntent is bound to the page context and the selection
      // snapshot generation that produced the candidate: navigation, a
      // same-URL reload, or a newer snapshot rejects stale intents instead
      // of submitting wrong-page media.
      const pageContextKey = typeof candidate.pageContextKey === "string" ? candidate.pageContextKey : null;
      const selectionGeneration = typeof candidate.selectionGeneration === "number"
        ? candidate.selectionGeneration
        : null;
      const currentPageContextKey = pageContextStore?.pageContextKey
        ? pageContextStore.pageContextKey({ tabId: tab.id, frameId: 0, pageUrl: tab.url })
        : null;
      if (pageContextKey && currentPageContextKey && pageContextKey !== currentPageContextKey) {
        return { success: false, connected: isConnected(), reason: "stale_page_context" };
      }
      if (selectionGeneration !== null && selectionGeneration !== getSelectionGeneration(tab.id)) {
        return { success: false, connected: isConnected(), reason: "stale_selection" };
      }

      const desktopCandidate = candidate.desktopCandidate && typeof candidate.desktopCandidate === "object"
        ? candidate.desktopCandidate
        : candidate;
      const selectedVideoVariant = normalizeSelectedVideoVariant(candidate.selectedVideoVariant);
      const browserFallbackCandidate = candidate.browserFallbackCandidate && typeof candidate.browserFallbackCandidate === "object"
        ? candidate.browserFallbackCandidate
        : null;
      const mediaType = desktopCandidate.mediaType || candidate.mediaType;
      const url = normalizeHttpUrl(desktopCandidate.url);
      const fallbackCandidate = selectedVideoVariant || browserFallbackCandidate;
      const fallbackUrl = normalizeHttpUrl(fallbackCandidate?.url);
      const pageUrl = selectFirstHttpUrl(desktopCandidate.pageUrl, candidate.pageUrl, tab?.url, url, fallbackUrl);
      const capability = downloadCapabilityUtils?.resolveDownloadCapability
        ? downloadCapabilityUtils.resolveDownloadCapability(desktopCandidate)
        : {
            browserDownloadable: false,
            requiresDesktop: true,
            desktopReason: "capability_unavailable",
          };
      const fallbackCapability = fallbackCandidate && downloadCapabilityUtils?.resolveDownloadCapability
        ? downloadCapabilityUtils.resolveDownloadCapability(fallbackCandidate)
        : null;
      const canUseBrowserFallback = Boolean(
        fallbackCandidate
        && fallbackUrl
        && (
          downloadCapabilityUtils?.canUseBrowserFallback
            ? downloadCapabilityUtils.canUseBrowserFallback(fallbackCandidate)
            : fallbackCapability?.requiresDesktop !== true && fallbackCapability?.browserDownloadable === true
        ),
      );

      if (!url) {
        return {
          success: false,
          connected: isConnected(),
          reason: capability.requiresDesktop ? "desktop_required" : "invalid_candidate_url",
          desktopReason: capability.desktopReason,
        };
      }

      const browserDownload = () => startBrowserDownload({
        url: canUseBrowserFallback ? fallbackUrl : url,
        filename: deriveBrowserDownloadFilename(
          canUseBrowserFallback ? fallbackCandidate : desktopCandidate,
          canUseBrowserFallback ? fallbackUrl : url,
        ),
      });

      if (capability.requiresDesktop && !isConnected() && !isConnecting()) {
        if (canUseBrowserFallback) {
          return browserDownload();
        }
        return {
          success: false,
          connected: isConnected(),
          reason: "desktop_required",
          desktopReason: capability.desktopReason,
        };
      }

      if (!capability.requiresDesktop && !isConnected() && !isConnecting()) {
        return browserDownload();
      }

      if (mediaType === "image") {
        const imageResult = await submitImageSelection({
          type: "save_image_from_page",
          url,
          pageUrl,
          originalFilename: desktopCandidate.title || candidate.title || undefined,
        }, {
          tabUrl: tab?.url,
        });

        if (!imageResult?.success && !capability.requiresDesktop && isRecoverableDesktopConnectionFailure(imageResult)) {
          return browserDownload();
        }

        if (!imageResult?.success && capability.requiresDesktop && isRecoverableDesktopConnectionFailure(imageResult)) {
          return {
            success: false,
            connected: isConnected(),
            reason: "desktop_required",
            desktopReason: capability.desktopReason,
          };
        }

        return imageResult;
      }

      const desktopResult = await submitVideoSelection({
        type: selectionMessageType,
        url,
        pageUrl,
        videoUrl: selectedVideoVariant?.url || url,
        title: desktopCandidate.title || candidate.title || tab?.title,
        selectedVideoVariant,
        videoCandidates: [{
          url: selectedVideoVariant?.url || url,
          type: typeof selectedVideoVariant?.type === "string" ? selectedVideoVariant.type : typeof desktopCandidate.type === "string" ? desktopCandidate.type : "unknown",
          confidence: typeof selectedVideoVariant?.confidence === "string" ? selectedVideoVariant.confidence : typeof desktopCandidate.confidence === "string" ? desktopCandidate.confidence : "low",
          source: typeof selectedVideoVariant?.source === "string" ? selectedVideoVariant.source : typeof desktopCandidate.source === "string" ? desktopCandidate.source : "popup_media_browser",
          mediaType: mediaType === "audio" ? "audio" : "video",
        }],
        selectionScope: "current_item",
        extensionData: {
          ameowCapture: {
            version: 1,
            action: "popup_fallback",
            pageUrl: pageUrl || url,
            targetHref: selectedVideoVariant?.url || url,
            targetSrc: selectedVideoVariant?.url || undefined,
            title: desktopCandidate.title || candidate.title || tab?.title,
          },
        },
      }, {
        tabUrl: tab?.url,
      });

      if (!desktopResult?.success && !capability.requiresDesktop && isRecoverableDesktopConnectionFailure(desktopResult)) {
        return browserDownload();
      }

      if (!desktopResult?.success && capability.requiresDesktop && isRecoverableDesktopConnectionFailure(desktopResult)) {
        return {
          success: false,
          connected: isConnected(),
          reason: "desktop_required",
          desktopReason: capability.desktopReason,
        };
      }

      return desktopResult;
    };

    // Captures the current item with its own capture generation. The
    // captured payload is only current for the page context it was
    // requested against, and only until a newer capture, navigation, or
    // tab switch supersedes it.
    const captureCurrentContent = async function (tab) {
      if (!tab || !Number.isInteger(tab.id)) {
        return {
          success: false,
          connected: isConnected(),
          reason: "no_active_tab",
        };
      }

      const captureGeneration = nextCaptureGeneration(tab.id);
      const pageContextKey = pageContextStore?.pageContextKey
        ? pageContextStore.pageContextKey({ tabId: tab.id, frameId: 0, pageUrl: tab.url })
        : null;

      const response = await sendMessageToTab(tab.id, {
        type: captureMessageType,
      }, { frameId: 0 }).catch(() => null);
      const payload = response?.payload && typeof response.payload === "object"
        ? response.payload
        : {
            type: selectionMessageType,
            url: tab.url,
            pageUrl: tab.url,
            title: tab.title,
            selectionScope: "current_item",
          };

      if (!(await pageSnapshotValidator?.isStillCurrent(
        tab,
        pageContextKey,
        captureGeneration,
        { generationOf: getCaptureGeneration },
      ))) {
        return {
          success: false,
          connected: isConnected(),
          reason: "stale_capture",
        };
      }

      return submitSelectionPayload(payload, {
        tabUrl: tab.url,
      });
    };

    return {
      captureCurrentContent,
      downloadCandidate,
    };
  };

  root.AmeowSelectionOps = {
    createSelectionOps,
  };
})(typeof self !== "undefined" ? self : globalThis);
