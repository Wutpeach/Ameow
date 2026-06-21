(function initAmeowMediaNetworkCache(root) {
  "use strict";

  const MEDIA_EXTENSIONS = {
    image: new Set(["avif", "gif", "jpg", "jpeg", "png", "svg", "webp"]),
    audio: new Set(["aac", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav"]),
    video: new Set(["m3u8", "m4s", "m4v", "mp4", "mpd", "mov", "ts", "webm"]),
  };
  const VIDEO_MANIFEST_EXTENSIONS = new Set(["m3u8", "mpd"]);
  const VIDEO_FRAGMENT_EXTENSIONS = new Set(["m4s", "ts"]);

  function isRecord(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function normalizeHttpUrl(rawUrl) {
    const genericUtils = root.AmeowGenericVideoSelectionUtils;
    if (genericUtils?.normalizeHttpUrl) {
      return genericUtils.normalizeHttpUrl(rawUrl);
    }

    if (typeof rawUrl !== "string") {
      return null;
    }

    try {
      const resolved = new URL(rawUrl.trim()).toString();
      return /^https?:\/\//i.test(resolved) ? resolved : null;
    } catch {
      return null;
    }
  }

  function urlExtension(rawUrl) {
    const normalized = normalizeHttpUrl(rawUrl);
    if (!normalized) {
      return "";
    }

    try {
      const pathname = new URL(normalized).pathname;
      const match = pathname.match(/\.([a-z0-9]{2,8})$/i);
      return match ? match[1].toLowerCase() : "";
    } catch {
      return "";
    }
  }

  function filenameFromUrl(rawUrl) {
    const normalized = normalizeHttpUrl(rawUrl);
    if (!normalized) {
      return "";
    }

    try {
      const segment = new URL(normalized).pathname.split("/").filter(Boolean).pop() || "";
      return decodeURIComponent(segment).replace(/\s+/g, " ").trim().slice(0, 140);
    } catch {
      return "";
    }
  }

  function isBilibiliHostname(hostname) {
    return /(?:^|\.)bilibili\.com$/i.test(hostname || "");
  }

  function isYouTubeHostname(hostname) {
    return /(?:^|\.)youtube\.com$/i.test(hostname || "");
  }

  function cleanCandidateTitle(rawTitle) {
    return typeof rawTitle === "string"
      ? rawTitle.replace(/\s+/g, " ").trim().slice(0, 140)
      : "";
  }

  function cleanBilibiliTitle(rawTitle) {
    return cleanCandidateTitle(rawTitle)
      .replace(/\s*[_-]\s*哔哩哔哩\s*bilibili\s*$/i, "")
      .replace(/\s*[_-]\s*bilibili\s*$/i, "")
      .replace(/\s*[_-]\s*哔哩哔哩\s*$/i, "")
      .trim();
  }

  function cleanYouTubeTitle(rawTitle) {
    return cleanCandidateTitle(rawTitle)
      .replace(/\s+-\s+YouTube\s*$/i, "")
      .trim();
  }

  function cleanPageTitleForUrl(rawTitle, rawUrl) {
    const title = cleanCandidateTitle(rawTitle);
    if (!title) {
      return "";
    }

    try {
      const hostname = new URL(rawUrl).hostname;
      if (isBilibiliHostname(hostname)) {
        return cleanBilibiliTitle(title);
      }
      if (isYouTubeHostname(hostname)) {
        return cleanYouTubeTitle(title);
      }
    } catch {
      return title;
    }

    return title;
  }

  function shouldPreferPageTitleForNetworkCandidate(candidate, pageUrl) {
    if (candidate?.mediaType === "image") {
      return false;
    }

    try {
      const hostname = new URL(pageUrl).hostname;
      return isBilibiliHostname(hostname) || isYouTubeHostname(hostname);
    } catch {
      return false;
    }
  }

  function responseHeader(details, headerName) {
    if (!Array.isArray(details?.responseHeaders)) {
      return "";
    }

    const match = details.responseHeaders.find((header) => (
      typeof header?.name === "string"
      && header.name.toLowerCase() === headerName.toLowerCase()
      && typeof header.value === "string"
    ));
    return match?.value?.trim() || "";
  }

  function normalizeContentType(value) {
    return typeof value === "string"
      ? value.split(";")[0].trim().toLowerCase()
      : "";
  }

  function normalizeContentLength(value) {
    const numeric = Number.parseInt(String(value || ""), 10);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
  }

  function mediaTypeFromContentType(contentType) {
    if (contentType.startsWith("image/")) {
      return "image";
    }
    if (contentType.startsWith("audio/")) {
      return "audio";
    }
    if (
      contentType.startsWith("video/")
      || contentType === "application/vnd.apple.mpegurl"
      || contentType === "application/x-mpegurl"
      || contentType === "application/mpegurl"
      || contentType === "application/dash+xml"
    ) {
      return "video";
    }
    return "";
  }

  function mediaTypeFromExtension(extension) {
    if (MEDIA_EXTENSIONS.image.has(extension)) {
      return "image";
    }
    if (MEDIA_EXTENSIONS.audio.has(extension)) {
      return "audio";
    }
    if (MEDIA_EXTENSIONS.video.has(extension)) {
      return "video";
    }
    return "";
  }

  function classifyCandidateType(url, mediaType, extension) {
    if (mediaType !== "video") {
      return undefined;
    }
    if (VIDEO_MANIFEST_EXTENSIONS.has(extension)) {
      return "manifest_m3u8";
    }
    if (VIDEO_FRAGMENT_EXTENSIONS.has(extension)) {
      return "stream_fragment";
    }
    const genericUtils = root.AmeowGenericVideoSelectionUtils;
    return genericUtils?.classifyVideoCandidateType
      ? genericUtils.classifyVideoCandidateType(url)
      : "unknown";
  }

  function shouldCacheMediaResponse(mediaType, extension) {
    if (!mediaType) {
      return false;
    }
    return !VIDEO_FRAGMENT_EXTENSIONS.has(extension);
  }

  function normalizeNetworkMediaEntry(details, tab, options = {}) {
    const url = normalizeHttpUrl(details?.url);
    const tabId = Number(details?.tabId);
    if (!url || !Number.isInteger(tabId) || tabId < 0) {
      return null;
    }

    const pageUrl = normalizeHttpUrl(tab?.url || details?.documentUrl);
    if (!pageUrl) {
      return null;
    }

    const contentType = normalizeContentType(responseHeader(details, "content-type"));
    const contentLength = normalizeContentLength(responseHeader(details, "content-length"));
    const extension = urlExtension(url);
    const mediaType = mediaTypeFromContentType(contentType) || mediaTypeFromExtension(extension);
    if (!shouldCacheMediaResponse(mediaType, extension)) {
      return null;
    }

    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const type = classifyCandidateType(url, mediaType, extension);
    return {
      url,
      tabId,
      pageUrl,
      mediaType,
      source: "web_request",
      confidence: contentType ? "medium" : "low",
      capturedAt: now,
      contentType: contentType || undefined,
      contentLength,
      extension: extension || undefined,
      title: filenameFromUrl(url),
      type,
      ...(mediaType === "image" ? { previewUrl: url } : {}),
    };
  }

  function tabBucketKey(tabId) {
    return String(tabId);
  }

  function normalizeCache(cache) {
    return isRecord(cache) ? cache : {};
  }

  function pruneNetworkMediaCache(cache, entry, options = {}) {
    const ttlMs = Number.isFinite(Number(options.ttlMs)) && Number(options.ttlMs) > 0
      ? Number(options.ttlMs)
      : 5 * 60 * 1000;
    const perTabLimit = Number.isFinite(Number(options.perTabLimit)) && Number(options.perTabLimit) > 0
      ? Math.floor(Number(options.perTabLimit))
      : 40;
    const totalLimit = Number.isFinite(Number(options.totalLimit)) && Number(options.totalLimit) > 0
      ? Math.floor(Number(options.totalLimit))
      : 120;
    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const cacheObject = normalizeCache(cache);
    const bucketKey = tabBucketKey(entry?.tabId);
    const nextBuckets = {};

    Object.entries(cacheObject).forEach(([key, bucket]) => {
      const entries = Array.isArray(bucket?.entries) ? bucket.entries : [];
      const retained = entries.filter((candidate) => {
        const capturedAt = Number(candidate?.capturedAt || 0);
        return candidate?.url && now - capturedAt <= ttlMs;
      });
      if (retained.length > 0) {
        nextBuckets[key] = {
          tabId: Number(bucket?.tabId),
          pageUrl: typeof bucket?.pageUrl === "string" ? bucket.pageUrl : "",
          updatedAt: Number(bucket?.updatedAt || 0),
          entries: retained,
        };
      }
    });

    if (entry?.url && Number.isInteger(Number(entry.tabId))) {
      const existingBucket = nextBuckets[bucketKey] || {
        tabId: entry.tabId,
        pageUrl: entry.pageUrl,
        updatedAt: entry.capturedAt,
        entries: [],
      };
      const mergedByUrl = new Map();
      existingBucket.entries.forEach((candidate) => {
        if (candidate?.url && normalizeHttpUrl(candidate.pageUrl) === normalizeHttpUrl(entry.pageUrl)) {
          mergedByUrl.set(candidate.url, candidate);
        }
      });
      mergedByUrl.set(entry.url, entry);
      nextBuckets[bucketKey] = {
        tabId: entry.tabId,
        pageUrl: entry.pageUrl,
        updatedAt: entry.capturedAt,
        entries: Array.from(mergedByUrl.values())
          .sort((left, right) => Number(right.capturedAt || 0) - Number(left.capturedAt || 0))
          .slice(0, perTabLimit),
      };
    }

    const flattened = [];
    Object.entries(nextBuckets).forEach(([key, bucket]) => {
      bucket.entries.forEach((candidate) => {
        flattened.push({ key, candidate });
      });
    });

    const allowedUrls = new Set(
      flattened
        .sort((left, right) => Number(right.candidate?.capturedAt || 0) - Number(left.candidate?.capturedAt || 0))
        .slice(0, totalLimit)
        .map(({ key, candidate }) => `${key}\n${candidate.url}`),
    );

    return Object.fromEntries(
      Object.entries(nextBuckets)
        .map(([key, bucket]) => {
          const entries = bucket.entries.filter((candidate) => allowedUrls.has(`${key}\n${candidate.url}`));
          return [key, {
            ...bucket,
            entries,
            updatedAt: entries[0]?.capturedAt || bucket.updatedAt,
          }];
        })
        .filter(([, bucket]) => bucket.entries.length > 0),
    );
  }

  function getNetworkMediaEntriesForTab(cache, tab, options = {}) {
    const tabId = Number(tab?.id);
    if (!Number.isInteger(tabId)) {
      return [];
    }

    const pageUrl = normalizeHttpUrl(tab?.url);
    if (!pageUrl) {
      return [];
    }

    const ttlMs = Number.isFinite(Number(options.ttlMs)) && Number(options.ttlMs) > 0
      ? Number(options.ttlMs)
      : 5 * 60 * 1000;
    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const bucket = normalizeCache(cache)[tabBucketKey(tabId)];
    const entries = Array.isArray(bucket?.entries) ? bucket.entries : [];
    return entries
      .filter((entry) => (
        normalizeHttpUrl(entry?.pageUrl) === pageUrl
        && now - Number(entry?.capturedAt || 0) <= ttlMs
      ))
      .sort((left, right) => Number(right.capturedAt || 0) - Number(left.capturedAt || 0));
  }

  function mergeCandidates(existingCandidates, networkCandidates, limit) {
    const merged = new Map();
    const push = (candidate) => {
      const url = normalizeHttpUrl(candidate?.url);
      if (!url || merged.has(url)) {
        return;
      }
      merged.set(url, {
        ...candidate,
        url,
      });
    };

    existingCandidates.forEach(push);
    networkCandidates.forEach(push);
    return Array.from(merged.values()).slice(0, Math.max(0, limit));
  }

  function mergeNetworkCandidatesIntoScanResult(scanResult, networkEntries, options = {}) {
    const totalLimit = Number.isFinite(Number(options.totalLimit)) && Number(options.totalLimit) > 0
      ? Math.floor(Number(options.totalLimit))
      : 100;
    const videos = Array.isArray(scanResult?.videos) ? scanResult.videos : [];
    const audios = Array.isArray(scanResult?.audios) ? scanResult.audios : [];
    const images = Array.isArray(scanResult?.images) ? scanResult.images : [];
    const entries = Array.isArray(networkEntries) ? networkEntries : [];
    const pageTitle = cleanPageTitleForUrl(scanResult?.pageTitle, scanResult?.pageUrl);
    const pagePreviewUrl = normalizeHttpUrl(scanResult?.pagePreviewUrl)
      || normalizeHttpUrl(videos.find((candidate) => candidate?.previewUrl)?.previewUrl);
    const networkVideos = entries
      .filter((entry) => entry.mediaType === "video")
      .map((entry) => ({
        ...entry,
        ...(pageTitle && shouldPreferPageTitleForNetworkCandidate(entry, scanResult?.pageUrl)
          ? { title: pageTitle }
          : {}),
        ...(pagePreviewUrl && !normalizeHttpUrl(entry?.previewUrl)
          ? { previewUrl: pagePreviewUrl }
          : {}),
      }));
    const networkAudios = entries
      .filter((entry) => entry.mediaType === "audio")
      .map((entry) => (
        pageTitle && shouldPreferPageTitleForNetworkCandidate(entry, scanResult?.pageUrl)
          ? { ...entry, title: pageTitle }
          : entry
      ));
    const networkImages = entries.filter((entry) => entry.mediaType === "image");

    const nextVideos = mergeCandidates(videos, networkVideos, totalLimit);
    const nextAudios = mergeCandidates(audios, networkAudios, Math.max(0, totalLimit - nextVideos.length));
    const nextImages = mergeCandidates(images, networkImages, Math.max(0, totalLimit - nextVideos.length - nextAudios.length));
    const beforeTotal = videos.length + audios.length + images.length;
    const networkTotal = networkVideos.length + networkAudios.length + networkImages.length;
    const afterTotal = nextVideos.length + nextAudios.length + nextImages.length;
    const uniqueUrls = new Set();
    [...videos, ...audios, ...images, ...networkVideos, ...networkAudios, ...networkImages].forEach((candidate) => {
      const url = normalizeHttpUrl(candidate?.url);
      if (url) {
        uniqueUrls.add(url);
      }
    });

    return {
      ...scanResult,
      videos: nextVideos,
      audios: nextAudios,
      images: nextImages,
      networkCandidateCount: networkTotal,
      mergedNetworkCandidateCount: Math.max(0, afterTotal - beforeTotal),
      truncated: scanResult?.truncated === true || afterTotal < uniqueUrls.size,
    };
  }

  root.AmeowMediaNetworkCache = {
    getNetworkMediaEntriesForTab,
    mergeNetworkCandidatesIntoScanResult,
    normalizeNetworkMediaEntry,
    pruneNetworkMediaCache,
  };
})(typeof self !== "undefined" ? self : globalThis);
