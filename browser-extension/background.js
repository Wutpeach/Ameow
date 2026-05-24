// Ameow Browser Extension - Background Service Worker
// WebSocket client for communication with Ameow desktop app

importScripts(
  "direct-download-quality.js",
  "extension-data-utils.js",
  "generic-video-selection-utils.js",
  "injection-debug-config.js",
  "launcher-config.js",
  "video-selection-routing.js",
  "xiaohongshu-drag-resolution-utils.js",
);

let ws = null;
let reconnectAttempts = 0;
let reconnectTimer = null;
const WS_URL = 'ws://127.0.0.1:39527';
const WS_RECONNECT_ALARM = 'ameow-ws-reconnect';
const REQUEST_TIMEOUT_MS = 7000;
const CONNECTING_WAIT_TIMEOUT_MS = 500;
const VIDEO_SELECTION_CONNECT_TIMEOUT_MS = 3500;
const VIDEO_SELECTION_RETRY_CONNECT_TIMEOUT_MS = 5000;
const PASTED_VIDEO_SELECTION_RESOLUTION_TIMEOUT_MS = 20000;
const PROTECTED_IMAGE_DRAG_TTL_MS = 2 * 60 * 1000;
const PROTECTED_IMAGE_RESOLUTION_TIMEOUT_MS = 15000;
const PROTECTED_IMAGE_BACKGROUND_FETCH_TIMEOUT_MS = 12000;
const XIAOHONGSHU_DRAG_TTL_MS = 2 * 60 * 1000;
const XIAOHONGSHU_DRAG_RESOLUTION_TIMEOUT_MS = 30000;
const XIAOHONGSHU_BACKGROUND_TAB_TIMEOUT_MS = 18000;
const CONNECTING_STATUS_TEXT = 'Connecting';
const OFFLINE_STATUS_TEXT = 'Offline';
const FALLBACK_LANGUAGE = 'en';
const LANGUAGE_STORAGE_KEY = 'ameowCurrentLanguage';
const PENDING_DOWNLOAD_PREFERENCES_SYNC_KEY = 'ameowPendingDownloadPreferencesSync';
const WS_ACTION_GET_LANGUAGE = 'get_language';
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
const INTERNAL_SCAN_PAGE_MEDIA_MESSAGE = 'ameow_scan_page_media';
const APP_VIDEO_SELECTION_ACTION = 'video_selected_v2';
const CONTEXT_MENU_DOWNLOAD_VIDEO_ID = 'ameow_download_video';
const MEDIA_SCAN_CACHE_KEY = 'ameowMediaScanCache';
const MEDIA_SCAN_CACHE_TTL_MS = 60 * 1000;
const MEDIA_SCAN_TIMEOUT_MS = 5000;
const MEDIA_SCAN_TOTAL_LIMIT = 100;
const pendingRequests = new Map();
const protectedImageDragRegistry = new Map();
const xiaohongshuDragRegistry = new Map();
let requestCounter = 0;
let lastConnectionIssue = OFFLINE_STATUS_TEXT;

// Store current theme from desktop app
let currentTheme = 'black';
let currentLanguage = resolvePreferredLanguage(undefined, self.navigator?.language);
const directDownloadQuality = self.AmeowDirectDownloadQuality;
const extensionDataUtils = self.AmeowExtensionDataUtils;
const genericVideoSelectionUtils = self.AmeowGenericVideoSelectionUtils;
const injectionDebugConfig = self.AmeowInjectionDebugConfig;
const launcherConfig = self.AmeowLauncherConfig;
const videoSelectionRouting = self.AmeowVideoSelectionRouting;
const xiaohongshuDragResolutionUtils = self.AmeowXiaohongshuDragResolutionUtils;
const languageInitializationPromise = initializeLanguageState();

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

  void ensureContextMenus();

  return currentLanguage;
}

function getContextMenuTitle() {
  return currentLanguage === 'zh-CN'
    ? '使用 Ameow 下载当前媒体'
    : 'Download Current Media with Ameow';
}

function ensureContextMenus() {
  if (!chrome?.contextMenus?.removeAll || !chrome?.contextMenus?.create) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create(
        {
          id: CONTEXT_MENU_DOWNLOAD_VIDEO_ID,
          title: getContextMenuTitle(),
          contexts: ['video', 'page', 'frame', 'link', 'image'],
        },
        () => {
          if (chrome.runtime?.lastError) {
            console.warn('[Ameow] Failed to create context menu:', chrome.runtime.lastError.message);
            resolve(false);
            return;
          }

          resolve(true);
        },
      );
    });
  });
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

