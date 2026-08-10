// Ameow Browser Extension - Background Service Worker
// WebSocket client for communication with Ameow desktop app

importScripts(
  "action-icon-indicator.js",
  "browser-download-lifecycle.js",
  "desktop-download-protocol.js",
  "desktop-port.js",
  "direct-download-quality.js",
  "drag-token-ops.js",
  "drag-token-registry.js",
  "extension-data-utils.js",
  "extension-store.js",
  "generic-video-selection-utils.js",
  "download-capability-utils.js",
  "media-network-cache.js",
  "injection-debug-config.js",
  "launcher-config.js",
  "media-scan-cache.js",
  "media-scan-ops.js",
  "page-context.js",
  "selection-ops.js",
  "site-session-cookie-sync.js",
  "site-session-ops.js",
  "video-selection-routing.js",
  "xiaohongshu-drag-resolution-utils.js",
);

const WS_RECONNECT_ALARM = 'ameow-ws-reconnect';
const REQUEST_TIMEOUT_MS = 7000;
const CONNECTING_WAIT_TIMEOUT_MS = 500;
const VIDEO_SELECTION_CONNECT_TIMEOUT_MS = 3500;
const VIDEO_SELECTION_RETRY_CONNECT_TIMEOUT_MS = 5000;
const SITE_SESSION_SYNC_REQUEST_TIMEOUT_MS = 25000;
const PASTED_VIDEO_SELECTION_RESOLUTION_TIMEOUT_MS = 20000;
const PROTECTED_IMAGE_DRAG_TTL_MS = 2 * 60 * 1000;
const PROTECTED_IMAGE_RESOLUTION_TIMEOUT_MS = 15000;
const PROTECTED_IMAGE_BACKGROUND_FETCH_TIMEOUT_MS = 12000;
const XIAOHONGSHU_DRAG_TTL_MS = 2 * 60 * 1000;
const XIAOHONGSHU_DRAG_RESOLUTION_TIMEOUT_MS = 30000;
const XIAOHONGSHU_BACKGROUND_TAB_TIMEOUT_MS = 18000;
const OFFLINE_STATUS_TEXT = 'Offline';
const FALLBACK_LANGUAGE = 'en';
const LANGUAGE_STORAGE_KEY = 'ameowCurrentLanguage';
const PENDING_DOWNLOAD_PREFERENCES_SYNC_KEY = 'ameowPendingDownloadPreferencesSync';
const WS_ACTION_LANGUAGE_INFO = 'language_info';
const WS_ACTION_LANGUAGE_CHANGED = 'language_changed';
const INTERNAL_VIDEO_SELECTION_MESSAGE = 'video_selection';
const INTERNAL_RESOLVE_VIDEO_SELECTION_MESSAGE = 'ameow_resolve_video_selection';
const INTERNAL_RESOLVE_PASTED_VIDEO_SELECTION_MESSAGE = 'ameow_resolve_pasted_video_selection';
const INTERNAL_RESOLVE_XIAOHONGSHU_CONTEXT_MEDIA_MESSAGE = 'resolve_xiaohongshu_context_media';
const INTERNAL_NAVIGATE_XIAOHONGSHU_NOTE_MESSAGE = 'navigate_xiaohongshu_note';
const INTERNAL_PAGE_IMAGE_SELECTION_MESSAGE = 'save_image_from_page';
const INTERNAL_REGISTER_XIAOHONGSHU_DRAG_MESSAGE = 'register_xiaohongshu_drag';
const INTERNAL_DOWNLOAD_CURRENT_CONTENT_MESSAGE = 'ameow_download_current_content';
const INTERNAL_CAPTURE_CURRENT_CONTENT_MESSAGE = 'ameow_capture_current_content';
const INTERNAL_LAUNCHER_PING_MESSAGE = 'ameow_launcher_ping';
const INTERNAL_LAUNCHER_RESTORE_MESSAGE = 'ameow_launcher_restore';
const INTERNAL_LAUNCHER_CONFIG_UPDATE_MESSAGE = 'ameow_launcher_config_update';
const INTERNAL_THEME_UPDATE_MESSAGE = 'theme_update';
const INTERNAL_SCAN_PAGE_MEDIA_MESSAGE = 'ameow_scan_page_media';
const INTERNAL_START_PICKER_MESSAGE = 'ameow_start_picker';
const MEDIA_SCAN_CACHE_KEY = 'ameowMediaScanCache';
const MEDIA_NETWORK_CACHE_KEY = 'ameowMediaNetworkCache';
const MEDIA_SCAN_CACHE_TTL_MS = 60 * 1000;
const MEDIA_SCAN_CACHE_TOTAL_LIMIT = 24;
const MEDIA_NETWORK_CACHE_TTL_MS = 3 * 60 * 1000;
const MEDIA_NETWORK_CACHE_PER_TAB_LIMIT = 40;
const MEDIA_NETWORK_CACHE_TOTAL_LIMIT = 120;
const MEDIA_SCAN_TIMEOUT_MS = 5000;
const MEDIA_SCAN_TOTAL_LIMIT = 100;
const BROWSER_DOWNLOAD_STATE_TTL_MS = 30 * 60 * 1000;
const BROWSER_DOWNLOAD_STATE_TOTAL_LIMIT = 50;
const BROWSER_DOWNLOAD_STATE_KEY = 'ameowBrowserDownloadState';
const desktopDownloadProtocol = self.AmeowDesktopDownloadProtocol;
const buildRequestFailure = desktopDownloadProtocol.buildRequestFailure;
const protectedImageDragRegistry = self.AmeowDragTokenRegistry?.createDragTokenRegistry
  ? self.AmeowDragTokenRegistry.createDragTokenRegistry({
      ttlMs: PROTECTED_IMAGE_DRAG_TTL_MS,
      totalLimit: 20,
    })
  : null;
const xiaohongshuDragRegistry = self.AmeowDragTokenRegistry?.createDragTokenRegistry
  ? self.AmeowDragTokenRegistry.createDragTokenRegistry({
      ttlMs: XIAOHONGSHU_DRAG_TTL_MS,
      totalLimit: 20,
    })
  : null;
const scanGenerations = new Map();
// Capture snapshots and selection snapshots have their own per-tab
// generations, distinct from scan generations and from each other.
const captureGenerations = new Map();
const selectionGenerations = new Map();
let actionIndicatorConnectionState = null;
const extensionStore = self.AmeowExtensionStore?.createSerializedStorageStore
  ? self.AmeowExtensionStore.createSerializedStorageStore({
      storageGet: (key) => storageGet(key),
      storageSet: (payload) => storageSet(payload),
      logger: (level, ...args) => {
        const method = level === 'error' ? console.error : console.warn;
        method(...args);
      },
    })
  : null;
const pageContextStore = self.AmeowPageContext?.createPageContextStore
  ? self.AmeowPageContext.createPageContextStore()
  : null;
const dragTokenOps = self.AmeowDragTokenOps?.createDragTokenOps
  ? self.AmeowDragTokenOps.createDragTokenOps({
      getTab: (tabId) => getTab(tabId),
      pageContextStore,
      normalizeHttpUrl,
    })
  : null;
const pageSnapshotValidator = self.AmeowPageContext?.createPageSnapshotValidator
  ? self.AmeowPageContext.createPageSnapshotValidator({
      getActiveTab: () => getActiveTab(),
      pageContextStore,
    })
  : null;

// Store current theme from desktop app
let currentTheme = 'black';
let currentLanguage = resolvePreferredLanguage(undefined, self.navigator?.language);
const directDownloadQuality = self.AmeowDirectDownloadQuality;
const downloadCapabilityUtils = self.AmeowDownloadCapabilityUtils;
const extensionDataUtils = self.AmeowExtensionDataUtils;
const genericVideoSelectionUtils = self.AmeowGenericVideoSelectionUtils;
const injectionDebugConfig = self.AmeowInjectionDebugConfig;
const launcherConfig = self.AmeowLauncherConfig;
const mediaNetworkCache = self.AmeowMediaNetworkCache;
const mediaScanCache = self.AmeowMediaScanCache;
const siteSessionCookieSync = self.AmeowSiteSessionCookieSync;
const actionIconIndicator = self.AmeowActionIconIndicator;
const browserDownloadLifecycle = self.AmeowBrowserDownloadLifecycle;
const videoSelectionRouting = self.AmeowVideoSelectionRouting;
const xiaohongshuDragResolutionUtils = self.AmeowXiaohongshuDragResolutionUtils;
const selectionOps = self.AmeowSelectionOps?.createSelectionOps
  ? self.AmeowSelectionOps.createSelectionOps({
      getActiveTab: () => getActiveTab(),
      pageContextStore,
      pageSnapshotValidator,
      getSelectionGeneration,
      nextCaptureGeneration,
      getCaptureGeneration,
      isConnected,
      isConnecting,
      downloadCapabilityUtils,
      normalizeHttpUrl,
      selectFirstHttpUrl,
      normalizeSelectedVideoVariant,
      deriveBrowserDownloadFilename,
      startBrowserDownload,
      isRecoverableDesktopConnectionFailure,
      submitVideoSelection: (payload, context) => handleVideoSelectionRequest(payload, context),
      submitImageSelection: (payload, context) => handlePageImageSelectionRequest(payload, context),
      submitSelectionPayload: (payload, context) => handleVideoSelectionRequest(payload, context),
      sendMessageToTab,
      captureMessageType: INTERNAL_CAPTURE_CURRENT_CONTENT_MESSAGE,
      selectionMessageType: INTERNAL_VIDEO_SELECTION_MESSAGE,
    })
  : null;
const mediaScanOps = self.AmeowMediaScanOps?.createMediaScanOps
  ? self.AmeowMediaScanOps.createMediaScanOps({
      getActiveTab: () => getActiveTab(),
      sendMessageToTab,
      storageGet,
      getNetworkMediaEntriesForTab,
      extensionStore,
      mediaScanCache,
      mediaNetworkCache,
      pageContextStore,
      pageSnapshotValidator,
      nextScanGeneration,
      getScanGeneration,
      nextSelectionGeneration,
      normalizeHttpUrl,
      hashString,
      storageKey: MEDIA_SCAN_CACHE_KEY,
      ttlMs: MEDIA_SCAN_CACHE_TTL_MS,
      cacheTtlMs: MEDIA_SCAN_CACHE_TTL_MS * 5,
      totalLimit: MEDIA_SCAN_CACHE_TOTAL_LIMIT,
      scanTotalLimit: MEDIA_SCAN_TOTAL_LIMIT,
      scanTimeoutMs: MEDIA_SCAN_TIMEOUT_MS,
    })
  : null;
const languageInitializationPromise = initializeLanguageState();
const browserDownloadTracker = browserDownloadLifecycle?.createBrowserDownloadTracker
  ? browserDownloadLifecycle.createBrowserDownloadTracker({
    ttlMs: BROWSER_DOWNLOAD_STATE_TTL_MS,
    totalLimit: BROWSER_DOWNLOAD_STATE_TOTAL_LIMIT,
  })
  : null;

function isEnglishVariant(normalized) {
  return normalized === 'en' || normalized.startsWith('en-');
}

function isChineseVariant(normalized) {
  return normalized === 'zh' || normalized.startsWith('zh-');
}

function normalizeAppLanguage(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/_/g, '-').toLowerCase();
  if (!normalized) {
    return null;
  }

  if (isEnglishVariant(normalized)) {
    return 'en';
  }

  if (isChineseVariant(normalized)) {
    return 'zh-CN';
  }

  return null;
}

function resolvePreferredLanguage(cachedLanguage, navigatorLanguage) {
  return (
    normalizeAppLanguage(cachedLanguage) ||
    normalizeAppLanguage(navigatorLanguage) ||
    FALLBACK_LANGUAGE
  );
}

function storageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime?.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(result);
    });
  });
}

function storageSet(payload) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(payload, () => {
      if (chrome.runtime?.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve();
    });
  });
}

async function setPendingDownloadPreferencesSync(pending) {
  if (!chrome?.storage?.local) {
    return;
  }

  try {
    await storageSet({
      [PENDING_DOWNLOAD_PREFERENCES_SYNC_KEY]: pending === true,
    });
  } catch (error) {
    console.error('[Ameow] Failed to persist pending preference sync state:', error);
  }
}

async function getCachedLanguage() {
  if (!chrome?.storage?.local) {
    return null;
  }

  try {
    const result = await storageGet(LANGUAGE_STORAGE_KEY);
    return normalizeAppLanguage(result?.[LANGUAGE_STORAGE_KEY]);
  } catch (error) {
    console.error('[Ameow] Failed to load cached language:', error);
    return null;
  }
}

async function cacheLanguage(language) {
  if (!chrome?.storage?.local) {
    return;
  }

  try {
    await storageSet({ [LANGUAGE_STORAGE_KEY]: language });
  } catch (error) {
    console.error('[Ameow] Failed to cache language:', error);
  }
}

function notifyLanguageUpdate() {
  chrome.runtime.sendMessage({
    type: 'language_update',
    language: currentLanguage,
  }).catch(() => {});
}

function setCurrentLanguage(nextLanguage, options = {}) {
  const normalized = normalizeAppLanguage(nextLanguage);
  if (!normalized) {
    return currentLanguage;
  }

  const changed = normalized !== currentLanguage;
  currentLanguage = normalized;

  if (options.persist !== false) {
    void cacheLanguage(normalized);
  }

  if (options.broadcast !== false && changed) {
    notifyLanguageUpdate();
  }

  return currentLanguage;
}

async function initializeLanguageState() {
  const cachedLanguage = await getCachedLanguage();
  const initialLanguage = resolvePreferredLanguage(cachedLanguage, self.navigator?.language);
  setCurrentLanguage(initialLanguage, {
    persist: cachedLanguage !== initialLanguage,
    broadcast: false,
  });
  return currentLanguage;
}

