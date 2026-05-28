// Ameow Browser Extension - YouTube Video Detector
// Detects video pages and injects download/screenshot buttons

(function() {
  'use strict';

  const PROCESSED_ATTR = 'data-ameow-processed';
  const BUTTON_CLASSES = [
    'ameow-youtube-btn',
    'ameow-youtube-set-in-btn',
    'ameow-youtube-set-out-btn',
    'ameow-youtube-screenshot-btn',
  ];
  const SCREENSHOT_PANEL_ID = 'ameow-youtube-screenshot-panel';
  const SCREENSHOT_LIST_ID = 'ameow-youtube-screenshot-list';
  const MAX_SCREENSHOTS = 20;
  const screenshots = [];
  const clipState = {
    startSec: null,
    endSec: null,
  };
  const localeUtils = window.AmeowLocaleUtils || null;
  const controlStyleUtils = window.AmeowControlStyleUtils || null;
  const injectionDebugConfig = window.AmeowInjectionDebugConfig || null;
  const injectedCatIcon = window.AmeowInjectedCatIcon;
  const FALLBACK_LANGUAGE = localeUtils?.FALLBACK_LANGUAGE || 'en';
  const RESOLVE_PASTED_VIDEO_SELECTION_MESSAGE = 'ameow_resolve_pasted_video_selection';
  let currentBundle = {
    language: FALLBACK_LANGUAGE,
    common: {},
    extension: {},
    _namespaces: ['extension', 'common'],
  };
  let injectionDebugEnabled = false;

  const CAT_ICON_CLASS = 'ameow-injected-cat-icon';
  const CLIP_POINT_ICON_SVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:block;">
    <path d="M8.5796 16.3287C8.20841 16.019 7.99992 15.5989 8 15.161V4.99686C8.00201 4.46777 8.25488 3.96084 8.70341 3.58672C9.15193 3.2126 9.75969 3.00168 10.394 3H15L15 21C14.4749 21 13.9713 20.826 13.6 20.5163L8.5796 16.3287Z" fill="black" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
  const CAMERA_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M9 4.5a2 2 0 0 0-1.79 1.11l-.47.94H5.5A3.5 3.5 0 0 0 2 10.05v7.45A3.5 3.5 0 0 0 5.5 21h13a3.5 3.5 0 0 0 3.5-3.5v-7.45A3.5 3.5 0 0 0 18.5 6.5h-1.24l-.47-.94A2 2 0 0 0 15 4.5H9Zm3 13a4.5 4.5 0 1 1 0-9a4.5 4.5 0 0 1 0 9Zm0-1.75a2.75 2.75 0 1 0 0-5.5a2.75 2.75 0 0 0 0 5.5Z"/>
  </svg>`;
  const SCREENSHOT_SAVE_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>
    <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/>
    <path d="M7 3v4a1 1 0 0 0 1 1h7"/>
  </svg>`;
  const SCREENSHOT_COPY_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect width="8" height="4" x="8" y="2" rx="1" ry="1"/>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
  </svg>`;
  const SCREENSHOT_DELETE_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 11v6"/>
    <path d="M14 11v6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
    <path d="M3 6h18"/>
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>`;
  const SCREENSHOT_COPIED_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6 7 17l-5-5"/>
    <path d="m22 10-7.5 7.5L13 16"/>
  </svg>`;

  function isVideoPage() {
    return window.location.pathname === '/watch' &&
      new URLSearchParams(window.location.search).has('v');
  }

  function getVideoId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('v');
  }

  function buildCurrentItemDownloadUrl() {
    const pageUrl = window.location.href;
    const videoId = getVideoId();
    if (!videoId) {
      return pageUrl;
    }

    try {
      const currentUrl = new URL(pageUrl);
      const canonicalUrl = new URL('/watch', currentUrl.origin);
      canonicalUrl.searchParams.set('v', videoId);
      return canonicalUrl.toString();
    } catch (error) {
      return pageUrl;
    }
  }

  function getCurrentVideoKey() {
    if (!isVideoPage()) {
      return window.location.pathname;
    }
    const videoId = getVideoId() || '';
    return `${window.location.pathname}?v=${videoId}`;
  }

  function getVideoElement() {
    return document.querySelector('video.video-stream') || document.querySelector('video');
  }

  function resetClipState() {
    clipState.startSec = null;
    clipState.endSec = null;
  }

  function hasValidClipRange() {
    return clipState.startSec != null &&
      clipState.endSec != null &&
      clipState.endSec > clipState.startSec;
  }

  function detectVideoPlayer() {
    if (!isVideoPage()) return;

    const videoId = getVideoId();
    if (!videoId) return;

    const rightControls = document.querySelector('.ytp-right-controls');
    if (!rightControls) return;
    if (rightControls.hasAttribute(PROCESSED_ATTR)) return;
    if (!isControlBarReady(rightControls)) return;

    console.log('[Ameow YouTube] Video detected:', videoId);
    injectControlButtons(rightControls);
    rightControls.setAttribute(PROCESSED_ATTR, 'true');
  }

  function isControlBarReady(container) {
    if (controlStyleUtils?.isControlBarReady) {
      return controlStyleUtils.isControlBarReady(container, {
        excludeClasses: BUTTON_CLASSES,
      });
    }

    return isRenderableControlBarFallback(container) &&
      hasRenderableNativeControlChildFallback(container);
  }

  function isRenderableControlBarFallback(container) {
    if (!(container instanceof HTMLElement) || !container.isConnected) {
      return false;
    }

    const style = window.getComputedStyle(container);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }

    const rect = container.getBoundingClientRect();
    if (rect.width < 16 || rect.height < 16) {
      return false;
    }

    return rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth;
  }

  function hasRenderableNativeControlChildFallback(container) {
    const children = Array.from(container.children).filter((child) => child instanceof HTMLElement);
    if (children.length === 0) {
      return false;
    }

    return children.some((child) => {
      if (!(child instanceof HTMLElement)) {
        return false;
      }

      const isInjectedButton = BUTTON_CLASSES.some((className) => child.classList.contains(className));
      if (isInjectedButton) {
        return false;
      }

      const style = window.getComputedStyle(child);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }

      const rect = child.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) {
        return false;
      }

      return rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth;
    });
  }

  function getCurrentPlaybackSeconds() {
    const videoEl = getVideoElement();
    if (!videoEl) return null;
    const current = Number(videoEl.currentTime);
    if (!Number.isFinite(current) || current < 0) return null;
    return current;
  }

  function formatTimestamp(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const hh = Math.floor(total / 3600);
    const mm = Math.floor((total % 3600) / 60);
    const ss = total % 60;
    if (hh > 0) {
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    }
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }

  function notify(message) {
    window.alert(message);
  }

  function t(key, fallback) {
    return localeUtils?.translate(currentBundle, key, fallback) || fallback || key;
  }

  function tt(key, values, fallback) {
    return localeUtils?.translateTemplate(currentBundle, key, values, fallback) || fallback || key;
  }

  function syncInjectionDebugState(enabled) {
    injectionDebugEnabled = enabled === true;
  }

  function summarizeVideoSelectionPayload(payload) {
    const normalizedTitle = typeof payload?.title === 'string' ? payload.title.trim() : '';
    const normalizedSelectionScope = typeof payload?.selectionScope === 'string'
      ? payload.selectionScope
      : null;

    return {
      url: typeof payload?.url === 'string' ? payload.url : null,
      pageUrl: typeof payload?.pageUrl === 'string' ? payload.pageUrl : null,
      selectionScope: normalizedSelectionScope,
      siteHint: typeof payload?.siteHint === 'string' ? payload.siteHint : null,
      titlePresent: normalizedTitle.length > 0,
      clipStartSec: Number.isFinite(payload?.clipStartSec) ? payload.clipStartSec : null,
      clipEndSec: Number.isFinite(payload?.clipEndSec) ? payload.clipEndSec : null,
    };
  }

  function logInjectionDebug(message, payload) {
    if (!injectionDebugEnabled) {
      return;
    }

    if (typeof payload === 'undefined') {
      console.info(`[Ameow YouTube] ${message}`);
      return;
    }

    console.info(`[Ameow YouTube] ${message}`, payload);
  }

  async function applyLanguage(nextLanguage) {
    if (!localeUtils?.loadLocaleBundle) {
      return;
    }

    currentBundle = await localeUtils.loadLocaleBundle(nextLanguage);
    refreshLocalizedUi();
  }

  function setButtonTitle(button, title) {
    if (!(button instanceof HTMLElement)) {
      return;
    }

    button.title = title;
    button.setAttribute('aria-label', title);
  }

  function updateStaticControlLabels() {
    const screenshotBtn = document.querySelector('.ameow-youtube-screenshot-btn');
    setButtonTitle(
      screenshotBtn,
      t('injected.playerControls.buttons.screenshot', 'Screenshot'),
    );
  }

  function refreshLocalizedUi() {
    updateStaticControlLabels();
    updateClipButtonsState();
    if (document.getElementById(SCREENSHOT_PANEL_ID)) {
      renderScreenshotPanel();
    }
  }

  function removeInjectedButtons() {
    for (const className of BUTTON_CLASSES) {
      document.querySelectorAll(`.${className}`).forEach((el) => el.remove());
    }
  }

  function createButton({ className, title, html, text, onClick, onContextMenu }) {
    const btn = document.createElement('button');
    btn.className = `ytp-button ${className}`;
    btn.type = 'button';
    btn.title = title;
    btn.setAttribute('aria-label', title);
    if (html === CAT_ICON_CLASS) {
      btn.appendChild(createCatIconElement());
    } else if (html) {
      btn.innerHTML = html;
    } else if (text) {
      const label = document.createElement('span');
      label.className = 'ameow-youtube-btn-label';
      label.textContent = text;
      btn.appendChild(label);
    }
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      onClick();
    });
    if (typeof onContextMenu === 'function') {
      btn.addEventListener('contextmenu', (e) => {
        onContextMenu(e);
      });
    }
    return btn;
  }

  function createCatIconElement() {
    return injectedCatIcon.createCatIconElement({ fallbackSizePx: 24 });
  }

  function getClipPointButtonTitle(pointLabel, seconds) {
    if (seconds == null) {
      return pointLabel === 'IN'
        ? t('injected.playerControls.buttons.setIn', 'Set IN point')
        : t('injected.playerControls.buttons.setOut', 'Set OUT point');
    }

    const formattedTime = formatTimestamp(seconds);
    return pointLabel === 'IN'
      ? tt(
        'injected.playerControls.clip.inSelected',
        { time: formattedTime },
        `IN: ${formattedTime} (right-click to clear)`,
      )
      : tt(
        'injected.playerControls.clip.outSelected',
        { time: formattedTime },
        `OUT: ${formattedTime} (right-click to clear)`,
      );
  }

  function sendVideoSelectionMessage(payload) {
    logInjectionDebug('Injected video_selection payload', summarizeVideoSelectionPayload(payload));
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[Ameow YouTube] Failed to contact background:', chrome.runtime.lastError.message);
        notify(
          t(
            'injected.playerControls.alerts.backgroundUnavailable',
            'Ameow extension background is unavailable. Please reload the extension.',
          ),
        );
        return;
      }

      if (!response?.success) {
        notify(
          t(
            'injected.playerControls.alerts.desktopUnavailable',
            'Ameow desktop app is not connected. Please open Ameow and try again.',
          ),
        );
      }
    });
  }

  function clearClipPoint(pointKey) {
    if (clipState[pointKey] == null) {
      return;
    }

    clipState[pointKey] = null;
    updateClipButtonsState();
  }

  function handleClipPointContextMenu(event, pointKey) {
    if (clipState[pointKey] == null) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();
    clearClipPoint(pointKey);
  }

  function updateClipButtonsState() {
    const fullBtn = document.querySelector('.ameow-youtube-btn');
    const inBtn = document.querySelector('.ameow-youtube-set-in-btn');
    const outBtn = document.querySelector('.ameow-youtube-set-out-btn');

    if (!inBtn || !outBtn || !fullBtn) return;

    if (clipState.startSec == null) {
      inBtn.removeAttribute('data-selected');
      setButtonTitle(inBtn, getClipPointButtonTitle('IN', null));
    } else {
      inBtn.setAttribute('data-selected', 'true');
      setButtonTitle(inBtn, getClipPointButtonTitle('IN', clipState.startSec));
    }

    if (clipState.endSec == null) {
      outBtn.removeAttribute('data-selected');
      setButtonTitle(outBtn, getClipPointButtonTitle('OUT', null));
    } else {
      outBtn.setAttribute('data-selected', 'true');
      setButtonTitle(outBtn, getClipPointButtonTitle('OUT', clipState.endSec));
    }

    if (hasValidClipRange()) {
      fullBtn.setAttribute('data-clip-ready', 'true');
      setButtonTitle(
        fullBtn,
        tt(
          'injected.playerControls.clip.downloadSelection',
          {
            start: formatTimestamp(clipState.startSec),
            end: formatTimestamp(clipState.endSec),
          },
          `Download section ${formatTimestamp(clipState.startSec)} -> ${formatTimestamp(clipState.endSec)}`,
        ),
      );
    } else {
      fullBtn.removeAttribute('data-clip-ready');
      setButtonTitle(
        fullBtn,
        t('injected.playerControls.buttons.download', 'Download with Ameow'),
      );
    }
  }

  function setInPoint() {
    const current = getCurrentPlaybackSeconds();
    if (current == null) {
      notify(
        t(
          'injected.playerControls.alerts.playbackTimeUnavailable',
          'Unable to read current playback time.',
        ),
      );
      return;
    }
    clipState.startSec = current;
    console.log('[Ameow YouTube] IN point set:', current);
    updateClipButtonsState();
  }

  function setOutPoint() {
    const current = getCurrentPlaybackSeconds();
    if (current == null) {
      notify(
        t(
          'injected.playerControls.alerts.playbackTimeUnavailable',
          'Unable to read current playback time.',
        ),
      );
      return;
    }
    clipState.endSec = current;
    console.log('[Ameow YouTube] OUT point set:', current);
    updateClipButtonsState();
  }

  function downloadSelectedClip() {
    const startSec = clipState.startSec;
    const endSec = clipState.endSec;

    if (startSec == null || endSec == null) {
      notify(
        t(
          'injected.playerControls.alerts.clipPointsRequired',
          'Please set both IN and OUT points first.',
        ),
      );
      return;
    }

    if (endSec <= startSec) {
      notify(
        t(
          'injected.playerControls.alerts.clipRangeInvalid',
          'OUT must be later than IN.',
        ),
      );
      return;
    }

    console.log('[Ameow YouTube] Clip range:', startSec, endSec);
    const payload = buildCurrentVideoSelectionPayload();
    if (!payload) {
      return;
    }

    sendVideoSelectionMessage(payload);
  }

  function handlePrimaryDownload() {
    if (hasValidClipRange()) {
      downloadSelectedClip();
      return;
    }
    downloadVideo();
  }

  function injectControlButtons(container) {
    removeInjectedButtons();

    const screenshotBtn = createButton({
      className: 'ameow-youtube-screenshot-btn',
      title: t('injected.playerControls.buttons.screenshot', 'Screenshot'),
      html: CAMERA_ICON_SVG,
      onClick: takeScreenshot,
    });
    const fullBtn = createButton({
      className: 'ameow-youtube-btn',
      title: t('injected.playerControls.buttons.download', 'Download with Ameow'),
      html: CAT_ICON_CLASS,
      onClick: handlePrimaryDownload,
    });
    const inBtn = createButton({
      className: 'ameow-youtube-set-in-btn',
      title: t('injected.playerControls.buttons.setIn', 'Set IN point'),
      html: CLIP_POINT_ICON_SVG,
      onClick: setInPoint,
      onContextMenu: (event) => handleClipPointContextMenu(event, 'startSec'),
    });
    const outBtn = createButton({
      className: 'ameow-youtube-set-out-btn',
      title: t('injected.playerControls.buttons.setOut', 'Set OUT point'),
      html: CLIP_POINT_ICON_SVG,
      onClick: setOutPoint,
      onContextMenu: (event) => handleClipPointContextMenu(event, 'endSec'),
    });

    const buttons = [outBtn, inBtn, fullBtn, screenshotBtn];
    for (const btn of buttons) {
      container.insertBefore(btn, container.firstChild);
    }

    updateClipButtonsState();
    console.log('[Ameow YouTube] Buttons injected');
  }

  function ensureScreenshotPanel() {
    let panel = document.getElementById(SCREENSHOT_PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = SCREENSHOT_PANEL_ID;
      panel.className = 'ameow-hidden';
      panel.innerHTML = `<div id="${SCREENSHOT_LIST_ID}"></div>`;
      document.body.appendChild(panel);
    }

    let list = document.getElementById(SCREENSHOT_LIST_ID);
    if (!list) {
      list = document.createElement('div');
      list.id = SCREENSHOT_LIST_ID;
      panel.appendChild(list);
    }

    return { panel, list };
  }

  function renderScreenshotPanel() {
    const { panel, list } = ensureScreenshotPanel();
    list.innerHTML = '';

    if (screenshots.length === 0) {
      panel.classList.add('ameow-hidden');
      return;
    }

    panel.classList.remove('ameow-hidden');
    for (const screenshot of screenshots) {
      list.appendChild(createScreenshotItem(screenshot));
    }
  }

  function createScreenshotItem(screenshot) {
    const item = document.createElement('div');
    item.className = 'ameow-youtube-screenshot-item';

    const img = document.createElement('img');
    img.src = screenshot.url;
    img.alt = screenshot.filename;
    img.loading = 'lazy';

    const overlay = document.createElement('div');
    overlay.className = 'ameow-youtube-screenshot-overlay';

    const timestamp = document.createElement('span');
    timestamp.className = 'ameow-youtube-screenshot-time';
    timestamp.textContent = screenshot.playbackLabel;

    const saveButton = createOverlayActionButton({
      title: t('injected.playerControls.overlayActions.save', 'Save'),
      icon: SCREENSHOT_SAVE_ICON_SVG,
      onClick: () => saveScreenshot(screenshot),
    });
    const copyButton = createOverlayActionButton({
      title: t('injected.playerControls.overlayActions.copy', 'Copy'),
      icon: SCREENSHOT_COPY_ICON_SVG,
      onClick: () => copyScreenshot(screenshot, copyButton),
    });
    const deleteButton = createOverlayActionButton({
      title: t('injected.playerControls.overlayActions.delete', 'Delete'),
      icon: SCREENSHOT_DELETE_ICON_SVG,
      onClick: () => removeScreenshot(screenshot.id),
    });
    deleteButton.classList.add('ameow-danger');

    overlay.append(saveButton, copyButton, deleteButton, timestamp);
    item.append(img, overlay);
    return item;
  }

  function createOverlayActionButton({ title, icon, onClick }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = icon;
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      onClick();
    });
    return button;
  }

  function addScreenshot(screenshot) {
    screenshots.unshift(screenshot);
    while (screenshots.length > MAX_SCREENSHOTS) {
      const removed = screenshots.pop();
      if (removed) {
        URL.revokeObjectURL(removed.url);
      }
    }
    renderScreenshotPanel();
  }

  async function takeScreenshot() {
    const video = getVideoElement();
    if (!(video instanceof HTMLVideoElement)) {
      notify(
        t(
          'injected.playerControls.alerts.videoElementUnavailable',
          'Unable to locate a video element.',
        ),
      );
      return;
    }

    try {
      const screenshot = await captureVideoFrame(video);
      if (!screenshot) {
        notify(
          t('injected.playerControls.alerts.screenshotFailed', 'Screenshot failed. Please try again.'),
        );
        return;
      }
      addScreenshot(screenshot);
    } catch (error) {
      console.error('[Ameow YouTube] Screenshot failed:', error);
      notify(
        t('injected.playerControls.alerts.screenshotFailed', 'Screenshot failed. Please try again.'),
      );
    }
  }

  async function captureVideoFrame(video) {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return null;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(video, 0, 0, width, height);

    const blob = await new Promise((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/png');
    });
    if (!(blob instanceof Blob)) {
      return null;
    }

    const playbackLabel = formatTimestamp(video.currentTime);
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: URL.createObjectURL(blob),
      blob,
      playbackLabel,
      filename: buildScreenshotFileName(playbackLabel),
    };
  }

  function buildScreenshotFileName(playbackLabel) {
    const title = extractVideoTitle()
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'youtube-video';
    return `${title}@${playbackLabel.replace(/:/g, '-')}-${Date.now()}.png`;
  }

  async function saveScreenshot(screenshot) {
    const savedByAmeow = await saveScreenshotViaAmeow(screenshot);
    if (savedByAmeow) {
      return;
    }
    saveScreenshotByBrowser(screenshot);
  }

  async function saveScreenshotViaAmeow(screenshot) {
    if (!chrome?.runtime?.sendMessage) {
      return false;
    }

    try {
      const dataUrl = await blobToDataUrl(screenshot.blob);
      if (!dataUrl.startsWith('data:')) {
        return false;
      }

      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: 'save_screenshot',
            dataUrl,
            filename: screenshot.filename,
          },
          (result) => {
            if (chrome.runtime.lastError) {
              resolve({ success: false });
              return;
            }
            resolve(result || { success: false });
          },
        );
      });

      return Boolean(response?.success);
    } catch (error) {
      console.error('[Ameow YouTube] Save screenshot via app failed:', error);
      return false;
    }
  }

  function saveScreenshotByBrowser(screenshot) {
    const link = document.createElement('a');
    link.href = screenshot.url;
    link.download = screenshot.filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
          return;
        }
        reject(new Error('Invalid data URL result'));
      };
      reader.onerror = () => {
        reject(reader.error || new Error('Failed to read blob'));
      };
      reader.readAsDataURL(blob);
    });
  }

  async function copyScreenshot(screenshot, button) {
    const clipboardItem = window.ClipboardItem;
    if (!navigator.clipboard?.write || typeof clipboardItem === 'undefined') {
      notify(
        t(
          'injected.playerControls.alerts.copyUnsupported',
          'Current browser does not support image copy.',
        ),
      );
      return;
    }

    try {
      await navigator.clipboard.write([new clipboardItem({
        [screenshot.blob.type]: screenshot.blob,
      })]);
      const defaultLabel = t('injected.playerControls.overlayActions.copy', 'Copy');
      const copiedLabel = t('injected.playerControls.overlayActions.copied', 'Copied');
      button.dataset.copied = 'true';
      button.title = copiedLabel;
      button.setAttribute('aria-label', copiedLabel);
      button.innerHTML = SCREENSHOT_COPIED_ICON_SVG;
      window.setTimeout(() => {
        button.dataset.copied = 'false';
        button.title = defaultLabel;
        button.setAttribute('aria-label', defaultLabel);
        button.innerHTML = SCREENSHOT_COPY_ICON_SVG;
      }, 1200);
    } catch (error) {
      console.error('[Ameow YouTube] Copy screenshot failed:', error);
      notify(
        t(
          'injected.playerControls.alerts.copyFailed',
          'Copy failed. Please check clipboard permission.',
        ),
      );
    }
  }

  function removeScreenshot(id) {
    const index = screenshots.findIndex((item) => item.id === id);
    if (index < 0) return;

    const [removed] = screenshots.splice(index, 1);
    URL.revokeObjectURL(removed.url);
    renderScreenshotPanel();
  }

  function clearScreenshots({ render = true } = {}) {
    while (screenshots.length > 0) {
      const removed = screenshots.pop();
      if (removed) {
        URL.revokeObjectURL(removed.url);
      }
    }
    if (render && document.getElementById(SCREENSHOT_PANEL_ID)) {
      renderScreenshotPanel();
    }
  }

  function cleanupScreenshotPanel() {
    clearScreenshots({ render: false });
    const panel = document.getElementById(SCREENSHOT_PANEL_ID);
    if (panel) {
      panel.remove();
    }
  }

  function extractVideoTitle() {
    const titleEl = document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string');
    if (titleEl && titleEl.textContent.trim()) {
      return titleEl.textContent.trim();
    }

    const titleEl2 = document.querySelector('#title h1 yt-formatted-string');
    if (titleEl2 && titleEl2.textContent.trim()) {
      return titleEl2.textContent.trim();
    }

    return document.title.replace(' - YouTube', '');
  }

  function buildCurrentVideoSelectionPayload() {
    if (!isVideoPage()) {
      return null;
    }

    const payload = {
      type: 'video_selection',
      url: buildCurrentItemDownloadUrl(),
      pageUrl: window.location.href,
      title: extractVideoTitle(),
      selectionScope: 'current_item',
      extensionData: {
        youtube: {
          forceExtended: false,
          allowCookies: false,
          source: 'injected',
        },
      },
    };

    if (hasValidClipRange()) {
      payload.clipStartSec = clipState.startSec;
      payload.clipEndSec = clipState.endSec;
    }

    return payload;
  }

  function downloadVideo() {
    const videoId = getVideoId();
    const payload = buildCurrentVideoSelectionPayload();
    if (!payload) {
      return;
    }

    console.log('[Ameow YouTube] Video ID:', videoId);
    console.log('[Ameow YouTube] Page URL:', payload.pageUrl);
    console.log('[Ameow YouTube] Download URL:', payload.url);
    console.log('[Ameow YouTube] Title:', payload.title);

    sendVideoSelectionMessage(payload);
  }

  const observer = new MutationObserver(() => {
    detectVideoPlayer();
  });

  let lastUrl = window.location.href;
  let lastVideoKey = getCurrentVideoKey();
  function checkUrlChange() {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      const currentVideoKey = getCurrentVideoKey();
      if (currentVideoKey !== lastVideoKey) {
        console.log('[Ameow YouTube] Video changed:', lastUrl);
        lastVideoKey = currentVideoKey;
        resetClipState();
        const processed = document.querySelectorAll(`[${PROCESSED_ATTR}]`);
        processed.forEach((el) => el.removeAttribute(PROCESSED_ATTR));
        removeInjectedButtons();
        cleanupScreenshotPanel();
      }
      detectVideoPlayer();
    }
  }

  if (chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type !== 'language_update') {
        if (message?.type === RESOLVE_PASTED_VIDEO_SELECTION_MESSAGE) {
          const payload = buildCurrentVideoSelectionPayload();
          sendResponse(
            payload
              ? { success: true, payload }
              : { success: false, reason: 'no_video_found' },
          );
          return true;
        }
        return false;
      }

      const nextLanguage = localeUtils?.normalizeAppLanguage?.(message.language);
      if (nextLanguage) {
        void applyLanguage(nextLanguage);
      }
      return true;
    });
  }

  async function init() {
    console.log('[Ameow YouTube] Detector initialized');

    if (injectionDebugConfig?.getEnabled) {
      try {
        syncInjectionDebugState(await injectionDebugConfig.getEnabled());
      } catch (error) {
        console.warn('[Ameow YouTube] Failed to read injection debug config:', error);
      }
    }
    if (injectionDebugConfig?.observe) {
      injectionDebugConfig.observe((enabled) => {
        syncInjectionDebugState(enabled);
      });
    }

    if (localeUtils?.resolveCurrentLanguage) {
      const initialLanguage = await localeUtils.resolveCurrentLanguage(navigator.language);
      await applyLanguage(initialLanguage);
    }

    detectVideoPlayer();
    observer.observe(document.body, { childList: true, subtree: true });
    window.setInterval(checkUrlChange, 500);
    window.addEventListener('beforeunload', cleanupScreenshotPanel);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      void init();
    });
  } else {
    void init();
  }
})();
