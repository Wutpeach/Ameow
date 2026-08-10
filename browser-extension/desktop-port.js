// Ameow Browser Extension - Desktop Port
//
// The named feature-facing operations over the Desktop protocol client.
// Raw Desktop WS action strings and envelopes stop at this boundary:
// feature/application code calls intent methods, and UI/content never sees
// the client, the loopback URL, or protocol envelopes.
//
// The Desktop port owns extension-side P3 mapping only; the canonical
// Desktop Application mapping stays Desktop-owned. Queue-ack-only behavior,
// aliases, and the fixed endpoint are unchanged. It is plain JavaScript
// with the protocol client injected; no `chrome.*`, DOM, or site code.

(function (root) {
  "use strict";

  const ACTION_VIDEO_SELECTED_V2 = "video_selected_v2";
  const ACTION_SAVE_IMAGE = "save_image";
  const ACTION_SAVE_DATA_URL = "save_data_url";
  const ACTION_SYNC_DOWNLOAD_PREFERENCES = "sync_download_preferences";
  const ACTION_SITE_SESSION_SYNCED_SUMMARY = "site_session_synced_summary";
  const ACTION_SITE_SESSION_SYNC_REQUEST = "site_session_sync_request";
  const ACTION_SITE_SESSION_ENABLE_CURRENT_TAB = "site_session_enable_current_tab";
  const ACTION_PROTECTED_IMAGE_RESOLUTION_RESULT = "protected_image_resolution_result";
  const ACTION_XIAOHONGSHU_DRAG_RESOLUTION_RESULT = "xiaohongshu_drag_resolution_result";
  const ACTION_PASTED_VIDEO_SELECTION_RESULT = "pasted_video_selection_result";
  const ACTION_SITE_SESSION_COOKIE_SYNC_RESULT = "site_session_cookie_sync_result";
  const ACTION_GET_EXTENSION_DEBUG_CONFIG = "get_extension_debug_config";
  const ACTION_GET_LANGUAGE = "get_language";
  const ACTION_GET_THEME = "get_theme";

  const DEFAULT_TIMEOUT_MS = 7000;

  const createDesktopPort = function (client, options = {}) {
    const request = function (action, data = {}, policy = {}) {
      return client.request(action, data, {
        timeoutMs: policy.timeoutMs ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        connectTimeoutMs: policy.connectTimeoutMs,
        forceConnect: policy.forceConnect === true,
      });
    };

    return {
      // Queue one selection to the Desktop download queue (queue-ack-only).
      queueVideoSelection(data, policy = {}) {
        return request(ACTION_VIDEO_SELECTED_V2, data, policy);
      },

      // Save an image through the Desktop authenticated download path.
      saveImage(data, policy = {}) {
        return request(ACTION_SAVE_IMAGE, data, policy);
      },

      // Save an encoded data URL through the Desktop.
      saveDataUrl(data, policy = {}) {
        return request(ACTION_SAVE_DATA_URL, data, policy);
      },

      // Sync the extension quality preference to the Desktop.
      syncDownloadPreferences(data, policy = {}) {
        return request(ACTION_SYNC_DOWNLOAD_PREFERENCES, data, policy);
      },

      // Site-session registry summary projection.
      getSiteSessionSummary(policy = {}) {
        return request(ACTION_SITE_SESSION_SYNCED_SUMMARY, {}, policy);
      },

      requestSiteSessionSync(siteId, policy = {}) {
        return request(ACTION_SITE_SESSION_SYNC_REQUEST, { siteId }, policy);
      },

      enableCurrentSiteSession(data, policy = {}) {
        return request(ACTION_SITE_SESSION_ENABLE_CURRENT_TAB, data, policy);
      },

      // Correlated results for Desktop-initiated resolver commands. The
      // Desktop command requestId is returned as `correlationRequestId`
      // under a new extension transport requestId; they stay distinct.
      reportProtectedImageResolution(requestId, result, policy = {}) {
        return request(ACTION_PROTECTED_IMAGE_RESOLUTION_RESULT, {
          correlationRequestId: requestId,
          ...result,
        }, policy);
      },

      reportDragResolution(requestId, result, policy = {}) {
        return request(ACTION_XIAOHONGSHU_DRAG_RESOLUTION_RESULT, {
          correlationRequestId: requestId,
          ...result,
        }, policy);
      },

      reportPasteResolution(requestId, result, policy = {}) {
        return request(ACTION_PASTED_VIDEO_SELECTION_RESULT, {
          correlationRequestId: requestId,
          ...result,
        }, policy);
      },

      reportCookieSync(requestId, result, policy = {}) {
        return request(ACTION_SITE_SESSION_COOKIE_SYNC_RESULT, {
          correlationRequestId: requestId,
          ...result,
        }, policy);
      },

      requestExtensionDebugConfig(policy = {}) {
        return request(ACTION_GET_EXTENSION_DEBUG_CONFIG, {}, policy);
      },

      // Fire-and-forget notifications (no request correlation).
      requestLanguage() {
        return client.sendNotification(ACTION_GET_LANGUAGE);
      },

      requestTheme() {
        return client.sendNotification(ACTION_GET_THEME);
      },
    };
  };

  root.AmeowDesktopPort = {
    createDesktopPort,
  };
})(typeof self !== "undefined" ? self : globalThis);