function requestLanguageFromApp(socket = ws) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return false;
  }

  try {
    socket.send(JSON.stringify({ action: WS_ACTION_GET_LANGUAGE }));
    return true;
  } catch (error) {
    console.error('[Ameow] Failed to request language from desktop app:', error);
    return false;
  }
}

function isConnected() {
  return ws && ws.readyState === WebSocket.OPEN;
}

function isConnecting() {
  return ws && ws.readyState === WebSocket.CONNECTING;
}

function unavailableStatusText() {
  return OFFLINE_STATUS_TEXT;
}

function hasUnavailableIssue() {
  return lastConnectionIssue === OFFLINE_STATUS_TEXT;
}

function isCurrentSocket(socket) {
  return ws === socket;
}

function detachSocketHandlers(socket) {
  if (!socket) {
    return;
  }

  socket.onopen = null;
  socket.onmessage = null;
  socket.onclose = null;
  socket.onerror = null;
}

function connectionState() {
  if (isConnected()) {
    return 'connected';
  }

  if (lastConnectionIssue === CONNECTING_STATUS_TEXT && !hasUnavailableIssue()) {
    return 'connecting';
  }

  return 'offline';
}

function connectionStatusText() {
  if (isConnected()) {
    return 'Connected';
  }
  if (isConnecting()) {
    if (hasUnavailableIssue()) {
      return lastConnectionIssue;
    }
    return lastConnectionIssue || CONNECTING_STATUS_TEXT;
  }
  if (reconnectTimer !== null) {
    return lastConnectionIssue || unavailableStatusText();
  }
  return lastConnectionIssue || OFFLINE_STATUS_TEXT;
}

function notifyConnectionStatus() {
  chrome.runtime.sendMessage({
    type: 'connection_update',
    connected: isConnected(),
    connecting: Boolean(isConnecting() || reconnectTimer !== null),
    state: connectionState(),
    statusText: connectionStatusText(),
  }).catch(() => {});
}

