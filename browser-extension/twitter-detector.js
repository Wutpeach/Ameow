// Ameow Browser Extension - Twitter Video Detector
// Detects video tweets and injects download buttons

(function() {
  'use strict';

  const PROCESSED_ATTR = 'data-ameow-processed';
  const RESOLVE_PASTED_VIDEO_SELECTION_MESSAGE = 'ameow_resolve_pasted_video_selection';
  const injectedCatIcon = window.AmeowInjectedCatIcon;

  function normalizeStatusUrl(rawUrl) {
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
      return null;
    }

    try {
      const parsed = new URL(rawUrl);
      if (!/(?:^|\.)twitter\.com$|(?:^|\.)x\.com$/i.test(parsed.hostname)) {
        return null;
      }
      if (!/\/[^/]+\/status\/\d+/i.test(parsed.pathname)) {
        return null;
      }
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString();
    } catch (_) {
      return null;
    }
  }

  function buildCurrentVideoSelectionPayload(url = window.location.href) {
    const statusUrl = normalizeStatusUrl(url);
    if (!statusUrl) {
      return null;
    }

    return {
      type: 'video_selection',
      url: statusUrl,
      pageUrl: statusUrl,
      title: document.title || '',
      selectionScope: 'current_item',
    };
  }

  // 检测视频推文
  function detectVideoTweets() {
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');
    console.log('[Ameow Twitter] Found tweets:', tweets.length);
    tweets.forEach(processTweet);
  }

  // 处理单个推文
  function processTweet(tweet) {
    if (tweet.hasAttribute(PROCESSED_ATTR)) return;

    // 检查是否包含视频
    const hasVideo = tweet.querySelector('video') !== null;
    console.log('[Ameow Twitter] Tweet has video:', hasVideo);
    if (!hasVideo) return;

    // 提取推文 URL
    const tweetUrl = extractTweetUrl(tweet);
    console.log('[Ameow Twitter] Tweet URL:', tweetUrl);
    if (!tweetUrl) return;

    // 注入下载按钮
    injectDownloadButton(tweet, tweetUrl);
    tweet.setAttribute(PROCESSED_ATTR, 'true');
  }

  // 提取推文 URL
  function extractTweetUrl(tweet) {
    const timeLink = tweet.querySelector('a[href*="/status/"] time');
    return normalizeStatusUrl(timeLink?.parentElement?.href);
  }

  // 注入下载按钮
  function injectDownloadButton(tweet, tweetUrl) {
    // 找到操作栏（回复、转发、点赞的容器）
    const actionBar = tweet.querySelector('[role="group"]');
    console.log('[Ameow Twitter] ActionBar found:', actionBar);
    if (!actionBar) return;

    const btn = document.createElement('div');
    btn.className = 'ameow-download-btn';
    btn.appendChild(createCatIconElement());
    btn.title = 'Download with Ameow';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      downloadVideo(tweetUrl);
    });
    actionBar.appendChild(btn);
    console.log('[Ameow Twitter] Button injected');
  }

  function createCatIconElement() {
    return injectedCatIcon.createCatIconElement({ fallbackSizePx: 20 });
  }

  // 发送下载请求
  function downloadVideo(tweetUrl) {
    console.log('[Ameow Twitter] Downloading:', tweetUrl);
    const payload = buildCurrentVideoSelectionPayload(tweetUrl);
    if (!payload) {
      return;
    }

    chrome.runtime.sendMessage(payload);
  }

  // MutationObserver 监听新推文
  const observer = new MutationObserver(() => {
    detectVideoTweets();
  });

  // 初始化
  function init() {
    console.log('[Ameow Twitter] Detector initialized');
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== RESOLVE_PASTED_VIDEO_SELECTION_MESSAGE) {
        return false;
      }

      const payload = buildCurrentVideoSelectionPayload();
      sendResponse(
        payload
          ? { success: true, payload }
          : { success: false, reason: 'no_video_found' },
      );
      return true;
    });
    detectVideoTweets();
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