// The Desktop protocol client owns the raw socket, connection generation,
// reconnect, envelope handling, and pending correlation. Background is the
// composition root: it injects the socket factory, the Chrome alarm adapter,
// the Desktop command dispatcher, and the post-connect bootstrap.
const desktopClient = desktopDownloadProtocol.createDesktopProtocolClient({
  createSocket(url) {
    return new WebSocket(url);
  },
  scheduleReconnectAlarm(delayMs) {
    if (!chrome?.alarms?.create) {
      return;
    }
    try {
      chrome.alarms.create(WS_RECONNECT_ALARM, {
        when: Date.now() + Math.max(1000, delayMs),
      });
    } catch (error) {
      console.error('[Ameow] Failed to schedule reconnect alarm:', error);
    }
  },
  clearReconnectAlarm() {
    if (!chrome?.alarms?.clear) {
      return;
    }
    try {
      chrome.alarms.clear(WS_RECONNECT_ALARM, () => {});
    } catch (error) {
      console.error('[Ameow] Failed to clear reconnect alarm:', error);
    }
  },
  onOpen: handleConnectedBootstrap,
  onClose: clearExtensionInjectionDebugConfigOnDisconnect,
  onCommand: handleMessage,
});

const desktopPort = self.AmeowDesktopPort?.createDesktopPort
  ? self.AmeowDesktopPort.createDesktopPort(desktopClient)
  : null;

// Composition order: the Desktop client and named port exist before any
// operation that captures them, so module evaluation cannot hit a TDZ
// ReferenceError even though the dependency is only used later.
const siteSessionOps = self.AmeowSiteSessionOps?.createSiteSessionOps
  ? self.AmeowSiteSessionOps.createSiteSessionOps({
      getActiveTab: () => getActiveTab(),
      normalizeHttpUrl,
      isConnected,
      siteSessionCookieSync,
      desktopPort,
      requestDesktopSiteSessionSync,
      normalizeSiteSessionRegistryEntry,
      broadcastRegistryUpdate: (entries) => {
        chrome.runtime.sendMessage({
          type: 'site_session_registry_update',
          entries,
        }).catch(() => {});
      },
      normalizeSynchronizedSiteSummaries,
      buildRequestFailure,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
    })
  : null;

desktopClient.subscribeConnection((state) => {
  if (!state.connected) {
    // Registry entries belong to the previous connection generation; they
    // become stale on close/replacement until Desktop pushes again.
    siteSessionCookieSync?.resetRegistryReadiness?.();
  }
  notifyConnectionStatus();
});

function requestLanguageFromApp() {
  return desktopPort?.requestLanguage ? desktopPort.requestLanguage() : false;
}

function isConnected() {
  return desktopClient.isConnected();
}

function isConnecting() {
  return desktopClient.isConnecting();
}

function connectionState() {
  return desktopClient.connectionState();
}

function connectionStatusText() {
  return desktopClient.connectionStatusText();
}

function notifyConnectionStatus() {
  chrome.runtime.sendMessage({
    type: 'connection_update',
    connected: isConnected(),
    connecting: desktopClient.getConnectionState().connecting,
    state: connectionState(),
    statusText: connectionStatusText(),
  }).catch(() => {});
  updateActionConnectionIndicator();
}

// Post-connect bootstrap: query theme/language and sync desktop-owned
// extension settings after every successful open.
function handleConnectedBootstrap() {
  try {
    desktopPort?.requestTheme?.();
  } catch (error) {
    console.warn('[Ameow] Failed to request theme from desktop app:', error);
  }

  requestLanguageFromApp();
  void bootstrapDownloadPreferencesSync();
  void syncExtensionInjectionDebugConfigFromApp();
}

function normalizeMediaSelectionPayload(message) {
  const requestedUrl = normalizeHttpUrl(message?.url);
  const pageUrl = normalizeHttpUrl(message?.pageUrl);
  const selectionScope = normalizeSelectionScope(message?.selectionScope) || 'current_item';
  const videoCandidates = normalizeVideoCandidates(message?.videoCandidates);
  const videoUrl = normalizeHttpUrl(message?.videoUrl);
  const selectedVideoVariant = normalizeSelectedVideoVariant(message?.selectedVideoVariant);
  const rawExtensionData = message?.extensionData && typeof message.extensionData === 'object'
    ? message.extensionData
    : message?.extension_data && typeof message.extension_data === 'object'
      ? message.extension_data
      : null;
  const normalizedExtensionData = extensionDataUtils?.normalizeExtensionData
    ? extensionDataUtils.normalizeExtensionData(rawExtensionData)
    : undefined;
  const siteHint = deriveSiteHint([
    message?.siteHint,
    pageUrl,
    requestedUrl,
    videoUrl,
  ]);
  const clipStartSec = normalizeClipTimeSeconds(message?.clipStartSec);
  const clipEndSec = normalizeClipTimeSeconds(message?.clipEndSec);
  const advancedQualityRequest = message?.advancedQualityRequest === true;

  return {
    requestedUrl,
    pageUrl,
    selectionScope,
    videoCandidates,
    videoUrl,
    selectedVideoVariant,
    siteHint,
    extensionData: normalizedExtensionData,
    clipStartSec,
    clipEndSec,
    advancedQualityRequest,
    title: typeof message?.title === 'string' ? message.title : undefined,
  };
}

function buildSelectionCandidateFromUrl(rawUrl, source = 'context_menu_src') {
  const url = normalizeHttpUrl(rawUrl);
  if (!url) {
    return [];
  }

  const type = genericVideoSelectionUtils?.classifyVideoCandidateType
    ? genericVideoSelectionUtils.classifyVideoCandidateType(url)
    : 'indirect_media';

  return [{
    url,
    type,
    confidence: type === 'direct_mp4' ? 'high' : 'medium',
    source,
    mediaType: 'video',
  }];
}

function isLikelyContentPageUrl(rawUrl) {
  const normalized = normalizeHttpUrl(rawUrl);
  if (!normalized) {
    return false;
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.pathname === '/' || parsed.pathname === '') {
      return false;
    }

    if (
      /(?:^|\.)xiaohongshu\.com$/i.test(parsed.hostname)
      && /^\/user\/profile\//i.test(parsed.pathname)
    ) {
      return false;
    }

    return !/\.(?:mp4|m4v|mov|webm|m3u8|mpd|jpg|jpeg|png|webp|gif|svg)(?:[?#]|$)/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function normalizeOriginalFilename(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : null;
}

function sanitizeBrowserDownloadFilename(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const sanitized = value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
  return sanitized || null;
}

function filenameExtension(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const match = value.match(/\.([a-z0-9]{2,8})$/i);
  return match ? match[1].toLowerCase() : '';
}

function deriveBrowserDownloadFilename(candidate, url) {
  const fromUrl = sanitizeBrowserDownloadFilename(deriveFilenameFromUrl(url));
  const title = sanitizeBrowserDownloadFilename(candidate?.title);
  if (!title) {
    return fromUrl || undefined;
  }

  const titleExt = filenameExtension(title);
  if (titleExt) {
    return title;
  }

  const urlExt = filenameExtension(fromUrl);
  return urlExt ? `${title}.${urlExt}` : title;
}

function isRecoverableDesktopConnectionFailure(result) {
  const code = result?.data?.code || result?.message || result?.reason || '';
  return code === 'not_connected' || code === 'send_failed';
}

function startBrowserDownload({ url, filename }) {
  return new Promise((resolve) => {
    if (!chrome?.downloads?.download) {
      resolve({
        success: false,
        connected: isConnected(),
        reason: 'browser_download_unavailable',
      });
      return;
    }

    const options = { url };
    if (filename) {
      options.filename = filename;
    }

    chrome.downloads.download(options, (downloadId) => {
      const error = chrome.runtime?.lastError;
      if (error) {
        resolve({
          success: false,
          connected: isConnected(),
          reason: 'browser_download_failed',
          error: error.message || String(error),
        });
        return;
      }

      if (typeof downloadId !== 'number') {
        resolve({
          success: false,
          connected: isConnected(),
          reason: 'browser_download_failed',
        });
        return;
      }

      const downloadState = browserDownloadTracker?.recordAccepted?.({
        downloadId,
        url,
        filename,
      }) || null;
      void persistBrowserDownloadState();

      resolve({
        success: true,
        connected: isConnected(),
        downloadedBy: 'browser',
        downloadId,
        browserDownloadStatus: downloadState?.status || 'accepted',
      });
    });
  });
}

// Bounded persisted metadata lets the MV3 worker reconstruct active
// browser-download state after suspension instead of silently losing it.
async function persistBrowserDownloadState() {
  if (!extensionStore || !browserDownloadTracker?.snapshot) {
    return;
  }
  const snapshot = browserDownloadTracker.snapshot();
  await extensionStore.update(BROWSER_DOWNLOAD_STATE_KEY, () => (
    snapshot.slice(0, BROWSER_DOWNLOAD_STATE_TOTAL_LIMIT)
  ));
}

async function rehydrateBrowserDownloadState() {
  if (!browserDownloadTracker?.rehydrateStored) {
    return;
  }
  const stored = await storageGet(BROWSER_DOWNLOAD_STATE_KEY).catch(() => ({}));
  const records = stored?.[BROWSER_DOWNLOAD_STATE_KEY];
  browserDownloadTracker.rehydrateStored(
    Array.isArray(records) ? records : [],
    { restarted: true, now: Date.now() },
  );
}

function handleBrowserDownloadChanged(delta) {
  const result = browserDownloadTracker?.handleChanged?.(delta) || null;
  if (result) {
    void persistBrowserDownloadState();
  }
  return result;
}

function getBrowserDownloadState(downloadId) {
  const state = browserDownloadTracker?.getState?.(downloadId) || null;
  if (!state) {
    return {
      success: false,
      reason: 'download_state_not_found',
    };
  }

  return {
    success: true,
    state,
  };
}

function handlePageImageSelectionRequest(message, senderContext = {}) {
  const imageUrl = normalizeHttpUrl(message?.url || message?.imageUrl);
  const pageUrl = selectFirstHttpUrl(
    message?.pageUrl,
    message?.linkUrl,
    senderContext.tabUrl,
    imageUrl,
  );
  const originalFilename = normalizeOriginalFilename(message?.originalFilename);

  if (!imageUrl) {
    return Promise.resolve({
      success: false,
      connected: isConnected(),
      reason: 'invalid_image_url',
    });
  }

  return downloadProtectedImageViaDesktopApp(
    imageUrl,
    pageUrl || senderContext.tabUrl || imageUrl,
    null,
    originalFilename || undefined,
  ).then((result) => {
    if (!result?.success) {
      console.warn(
        '[Ameow] Image selection request was not completed:',
        result?.data?.code || result?.message || 'unknown',
      );
    }

    return {
      success: Boolean(result?.success),
      connected: isConnected(),
      reason: result?.data?.code || null,
    };
  }).catch((error) => {
    console.error('[Ameow] Failed to prepare image selection request:', error);
    return {
      success: false,
      connected: isConnected(),
      reason: 'prepare_failed',
    };
  });
}

function shouldRetryVideoSelectionRequest(result) {
  if (result?.success) {
    return false;
  }

  const code = result?.data?.code || result?.message || '';
  return code === 'not_connected' || code === 'send_failed';
}

function notifyExtensionInjectionDebugConfigUpdate(enabled) {
  chrome.runtime.sendMessage({
    type: 'extension_injection_debug_config_update',
    enabled: enabled === true,
  }).catch(() => {});
}

async function setExtensionInjectionDebugEnabled(enabled) {
  const normalized = enabled === true;

  if (!injectionDebugConfig?.setEnabled) {
    return normalized;
  }

  try {
    await injectionDebugConfig.setEnabled(normalized);
    notifyExtensionInjectionDebugConfigUpdate(normalized);
    return normalized;
  } catch (error) {
    console.error('[Ameow] Failed to persist injection debug config:', error);
    return normalized;
  }
}

function syncExtensionInjectionDebugConfigFromApp() {
  if (!desktopPort?.requestExtensionDebugConfig) {
    return Promise.resolve(false);
  }
  return desktopPort.requestExtensionDebugConfig({
    timeoutMs: REQUEST_TIMEOUT_MS,
    forceConnect: true,
  }).then((response) => {
    if (!response?.success) {
      console.warn(
        '[Ameow] Failed to sync extension injection debug config:',
        response?.data?.code || response?.message || 'unknown'
      );
      return false;
    }

    const enabled = response?.data?.enabled === true;
    return setExtensionInjectionDebugEnabled(enabled).then(() => true);
  }).catch((error) => {
    console.error('[Ameow] Failed to sync extension injection debug config:', error);
    return false;
  });
}

function clearExtensionInjectionDebugConfigOnDisconnect() {
  void setExtensionInjectionDebugEnabled(false);
}

function resetSocketForRetry() {
  desktopClient.resetSocketForRetry();
}

function normalizeHttpUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const resolved = new URL(trimmed).toString();
    return resolved.startsWith('http://') || resolved.startsWith('https://')
      ? resolved
      : null;
  } catch (error) {
    return null;
  }
}