function normalizeMediaSelectionPayload(message) {
  const requestedUrl = normalizeHttpUrl(message?.url);
  const pageUrl = normalizeHttpUrl(message?.pageUrl);
  const selectionScope = normalizeSelectionScope(message?.selectionScope) || 'current_item';
  const videoCandidates = normalizeVideoCandidates(message?.videoCandidates);
  const videoUrl = normalizeHttpUrl(message?.videoUrl);
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

  return {
    requestedUrl,
    pageUrl,
    selectionScope,
    videoCandidates,
    videoUrl,
    siteHint,
    extensionData: normalizedExtensionData,
    clipStartSec,
    clipEndSec,
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

function isLikelyImageUrl(rawUrl) {
  const normalized = normalizeHttpUrl(rawUrl);
  if (!normalized) {
    return false;
  }

  try {
    const parsed = new URL(normalized);
    return (
      /\.(?:jpg|jpeg|png|webp|gif|bmp|svg|avif)(?:[?#]|$)/i.test(parsed.pathname)
      || /(?:imageView2|format\/(?:jpe?g|png|webp|gif)|notes_pre_post|!nc_)/i.test(normalized)
      || (/xhscdn\.com/i.test(parsed.hostname) && !/\.(?:mp4|m4v|mov|m3u8|mpd)(?:[?#]|$)/i.test(normalized))
    );
  } catch {
    return false;
  }
}

function buildContextMenuFallbackSelection(info, tab) {
  const pageUrl = selectFirstHttpUrl(info?.linkUrl, info?.pageUrl, info?.frameUrl, tab?.url);
  const directVideoUrl = normalizeHttpUrl(info?.srcUrl);
  const routeUrl = isLikelyContentPageUrl(pageUrl) ? pageUrl : (directVideoUrl || pageUrl);
  if (!routeUrl) {
    return null;
  }

  return {
    url: routeUrl,
    pageUrl: pageUrl || routeUrl,
    videoUrl: directVideoUrl || undefined,
    videoCandidates: buildSelectionCandidateFromUrl(directVideoUrl, 'context_menu_src'),
    title: typeof tab?.title === 'string' ? tab.title : undefined,
    selectionScope: 'current_item',
  };
}

function normalizeOriginalFilename(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : null;
}

function buildContextMenuImageSelection(info, tab) {
  const imageUrl = normalizeHttpUrl(info?.srcUrl);
  if (!imageUrl) {
    return null;
  }

  const pageUrl = selectFirstHttpUrl(info?.linkUrl, info?.pageUrl, info?.frameUrl, tab?.url, imageUrl);
  return {
    url: imageUrl,
    pageUrl: pageUrl || imageUrl,
    originalFilename: normalizeOriginalFilename(info?.selectionText) || deriveFilenameFromUrl(imageUrl) || undefined,
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

function buildRequestFailure(code, requestId = null) {
  const data = { code };
  if (requestId) {
    data.requestId = requestId;
  }

  return {
    success: false,
    message: code,
    data,
  };
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
  return sendRequestToApp(
    'get_extension_debug_config',
    {},
    REQUEST_TIMEOUT_MS,
    {
      forceConnect: true,
    }
  ).then((response) => {
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
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  clearReconnectAlarm();

  if (!ws) {
    return;
  }

  const socket = ws;
  detachSocketHandlers(socket);
  ws = null;

  try {
    socket.close();
  } catch (_) {
    // Ignore close failures while forcing a fresh connection for retry.
  }
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
    selectionScope: typeof payload?.selectionScope === 'string' ? payload.selectionScope : null,
    siteHint: typeof payload?.siteHint === 'string' ? payload.siteHint : null,
    titlePresent: normalizedTitle.length > 0,
    cookiesPresent: typeof payload?.cookies === 'string' && payload.cookies.trim().length > 0,
    extensionData: youtubeExtensionData ? {
      youtube: {
        forceExtended: youtubeExtensionData.forceExtended === true,
        allowCookies: youtubeExtensionData.allowCookies === true,
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

function cleanupProtectedImageDragRegistry() {
  const now = Date.now();
  for (const [token, entry] of protectedImageDragRegistry.entries()) {
    if (!entry || typeof entry.createdAt !== 'number' || now - entry.createdAt > PROTECTED_IMAGE_DRAG_TTL_MS) {
      protectedImageDragRegistry.delete(token);
    }
  }
}

function cleanupXiaohongshuDragRegistry() {
  const now = Date.now();
  for (const [token, entry] of xiaohongshuDragRegistry.entries()) {
    if (!entry || typeof entry.createdAt !== 'number' || now - entry.createdAt > XIAOHONGSHU_DRAG_TTL_MS) {
      xiaohongshuDragRegistry.delete(token);
    }
  }
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

  return sendRequestToApp(
    'save_image',
    {
      url: normalizedUrl,
      targetDir,
      originalFilename,
      requestHeaders: headers,
      referrer: normalizedPageUrl || undefined,
    },
    PROTECTED_IMAGE_RESOLUTION_TIMEOUT_MS,
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

  const response = await sendRequestToApp(
    'protected_image_resolution_result',
    {
      correlationRequestId: requestId,
      success: result?.success === true,
      filePath: typeof result?.filePath === 'string' ? result.filePath : undefined,
      code: typeof result?.code === 'string' ? result.code : undefined,
      error: typeof result?.error === 'string' ? result.error : undefined,
    },
    PROTECTED_IMAGE_RESOLUTION_TIMEOUT_MS,
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

  const response = await sendRequestToApp(
    'xiaohongshu_drag_resolution_result',
    {
      correlationRequestId: requestId,
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
    XIAOHONGSHU_DRAG_RESOLUTION_TIMEOUT_MS,
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

  const response = await sendRequestToApp(
    'pasted_video_selection_result',
    {
      correlationRequestId: requestId,
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
    PASTED_VIDEO_SELECTION_RESOLUTION_TIMEOUT_MS,
  );

  if (!response?.success) {
    console.warn(
      '[Ameow] pasted_video_selection_result was not acknowledged:',
      response?.data?.code || response?.message || 'unknown'
    );
  }
}

async function handleProtectedImageResolveRequest(data) {
  cleanupProtectedImageDragRegistry();

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

  const entry = protectedImageDragRegistry.get(token);
  if (!entry) {
    await reportProtectedImageResolutionResult(requestId, {
      success: false,
      code: 'protected_image_token_missing',
      error: 'Protected image drag token was missing or expired',
    });
    return;
  }
  protectedImageDragRegistry.delete(token);

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

    const saveResult = await sendRequestToApp(
      'save_data_url',
      {
        dataUrl: resolution.dataUrl,
        originalFilename:
          typeof resolution.filename === 'string' && resolution.filename.trim()
            ? resolution.filename.trim()
            : deriveFilenameFromUrl(imageUrl) || undefined,
        targetDir,
      },
      PROTECTED_IMAGE_RESOLUTION_TIMEOUT_MS,
    );

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
  cleanupXiaohongshuDragRegistry();

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

  const entry = xiaohongshuDragRegistry.get(token);
  if (!entry) {
    console.warn('[Ameow] Xiaohongshu drag token was missing in registry:', {
      requestId,
      token,
    });
    await reportXiaohongshuDragResolutionResult(requestId, {
      success: false,
      kind: 'unknown',
      code: 'xiaohongshu_drag_token_missing',
      error: 'Xiaohongshu drag token was missing or expired',
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
  const force = options.force === true;

  if (isConnected() || isConnecting()) return;
  if (reconnectTimer !== null) {
    if (!force) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  clearReconnectAlarm();

  if (ws) {
    detachSocketHandlers(ws);
  }

  const shouldNotifyConnecting = reconnectAttempts === 0 && !hasUnavailableIssue();
  if (shouldNotifyConnecting) {
    lastConnectionIssue = CONNECTING_STATUS_TEXT;
    notifyConnectionStatus();
  }

  const socket = new WebSocket(WS_URL);
  ws = socket;

  socket.onopen = () => {
    if (!isCurrentSocket(socket)) {
      return;
    }

    console.info('[Ameow] Connected to desktop app');
    reconnectAttempts = 0;
    lastConnectionIssue = '';
    notifyConnectionStatus();
    clearReconnectAlarm();

    try {
      // Query current theme after connection.
      socket.send(JSON.stringify({ action: 'get_theme' }));
    } catch (error) {
      console.warn('[Ameow] Failed to request theme from desktop app:', error);
    }

    requestLanguageFromApp(socket);
    void bootstrapDownloadPreferencesSync();
    void syncExtensionInjectionDebugConfigFromApp();
  };

  socket.onmessage = (event) => {
    if (!isCurrentSocket(socket)) {
      return;
    }

    try {
      const message = JSON.parse(event.data);
      if (handlePendingRequestResponse(message)) {
        return;
      }
      handleMessage(message);
    } catch (e) {
      console.error('[Ameow] Failed to parse message:', e);
    }
  };

  socket.onclose = () => {
    if (!isCurrentSocket(socket)) {
      return;
    }

    console.info('[Ameow] Disconnected');
    clearExtensionInjectionDebugConfigOnDisconnect();
    rejectPendingRequests('ws_closed');
    detachSocketHandlers(socket);
    ws = null;
    lastConnectionIssue = unavailableStatusText();
    notifyConnectionStatus();
    scheduleReconnect();
  };

  socket.onerror = () => {
    if (!isCurrentSocket(socket)) {
      return;
    }

    if (!isConnected()) {
      clearExtensionInjectionDebugConfigOnDisconnect();
      lastConnectionIssue = unavailableStatusText();
      console.warn('[Ameow] WebSocket unavailable. Open the Ameow desktop app to enable browser-extension features.');
      notifyConnectionStatus();
      scheduleReconnect();
      return;
    }
    console.error('[Ameow] WebSocket error while connected.');
  };
}

function scheduleReconnect() {
  if (reconnectTimer !== null) {
    return;
  }

  reconnectAttempts++;
  const delay = Math.min(500 * Math.pow(1.5, reconnectAttempts), 5000);
  scheduleReconnectAlarm(delay);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function scheduleReconnectAlarm(delayMs) {
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
}

function clearReconnectAlarm() {
  if (!chrome?.alarms?.clear) {
    return;
  }

  try {
    chrome.alarms.clear(WS_RECONNECT_ALARM, () => {});
  } catch (error) {
    console.error('[Ameow] Failed to clear reconnect alarm:', error);
  }
}

function nextRequestId() {
  requestCounter += 1;
  return `req_${Date.now()}_${requestCounter}`;
}

function handlePendingRequestResponse(message) {
  const requestId = message?.data?.requestId || message?.data?.request_id;
  if (!requestId) {
    return false;
  }

  const pending = pendingRequests.get(requestId);
  if (!pending) {
    return false;
  }

  pendingRequests.delete(requestId);
  clearTimeout(pending.timer);
  pending.resolve(message);
  return true;
}

function rejectPendingRequests(reason) {
  for (const [requestId, pending] of pendingRequests.entries()) {
    clearTimeout(pending.timer);
    pending.resolve(buildRequestFailure(reason, requestId));
  }
  pendingRequests.clear();
}

function handleMessage(message) {
  // Compatible with: top-level action, type, or wrapped data.action
  const action = message.action || message.type || message.data?.action;

  switch (action) {
    case 'theme_changed':
      currentTheme = message.data?.theme || 'black';
      // Notify popup if open (ignore errors if popup is closed)
      chrome.runtime.sendMessage({ type: 'theme_update', theme: currentTheme }).catch(() => {});
      break;
    case 'theme_info':
      // Compatible with: message.data.theme or message.theme
      currentTheme = message.data?.theme || message.theme || 'black';
      chrome.runtime.sendMessage({ type: 'theme_update', theme: currentTheme }).catch(() => {});
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
    case 'resolve_protected_image':
      void handleProtectedImageResolveRequest(message.data || {});
      break;
    case 'resolve_pasted_video_selection':
      void handlePastedVideoSelectionResolveRequest(message.data || {});
      break;
    case 'resolve_xiaohongshu_drag':
      void handleXiaohongshuDragResolveRequest(message.data || {});
      break;
  }
}

function sendToApp(data) {
  if (isConnected()) {
    ws.send(JSON.stringify(data));
    return true;
  }
  connect({ force: true });
  return false;
}

function syncDownloadPreferencesToApp() {
  return directDownloadQuality
    .getQualityPreference()
    .then(async (qualityPreference) => {
      const response = await sendRequestToApp(
        'sync_download_preferences',
        {
          videoQuality: qualityPreference,
        },
        REQUEST_TIMEOUT_MS,
        {
          forceConnect: true,
        }
      );
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

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForConnection(timeoutMs) {
  if (isConnected()) {
    return true;
  }

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (isConnected()) {
      return true;
    }
    await sleep(80);
  }
  return isConnected();
}

async function ensureConnection(timeoutMs, options = {}) {
  if (isConnected()) {
    return true;
  }

  connect({ force: options.force === true });
  return waitForConnection(timeoutMs);
}

async function sendRequestToApp(action, data = {}, timeoutMs = REQUEST_TIMEOUT_MS, options = {}) {
  const connectTimeoutMs = typeof options.connectTimeoutMs === 'number'
    ? options.connectTimeoutMs
    : CONNECTING_WAIT_TIMEOUT_MS;
  const forceConnect = options.forceConnect === true;

  if (!isConnected()) {
    const connected = await ensureConnection(connectTimeoutMs, { force: forceConnect });
    if (!connected) {
      return buildRequestFailure('not_connected');
    }
  }

  if (!isConnected()) {
    return buildRequestFailure('not_connected');
  }

  const requestId = nextRequestId();
  const payload = {
    action,
    data: {
      ...data,
      requestId,
    },
  };

  return await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!pendingRequests.has(requestId)) {
        return;
      }
      pendingRequests.delete(requestId);
      resolve(buildRequestFailure('request_timeout', requestId));
    }, timeoutMs);

    pendingRequests.set(requestId, { resolve, timer });

    try {
      ws.send(JSON.stringify(payload));
    } catch (error) {
      clearTimeout(timer);
      pendingRequests.delete(requestId);
      resolve(buildRequestFailure('send_failed', requestId));
    }
  });
}

function queueVideoSelectionToApp(data) {
  const sendSelectionRequest = (action) => sendRequestToApp(
    action,
    data,
    REQUEST_TIMEOUT_MS,
    {
      connectTimeoutMs: VIDEO_SELECTION_CONNECT_TIMEOUT_MS,
      forceConnect: true,
    }
  );

  return sendSelectionRequest(APP_VIDEO_SELECTION_ACTION).then(async (result) => {
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

    return sendSelectionRequest(APP_VIDEO_SELECTION_ACTION);
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
      videoCandidates,
      selectionScope,
      clipStartSec: normalized.clipStartSec,
      clipEndSec: normalized.clipEndSec,
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
        'Forwarding video_selected_v2 payload',
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

async function downloadCurrentContentFromActiveTab() {
  const tab = await getActiveTab();
  if (!tab?.id) {
    return {
      success: false,
      connected: isConnected(),
      reason: 'no_active_tab',
    };
  }

  const response = await sendMessageToTab(tab.id, {
    type: INTERNAL_CAPTURE_CURRENT_CONTENT_MESSAGE,
  }).catch(() => null);
  const payload = response?.payload && typeof response.payload === 'object'
    ? response.payload
    : {
        type: INTERNAL_VIDEO_SELECTION_MESSAGE,
        url: tab.url,
        pageUrl: tab.url,
        title: tab.title,
        selectionScope: 'current_item',
      };

  return handleVideoSelectionRequest(payload, {
    tabUrl: tab.url,
  });
}

function mediaScanCacheKey(tab) {
  const tabId = typeof tab?.id === 'number' ? tab.id : 'none';
  const url = typeof tab?.url === 'string' ? tab.url : '';
  return `${tabId}-${hashString(url)}`;
}

function normalizeMediaScanResponse(response, tab) {
  if (!response?.success) {
    return {
      success: false,
      reason: response?.reason || 'scan_failed',
      pageUrl: tab?.url || null,
      pageTitle: tab?.title || '',
      videos: [],
      images: [],
      scannedAt: Date.now(),
      scanDurationMs: 0,
    };
  }
  const videos = Array.isArray(response.videos)
    ? response.videos.slice(0, MEDIA_SCAN_TOTAL_LIMIT)
    : [];
  const images = Array.isArray(response.images)
    ? response.images.slice(0, Math.max(0, MEDIA_SCAN_TOTAL_LIMIT - videos.length))
    : [];
  return {
    success: true,
    pageUrl: normalizeHttpUrl(response.pageUrl) || tab?.url || null,
    pageTitle: typeof response.pageTitle === 'string' ? response.pageTitle : tab?.title || '',
    videos,
    images,
    scannedAt: typeof response.scannedAt === 'number' ? response.scannedAt : Date.now(),
    scanDurationMs: typeof response.scanDurationMs === 'number' ? response.scanDurationMs : 0,
    truncated: response.truncated === true || videos.length + images.length < (
      (Array.isArray(response.videos) ? response.videos.length : 0)
      + (Array.isArray(response.images) ? response.images.length : 0)
    ),
  };
}

async function getMediaScanCacheForActiveTab() {
  const tab = await getActiveTab();
  if (!tab?.id) {
    return {
      success: false,
      reason: 'no_active_tab',
    };
  }

  const result = await storageGet(MEDIA_SCAN_CACHE_KEY).catch(() => ({}));
  const storedCache = result?.[MEDIA_SCAN_CACHE_KEY];
  const cache = storedCache && typeof storedCache === 'object' && !Array.isArray(storedCache)
    ? storedCache
    : {};
  const key = mediaScanCacheKey(tab);
  const entry = cache[key] || null;
  if (!entry) {
    return {
      success: true,
      cached: false,
      ttlMs: MEDIA_SCAN_CACHE_TTL_MS,
    };
  }

  const ageMs = Date.now() - Number(entry.scannedAt || 0);
  return {
    success: true,
    cached: true,
    stale: ageMs > MEDIA_SCAN_CACHE_TTL_MS,
    ageMs,
    ttlMs: MEDIA_SCAN_CACHE_TTL_MS,
    result: entry,
  };
}

async function storeMediaScanCache(tab, result) {
  const key = mediaScanCacheKey(tab);
  const current = await storageGet(MEDIA_SCAN_CACHE_KEY).catch(() => ({}));
  const cache = current?.[MEDIA_SCAN_CACHE_KEY] && typeof current[MEDIA_SCAN_CACHE_KEY] === 'object'
    ? current[MEDIA_SCAN_CACHE_KEY]
    : {};
  const nextCache = {};
  const now = Date.now();
  Object.entries(cache).forEach(([entryKey, entry]) => {
    if (entryKey === key) {
      return;
    }
    const scannedAt = Number(entry?.scannedAt || 0);
    if (now - scannedAt <= MEDIA_SCAN_CACHE_TTL_MS * 5) {
      nextCache[entryKey] = entry;
    }
  });
  nextCache[key] = result;
  await storageSet({ [MEDIA_SCAN_CACHE_KEY]: nextCache });
}

async function scanPageMediaForActiveTab() {
  const tab = await getActiveTab();
  if (!tab?.id) {
    return {
      success: false,
      reason: 'no_active_tab',
    };
  }

  const response = await Promise.race([
    sendMessageToTab(tab.id, { type: INTERNAL_SCAN_PAGE_MEDIA_MESSAGE }, { frameId: 0 }).catch((error) => ({
      success: false,
      reason: error?.message || 'scan_unavailable',
    })),
    new Promise((resolve) => {
      setTimeout(() => resolve({
        success: false,
        reason: 'scan_timeout',
      }), MEDIA_SCAN_TIMEOUT_MS);
    }),
  ]);
  const normalized = normalizeMediaScanResponse(response, tab);
  if (normalized.success) {
    await storeMediaScanCache(tab, normalized).catch((error) => {
      console.warn('[Ameow] Failed to cache media scan result:', error);
    });
  }
  return {
    ...normalized,
    ttlMs: MEDIA_SCAN_CACHE_TTL_MS,
  };
}

async function downloadMediaCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return {
      success: false,
      connected: isConnected(),
      reason: 'invalid_candidate',
    };
  }
  const tab = await getActiveTab();
  const mediaType = candidate.mediaType;
  const url = normalizeHttpUrl(candidate.url);
  const pageUrl = selectFirstHttpUrl(candidate.pageUrl, tab?.url, url);

  if (!url) {
    return {
      success: false,
      connected: isConnected(),
      reason: 'invalid_candidate_url',
    };
  }

  if (mediaType === 'image') {
    return handlePageImageSelectionRequest({
      type: INTERNAL_PAGE_IMAGE_SELECTION_MESSAGE,
      url,
      pageUrl,
      originalFilename: candidate.title || undefined,
    }, {
      tabUrl: tab?.url,
    });
  }

  return handleVideoSelectionRequest({
    type: INTERNAL_VIDEO_SELECTION_MESSAGE,
    url,
    pageUrl,
    videoUrl: url,
    title: candidate.title || tab?.title,
    videoCandidates: [{
      url,
      type: typeof candidate.type === 'string' ? candidate.type : 'unknown',
      confidence: typeof candidate.confidence === 'string' ? candidate.confidence : 'low',
      source: typeof candidate.source === 'string' ? candidate.source : 'popup_media_browser',
      mediaType: 'video',
    }],
    selectionScope: 'current_item',
    extensionData: {
      ameowCapture: {
        version: 1,
        action: 'popup_fallback',
        pageUrl: pageUrl || url,
        targetHref: url,
        title: candidate.title || tab?.title,
      },
    },
  }, {
    tabUrl: tab?.url,
  });
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

async function requestResolvedVideoSelection(tabId, options = {}) {
  try {
    const response = await sendMessageToTab(
      tabId,
      {
        type: INTERNAL_RESOLVE_VIDEO_SELECTION_MESSAGE,
        source: options.source || 'popup',
        requestedSrcUrl: options.requestedSrcUrl || undefined,
      },
      typeof options.frameId === 'number' ? { frameId: options.frameId } : {},
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

async function requestResolvedXiaohongshuContextMedia(tabId, options = {}) {
  try {
    const response = await sendMessageToTab(
      tabId,
      {
        type: INTERNAL_RESOLVE_XIAOHONGSHU_CONTEXT_MEDIA_MESSAGE,
        source: options.source || 'context_menu',
        linkUrl: options.linkUrl || undefined,
        imageUrl: options.imageUrl || undefined,
        frameUrl: options.frameUrl || undefined,
        pageUrl: options.pageUrl || undefined,
        mediaType: options.mediaType || undefined,
      },
      typeof options.frameId === 'number' ? { frameId: options.frameId } : {},
    );

    if (response?.success && response.payload && typeof response.payload === 'object') {
      return response.payload;
    }
  } catch (error) {
    console.warn('[Ameow] Failed to resolve Xiaohongshu context media:', error);
  }

  return null;
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === INTERNAL_VIDEO_SELECTION_MESSAGE) {
    handleVideoSelectionRequest(message, {
      tabUrl: sender.tab?.url,
    }).then(sendResponse);
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
    handleVideoSelectionRequest(payload, {
      tabUrl: sender.tab?.url,
    }).then(sendResponse).catch((error) => {
      console.error('[Ameow] Failed to queue current-content selection:', error);
      sendResponse({
        success: false,
        connected: isConnected(),
        reason: 'prepare_failed',
      });
    });
    return true;
  } else if (message.type === INTERNAL_PAGE_IMAGE_SELECTION_MESSAGE) {
    handlePageImageSelectionRequest(message, {
      tabUrl: sender.tab?.url,
    }).then(sendResponse);
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

    cleanupProtectedImageDragRegistry();
    protectedImageDragRegistry.set(token, {
      tabId,
      frameId: typeof sender.frameId === 'number' ? sender.frameId : undefined,
      imageUrl,
      pageUrl,
      createdAt: Date.now(),
    });
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

    cleanupXiaohongshuDragRegistry();
    xiaohongshuDragRegistry.set(token, {
      tabId,
      frameId: typeof sender.frameId === 'number' ? sender.frameId : undefined,
      pageUrl,
      sourcePageUrl,
      detailUrl,
      noteId,
      imageUrl,
      mediaType,
      videoIntentConfidence,
      videoIntentSources,
      createdAt: Date.now(),
    });
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

    sendRequestToApp('save_data_url', {
      dataUrl,
      originalFilename: filename,
      requireRenameEnabled: true,
    }).then((result) => {
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
    sendResponse({
      connected: isConnected(),
      connecting: isConnecting() || reconnectTimer !== null,
      state: connectionState(),
      statusText: connectionStatusText(),
    });
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
    scanPageMediaForActiveTab().then(sendResponse).catch((error) => {
      console.error('[Ameow] Failed to scan page media:', error);
      sendResponse({
        success: false,
        reason: 'scan_failed',
      });
    });
    return true;
  } else if (message.type === 'get_media_scan_cache') {
    getMediaScanCacheForActiveTab().then(sendResponse);
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
  return true;
});

if (chrome?.contextMenus?.onClicked) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== CONTEXT_MENU_DOWNLOAD_VIDEO_ID || !tab?.id) {
      return;
    }

    const siteHint = deriveSiteHint([
      info?.linkUrl,
      info?.srcUrl,
      info?.pageUrl,
      info?.frameUrl,
      tab?.url,
    ]);
    const frameId = typeof info.frameId === 'number' ? info.frameId : undefined;
    const normalizedMediaType = info?.mediaType === 'image' || info?.mediaType === 'video'
      ? info.mediaType
      : undefined;

    void Promise.resolve().then(async () => {
      if (siteHint === 'xiaohongshu') {
        const resolvedMedia = await requestResolvedXiaohongshuContextMedia(tab.id, {
          source: 'context_menu',
          frameId,
          linkUrl: info?.linkUrl,
          imageUrl: info?.srcUrl,
          frameUrl: info?.frameUrl,
          pageUrl: info?.pageUrl,
          mediaType: normalizedMediaType,
        });

        if (resolvedMedia?.kind === 'image' && resolvedMedia.imageUrl) {
          return handlePageImageSelectionRequest({
            url: resolvedMedia.imageUrl,
            pageUrl: resolvedMedia.pageUrl || info?.linkUrl || info?.pageUrl,
          }, {
            tabUrl: tab.url,
          });
        }

        if (resolvedMedia?.pageUrl) {
          return handleVideoSelectionRequest({
            url: resolvedMedia.videoUrl || resolvedMedia.pageUrl,
            pageUrl: resolvedMedia.pageUrl,
            videoUrl: resolvedMedia.videoUrl || null,
            videoCandidates: resolvedMedia.videoCandidates || [],
            title: resolvedMedia.title,
            selectionScope: 'current_item',
          }, {
            tabUrl: tab.url,
          });
        }

        if (isLikelyImageUrl(info?.srcUrl)) {
          return handlePageImageSelectionRequest({
            url: info.srcUrl,
            pageUrl: info?.linkUrl || info?.pageUrl || info?.frameUrl || tab?.url,
          }, {
            tabUrl: tab.url,
          });
        }
      }

      if (normalizedMediaType === 'image' || isLikelyImageUrl(info?.srcUrl)) {
        const imageSelection = buildContextMenuImageSelection(info, tab);
        if (imageSelection) {
          return handlePageImageSelectionRequest(imageSelection, {
            tabUrl: tab.url,
          });
        }
      }

      const resolvedSelection = await requestResolvedVideoSelection(tab.id, {
        source: 'context_menu',
        requestedSrcUrl: info.srcUrl,
        frameId,
      });
      const payload = resolvedSelection || buildContextMenuFallbackSelection(info, tab);
      if (!payload) {
        console.warn('[Ameow] Context menu selection could not be resolved');
        return null;
      }

      return handleVideoSelectionRequest(payload, {
        tabUrl: tab.url,
      });
    }).then((result) => {
      if (!result || result.success) {
        return;
      }

      console.warn(
        '[Ameow] Context menu media request was not queued:',
        result.reason || 'unknown',
      );
    }).catch((error) => {
      console.error('[Ameow] Failed to queue context-menu media selection:', error);
    });
  });
}

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

if (chrome?.runtime?.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    void ensureContextMenus();
    connect({ force: true });
    void bootstrapDownloadPreferencesSync();
  });
}

if (chrome?.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(() => {
    void ensureContextMenus();
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

// Auto-connect on startup
clearExtensionInjectionDebugConfigOnDisconnect();
void ensureContextMenus();
connect();
void bootstrapDownloadPreferencesSync();