function hashString(value) {
  const input = typeof value === 'string' ? value : '';
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function selectFirstHttpUrl(...values) {
  for (const value of values) {
    const normalized = normalizeHttpUrl(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function normalizeSiteHint(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === 'youtube' || normalized === 'yt' || normalized === 'youtu' || normalized === 'youtu.be') {
    return 'youtube';
  }
  if (normalized === 'bilibili' || normalized === 'bili' || normalized === 'b23') {
    return 'bilibili';
  }
  if (normalized === 'twitter' || normalized === 'x' || normalized === 'twitter-x') {
    return 'twitter-x';
  }
  if (normalized === 'douyin') {
    return 'douyin';
  }
  if (normalized === 'xiaohongshu' || normalized === 'xhs') {
    return 'xiaohongshu';
  }
  if (normalized === 'pinterest') {
    return 'pinterest';
  }
  if (normalized === 'weibo' || normalized === 'weibo.cn') {
    return 'weibo';
  }
  if (normalized === 'generic') {
    return 'generic';
  }

  // Generic transport preserves an explicit unknown hint as a safe opaque id
  // so a new Site needs no alias/URL edit here; provider matching decides.
  if (/^[a-z0-9_-]{1,64}$/.test(normalized)) {
    return normalized;
  }

  return null;
}

function deriveSiteHint(values) {
  for (const value of values) {
    const normalized = normalizeSiteHint(value);
    if (normalized) {
      return normalized;
    }
  }

  for (const rawValue of values) {
    const value = typeof rawValue === 'string' ? rawValue.toLowerCase() : '';
    if (!value) continue;

    if (value.includes('youtube.com/') || value.includes('youtu.be/')) {
      return 'youtube';
    }
    if (value.includes('bilibili.com/') || value.includes('b23.tv/') || value.includes('bilivideo.com/')) {
      return 'bilibili';
    }
    if (value.includes('twitter.com/') || value.includes('x.com/')) {
      return 'twitter-x';
    }
    if (
      value.includes('douyin.com/')
      || value.includes('douyinvod.com/')
      || value.includes('douyincdn.com/')
      || value.includes('bytecdn')
      || value.includes('bytedance')
    ) {
      return 'douyin';
    }
    if (value.includes('xiaohongshu.com/') || value.includes('xhslink.com/') || value.includes('xhscdn.com/')) {
      return 'xiaohongshu';
    }
    if (value.includes('pinterest.com/') || value.includes('pinimg.com/')) {
      return 'pinterest';
    }
    if (
      value.includes('weibo.com/')
      || value.includes('weibo.cn/')
      || value.includes('m.weibo.com/')
      || value.includes('m.weibo.cn/')
      || value.includes('video.weibo.com/')
    ) {
      return 'weibo';
    }
  }

  return null;
}

function summarizeVideoSelectionForDebug(payload) {
  const normalizedTitle = typeof payload?.title === 'string' ? payload.title.trim() : '';
  const normalizedCandidates = Array.isArray(payload?.videoCandidates) ? payload.videoCandidates : [];
  const youtubeExtensionData = payload?.extensionData?.youtube && typeof payload.extensionData.youtube === 'object'
    ? payload.extensionData.youtube
    : null;

  return {
    url: normalizeHttpUrl(payload?.url) || null,
    pageUrl: normalizeHttpUrl(payload?.pageUrl) || null,
    videoUrl: normalizeHttpUrl(payload?.videoUrl) || null,
    selectedVideoVariantUrl: normalizeHttpUrl(payload?.selectedVideoVariant?.url) || null,
    selectionScope: typeof payload?.selectionScope === 'string' ? payload.selectionScope : null,
    siteHint: typeof payload?.siteHint === 'string' ? payload.siteHint : null,
    titlePresent: normalizedTitle.length > 0,
    cookiesPresent: typeof payload?.cookies === 'string' && payload.cookies.trim().length > 0,
    extensionData: youtubeExtensionData ? {
      youtube: {
        source: typeof youtubeExtensionData.source === 'string' ? youtubeExtensionData.source : null,
      },
    } : null,
    videoCandidateCount: normalizedCandidates.length,
    clipStartSec: Number.isFinite(payload?.clipStartSec) ? payload.clipStartSec : null,
    clipEndSec: Number.isFinite(payload?.clipEndSec) ? payload.clipEndSec : null,
    videoQuality:
      typeof payload?.videoQuality === 'string' ? payload.videoQuality : null,
  };
}

function logInjectedVideoSelectionDebug(message, payload) {
  if (typeof payload === 'undefined') {
    console.info(`[Ameow] ${message}`);
    return;
  }

  console.info(`[Ameow] ${message}`, payload);
}

function deriveFilenameFromUrl(rawUrl) {
  const normalized = normalizeHttpUrl(rawUrl);
  if (!normalized) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    const rawName = parsed.pathname.split('/').filter(Boolean).pop() || '';
    return rawName ? decodeURIComponent(rawName) : null;
  } catch (error) {
    return null;
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => reject(new Error('Failed to read protected image blob'));
    reader.readAsDataURL(blob);
  });
}

function buildCookieHeader(cookies) {
  if (!Array.isArray(cookies) || cookies.length === 0) {
    return '';
  }

  return cookies
    .filter((cookie) => typeof cookie?.name === 'string' && typeof cookie?.value === 'string')
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

async function getCookieHeaderForRequestUrl(url) {
  const normalizedUrl = normalizeHttpUrl(url);
  if (!normalizedUrl) {
    return '';
  }

  try {
    const cookies = await chrome.cookies.getAll({ url: normalizedUrl });
    return buildCookieHeader(cookies);
  } catch (error) {
    console.warn('[Ameow] Failed to read cookies for protected image request:', error);
    return '';
  }
}

async function fetchProtectedImageInBackground(imageUrl, pageUrl) {
  const normalizedUrl = normalizeHttpUrl(imageUrl);
  if (!normalizedUrl) {
    return {
      success: false,
      code: 'protected_image_invalid_url',
      error: 'Invalid protected image URL',
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error('Protected image background fetch timed out'));
  }, PROTECTED_IMAGE_BACKGROUND_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(normalizedUrl, {
      credentials: 'include',
      cache: 'force-cache',
      referrer: normalizeHttpUrl(pageUrl) || undefined,
      referrerPolicy: 'strict-origin-when-cross-origin',
      headers: {
        Accept: 'image/*,*/*;q=0.8',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        success: false,
        code: 'protected_image_fetch_failed',
        error: `Protected image background fetch failed with status ${response.status}`,
      };
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('image/')) {
      return {
        success: false,
        code: 'protected_image_non_image_response',
        error: 'Protected image background fetch returned non-image content',
      };
    }

    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return {
        success: false,
        code: 'protected_image_blob_encode_failed',
        error: 'Protected image background blob encoding failed',
      };
    }

    return {
      success: true,
      dataUrl,
      filename: deriveFilenameFromUrl(response.url || normalizedUrl),
    };
  } catch (error) {
    return {
      success: false,
      code: 'protected_image_background_fetch_failed',
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function downloadProtectedImageViaDesktopApp(imageUrl, pageUrl, targetDir, originalFilename) {
  const normalizedUrl = normalizeHttpUrl(imageUrl);
  if (!normalizedUrl) {
    return buildRequestFailure('protected_image_invalid_url');
  }

  const normalizedPageUrl = normalizeHttpUrl(pageUrl);
  let originHeader;
  try {
    originHeader = normalizedPageUrl ? new URL(normalizedPageUrl).origin : undefined;
  } catch (error) {
    originHeader = undefined;
  }

  const headers = {
    Accept: 'image/*,*/*;q=0.8',
    Referer: normalizedPageUrl || undefined,
    Origin: originHeader,
    'User-Agent': self.navigator?.userAgent || undefined,
  };
  const cookieHeader = await getCookieHeaderForRequestUrl(normalizedUrl);
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  if (!desktopPort?.saveImage) {
    return buildRequestFailure('not_connected');
  }
  return desktopPort.saveImage(
    {
      url: normalizedUrl,
      targetDir,
      originalFilename,
      requestHeaders: headers,
      referrer: normalizedPageUrl || undefined,
    },
    { timeoutMs: PROTECTED_IMAGE_RESOLUTION_TIMEOUT_MS },
  );
}

function sendMessageToTab(tabId, message, options = {}) {
  return new Promise((resolve, reject) => {
    const callback = (response) => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    };

    try {
      if (typeof options.frameId === 'number' && options.frameId >= 0) {
        chrome.tabs.sendMessage(tabId, message, { frameId: options.frameId }, callback);
      } else {
        chrome.tabs.sendMessage(tabId, message, callback);
      }
    } catch (error) {
      reject(error);
    }
  });
}

async function reportProtectedImageResolutionResult(requestId, result) {
  if (!requestId) {
    return;
  }
  if (!desktopPort?.reportProtectedImageResolution) {
    return;
  }

  const response = await desktopPort.reportProtectedImageResolution(
    requestId,
    {
      success: result?.success === true,
      filePath: typeof result?.filePath === 'string' ? result.filePath : undefined,
      code: typeof result?.code === 'string' ? result.code : undefined,
      error: typeof result?.error === 'string' ? result.error : undefined,
    },
    { timeoutMs: PROTECTED_IMAGE_RESOLUTION_TIMEOUT_MS },
  );

  if (!response?.success) {
    console.warn(
      '[Ameow] protected_image_resolution_result was not acknowledged:',
      response?.data?.code || response?.message || 'unknown'
    );
  }
}

async function reportXiaohongshuDragResolutionResult(requestId, result) {
  if (!requestId) {
    return;
  }
  if (!desktopPort?.reportDragResolution) {
    return;
  }

  const response = await desktopPort.reportDragResolution(
    requestId,
    {
      success: result?.success === true,
      kind: typeof result?.kind === 'string' ? result.kind : 'unknown',
      pageUrl: normalizeHttpUrl(result?.pageUrl),
      detailUrl: normalizeHttpUrl(result?.detailUrl),
      imageUrl: normalizeHttpUrl(result?.imageUrl),
      videoUrl: normalizeHttpUrl(result?.videoUrl),
      videoCandidates: normalizeVideoCandidates(result?.videoCandidates),
      videoIntentConfidence: normalizeVideoIntentConfidence(result?.videoIntentConfidence),
      videoIntentSources: normalizeStringList(result?.videoIntentSources),
      sourcePageUrl: normalizeHttpUrl(result?.sourcePageUrl),
      cookies: typeof result?.cookies === 'string' && result.cookies.trim()
        ? result.cookies
        : undefined,
      code: typeof result?.code === 'string' ? result.code : undefined,
      error: typeof result?.error === 'string' ? result.error : undefined,
    },
    { timeoutMs: XIAOHONGSHU_DRAG_RESOLUTION_TIMEOUT_MS },
  );

  if (!response?.success) {
    console.warn(
      '[Ameow] xiaohongshu_drag_resolution_result was not acknowledged:',
      response?.data?.code || response?.message || 'unknown'
    );
  }
}

async function reportPastedVideoSelectionResolutionResult(requestId, result) {
  if (!requestId) {
    return;
  }
  if (!desktopPort?.reportPasteResolution) {
    return;
  }

  const response = await desktopPort.reportPasteResolution(
    requestId,
    {
      success: result?.success === true,
      url: normalizeHttpUrl(result?.url),
      pageUrl: normalizeHttpUrl(result?.pageUrl),
      videoUrl: normalizeHttpUrl(result?.videoUrl),
      videoCandidates: normalizeVideoCandidates(result?.videoCandidates),
      siteHint: typeof result?.siteHint === 'string' ? result.siteHint : undefined,
      title: typeof result?.title === 'string' ? result.title : undefined,
      cookies: typeof result?.cookies === 'string' && result.cookies.trim()
        ? result.cookies
        : undefined,
      selectionScope: result?.selectionScope === 'current_item' || result?.selectionScope === 'playlist'
        ? result.selectionScope
        : undefined,
      clipStartSec: normalizeClipTimeSeconds(result?.clipStartSec) ?? undefined,
      clipEndSec: normalizeClipTimeSeconds(result?.clipEndSec) ?? undefined,
      videoQuality:
        result?.videoQuality === 'best'
        || result?.videoQuality === 'balanced'
        || result?.videoQuality === 'data_saver'
          ? result.videoQuality
          : undefined,
      extensionData: result?.extensionData && typeof result.extensionData === 'object'
        ? result.extensionData
        : undefined,
      code: typeof result?.code === 'string' ? result.code : undefined,
      error: typeof result?.error === 'string' ? result.error : undefined,
    },
    { timeoutMs: PASTED_VIDEO_SELECTION_RESOLUTION_TIMEOUT_MS },
  );

  if (!response?.success) {
    console.warn(
      '[Ameow] pasted_video_selection_result was not acknowledged:',
      response?.data?.code || response?.message || 'unknown'
    );
  }
}

async function reportSiteSessionCookieSyncResult(requestId, result) {
  if (!requestId) {
    return;
  }
  if (!desktopPort?.reportCookieSync) {
    return;
  }

  const response = await desktopPort.reportCookieSync(
    requestId,
    {
      success: result?.success === true,
      siteId: typeof result?.siteId === 'string' ? result.siteId : undefined,
      source: result?.source && typeof result.source === 'object'
        ? result.source
        : undefined,
      cookies: Array.isArray(result?.cookies) ? result.cookies : [],
      code: typeof result?.code === 'string' ? result.code : undefined,
      error: typeof result?.error === 'string' ? result.error : undefined,
    },
    { timeoutMs: REQUEST_TIMEOUT_MS },
  );

  if (!response?.success) {
    console.warn(
      '[Ameow] site_session_cookie_sync_result was not acknowledged:',
      response?.data?.code || response?.message || 'unknown'
    );
  }
}

function resolveExtensionSyncBrowserLabel() {
  const userAgent = self.navigator?.userAgent || '';
  if (/\bEdg\//.test(userAgent)) {
    return 'edge';
  }
  if (/\bOPR\//.test(userAgent)) {
    return 'opera';
  }
  if (/\bChrome\//.test(userAgent) || /\bChromium\//.test(userAgent)) {
    return 'chromium';
  }
  return 'browser-extension';
}

async function collectSiteSessionCookies(site) {
  const queries = siteSessionCookieSync.buildCookieQueries(site);
  const collected = [];
  for (const query of queries) {
    try {
      const cookies = await chrome.cookies.getAll(query);
      collected.push(...cookies);
    } catch (error) {
      console.warn('[Ameow] Failed to read site-session cookies for query:', {
        domain: query.domain || null,
        url: query.url || null,
        error: error?.message || String(error),
      });
    }
  }

  return siteSessionCookieSync.normalizeCookieRecords(collected, site.cookieDomains);
}

function normalizeSiteSessionRegistryEntry(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const siteId = typeof value.siteId === 'string' && value.siteId.trim()
    ? value.siteId.trim()
    : null;
  const cookieDomains = Array.isArray(value.cookieDomains)
    ? value.cookieDomains.filter((domain) => typeof domain === 'string' && domain.trim())
    : [];
  if (!siteId || cookieDomains.length === 0) {
    return null;
  }
  return {
    ...value,
    siteId,
    displayName: typeof value.displayName === 'string' && value.displayName.trim()
      ? value.displayName.trim()
      : siteId,
    cookieDomains,
  };
}

function applySiteSessionRegistryUpdate(data) {
  const entries = siteSessionCookieSync.setRegistryEntries(data?.entries || []);
  siteSessionCookieSync.setRegistryReady(true);
  chrome.runtime.sendMessage({
    type: 'site_session_registry_update',
    entries,
  }).catch(() => {});
}

function findCurrentSiteSessionForUrl(url) {
  return siteSessionCookieSync.findRegistryEntryForUrl(url);
}

async function buildSiteSessionStatusForActiveTab() {
  return siteSessionOps?.buildStatus() ?? {
    currentTabUrl: null,
    currentTabTitle: null,
    currentSiteSession: null,
    canSyncCurrentSite: false,
    canEnableCurrentSite: false,
    registryReady: false,
    registryEntryCount: 0,
  };
}

function normalizeSiteSessionSyncSource(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return {
    browser: typeof value.browser === 'string' && value.browser.trim() ? value.browser.trim() : null,
    profileLabel: typeof value.profileLabel === 'string' && value.profileLabel.trim()
      ? value.profileLabel.trim()
      : typeof value.profile_label === 'string' && value.profile_label.trim()
        ? value.profile_label.trim()
        : null,
    extensionId: typeof value.extensionId === 'string' && value.extensionId.trim()
      ? value.extensionId.trim()
      : typeof value.extension_id === 'string' && value.extension_id.trim()
        ? value.extension_id.trim()
        : null,
  };
}

function normalizeSynchronizedSiteSummary(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const siteId = typeof value.siteId === 'string' && value.siteId.trim()
    ? value.siteId.trim()
    : typeof value.site_id === 'string' && value.site_id.trim()
      ? value.site_id.trim()
      : null;
  if (!siteId) {
    return null;
  }

  const updatedAtMs = Number(value.updatedAtMs ?? value.updated_at_ms);
  return {
    siteId,
    displayName: typeof value.displayName === 'string' && value.displayName.trim()
      ? value.displayName.trim()
      : typeof value.display_name === 'string' && value.display_name.trim()
        ? value.display_name.trim()
        : siteId,
    primaryHost: typeof value.primaryHost === 'string' && value.primaryHost.trim()
      ? value.primaryHost.trim()
      : typeof value.primary_host === 'string' && value.primary_host.trim()
        ? value.primary_host.trim()
        : null,
    icon: value.icon && typeof value.icon === 'object' ? value.icon : null,
    availability: value.availability === 'ready' || value.availability === 'partial'
      ? value.availability
      : null,
    updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : null,
    lastSyncSource: normalizeSiteSessionSyncSource(value.lastSyncSource ?? value.last_sync_source),
  };
}

function normalizeSynchronizedSiteSummaries(value) {
  const rawEntries = Array.isArray(value?.synchronizedSites)
    ? value.synchronizedSites
    : Array.isArray(value?.entries)
      ? value.entries
      : [];
  return rawEntries
    .map(normalizeSynchronizedSiteSummary)
    .filter(Boolean);
}

async function getSiteSessionDrawerState() {
  return siteSessionOps?.getDrawerState() ?? {
    connected: false,
    currentTab: null,
    synchronizedSites: [],
    reason: 'site_session_ops_unavailable',
  };
}

async function startPickDownloadForActiveTab() {
  const tab = await getActiveTab();
  const pageUrl = normalizeHttpUrl(tab?.url);
  if (!pageUrl || typeof tab?.id !== 'number') {
    return {
      success: false,
      connected: isConnected(),
      reason: 'unsupported_page',
    };
  }

  try {
    const response = await sendMessageToTab(tab.id, {
      type: INTERNAL_START_PICKER_MESSAGE,
    }, { frameId: 0 });
    return {
      success: response?.success !== false,
      connected: isConnected(),
      reason: response?.success === false ? response?.reason || 'picker_start_failed' : null,
    };
  } catch (error) {
    console.warn('[Ameow] Failed to start picker from popup:', error);
    return {
      success: false,
      connected: isConnected(),
      reason: 'picker_start_failed',
    };
  }
}

function updateActionConnectionIndicator() {
  if (!chrome?.action?.setBadgeText) {
    return;
  }

  const nextState = actionIconIndicator.normalizeConnectionState(connectionState());
  if (actionIndicatorConnectionState === nextState) {
    return;
  }

  try {
    const indicatorState = actionIconIndicator.resolveActionIndicatorState(nextState);
    chrome.action.setBadgeText({ text: indicatorState.badgeText });
    chrome.action.setIcon?.({ path: indicatorState.iconPath });
    chrome.action.setTitle?.({
      title: nextState === actionIconIndicator.CONNECTION_STATES.CONNECTED
        ? 'Ameow: desktop connected'
        : 'Ameow: desktop offline',
    });
    actionIndicatorConnectionState = nextState;
  } catch (error) {
    console.warn('[Ameow] Failed to update action connection indicator:', error);
  }
}

async function requestDesktopSiteSessionSync(entry) {
  const normalizedEntry = normalizeSiteSessionRegistryEntry(entry);
  if (!normalizedEntry) {
    return {
      success: false,
      connected: isConnected(),
      reason: 'unsupported_site_session',
    };
  }

  const response = desktopPort?.requestSiteSessionSync
    ? await desktopPort.requestSiteSessionSync(normalizedEntry.siteId, {
        timeoutMs: SITE_SESSION_SYNC_REQUEST_TIMEOUT_MS,
        forceConnect: true,
      })
    : buildRequestFailure('not_connected');

  return {
    success: response?.success === true,
    connected: isConnected(),
    siteId: normalizedEntry.siteId,
    reason: response?.success === true
      ? null
      : response?.data?.code || response?.message || 'site_session_sync_failed',
  };
}

async function syncCurrentSiteSessionFromActiveTab() {
  return siteSessionOps?.syncCurrentSite() ?? {
    success: false,
    connected: isConnected(),
    reason: 'site_session_ops_unavailable',
  };
}

async function enableCurrentSiteSessionFromActiveTab() {
  return siteSessionOps?.enableCurrentSite() ?? {
    success: false,
    connected: isConnected(),
    reason: 'site_session_ops_unavailable',
  };
}

async function handleSiteSessionCookieSyncRequest(data) {
  const resolvedRequest = siteSessionCookieSync.resolveSiteSessionCookieSyncRequest(data);
  if (!resolvedRequest.success) {
    await reportSiteSessionCookieSyncResult(resolvedRequest.requestId, {
      success: false,
      siteId: resolvedRequest.siteId,
      cookies: [],
      code: resolvedRequest.code,
      error: resolvedRequest.error,
      source: {
        browser: resolveExtensionSyncBrowserLabel(),
        profileLabel: null,
        extensionId: chrome.runtime?.id || null,
      },
    });
    return;
  }

  const cookies = await collectSiteSessionCookies(resolvedRequest.site);
  if (cookies.length === 0) {
    await reportSiteSessionCookieSyncResult(resolvedRequest.requestId, {
      success: false,
      siteId: resolvedRequest.site.siteId,
      cookies: [],
      code: 'no_site_session_cookies',
      error: 'No supported site cookies were available. Log in to the site in this browser first.',
      source: {
        browser: resolveExtensionSyncBrowserLabel(),
        profileLabel: null,
        extensionId: chrome.runtime?.id || null,
      },
    });
    return;
  }

  await reportSiteSessionCookieSyncResult(resolvedRequest.requestId, {
    success: true,
    siteId: resolvedRequest.site.siteId,
    cookies,
    source: {
      browser: resolveExtensionSyncBrowserLabel(),
      profileLabel: null,
      extensionId: chrome.runtime?.id || null,
    },
  });
}

// Revalidates a token's registered page context against the live tab.
async function handleProtectedImageResolveRequest(data) {
  const requestId = typeof data?.requestId === 'string' ? data.requestId : '';
  const token = typeof data?.token === 'string' ? data.token.trim() : '';
  if (!requestId || !token) {
    await reportProtectedImageResolutionResult(requestId, {
      success: false,
      code: 'protected_image_missing_request',
      error: 'Missing protected image request metadata',
    });
    return;
  }

  // Atomic one-shot consumption: a duplicate Desktop command cannot repeat
  // resolution work or downloads.
  const consumed = protectedImageDragRegistry?.consume
    ? protectedImageDragRegistry.consume(token)
    : null;
  if (!consumed || !consumed.success) {
    const code = consumed?.workerRestarted ? 'protected_image_token_restart_invalidated' : 'protected_image_token_missing';
    await reportProtectedImageResolutionResult(requestId, {
      success: false,
      code,
      error: consumed?.workerRestarted
        ? 'Protected image drag token was lost in a background worker restart'
        : 'Protected image drag token was missing, consumed, or expired',
    });
    return;
  }
  const entry = consumed.entry;

  if (!(await dragTokenOps?.revalidateEntry(entry))) {
    await reportProtectedImageResolutionResult(requestId, {
      success: false,
      code: 'protected_image_stale_context',
      error: 'Protected image drag token page context changed or the tab was closed',
    });
    return;
  }

  const imageUrl = normalizeHttpUrl(data?.imageUrl) || entry.imageUrl;
  const pageUrl = normalizeHttpUrl(data?.pageUrl) || entry.pageUrl;
  const targetDir = typeof data?.targetDir === 'string' && data.targetDir.trim()
    ? data.targetDir
    : undefined;

  console.info('[Ameow] Resolving protected image fallback:', {
    requestId,
    token,
    tabId: entry.tabId,
    frameId: entry.frameId,
    imageUrl,
    pageUrl,
  });

  if (!imageUrl) {
    await reportProtectedImageResolutionResult(requestId, {
      success: false,
      code: 'protected_image_invalid_url',
      error: 'Protected image URL was missing or invalid',
    });
    return;
  }

  try {
    let resolution = await sendMessageToTab(
      entry.tabId,
      {
        type: 'resolve_protected_image',
        token,
        imageUrl,
        pageUrl,
      },
      { frameId: entry.frameId },
    );

    if (!resolution?.success || typeof resolution?.dataUrl !== 'string') {
      console.warn(
        '[Ameow] Protected image tab resolution failed, trying extension background fetch:',
        resolution?.code || resolution?.error || 'unknown'
      );
      resolution = await fetchProtectedImageInBackground(imageUrl, pageUrl);
    }

    if (!resolution?.success || typeof resolution?.dataUrl !== 'string') {
      console.warn(
        '[Ameow] Protected image byte resolution failed, trying desktop authenticated download:',
        resolution?.code || resolution?.error || 'unknown'
      );
      const desktopDownloadResult = await downloadProtectedImageViaDesktopApp(
        imageUrl,
        pageUrl,
        targetDir,
        typeof resolution?.filename === 'string' && resolution.filename.trim()
          ? resolution.filename.trim()
          : deriveFilenameFromUrl(imageUrl) || undefined,
      );

      if (
        desktopDownloadResult?.success
        && typeof desktopDownloadResult.message === 'string'
        && desktopDownloadResult.message.trim()
      ) {
        console.info(
          '[Ameow] Protected image fallback saved via authenticated desktop download:',
          desktopDownloadResult.message.trim()
        );
        await reportProtectedImageResolutionResult(requestId, {
          success: true,
          filePath: desktopDownloadResult.message.trim(),
        });
        return;
      }

      await reportProtectedImageResolutionResult(requestId, {
        success: false,
        code: typeof desktopDownloadResult?.data?.code === 'string'
          ? desktopDownloadResult.data.code
          : typeof resolution?.code === 'string'
            ? resolution.code
            : 'protected_image_resolution_failed',
        error: typeof desktopDownloadResult?.message === 'string'
          ? desktopDownloadResult.message
          : typeof resolution?.error === 'string'
            ? resolution.error
            : 'Protected image resolver did not return image bytes',
      });
      return;
    }

    const saveResult = desktopPort?.saveDataUrl
      ? await desktopPort.saveDataUrl(
          {
            dataUrl: resolution.dataUrl,
            originalFilename:
              typeof resolution.filename === 'string' && resolution.filename.trim()
                ? resolution.filename.trim()
                : deriveFilenameFromUrl(imageUrl) || undefined,
            targetDir,
          },
          { timeoutMs: PROTECTED_IMAGE_RESOLUTION_TIMEOUT_MS },
        )
      : buildRequestFailure('not_connected');

    if (saveResult?.success && typeof saveResult.message === 'string' && saveResult.message.trim()) {
      console.info('[Ameow] Protected image fallback saved via Ameow:', saveResult.message.trim());
      await reportProtectedImageResolutionResult(requestId, {
        success: true,
        filePath: saveResult.message.trim(),
      });
      return;
    }

    await reportProtectedImageResolutionResult(requestId, {
      success: false,
      code: typeof saveResult?.data?.code === 'string'
        ? saveResult.data.code
        : 'save_data_url_failed',
      error: typeof saveResult?.message === 'string'
        ? saveResult.message
        : 'Protected image save_data_url fallback failed',
    });
  } catch (error) {
    console.warn('[Ameow] Protected image fallback failed:', error);
    await reportProtectedImageResolutionResult(requestId, {
      success: false,
      code: 'protected_image_resolution_failed',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleXiaohongshuDragResolveRequest(data) {
  const requestId = typeof data?.requestId === 'string' ? data.requestId.trim() : '';
  const token = typeof data?.token === 'string' ? data.token.trim() : '';
  console.info('[Ameow] Resolving Xiaohongshu drag in extension background:', {
    requestId,
    token,
    pageUrl: normalizeHttpUrl(data?.pageUrl) || null,
    noteId: typeof data?.noteId === 'string' ? data.noteId : null,
    imageUrl: normalizeHttpUrl(data?.imageUrl) || null,
    mediaType: typeof data?.mediaType === 'string' ? data.mediaType : null,
    videoIntentConfidence: normalizeVideoIntentConfidence(data?.videoIntentConfidence) ?? null,
    videoIntentSources: normalizeStringList(data?.videoIntentSources),
  });
  if (!requestId || !token) {
    await reportXiaohongshuDragResolutionResult(requestId, {
      success: false,
      kind: 'unknown',
      code: 'xiaohongshu_drag_missing_request',
      error: 'Missing Xiaohongshu drag request metadata',
    });
    return;
  }

  // Atomic one-shot consumption: a duplicate Desktop command with the same
  // token cannot repeat resolution work or downloads.
  const consumed = xiaohongshuDragRegistry?.consume
    ? xiaohongshuDragRegistry.consume(token)
    : null;
  if (!consumed || !consumed.success) {
    console.warn('[Ameow] Xiaohongshu drag token was not consumable in registry:', {
      requestId,
      token,
      code: consumed?.code || 'drag_token_missing',
    });
    const code = consumed?.workerRestarted ? 'xiaohongshu_drag_token_restart_invalidated' : 'xiaohongshu_drag_token_missing';
    await reportXiaohongshuDragResolutionResult(requestId, {
      success: false,
      kind: 'unknown',
      code,
      error: consumed?.workerRestarted
        ? 'Xiaohongshu drag token was lost in a background worker restart'
        : 'Xiaohongshu drag token was missing, consumed, or expired',
    });
    return;
  }
  const entry = consumed.entry;

  if (!(await dragTokenOps?.revalidateEntry(entry))) {
    await reportXiaohongshuDragResolutionResult(requestId, {
      success: false,
      kind: 'unknown',
      pageUrl: entry.pageUrl,
      code: 'xiaohongshu_drag_stale_context',
      error: 'Xiaohongshu drag token page context changed or the tab was closed',
    });
    return;
  }

  console.info('[Ameow] Xiaohongshu drag registry hit:', {
    requestId,
    token,
    registryPageUrl: entry.pageUrl,
    registryDetailUrl: entry.detailUrl,
    registryNoteId: entry.noteId,
    registryImageUrl: entry.imageUrl,
    registryMediaType: entry.mediaType,
    registryVideoIntentConfidence: entry.videoIntentConfidence,
    registryVideoIntentSources: entry.videoIntentSources,
    registrySourcePageUrl: entry.sourcePageUrl,
    tabId: entry.tabId,
    frameId: entry.frameId,
  });

  try {
    const resolutionCookies = await getCookiesForUrl(
      normalizeHttpUrl(data?.pageUrl) || entry.pageUrl || ''
    );
    let resolution = await sendMessageToTab(
      entry.tabId,
      {
        type: 'resolve_xiaohongshu_drag',
        token,
        pageUrl: normalizeHttpUrl(data?.pageUrl) || entry.pageUrl,
        detailUrl: normalizeHttpUrl(data?.detailUrl) || entry.detailUrl,
        noteId: typeof data?.noteId === 'string' && data.noteId.trim() ? data.noteId.trim() : entry.noteId,
        imageUrl: normalizeHttpUrl(data?.imageUrl) || entry.imageUrl,
        mediaType:
          typeof data?.mediaType === 'string' && data.mediaType.trim()
            ? data.mediaType.trim()
            : entry.mediaType,
        videoIntentConfidence:
          normalizeVideoIntentConfidence(data?.videoIntentConfidence)
          ?? entry.videoIntentConfidence
          ?? null,
        videoIntentSources: normalizeStringList(data?.videoIntentSources).length > 0
          ? normalizeStringList(data?.videoIntentSources)
          : entry.videoIntentSources,
      },
      { frameId: entry.frameId },
    );

    const requestMediaType =
      typeof data?.mediaType === 'string' && data.mediaType.trim()
        ? data.mediaType.trim()
        : entry.mediaType;
    const requestVideoIntentConfidence =
      normalizeVideoIntentConfidence(data?.videoIntentConfidence)
      ?? entry.videoIntentConfidence
      ?? null;

    if (!(
      hasUsableXiaohongshuMedia(resolution)
      || xiaohongshuDragResolutionUtils?.hasResolvedXiaohongshuDragMedia?.(resolution, {
        mediaType: requestMediaType,
        videoIntentConfidence: requestVideoIntentConfidence,
      }) === true
    )) {
      console.info('[Ameow] Xiaohongshu drag did not expose direct media in source tab; trying background tab fallback:', {
        requestId,
        token,
        pageUrl: normalizeHttpUrl(data?.pageUrl) || entry.pageUrl || null,
        detailUrl: normalizeHttpUrl(data?.detailUrl) || entry.detailUrl || null,
        sourcePageUrl: entry.sourcePageUrl || null,
        noteId: typeof data?.noteId === 'string' && data.noteId.trim() ? data.noteId.trim() : entry.noteId,
      });
      const backgroundTabResolution = await resolveXiaohongshuViaBackgroundTab(entry, {
        pageUrl: normalizeHttpUrl(data?.pageUrl) || entry.pageUrl,
        detailUrl: normalizeHttpUrl(data?.detailUrl) || entry.detailUrl,
        sourcePageUrl: entry.sourcePageUrl,
        noteId: typeof data?.noteId === 'string' && data.noteId.trim() ? data.noteId.trim() : entry.noteId,
        imageUrl: normalizeHttpUrl(data?.imageUrl) || entry.imageUrl,
        videoIntentConfidence: requestVideoIntentConfidence,
        videoIntentSources: normalizeStringList(data?.videoIntentSources).length > 0
          ? normalizeStringList(data?.videoIntentSources)
          : entry.videoIntentSources,
      });

      if (backgroundTabResolution) {
        resolution = {
          ...resolution,
          ...backgroundTabResolution,
          detailUrl:
            normalizeHttpUrl(backgroundTabResolution?.detailUrl)
            || normalizeHttpUrl(resolution?.detailUrl)
            || entry.detailUrl,
        };
      }
    }

    console.info('[Ameow] Xiaohongshu drag tab resolution completed:', {
      requestId,
      token,
      tabId: entry.tabId,
      frameId: entry.frameId,
      success: resolution?.success === true,
      kind: typeof resolution?.kind === 'string' ? resolution.kind : 'unknown',
      detailUrl: normalizeHttpUrl(resolution?.detailUrl) || entry.detailUrl || null,
      imageUrl: normalizeHttpUrl(resolution?.imageUrl) || null,
      videoUrl: normalizeHttpUrl(resolution?.videoUrl) || null,
      videoIntentConfidence: normalizeVideoIntentConfidence(resolution?.videoIntentConfidence) ?? null,
      videoIntentSources: normalizeStringList(resolution?.videoIntentSources),
      videoCandidatesCount: Array.isArray(resolution?.videoCandidates)
        ? resolution.videoCandidates.length
        : 0,
      sourcePageUrl: entry.sourcePageUrl,
      cookiesPresent: Boolean(resolutionCookies),
      code: typeof resolution?.code === 'string' ? resolution.code : null,
      error: typeof resolution?.error === 'string' ? resolution.error : null,
    });

    await reportXiaohongshuDragResolutionResult(requestId, {
      success: resolution?.success === true,
      kind: typeof resolution?.kind === 'string' ? resolution.kind : 'unknown',
      pageUrl: normalizeHttpUrl(resolution?.pageUrl) || entry.pageUrl,
      detailUrl: normalizeHttpUrl(resolution?.detailUrl) || entry.detailUrl,
      imageUrl: normalizeHttpUrl(resolution?.imageUrl) || entry.imageUrl,
      videoUrl: normalizeHttpUrl(resolution?.videoUrl),
      videoCandidates: normalizeVideoCandidates(resolution?.videoCandidates),
      videoIntentConfidence: normalizeVideoIntentConfidence(resolution?.videoIntentConfidence),
      videoIntentSources: normalizeStringList(resolution?.videoIntentSources),
      sourcePageUrl: entry.sourcePageUrl,
      cookies: resolutionCookies,
      code: typeof resolution?.code === 'string' ? resolution.code : undefined,
      error: typeof resolution?.error === 'string' ? resolution.error : undefined,
    });
  } catch (error) {
    console.warn('[Ameow] Xiaohongshu drag resolution failed in extension background:', {
      requestId,
      token,
      error: error instanceof Error ? error.message : String(error),
    });
    await reportXiaohongshuDragResolutionResult(requestId, {
      success: false,
      kind: 'unknown',
      pageUrl: entry.pageUrl,
      imageUrl: entry.imageUrl,
      code: 'xiaohongshu_drag_resolution_failed',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function connect(options = {}) {
  return desktopClient.connect(options);
}

function handleMessage(message) {
  // Compatible with: top-level action, type, or wrapped data.action
  const action = message.action || message.type || message.data?.action;

  switch (action) {
    case 'theme_changed':
      currentTheme = message.data?.theme || 'black';
      // Notify popup if open (ignore errors if popup is closed)
      chrome.runtime.sendMessage({ type: 'theme_update', theme: currentTheme }).catch(() => {});
      void broadcastThemeToTabs(currentTheme);
      break;
    case 'theme_info':
      // Compatible with: message.data.theme or message.theme
      currentTheme = message.data?.theme || message.theme || 'black';
      chrome.runtime.sendMessage({ type: 'theme_update', theme: currentTheme }).catch(() => {});
      void broadcastThemeToTabs(currentTheme);
      break;
    case WS_ACTION_LANGUAGE_CHANGED:
    case WS_ACTION_LANGUAGE_INFO: {
      const nextLanguage = message.data?.language || message.language;
      setCurrentLanguage(nextLanguage);
      break;
    }
    case 'extension_debug_config_changed':
    case 'extension_debug_config_info':
      void setExtensionInjectionDebugEnabled(message.data?.enabled === true || message.enabled === true);
      break;
    case 'request_download_preferences':
      void bootstrapDownloadPreferencesSync();
      break;
    case 'site_session_registry_update':
      applySiteSessionRegistryUpdate(message.data || {});
      break;
    case 'resolve_protected_image':
      void handleProtectedImageResolveRequest(message.data || {});
      break;
    case 'resolve_pasted_video_selection':
      void handlePastedVideoSelectionResolveRequest(message.data || {});
      break;
    case 'site_session_cookie_sync_request':
      void handleSiteSessionCookieSyncRequest(message.data || {});
      break;
    case 'resolve_xiaohongshu_drag':
      void handleXiaohongshuDragResolveRequest(message.data || {});
      break;
  }
}

function syncDownloadPreferencesToApp() {
  return directDownloadQuality
    .getQualityPreference()
    .then(async (qualityPreference) => {
      const response = await desktopPort?.syncDownloadPreferences
        ? desktopPort.syncDownloadPreferences(
            { videoQuality: qualityPreference },
            { timeoutMs: REQUEST_TIMEOUT_MS, forceConnect: true },
          )
        : buildRequestFailure('not_connected');
      const success = Boolean(response?.success);
      await setPendingDownloadPreferencesSync(!success);
      if (!success) {
        console.warn(
          '[Ameow] Download preferences sync was not acknowledged:',
          response?.data?.code || response?.message || 'unknown'
        );
      }
      return success;
    })
    .catch(async (error) => {
      console.error('[Ameow] Failed to sync download preferences:', error);
      await setPendingDownloadPreferencesSync(true);
      return false;
    });
}

function bootstrapDownloadPreferencesSync() {
  return setPendingDownloadPreferencesSync(true).then(() => {
    return syncDownloadPreferencesToApp();
  });
}

function markDownloadPreferencesDirtyAndSync() {
  void bootstrapDownloadPreferencesSync();
}

async function ensureConnection(timeoutMs, options = {}) {
  return desktopClient.connectAndWait(timeoutMs, { force: options.force === true });
}

function queueVideoSelectionToApp(data) {
  if (!desktopPort?.queueVideoSelection) {
    return Promise.resolve(buildRequestFailure('not_connected'));
  }

  const sendSelectionRequest = () => desktopPort.queueVideoSelection(data, {
    timeoutMs: REQUEST_TIMEOUT_MS,
    connectTimeoutMs: VIDEO_SELECTION_CONNECT_TIMEOUT_MS,
    forceConnect: true,
  });

  return sendSelectionRequest().then(async (result) => {
    if (!shouldRetryVideoSelectionRequest(result)) {
      return result;
    }

    console.info(
      '[Ameow] Retrying video selection after recoverable connection failure:',
      result?.data?.code || result?.message || 'unknown'
    );
    resetSocketForRetry();

    const connected = await ensureConnection(
      VIDEO_SELECTION_RETRY_CONNECT_TIMEOUT_MS,
      { force: true }
    );
    if (!connected) {
      return result;
    }

    return sendSelectionRequest();
  });
}

function isPastedVideoSelectionSiteHintSupported(siteHint) {
  return siteHint === 'bilibili'
    || siteHint === 'douyin'
    || siteHint === 'youtube'
    || siteHint === 'twitter-x'
    || siteHint === 'pinterest'
    || siteHint === 'xiaohongshu';
}

function normalizeVideoCandidates(rawCandidates) {
  if (!Array.isArray(rawCandidates)) return [];

  const normalizeMediaType = (value) => {
    if (value === 'video' || value === 'image') {
      return value;
    }
    return undefined;
  };

  const normalized = [];
  for (const candidate of rawCandidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const url = typeof candidate.url === 'string' ? candidate.url.trim() : '';
    if (!url || !url.startsWith('http') || url.startsWith('blob:')) continue;
    normalized.push({
      url,
      type: typeof candidate.type === 'string' ? candidate.type : 'unknown',
      confidence: typeof candidate.confidence === 'string' ? candidate.confidence : 'low',
      source: typeof candidate.source === 'string' ? candidate.source : 'unknown',
      mediaType: normalizeMediaType(candidate.mediaType ?? candidate.media_type),
    });
  }

  return normalized;
}

function normalizeSelectedVideoVariant(rawVariant) {
  if (!rawVariant || typeof rawVariant !== 'object') {
    return undefined;
  }
  const url = normalizeHttpUrl(rawVariant.url);
  if (!url || url.startsWith('blob:')) {
    return undefined;
  }
  const normalized = {
    url,
    type: typeof rawVariant.type === 'string' ? rawVariant.type : 'direct_mp4',
    confidence: typeof rawVariant.confidence === 'string' ? rawVariant.confidence : 'high',
    source: typeof rawVariant.source === 'string' ? rawVariant.source : 'selected_variant',
    mediaType: 'video',
  };
  if (typeof rawVariant.label === 'string' && rawVariant.label.trim()) {
    normalized.label = rawVariant.label.trim().slice(0, 40);
  }
  for (const key of ['width', 'height', 'bitrate', 'qualityIndex']) {
    const value = Number(rawVariant[key]);
    if (Number.isFinite(value) && value > 0) {
      normalized[key] = Math.round(value);
    }
  }
  return normalized;
}

function normalizeVideoIntentConfidence(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  if (value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 1;
  }

  return Math.round(value * 1000) / 1000;
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = [];
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== 'string') {
      continue;
    }

    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

function normalizeClipTimeSeconds(value) {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;

  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

function normalizeSelectionScope(value) {
  if (value === 'current_item') return 'current_item';
  if (value === 'playlist') return 'playlist';
  return null;
}

// Convert cookies to Netscape format for yt-dlp
function cookiesToNetscape(cookies) {
  // Netscape cookie file header is required
  const header = '# Netscape HTTP Cookie File\n# https://curl.haxx.se/docs/http-cookies.html\n# This file was generated by Ameow\n\n';
  const lines = cookies.map(cookie => {
    const secure = cookie.secure ? 'TRUE' : 'FALSE';
    const expiry = cookie.expirationDate ? Math.floor(cookie.expirationDate) : 0;
    // Keep domain as-is from Chrome API, set includeSubdomains based on leading dot
    const includeSubdomains = cookie.domain.startsWith('.') ? 'TRUE' : 'FALSE';
    return `${cookie.domain}\t${includeSubdomains}\t${cookie.path}\t${secure}\t${expiry}\t${cookie.name}\t${cookie.value}`;
  }).join('\n');
  return header + lines;
}

// Get cookies for a URL (including parent domain)
async function getCookiesForUrl(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    // Extract base domain (e.g., www.douyin.com -> douyin.com)
    const parts = hostname.split('.');
    const baseDomain = parts.length > 2 ? parts.slice(-2).join('.') : hostname;

    // Get cookies from the exact URL plus hostname/base-domain lookups.
    // Exact URL matching catches host-only/path-scoped cookies that domain-only
    // lookup can miss in Chromium.
    const [urlCookies, hostCookies, baseCookies] = await Promise.all([
      chrome.cookies.getAll({ url: urlObj.href }),
      chrome.cookies.getAll({ domain: hostname }),
      chrome.cookies.getAll({ domain: baseDomain })
    ]);

    // Merge and deduplicate cookies
    const cookieMap = new Map();
    [...urlCookies, ...hostCookies, ...baseCookies].forEach(cookie => {
      const key = `${cookie.domain}|${cookie.path}|${cookie.name}`;
      cookieMap.set(key, cookie);
    });

    const allCookies = Array.from(cookieMap.values());
    if (allCookies.length > 0) {
      return cookiesToNetscape(allCookies);
    }
  } catch (e) {
    console.error('[Ameow] Failed to get cookies:', e);
  }
  return '';
}

async function buildForwardedVideoSelectionPayload(message, senderContext = {}) {
  const normalized = normalizeMediaSelectionPayload(message);
  const originalRequestedUrl = normalized.requestedUrl;
  const originalPageUrl = selectFirstHttpUrl(normalized.pageUrl, senderContext.tabUrl, originalRequestedUrl);
  const selectionScope = normalized.selectionScope;
  const videoCandidates = normalized.videoCandidates;
  const originalSiteHint = deriveSiteHint([
    normalized.siteHint,
    originalPageUrl,
    originalRequestedUrl,
    normalized.videoUrl,
    senderContext.tabUrl,
  ]);

  const requestedUrl = originalRequestedUrl;
  const pageUrl = originalPageUrl;
  const siteHint = originalSiteHint;
  const [qualityPreference, injectionDebugEnabled] = await Promise.all([
    directDownloadQuality.getQualityPreference(),
    injectionDebugConfig?.getEnabled ? injectionDebugConfig.getEnabled() : Promise.resolve(false),
  ]);

  console.info('[Ameow] Using yt-dlp quality preference:', qualityPreference);
  const resolvedRouting = videoSelectionRouting?.resolveVideoSelectionRouting
    ? videoSelectionRouting.resolveVideoSelectionRouting({
        requestedUrl,
        pageUrl,
        senderTabUrl: senderContext.tabUrl,
        fallbackUrl: message.url,
      })
    : {
        routeUrl: requestedUrl || pageUrl || normalizeHttpUrl(senderContext.tabUrl) || normalizeHttpUrl(message.url),
        pageUrl: pageUrl || normalizeHttpUrl(senderContext.tabUrl) || requestedUrl || normalizeHttpUrl(message.url),
      };

  return {
    forwardedPayload: {
      url: resolvedRouting.routeUrl || requestedUrl || message.url,
      pageUrl: resolvedRouting.pageUrl || pageUrl || requestedUrl || message.pageUrl || senderContext.tabUrl || message.url,
      siteHint,
      title: normalized.title,
      videoUrl: normalized.videoUrl,
      selectedVideoVariant: normalized.selectedVideoVariant,
      videoCandidates,
      selectionScope,
      clipStartSec: normalized.clipStartSec,
      clipEndSec: normalized.clipEndSec,
      advancedQualityRequest: normalized.advancedQualityRequest,
      videoQuality: qualityPreference,
      extensionData: normalized.extensionData,
    },
    injectionDebugEnabled,
    normalized,
    originalPageUrl,
    originalRequestedUrl,
    originalSiteHint,
    selectionScope,
  };
}

async function handleVideoSelectionRequest(message, senderContext = {}) {
  try {
    const prepared = await buildForwardedVideoSelectionPayload(message, senderContext);

    if (prepared.injectionDebugEnabled) {
      logInjectedVideoSelectionDebug(
        'Injected video_selection request received',
        {
          ...summarizeVideoSelectionForDebug({
            ...message,
            url: prepared.originalRequestedUrl,
            pageUrl: prepared.originalPageUrl,
            selectionScope: prepared.selectionScope,
            siteHint: prepared.originalSiteHint,
            clipStartSec: prepared.normalized.clipStartSec,
            clipEndSec: prepared.normalized.clipEndSec,
          }),
          senderTabUrl: normalizeHttpUrl(senderContext.tabUrl) || null,
        },
      );
      logInjectedVideoSelectionDebug(
        'Forwarding video selection payload',
        summarizeVideoSelectionForDebug(prepared.forwardedPayload),
      );
    }

    const result = await queueVideoSelectionToApp(prepared.forwardedPayload);
    return {
      success: Boolean(result?.success),
      connected: isConnected(),
      reason: result?.data?.code || null,
    };
  } catch (error) {
    console.error('[Ameow] Failed to prepare video selection request:', error);
    return {
      success: false,
      connected: isConnected(),
      reason: 'prepare_failed',
    };
  }
}

async function handlePastedVideoSelectionResolveRequest(data) {
  const requestId = typeof data?.requestId === 'string' ? data.requestId.trim() : '';
  const rawUrl = normalizeHttpUrl(data?.url);
  const pageUrl = normalizeHttpUrl(data?.pageUrl) || rawUrl;
  const siteHint = deriveSiteHint([
    data?.siteHint,
    pageUrl,
    rawUrl,
    normalizeHttpUrl(data?.videoUrl),
  ]);

  if (!requestId || !rawUrl) {
    await reportPastedVideoSelectionResolutionResult(requestId, {
      success: false,
      code: 'pasted_video_missing_request',
      error: 'Missing pasted video request metadata',
    });
    return;
  }

  if (!isPastedVideoSelectionSiteHintSupported(siteHint)) {
    await reportPastedVideoSelectionResolutionResult(requestId, {
      success: false,
      code: 'pasted_video_unsupported_site',
      error: `Unsupported pasted video site: ${siteHint || 'unknown'}`,
    });
    return;
  }

  let tab = null;
  let createdTab = false;
  let selectionPayload = null;
  let tabUrl = null;

  try {
    tab = await findMatchingVideoSelectionTab(pageUrl || rawUrl);
    if (!tab?.id) {
      tab = await createTab({
        url: pageUrl || rawUrl,
        active: false,
      });
      createdTab = true;
      await waitForTabComplete(tab.id);
      tab = await getTab(tab.id).catch(() => tab);
    }
    tabUrl = normalizeHttpUrl(tab?.url);

    selectionPayload = await requestResolvedPastedVideoSelection(tab.id, {
      source: 'pasted',
      requestedUrl: rawUrl,
      pageUrl: pageUrl || rawUrl,
      siteHint,
    });
  } catch (error) {
    console.warn('[Ameow] Failed to resolve pasted video selection in page context:', error);
  }

  try {
    if (selectionPayload && typeof selectionPayload === 'object') {
      const prepared = await buildForwardedVideoSelectionPayload(selectionPayload, {
        tabUrl: tabUrl || pageUrl || rawUrl,
      });

      await reportPastedVideoSelectionResolutionResult(requestId, {
        success: true,
        ...prepared.forwardedPayload,
      });
      return;
    }

    const qualityPreference = await directDownloadQuality.getQualityPreference();

    await reportPastedVideoSelectionResolutionResult(requestId, {
      success: true,
      url: rawUrl,
      pageUrl: pageUrl || rawUrl,
      siteHint,
      selectionScope: 'current_item',
      videoQuality: qualityPreference,
      extensionData: siteHint === 'youtube'
        ? { youtube: { source: 'pasted' } }
        : undefined,
    });
  } catch (error) {
    console.warn('[Ameow] Failed to resolve pasted video selection:', error);
    await reportPastedVideoSelectionResolutionResult(requestId, {
      success: false,
      code: 'pasted_video_resolution_failed',
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (createdTab && tab?.id) {
      await removeTabQuietly(tab.id);
    }
  }
}

function createTab(createProperties) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create(createProperties, (tab) => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tab);
    });
  });
}

function updateTab(tabId, updateProperties) {
  return new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, updateProperties, (tab) => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tab);
    });
  });
}

function getTab(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tab);
    });
  });
}

function removeTabQuietly(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.remove(tabId, () => {
      resolve();
    });
  });
}

async function pingLauncherForActiveTab() {
  const tab = await getActiveTab();
  const config = launcherConfig?.getConfig ? await launcherConfig.getConfig() : null;
  if (!tab?.id) {
    return {
      ok: false,
      mounted: false,
      visible: false,
      enabled: config?.enabled !== false,
      hiddenForSite: Boolean(config && launcherConfig?.isSiteDisabled?.(config, tab?.url)),
      side: config?.side,
      reason: 'no_active_tab',
      version: 1,
    };
  }

  const requestId = `launcher-ping-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const response = await Promise.race([
    sendMessageToTab(tab.id, {
      type: INTERNAL_LAUNCHER_PING_MESSAGE,
      requestId,
    }).catch(() => null),
    new Promise((resolve) => {
      setTimeout(() => resolve(null), 500);
    }),
  ]);

  if (!response || response.requestId !== requestId) {
    return {
      ok: false,
      mounted: false,
      visible: false,
      enabled: config?.enabled !== false,
      hiddenForSite: Boolean(config && launcherConfig?.isSiteDisabled?.(config, tab.url)),
      side: config?.side,
      version: 1,
    };
  }

  return response;
}

async function broadcastLauncherConfigToTabs(config) {
  if (!chrome?.tabs?.query) {
    return;
  }

  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => {
    if (typeof tab.id !== 'number') {
      return Promise.resolve(null);
    }
    return sendMessageToTab(tab.id, {
      type: INTERNAL_LAUNCHER_CONFIG_UPDATE_MESSAGE,
      config,
    }).catch(() => null);
  }));
}

async function broadcastThemeToTabs(theme) {
  if (!chrome?.tabs?.query) {
    return;
  }

  const normalizedTheme = theme === 'white' ? 'white' : 'black';
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => {
    if (typeof tab.id !== 'number') {
      return Promise.resolve(null);
    }
    return sendMessageToTab(tab.id, {
      type: INTERNAL_THEME_UPDATE_MESSAGE,
      theme: normalizedTheme,
    }).catch(() => null);
  }));
}

async function setLauncherEnabled(enabled) {
  if (!launcherConfig?.updateConfig) {
    return {
      success: false,
      reason: 'launcher_config_unavailable',
    };
  }

  const config = await launcherConfig.updateConfig((current) => ({
    ...current,
    enabled: enabled === true,
  }));
  await broadcastLauncherConfigToTabs(config);

  return {
    success: true,
    config,
  };
}

async function restoreLauncherForActiveSite() {
  const tab = await getActiveTab();
  if (!tab?.url || !launcherConfig?.updateConfig) {
    return {
      success: false,
      reason: 'launcher_config_unavailable',
    };
  }

  const config = await launcherConfig.updateConfig((current) => (
    launcherConfig.removeDisabledSitePattern(current, tab.url)
  ));

  if (tab.id) {
    await sendMessageToTab(tab.id, {
      type: INTERNAL_LAUNCHER_RESTORE_MESSAGE,
    }).catch(() => null);
  }

  return {
    success: true,
    config,
  };
}

async function getLauncherControlsState() {
  const [status, config] = await Promise.all([
    pingLauncherForActiveTab(),
    launcherConfig?.getConfig ? launcherConfig.getConfig() : Promise.resolve(null),
  ]);

  return {
    success: true,
    status,
    config,
  };
}

async function updateLauncherConfigAndBroadcast(updater) {
  if (!launcherConfig?.updateConfig) {
    return {
      success: false,
      reason: 'launcher_config_unavailable',
    };
  }
  const config = await launcherConfig.updateConfig(updater);
  await broadcastLauncherConfigToTabs(config);
  return {
    success: true,
    config,
  };
}

async function restoreHiddenSitePattern(pattern) {
  return updateLauncherConfigAndBroadcast((current) => (
    launcherConfig.removeDisabledPatternValue
      ? launcherConfig.removeDisabledPatternValue(current, pattern)
      : {
          ...current,
          disabledSitePatterns: (current.disabledSitePatterns || []).filter((entry) => entry !== pattern),
        }
  ));
}

async function restoreAllHiddenSites() {
  return updateLauncherConfigAndBroadcast((current) => (
    launcherConfig.clearDisabledSitePatterns
      ? launcherConfig.clearDisabledSitePatterns(current)
      : { ...current, disabledSitePatterns: [] }
  ));
}

async function setLauncherSide(side) {
  return updateLauncherConfigAndBroadcast((current) => (
    launcherConfig.setSide
      ? launcherConfig.setSide(current, side)
      : { ...current, side: side === 'left' ? 'left' : 'right' }
  ));
}

async function resetLauncherPosition() {
  return updateLauncherConfigAndBroadcast((current) => (
    launcherConfig.resetPosition
      ? launcherConfig.resetPosition(current)
      : {
          ...current,
          side: launcherConfig.DEFAULT_CONFIG?.side || 'right',
          verticalPosition: launcherConfig.DEFAULT_CONFIG?.verticalPosition || 0.62,
        }
  ));
}


async function getStoredNetworkMediaCache() {
  const result = await storageGet(MEDIA_NETWORK_CACHE_KEY).catch(() => ({}));
  const cache = result?.[MEDIA_NETWORK_CACHE_KEY];
  return cache && typeof cache === 'object' && !Array.isArray(cache)
    ? cache
    : {};
}

async function storeNetworkMediaEntry(entry) {
  if (!mediaNetworkCache?.pruneNetworkMediaCache || !extensionStore) {
    return;
  }

  await extensionStore.update(MEDIA_NETWORK_CACHE_KEY, (cache) => {
    const currentCache = cache && typeof cache === 'object' && !Array.isArray(cache)
      ? cache
      : {};
    return mediaNetworkCache.pruneNetworkMediaCache(currentCache, entry, {
      now: Date.now(),
      ttlMs: MEDIA_NETWORK_CACHE_TTL_MS,
      perTabLimit: MEDIA_NETWORK_CACHE_PER_TAB_LIMIT,
      totalLimit: MEDIA_NETWORK_CACHE_TOTAL_LIMIT,
    });
  });
}

async function getNetworkMediaEntriesForTab(tab) {
  if (!mediaNetworkCache?.getNetworkMediaEntriesForTab) {
    return [];
  }

  const cache = await getStoredNetworkMediaCache();
  return mediaNetworkCache.getNetworkMediaEntriesForTab(cache, tab, {
    now: Date.now(),
    ttlMs: MEDIA_NETWORK_CACHE_TTL_MS,
  });
}

async function rememberNetworkMediaResponse(details) {
  if (!mediaNetworkCache?.normalizeNetworkMediaEntry || typeof details?.tabId !== 'number' || details.tabId < 0) {
    return;
  }

  try {
    const tab = await getTab(details.tabId);
    const entry = mediaNetworkCache.normalizeNetworkMediaEntry(details, tab, {
      now: Date.now(),
    });
    if (!entry) {
      return;
    }
    await storeNetworkMediaEntry(entry);
  } catch (error) {
    console.warn('[Ameow] Failed to cache observed media response:', error);
  }
}


async function downloadCurrentContentFromActiveTab() {
  const tab = await getActiveTab();
  if (!tab?.id) {
    return {
      success: false,
      connected: isConnected(),
      reason: 'no_active_tab',
    };
  }
  return selectionOps?.captureCurrentContent(tab) ?? {
    success: false,
    connected: isConnected(),
    reason: 'selection_ops_unavailable',
  };
}

async function downloadMediaCandidate(candidate) {
  return selectionOps?.downloadCandidate(candidate) ?? {
    success: false,
    connected: isConnected(),
    reason: 'selection_ops_unavailable',
  };
}

function waitForTabComplete(tabId, options = {}) {
  const timeoutMs = typeof options.timeoutMs === 'number'
    ? options.timeoutMs
    : XIAOHONGSHU_BACKGROUND_TAB_TIMEOUT_MS;
  const urlChangedFrom = normalizeHttpUrl(options.urlChangedFrom);

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timerId);
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      chrome.tabs.onRemoved.removeListener(handleRemoved);
      resolve(result);
    };

    const fail = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timerId);
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      chrome.tabs.onRemoved.removeListener(handleRemoved);
      reject(error);
    };

    const evaluateTab = (tab) => {
      if (!tab || tab.id !== tabId) {
        return false;
      }

      const normalizedUrl = normalizeHttpUrl(tab.url);
      const statusComplete = tab.status === 'complete';
      const urlChanged = urlChangedFrom
        ? normalizedUrl && normalizedUrl !== urlChangedFrom
        : true;

      if (statusComplete && urlChanged) {
        finish(tab);
        return true;
      }

      return false;
    };

    const handleUpdated = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId !== tabId) {
        return;
      }
      if (
        changeInfo.status === 'complete'
        || typeof changeInfo.url === 'string'
      ) {
        evaluateTab(tab);
      }
    };

    const handleRemoved = (removedTabId) => {
      if (removedTabId !== tabId) {
        return;
      }
      fail(new Error('Background Xiaohongshu tab was closed before resolution completed'));
    };

    const timerId = setTimeout(() => {
      fail(new Error('Background Xiaohongshu tab timed out before finishing navigation'));
    }, timeoutMs);

    chrome.tabs.onUpdated.addListener(handleUpdated);
    chrome.tabs.onRemoved.addListener(handleRemoved);

    getTab(tabId)
      .then((tab) => {
        evaluateTab(tab);
      })
      .catch((error) => {
        fail(error);
      });
  });
}

function hasUsableXiaohongshuMedia(result) {
  if (!result || typeof result !== 'object') {
    return false;
  }

  const videoUrl = normalizeHttpUrl(result.videoUrl);
  const candidates = normalizeVideoCandidates(result.videoCandidates);
  return Boolean(videoUrl) || candidates.length > 0;
}

function isResolvableXiaohongshuNoteUrl(value) {
  const normalized = normalizeHttpUrl(value);
  if (!normalized) {
    return false;
  }

  try {
    const parsed = new URL(normalized);
    return /(?:^|\.)(xiaohongshu\.com|xhslink\.com)$/i.test(parsed.hostname)
      && /\/(?:explore|discovery\/item)\/[a-zA-Z0-9]+|^\/user\/profile\/[^/?#]+\/[a-zA-Z0-9]+(?:[/?#]|$)/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

async function resolveXiaohongshuViaBackgroundTab(entry, options = {}) {
  const initialUrl = normalizeHttpUrl(options.detailUrl)
    || normalizeHttpUrl(options.sourcePageUrl)
    || normalizeHttpUrl(options.pageUrl)
    || normalizeHttpUrl(entry.detailUrl)
    || normalizeHttpUrl(entry.sourcePageUrl)
    || normalizeHttpUrl(entry.pageUrl);
  const noteId = typeof options.noteId === 'string' && options.noteId.trim()
    ? options.noteId.trim()
    : entry.noteId;
  if (!initialUrl) {
    return null;
  }

  const tab = await createTab({
    url: initialUrl,
    active: false,
  });
  const tabId = tab?.id;
  if (typeof tabId !== 'number') {
    return null;
  }

  try {
    await waitForTabComplete(tabId, { timeoutMs: XIAOHONGSHU_BACKGROUND_TAB_TIMEOUT_MS });
    await sleep(700);

    let navigation = null;
    if (noteId) {
      try {
        navigation = await sendMessageToTab(tabId, {
          type: INTERNAL_NAVIGATE_XIAOHONGSHU_NOTE_MESSAGE,
          noteId,
          pageUrl: normalizeHttpUrl(options.pageUrl) || entry.pageUrl,
          detailUrl: normalizeHttpUrl(options.detailUrl) || entry.detailUrl || null,
        });
      } catch (error) {
        console.warn('[Ameow] Failed to navigate Xiaohongshu background tab to target note:', error);
      }
    }

    const navigatedDetailUrl = normalizeHttpUrl(navigation?.detailUrl);
    if (navigatedDetailUrl && navigatedDetailUrl !== initialUrl) {
      await updateTab(tabId, { url: navigatedDetailUrl, active: false });
      await waitForTabComplete(tabId, {
        timeoutMs: XIAOHONGSHU_BACKGROUND_TAB_TIMEOUT_MS,
        urlChangedFrom: initialUrl,
      });
      await sleep(700);
    } else if (navigation?.clicked) {
      try {
        await waitForTabComplete(tabId, {
          timeoutMs: 6000,
          urlChangedFrom: initialUrl,
        });
      } catch {
        await sleep(1500);
      }
      await sleep(500);
    }

    const currentTab = await getTab(tabId);
    const currentUrl = normalizeHttpUrl(currentTab?.url)
      || navigatedDetailUrl
      || initialUrl;
    const requestPageUrl = isResolvableXiaohongshuNoteUrl(currentUrl)
      ? currentUrl
      : normalizeHttpUrl(navigatedDetailUrl)
        || normalizeHttpUrl(options.detailUrl)
        || normalizeHttpUrl(options.pageUrl)
        || entry.pageUrl;

    console.info('[Ameow] Resolving Xiaohongshu via background tab:', {
      tabId,
      initialUrl,
      currentUrl,
      requestPageUrl,
      noteId,
      navigatedDetailUrl: navigatedDetailUrl || null,
      clicked: navigation?.clicked === true,
    });

    const resolved = await sendMessageToTab(tabId, {
      type: INTERNAL_RESOLVE_XIAOHONGSHU_CONTEXT_MEDIA_MESSAGE,
      pageUrl: requestPageUrl,
      noteId,
      imageUrl: normalizeHttpUrl(options.imageUrl) || entry.imageUrl || null,
      mediaType: 'video',
      videoIntentConfidence:
        normalizeVideoIntentConfidence(options.videoIntentConfidence)
        ?? entry.videoIntentConfidence
        ?? null,
      videoIntentSources: normalizeStringList(options.videoIntentSources).length > 0
        ? normalizeStringList(options.videoIntentSources)
        : entry.videoIntentSources,
    });

    if (!resolved?.success || !resolved?.payload) {
      return {
      success: false,
      pageUrl: requestPageUrl,
      detailUrl: navigatedDetailUrl || normalizeHttpUrl(options.detailUrl) || null,
      code: typeof resolved?.code === 'string'
        ? resolved.code
        : 'xiaohongshu_background_tab_resolution_failed',
      };
    }

    return {
      success: true,
      ...resolved.payload,
      pageUrl: normalizeHttpUrl(resolved.payload.pageUrl) || requestPageUrl,
      detailUrl:
        navigatedDetailUrl
        || normalizeHttpUrl(resolved.payload.detailUrl)
        || normalizeHttpUrl(options.detailUrl)
        || null,
    };
  } finally {
    await removeTabQuietly(tabId);
  }
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

// Scan/selection generation: a new scan supersedes earlier candidates and
// selections for the tab. Combined with the page context key, this rejects
// stale downloads after a newer scan or navigation.
function nextScanGeneration(tabId) {
  if (!Number.isInteger(tabId)) {
    return null;
  }
  const next = (scanGenerations.get(tabId) || 0) + 1;
  scanGenerations.set(tabId, next);
  return next;
}

function getScanGeneration(tabId) {
  return Number.isInteger(tabId) ? scanGenerations.get(tabId) || 0 : 0;
}

function nextCaptureGeneration(tabId) {
  if (!Number.isInteger(tabId)) {
    return null;
  }
  const next = (captureGenerations.get(tabId) || 0) + 1;
  captureGenerations.set(tabId, next);
  return next;
}

function getCaptureGeneration(tabId) {
  return Number.isInteger(tabId) ? captureGenerations.get(tabId) || 0 : 0;
}

function nextSelectionGeneration(tabId) {
  if (!Number.isInteger(tabId)) {
    return null;
  }
  const next = (selectionGenerations.get(tabId) || 0) + 1;
  selectionGenerations.set(tabId, next);
  return next;
}

function getSelectionGeneration(tabId) {
  return Number.isInteger(tabId) ? selectionGenerations.get(tabId) || 0 : 0;
}

// Current page context for popup/current-page operations: always the main
// frame (frame 0) of the active tab.
async function getActiveTabPageContext() {
  const tab = await getActiveTab();
  if (!tab) {
    return { tab: null, pageContextKey: null, generation: 0 };
  }
  const pageContextKey = pageContextStore?.pageContextKey
    ? pageContextStore.pageContextKey({ tabId: tab.id, frameId: 0, pageUrl: tab.url })
    : null;
  return {
    tab,
    pageContextKey,
    generation: getScanGeneration(tab.id),
  };
}

async function requestResolvedVideoSelection(tabId, options = {}) {
  try {
    const response = await sendMessageToTab(
      tabId,
      {
        type: INTERNAL_RESOLVE_VIDEO_SELECTION_MESSAGE,
        source: options.source || 'popup',
        requestedSrcUrl: options.requestedSrcUrl || undefined,
      },
      // Popup/current-page operations deterministically target the main
      // frame; frame-originated operations pass an explicit frameId.
      { frameId: options.frameId ?? 0 },
    );

    if (response?.success && response.payload && typeof response.payload === 'object') {
      return response.payload;
    }
  } catch (error) {
    console.warn('[Ameow] Failed to resolve in-tab video selection:', error);
  }

  return null;
}

async function requestResolvedPastedVideoSelection(tabId, options = {}) {
  try {
    const response = await sendMessageToTab(
      tabId,
      {
        type: INTERNAL_RESOLVE_PASTED_VIDEO_SELECTION_MESSAGE,
        source: options.source || 'pasted',
        requestedUrl: options.requestedUrl || undefined,
        pageUrl: options.pageUrl || undefined,
        siteHint: options.siteHint || undefined,
      },
      { frameId: 0 },
    );

    if (response?.success && response.payload && typeof response.payload === 'object') {
      return response.payload;
    }
  } catch (error) {
    console.warn('[Ameow] Failed to resolve pasted video selection in-tab:', error);
  }

  return null;
}

async function findMatchingVideoSelectionTab(url) {
  const normalizedUrl = normalizeHttpUrl(url);
  if (!normalizedUrl) {
    return null;
  }

  const tabs = await chrome.tabs.query({});
  return tabs.find((tab) => normalizeHttpUrl(tab.url) === normalizedUrl && typeof tab.id === 'number') || null;
}

// Listen for messages from content script. Every content-originated
// message is normalized once into a BrowserMessageContext (tab/frame/
// document/page identity) that is authoritative for where the interaction
// happened; a later active-tab lookup must not replace it.
function senderContextFor(sender) {
  const context = pageContextStore?.normalizeBrowserMessageContext
    ? pageContextStore.normalizeBrowserMessageContext(sender)
    : {};
  return {
    tabUrl: sender.tab?.url,
    tabId: context.tabId ?? sender.tab?.id,
    frameId: context.frameId ?? sender.frameId,
    documentId: context.documentId,
    pageUrl: context.pageUrl,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === INTERNAL_VIDEO_SELECTION_MESSAGE) {
    handleVideoSelectionRequest(message, senderContextFor(sender)).then(sendResponse);
    return true;
  } else if (message.type === INTERNAL_DOWNLOAD_CURRENT_CONTENT_MESSAGE) {
    const payload = message?.payload && typeof message.payload === 'object'
      ? message.payload
      : null;
    if (!payload) {
      sendResponse({
        success: false,
        connected: isConnected(),
        reason: 'invalid_current_content_payload',
      });
      return true;
    }
    handleVideoSelectionRequest(payload, senderContextFor(sender)).then(sendResponse).catch((error) => {
      console.error('[Ameow] Failed to queue current-content selection:', error);
      sendResponse({
        success: false,
        connected: isConnected(),
        reason: 'prepare_failed',
      });
    });
    return true;
  } else if (message.type === INTERNAL_PAGE_IMAGE_SELECTION_MESSAGE) {
    handlePageImageSelectionRequest(message, senderContextFor(sender)).then(sendResponse);
    return true;
  } else if (message.type === 'connect') {
    connect({ force: true });
    sendResponse({
      success: true,
      connected: isConnected()
    });
  } else if (message.type === 'register_protected_image_drag') {
    const token = typeof message.token === 'string' ? message.token.trim() : '';
    const imageUrl = normalizeHttpUrl(message.imageUrl);
    const pageUrl = normalizeHttpUrl(message.pageUrl || sender.tab?.url);
    const tabId = sender.tab?.id;

    if (!token || !imageUrl || typeof tabId !== 'number') {
      sendResponse({
        success: false,
        reason: 'invalid_protected_image_drag',
      });
      return true;
    }

    const registration = dragTokenOps?.buildRegistration
      ? dragTokenOps.buildRegistration(
          {
            tabId,
            frameId: typeof sender.frameId === 'number' ? sender.frameId : 0,
            documentId: sender.documentId,
            pageUrl,
          },
          {
            frameId: typeof sender.frameId === 'number' ? sender.frameId : undefined,
            documentId: sender.documentId,
            imageUrl,
            pageUrl,
          },
        )
      : { success: false, code: 'drag_token_invalid' };
    const registered = registration?.success && protectedImageDragRegistry?.register
      ? protectedImageDragRegistry.register(token, registration.facts)
      : { success: false, code: 'drag_token_registry_unavailable' };
    if (!registered?.success) {
      sendResponse({
        success: false,
        reason: registered?.code === 'drag_token_limit_reached'
          ? 'protected_image_drag_limit_reached'
          : 'invalid_protected_image_drag',
      });
      return true;
    }
    console.info('[Ameow] Registered protected image drag token:', {
      token,
      tabId,
      frameId: sender.frameId,
      imageUrl,
      pageUrl,
    });
    sendResponse({
      success: true,
    });
    return true;
  } else if (message.type === INTERNAL_REGISTER_XIAOHONGSHU_DRAG_MESSAGE) {
    const token = typeof message.token === 'string' ? message.token.trim() : '';
    const pageUrl = normalizeHttpUrl(message.pageUrl || sender.tab?.url);
    const sourcePageUrl = normalizeHttpUrl(sender.tab?.url);
    const detailUrl = normalizeHttpUrl(message.detailUrl);
    const noteId = typeof message.noteId === 'string' && message.noteId.trim()
      ? message.noteId.trim()
      : null;
    const imageUrl = normalizeHttpUrl(message.imageUrl);
    const mediaType = typeof message.mediaType === 'string' && message.mediaType.trim()
      ? message.mediaType.trim()
      : null;
    const videoIntentConfidence = normalizeVideoIntentConfidence(message.videoIntentConfidence) ?? null;
    const videoIntentSources = normalizeStringList(message.videoIntentSources);
    const tabId = sender.tab?.id;

    if (!token || !pageUrl || typeof tabId !== 'number') {
      sendResponse({
        success: false,
        reason: 'invalid_xiaohongshu_drag',
      });
      return true;
    }

    const registration = dragTokenOps?.buildRegistration
      ? dragTokenOps.buildRegistration(
          {
            tabId,
            frameId: typeof sender.frameId === 'number' ? sender.frameId : 0,
            documentId: sender.documentId,
            pageUrl,
          },
          {
            frameId: typeof sender.frameId === 'number' ? sender.frameId : undefined,
            documentId: sender.documentId,
            pageUrl,
            sourcePageUrl,
            detailUrl,
            noteId,
            imageUrl,
            mediaType,
            videoIntentConfidence,
            videoIntentSources,
          },
        )
      : { success: false, code: 'drag_token_invalid' };
    const registered = registration?.success && xiaohongshuDragRegistry?.register
      ? xiaohongshuDragRegistry.register(token, registration.facts)
      : { success: false, code: 'drag_token_registry_unavailable' };
    if (!registered?.success) {
      sendResponse({
        success: false,
        reason: registered?.code === 'drag_token_limit_reached'
          ? 'xiaohongshu_drag_limit_reached'
          : 'invalid_xiaohongshu_drag',
      });
      return true;
    }
    console.info('[Ameow] Registered Xiaohongshu drag token:', {
      token,
      tabId,
      frameId: sender.frameId,
      pageUrl,
      sourcePageUrl,
      detailUrl,
      noteId,
      imageUrl,
      mediaType,
      videoIntentConfidence,
      videoIntentSources,
    });
    sendResponse({
      success: true,
    });
    return true;
  } else if (message.type === 'save_screenshot') {
    const dataUrl = typeof message.dataUrl === 'string' ? message.dataUrl : '';
    const filename = typeof message.filename === 'string' ? message.filename : null;

    if (!dataUrl.startsWith('data:')) {
      sendResponse({
        success: false,
        connected: isConnected(),
        error: 'invalid_data_url',
      });
      return true;
    }

    (desktopPort?.saveDataUrl
      ? desktopPort.saveDataUrl({
          dataUrl,
          originalFilename: filename,
          requireRenameEnabled: true,
        })
      : Promise.resolve(buildRequestFailure('not_connected'))
    ).then((result) => {
      if (!result?.success) {
        console.warn('[Ameow] save_screenshot fallback reason:', result?.data?.code || result?.message || 'unknown');
      }
      sendResponse({
        success: Boolean(result?.success),
        connected: isConnected(),
        reason: result?.data?.code || null,
      });
    });
    return true;
  } else if (message.type === 'get_status') {
    buildSiteSessionStatusForActiveTab().then((siteSession) => {
      sendResponse({
        connected: isConnected(),
        connecting: desktopClient.getConnectionState().connecting,
        state: connectionState(),
        statusText: connectionStatusText(),
        siteSession,
      });
    });
    return true;
  } else if (message.type === 'sync_current_site_session') {
    syncCurrentSiteSessionFromActiveTab().then(sendResponse).catch((error) => {
      console.error('[Ameow] Failed to sync current site session:', error);
      sendResponse({
        success: false,
        connected: isConnected(),
        reason: 'site_session_sync_failed',
      });
    });
    return true;
  } else if (message.type === 'enable_current_site_session') {
    enableCurrentSiteSessionFromActiveTab().then(sendResponse).catch((error) => {
      console.error('[Ameow] Failed to enable current site session:', error);
      sendResponse({
        success: false,
        connected: isConnected(),
        reason: 'site_session_enable_failed',
      });
    });
    return true;
  } else if (message.type === 'get_site_session_drawer_state') {
    getSiteSessionDrawerState().then(sendResponse).catch((error) => {
      console.error('[Ameow] Failed to get site-session drawer state:', error);
      sendResponse({
        connected: isConnected(),
        currentTab: null,
        synchronizedSites: [],
        reason: 'site_session_drawer_state_failed',
      });
    });
    return true;
  } else if (message.type === 'start_pick_download') {
    startPickDownloadForActiveTab().then(sendResponse).catch((error) => {
      console.error('[Ameow] Failed to start pick download:', error);
      sendResponse({
        success: false,
        connected: isConnected(),
        reason: 'picker_start_failed',
      });
    });
    return true;
  } else if (message.type === 'get_launcher_status') {
    pingLauncherForActiveTab().then(sendResponse);
    return true;
  } else if (message.type === 'get_launcher_controls_state') {
    getLauncherControlsState().then(sendResponse);
    return true;
  } else if (message.type === 'restore_launcher_for_site') {
    restoreLauncherForActiveSite().then(sendResponse);
    return true;
  } else if (message.type === 'set_launcher_enabled') {
    setLauncherEnabled(message.enabled === true).then(sendResponse);
    return true;
  } else if (message.type === 'set_launcher_side') {
    setLauncherSide(message.side).then(sendResponse);
    return true;
  } else if (message.type === 'reset_launcher_position') {
    resetLauncherPosition().then(sendResponse);
    return true;
  } else if (message.type === 'restore_hidden_site') {
    restoreHiddenSitePattern(message.pattern).then(sendResponse);
    return true;
  } else if (message.type === 'restore_all_hidden_sites') {
    restoreAllHiddenSites().then(sendResponse);
    return true;
  } else if (message.type === 'scan_page_media') {
    mediaScanOps?.scanPageMediaForActiveTab().then(sendResponse).catch((error) => {
      console.error('[Ameow] Failed to scan page media:', error);
      sendResponse({
        success: false,
        reason: 'scan_failed',
      });
    });
    return true;
  } else if (message.type === 'get_media_scan_cache') {
    mediaScanOps?.getMediaScanCacheForActiveTab().then(sendResponse);
    return true;
  } else if (message.type === 'download_media_candidate') {
    downloadMediaCandidate(message.candidate).then(sendResponse).catch((error) => {
      console.error('[Ameow] Failed to download media candidate:', error);
      sendResponse({
        success: false,
        connected: isConnected(),
        reason: 'prepare_failed',
      });
    });
    return true;
  } else if (message.type === 'get_browser_download_state') {
    sendResponse(getBrowserDownloadState(message.downloadId));
    return false;
  } else if (message.type === 'download_current_content') {
    downloadCurrentContentFromActiveTab().then(sendResponse).catch((error) => {
      console.error('[Ameow] Failed to trigger current-content download:', error);
      sendResponse({
        success: false,
        connected: isConnected(),
        reason: 'prepare_failed',
      });
    });
    return true;
  } else if (message.type === 'get_theme') {
    sendResponse({ theme: currentTheme });
  } else if (message.type === 'get_language') {
    Promise.resolve(languageInitializationPromise)
      .catch(() => currentLanguage)
      .then(() => {
        sendResponse({ language: currentLanguage });
      });
    return true;
  } else if (message.type === 'download_current_video') {
    getActiveTab().then(async (tab) => {
      if (!tab?.id) {
        sendResponse({
          success: false,
          connected: isConnected(),
          reason: 'no_active_tab',
        });
        return;
      }

      const resolvedSelection = await requestResolvedVideoSelection(tab.id, {
        source: 'popup',
      });

      if (!resolvedSelection) {
        sendResponse({
          success: false,
          connected: isConnected(),
          reason: 'no_video_found',
        });
        return;
      }

      const result = await handleVideoSelectionRequest(resolvedSelection, {
        tabUrl: tab.url,
      });
      sendResponse(result);
    }).catch((error) => {
      console.error('[Ameow] Failed to trigger current video download:', error);
      sendResponse({
        success: false,
        connected: isConnected(),
        reason: 'prepare_failed',
      });
    });
    return true;
  }
  // Unknown/unowned message: every handled branch above returned true before
  // falling through, so returning false here closes the channel instead of
  // leaving an async response port open.
  return false;
});

if (chrome?.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm?.name !== WS_RECONNECT_ALARM) {
      return;
    }

    if (!isConnected() && !isConnecting()) {
      connect({ force: true });
    }
  });
}

if (chrome?.webRequest?.onHeadersReceived) {
  chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
      void rememberNetworkMediaResponse(details);
    },
    {
      urls: ['http://*/*', 'https://*/*'],
      types: ['image', 'media', 'xmlhttprequest', 'other'],
    },
    ['responseHeaders'],
  );
}

if (chrome?.downloads?.onChanged) {
  chrome.downloads.onChanged.addListener((delta) => {
    handleBrowserDownloadChanged(delta);
  });
}

if (chrome?.runtime?.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    connect({ force: true });
    void bootstrapDownloadPreferencesSync();
  });
}

if (chrome?.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(() => {
    connect({ force: true });
    void bootstrapDownloadPreferencesSync();
  });
}

if (chrome?.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }

    if (
      !changes?.[directDownloadQuality.STORAGE_KEY]
      && !changes?.[directDownloadQuality.LEGACY_STORAGE_KEY]
    ) {
      return;
    }

    markDownloadPreferencesDirtyAndSync();
  });
}

// Page identity lifecycle: navigation advances the page context generation
// (superseding page-scoped captures/selections) and tab removal removes all
// page-scoped state.
if (chrome?.tabs?.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (!Number.isInteger(tabId)) {
      return;
    }
    if (typeof changeInfo?.url === 'string' || changeInfo?.status === 'loading') {
      pageContextStore?.advanceNavigation(tabId);
    }
  });
}

if (chrome?.tabs?.onRemoved) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    pageContextStore?.removeTab(tabId);
    scanGenerations.delete(tabId);
    captureGenerations.delete(tabId);
    selectionGenerations.delete(tabId);
    // Tab removal invalidates every drag token of that tab only.
    protectedImageDragRegistry?.removeByTab?.(tabId);
    xiaohongshuDragRegistry?.removeByTab?.(tabId);
  });
}

// Auto-connect on startup. The worker may have been suspended: reconstruct
// bounded browser-download state so active downloads survive normal MV3
// restarts instead of being silently forgotten.
void rehydrateBrowserDownloadState();
clearExtensionInjectionDebugConfigOnDisconnect();
connect();
void bootstrapDownloadPreferencesSync();
