(function () {
  "use strict";

  const domUtils = window.AmeowDomInjectionUtils || null;
  const selectionUtils = window.AmeowGenericVideoSelectionUtils || null;
  const CONTEXT_TTL_MS = 10000;
  const MIN_VIDEO_WIDTH = 120;
  const MIN_VIDEO_HEIGHT = 68;
  const PERFORMANCE_SCAN_LIMIT = 80;
  const MESSAGE_RESOLVE_VIDEO_SELECTION = "ameow_resolve_video_selection";
  const MESSAGE_RESOLVE_PASTED_VIDEO_SELECTION = "ameow_resolve_pasted_video_selection";
  const MESSAGE_SCAN_PAGE_MEDIA = "ameow_scan_page_media";
  const SELECTION_SCOPE_CURRENT_ITEM = "current_item";
  const MEDIA_SCAN_TOTAL_LIMIT = 100;
  const MEDIA_SCAN_LINK_LIMIT = 80;
  const MIN_IMAGE_WIDTH = 100;
  const MIN_IMAGE_HEIGHT = 100;
  const DIRECT_IMAGE_EXT_RE = /\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i;
  const DIRECT_AUDIO_EXT_RE = /\.(?:aac|flac|m4a|mp3|oga|ogg|opus|wav)(?:[?#]|$)/i;
  const AUDIO_FRAGMENT_EXT_RE = /\.(?:m3u8|m4s|mpd|ts)(?:[?#]|$)/i;
  const MIN_AUDIO_DURATION_SECONDS = 5;
  const MEDIA_ROUTE_PATH_RE =
    /\/(?:video|watch|reel|reels|p|status|pin|detail|post|clip|shorts|tv)\/[^/?#]+/i;
  const XIAOHONGSHU_NOTE_PATH_RE =
    /\/(?:explore|discovery\/item)\/([a-zA-Z0-9]+)|^\/user\/profile\/[^/?#]+\/([a-zA-Z0-9]+)(?:[/?#]|$)/i;

  const playbackTimestamps = new WeakMap();
  let lastContextSelection = null;

  if (!domUtils || !selectionUtils || !chrome?.runtime?.onMessage) {
    return;
  }

  function normalizeHttpUrl(raw, baseUrl = window.location.href) {
    return selectionUtils?.normalizeHttpUrl ? selectionUtils.normalizeHttpUrl(raw, baseUrl) : null;
  }

  function isRenderableVideo(video) {
    return (
      video instanceof HTMLVideoElement &&
      domUtils?.isRenderableElement?.(video, {
        minWidth: MIN_VIDEO_WIDTH,
        minHeight: MIN_VIDEO_HEIGHT,
      }) === true
    );
  }

  function isLikelyContentUrl(rawUrl) {
    const normalized = normalizeHttpUrl(rawUrl);
    if (!normalized) {
      return false;
    }

    try {
      const parsed = new URL(normalized);
      if (parsed.pathname === "/" || parsed.pathname === "") {
        return false;
      }

       if (
        isXiaohongshuHostname(parsed.hostname) &&
        !XIAOHONGSHU_NOTE_PATH_RE.test(parsed.pathname)
      ) {
        return false;
      }

      if (/\.(?:mp4|m4v|mov|webm|m3u8|mpd|jpg|jpeg|png|webp|gif|svg)(?:[?#]|$)/i.test(parsed.pathname)) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  function normalizeContentUrl(rawUrl) {
    const normalized = normalizeHttpUrl(rawUrl);
    if (!normalized || !isLikelyContentUrl(normalized)) {
      return null;
    }

    const normalizedXiaohongshuNoteUrl = normalizeXiaohongshuNoteUrl(normalized);
    if (normalizedXiaohongshuNoteUrl) {
      return normalizedXiaohongshuNoteUrl;
    }

    try {
      const parsed = new URL(normalized);
      if (MEDIA_ROUTE_PATH_RE.test(parsed.pathname)) {
        parsed.search = "";
      }
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return normalized;
    }
  }

  function isXiaohongshuHostname(hostname) {
    return /(?:^|\.)xiaohongshu\.com$/i.test(hostname || "")
      || /(?:^|\.)xhslink\.com$/i.test(hostname || "");
  }

  function isXiaohongshuPageUrl(rawUrl) {
    const normalized = normalizeHttpUrl(rawUrl);
    if (!normalized) {
      return false;
    }

    try {
      return isXiaohongshuHostname(new URL(normalized).hostname);
    } catch {
      return false;
    }
  }

  function normalizeXiaohongshuNoteUrl(rawUrl) {
    const normalized = normalizeHttpUrl(rawUrl);
    if (!normalized) {
      return null;
    }

    try {
      const parsed = new URL(normalized);
      if (!isXiaohongshuHostname(parsed.hostname) || !XIAOHONGSHU_NOTE_PATH_RE.test(parsed.pathname)) {
        return null;
      }

      parsed.search = "";
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return null;
    }
  }

  function scoreRectOverlap(referenceRect, candidateRect) {
    if (!referenceRect || !candidateRect) {
      return 0;
    }

    const overlapWidth = Math.max(
      0,
      Math.min(referenceRect.right, candidateRect.right) - Math.max(referenceRect.left, candidateRect.left),
    );
    const overlapHeight = Math.max(
      0,
      Math.min(referenceRect.bottom, candidateRect.bottom) - Math.max(referenceRect.top, candidateRect.top),
    );
    const overlapArea = overlapWidth * overlapHeight;
    if (overlapArea <= 0) {
      return 0;
    }

    const referenceArea = Math.max(1, referenceRect.width * referenceRect.height);
    return overlapArea / referenceArea;
  }

  function collectScoredRouteCandidate(scoredCandidates, rawUrl, score) {
    const normalized = normalizeXiaohongshuNoteUrl(rawUrl) || normalizeContentUrl(rawUrl);
    if (!normalized) {
      return;
    }

    const previousScore = scoredCandidates.get(normalized);
    if (typeof previousScore === "number" && previousScore >= score) {
      return;
    }

    scoredCandidates.set(normalized, score);
  }

  function collectXiaohongshuRouteCandidatesFromScope(scope, referenceElement, scoredCandidates, baseScore) {
    if (!(scope instanceof Element)) {
      return;
    }

    const referenceRect =
      referenceElement instanceof Element && typeof referenceElement.getBoundingClientRect === "function"
        ? referenceElement.getBoundingClientRect()
        : null;
    const anchors = [];
    const seenAnchors = new Set();

    const pushAnchor = (anchor) => {
      if (!(anchor instanceof HTMLAnchorElement) || seenAnchors.has(anchor)) {
        return;
      }

      seenAnchors.add(anchor);
      anchors.push(anchor);
    };

    if (scope instanceof HTMLAnchorElement) {
      pushAnchor(scope);
    }

    const closestAnchor = scope.closest('a[href*="/explore/"], a[href*="/discovery/item/"]');
    if (closestAnchor instanceof HTMLAnchorElement) {
      pushAnchor(closestAnchor);
    }

    scope
      .querySelectorAll?.('a[href*="/explore/"], a[href*="/discovery/item/"]')
      ?.forEach?.((anchor) => {
        if (anchors.length >= 18) {
          return;
        }
        pushAnchor(anchor);
      });

    anchors.forEach((anchor, index) => {
      let score = baseScore - index * 6;

      if (referenceElement instanceof Element && anchor.contains(referenceElement)) {
        score += 180;
      }

      if (typeof anchor.getBoundingClientRect === "function" && referenceRect) {
        const anchorRect = anchor.getBoundingClientRect();
        score += Math.round(scoreRectOverlap(referenceRect, anchorRect) * 220);

        const anchorCenterX = anchorRect.left + anchorRect.width / 2;
        const anchorCenterY = anchorRect.top + anchorRect.height / 2;
        const referenceCenterX = referenceRect.left + referenceRect.width / 2;
        const referenceCenterY = referenceRect.top + referenceRect.height / 2;
        const distance = Math.hypot(anchorCenterX - referenceCenterX, anchorCenterY - referenceCenterY);
        score -= Math.min(48, Math.round(distance / 12));
      }

      if (anchor.querySelector("video")) {
        score += 40;
      }
      if (anchor.querySelector("img")) {
        score += 16;
      }

      collectScoredRouteCandidate(scoredCandidates, anchor.href, score);
    });
  }

  function resolveXiaohongshuRouteUrl(referenceElement) {
    const currentNoteUrl = normalizeXiaohongshuNoteUrl(window.location.href);
    if (currentNoteUrl) {
      return currentNoteUrl;
    }

    if (!(referenceElement instanceof Element)) {
      return null;
    }

    const scoredCandidates = new Map();
    let current = referenceElement;
    for (let depth = 0; current && depth < 6; depth += 1) {
      collectXiaohongshuRouteCandidatesFromScope(
        current,
        referenceElement,
        scoredCandidates,
        1240 - depth * 90,
      );
      current = current.parentElement;
    }

    if (typeof document.elementsFromPoint === "function") {
      const rect = referenceElement.getBoundingClientRect?.();
      if (rect) {
        const points = [
          { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
          { x: rect.left + Math.min(rect.width * 0.25, Math.max(rect.width - 1, 0)), y: rect.top + rect.height / 2 },
          { x: rect.left + Math.min(rect.width * 0.75, Math.max(rect.width - 1, 0)), y: rect.top + rect.height / 2 },
        ].filter((point) => (
          Number.isFinite(point.x)
          && Number.isFinite(point.y)
          && point.x >= 0
          && point.y >= 0
          && point.x <= window.innerWidth
          && point.y <= window.innerHeight
        ));

        points.forEach((point, index) => {
          const elements = document.elementsFromPoint(point.x, point.y);
          elements.forEach((element, elementIndex) => {
            collectXiaohongshuRouteCandidatesFromScope(
              element,
              referenceElement,
              scoredCandidates,
              1180 - index * 30 - elementIndex * 10,
            );
          });
        });
      }
    }

    return Array.from(scoredCandidates.entries())
      .sort((left, right) => right[1] - left[1])[0]?.[0] || null;
  }

  function shouldAvoidCurrentPageFallback(rawUrl = window.location.href) {
    return isXiaohongshuPageUrl(rawUrl) && !normalizeXiaohongshuNoteUrl(rawUrl);
  }

  function resolveSelectionPageUrl(routeUrl, fallbackVideoUrl, currentPageUrl = window.location.href) {
    const normalizedRouteUrl = normalizeContentUrl(routeUrl) || normalizeHttpUrl(routeUrl);
    if (normalizedRouteUrl) {
      return normalizedRouteUrl;
    }

    const normalizedCurrentPageUrl = normalizeHttpUrl(currentPageUrl) || null;
    if (normalizedCurrentPageUrl && !shouldAvoidCurrentPageFallback(normalizedCurrentPageUrl)) {
      return normalizedCurrentPageUrl;
    }

    return normalizeHttpUrl(fallbackVideoUrl) || null;
  }

  function resolveRouteUrl(referenceElement) {
    if (isXiaohongshuPageUrl(window.location.href)) {
      const xiaohongshuRouteUrl = resolveXiaohongshuRouteUrl(referenceElement);
      if (xiaohongshuRouteUrl) {
        return xiaohongshuRouteUrl;
      }
    }

    const scopedUrl = domUtils?.resolveScopedContentUrl?.(referenceElement, {
      normalizeContentUrl,
      currentUrl: window.location.href,
      canonicalUrl: domUtils.resolveCanonicalUrl?.(document) || window.location.href,
      isDetailPage: MEDIA_ROUTE_PATH_RE.test(window.location.pathname),
      extraScopedSelectors: ["article", '[role="dialog"]', "section", "main"],
      maxScopeDepth: 8,
      maxScopedContentLinks: 8,
    });

    const normalizedScopedUrl = normalizeContentUrl(scopedUrl);
    if (normalizedScopedUrl) {
      return normalizedScopedUrl;
    }

    if (shouldAvoidCurrentPageFallback(window.location.href)) {
      return null;
    }

    return normalizeContentUrl(window.location.href) || null;
  }

  function extractTitle() {
    const metaTitle = firstMetaContent([
      'meta[property="og:title"]',
      'meta[name="og:title"]',
      'meta[name="twitter:title"]',
    ]);
    if (metaTitle) {
      return metaTitle;
    }

    return (document.title || "").trim();
  }

  function firstMetaContent(selectors) {
    for (const selector of selectors) {
      const value = document.querySelector(selector)?.getAttribute("content")?.trim();
      if (value) {
        return value;
      }
    }
    return "";
  }

  function extractMetaPreviewUrl() {
    const rawUrl = firstMetaContent([
      'meta[property="og:image"]',
      'meta[property="og:image:secure_url"]',
      'meta[name="og:image"]',
      'meta[name="twitter:image"]',
      'meta[name="twitter:image:src"]',
      'meta[itemprop="image"]',
    ]);
    return normalizeHttpUrl(rawUrl);
  }

  function normalizeCandidateTitle(rawTitle) {
    if (typeof rawTitle !== "string") {
      return "";
    }
    return rawTitle.replace(/\s+/g, " ").trim().slice(0, 140);
  }

  function titleFromElementAttribute(element, attributes = ["title", "aria-label", "data-title", "alt"]) {
    if (!element?.getAttribute) {
      return "";
    }
    for (const attribute of attributes) {
      const value = normalizeCandidateTitle(element.getAttribute(attribute));
      if (value) {
        return value;
      }
    }
    return "";
  }

  function titleFromElementText(element) {
    return normalizeCandidateTitle(element?.textContent || "");
  }

  function resolveVideoMetadataScope(video) {
    if (!video) {
      return null;
    }
    if (typeof video.closest === "function") {
      const scoped = video.closest(
        'article, [role="article"], figure, [data-title], [data-e2e], [data-testid]',
      );
      if (scoped) {
        return scoped;
      }
    }

    let current = video.parentElement || null;
    for (let depth = 0; current && depth < 4; depth += 1) {
      if (
        titleFromElementAttribute(current) ||
        current.querySelector?.("h1, h2, h3, [role='heading'], img[alt]")
      ) {
        return current;
      }
      current = current.parentElement || null;
    }
    return video.parentElement || null;
  }

  function resolveVideoTitle(video) {
    const scope = resolveVideoMetadataScope(video);
    const titleElement = scope?.querySelector?.(
      "h1, h2, h3, [role='heading'], [data-title], a[title], img[alt]",
    );
    return titleFromElementAttribute(video)
      || titleFromElementAttribute(scope)
      || titleFromElementAttribute(titleElement)
      || titleFromElementText(titleElement)
      || extractTitle();
  }

  function firstSrcsetUrl(rawSrcset) {
    return typeof rawSrcset === "string"
      ? rawSrcset.split(",")[0]?.trim()?.split(/\s+/)[0] || ""
      : "";
  }

  function extractImageElementUrl(image) {
    return normalizeHttpUrl(
      image?.currentSrc
        || image?.src
        || image?.getAttribute?.("src")
        || firstSrcsetUrl(image?.getAttribute?.("srcset"))
        || image?.getAttribute?.("data-src")
        || image?.getAttribute?.("data-original"),
    );
  }

  function imageHasKnownSmallSize(image) {
    const width = Number(image?.naturalWidth || image?.width || 0);
    const height = Number(image?.naturalHeight || image?.height || 0);
    return (width > 0 && width < MIN_IMAGE_WIDTH) || (height > 0 && height < MIN_IMAGE_HEIGHT);
  }

  function extractScopedPreviewUrl(scope) {
    const image = scope?.querySelector?.("img[src], img[srcset], img[data-src], img[data-original]");
    if (!image || imageHasKnownSmallSize(image)) {
      return null;
    }
    return extractImageElementUrl(image);
  }

  function resolveVideoPreviewUrl(video) {
    return normalizeHttpUrl(video?.poster || video?.getAttribute?.("poster"))
      || extractScopedPreviewUrl(resolveVideoMetadataScope(video))
      || extractMetaPreviewUrl();
  }

  function urlHost(rawUrl) {
    try {
      return new URL(rawUrl).hostname.toLowerCase();
    } catch {
      return "";
    }
  }

  function urlExtension(rawUrl) {
    try {
      const pathname = new URL(rawUrl).pathname;
      const match = pathname.match(/\.([a-z0-9]{2,5})$/i);
      return match?.[1]?.toLowerCase() || "";
    } catch {
      return "";
    }
  }

  function urlFilename(rawUrl) {
    try {
      const pathname = new URL(rawUrl).pathname;
      const lastSegment = decodeURIComponent(pathname.split("/").filter(Boolean).pop() || "");
      return lastSegment || "";
    } catch {
      return "";
    }
  }

  function candidateId(mediaType, rawUrl) {
    const source = `${mediaType}:${rawUrl}`;
    let hash = 0;
    for (let index = 0; index < source.length; index += 1) {
      hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0;
    }
    return `${mediaType}-${Math.abs(hash).toString(36)}`;
  }

  function describeCandidate({
    url,
    mediaType,
    source,
    type,
    confidence,
    title,
    width,
    height,
    previewUrl,
    mimeType,
    duration,
  }) {
    const normalized = normalizeHttpUrl(url);
    if (!normalized) {
      return null;
    }
    const normalizedPreviewUrl = normalizeHttpUrl(previewUrl);
    return {
      id: candidateId(mediaType, normalized),
      mediaType,
      url: normalized,
      title: typeof title === "string" && title.trim()
        ? title.trim()
        : urlFilename(normalized),
      host: urlHost(normalized),
      extension: urlExtension(normalized),
      source,
      type: typeof type === "string" ? type : undefined,
      confidence: typeof confidence === "string" ? confidence : "low",
      mimeType: typeof mimeType === "string" && mimeType.trim() ? mimeType.trim() : undefined,
      ...(normalizedPreviewUrl ? { previewUrl: normalizedPreviewUrl } : {}),
      ...(Number.isFinite(width) && width > 0 ? { width: Math.round(width) } : {}),
      ...(Number.isFinite(height) && height > 0 ? { height: Math.round(height) } : {}),
      ...(Number.isFinite(duration) && duration > 0 ? { duration: Math.round(duration) } : {}),
    };
  }

  function extractVideoCandidatesFromElement(video) {
    if (!(video instanceof HTMLVideoElement)) {
      return [];
    }

    const candidates = [];
    const collect = (rawUrl, source) => {
      const url = normalizeHttpUrl(rawUrl);
      if (!url) {
        return;
      }

      candidates.push({
        url,
        type: selectionUtils.classifyVideoCandidateType(url),
        confidence: source === "video_element" ? "high" : "medium",
        source,
        mediaType: "video",
      });
    };

    collect(video.currentSrc, "video_element");
    collect(video.src, "video_element");
    collect(video.getAttribute("src"), "video_element");

    video.querySelectorAll("source").forEach((source) => {
      collect(source.src, "video_source");
      collect(source.getAttribute("src"), "video_source");
    });

    return candidates;
  }

  function collectVideoScanCandidates() {
    const videos = Array.from(document.querySelectorAll("video"));
    const candidates = [];

    videos.forEach((video) => {
      extractVideoCandidatesFromElement(video).forEach((candidate) => {
        const rect = typeof video.getBoundingClientRect === "function"
          ? video.getBoundingClientRect()
          : null;
        const described = describeCandidate({
          ...candidate,
          mediaType: "video",
          title: resolveVideoTitle(video),
          width: video.videoWidth || rect?.width,
          height: video.videoHeight || rect?.height,
          previewUrl: resolveVideoPreviewUrl(video),
        });
        if (described) {
          candidates.push(described);
        }
      });
    });

    const anchors = Array.from(document.querySelectorAll("a[href]")).slice(0, MEDIA_SCAN_LINK_LIMIT);
    anchors.forEach((anchor) => {
      const url = normalizeHttpUrl(anchor.getAttribute("href"));
      if (!url) {
        return;
      }
      const type = selectionUtils.classifyVideoCandidateType(url);
      if (type === "unknown") {
        return;
      }
      const described = describeCandidate({
        url,
        mediaType: "video",
        type,
        confidence: type === "direct_mp4" ? "medium" : "low",
        source: "direct_link",
        title: anchor.textContent || extractTitle(),
        previewUrl: extractMetaPreviewUrl(),
      });
      if (described) {
        candidates.push(described);
      }
    });

    return dedupeCandidates(candidates, (candidate) => selectionUtils.candidateStrength?.(candidate) || 0);
  }

  function imageDisplaySize(image) {
    const rect = typeof image.getBoundingClientRect === "function"
      ? image.getBoundingClientRect()
      : null;
    const width = image.naturalWidth || image.width || rect?.width || 0;
    const height = image.naturalHeight || image.height || rect?.height || 0;
    return { width, height };
  }

  function isLargeEnoughImage(image) {
    const { width, height } = imageDisplaySize(image);
    return width >= MIN_IMAGE_WIDTH && height >= MIN_IMAGE_HEIGHT;
  }

  function collectImageScanCandidates() {
    const candidates = [];
    const images = Array.from(document.querySelectorAll("img[src]"));
    images.forEach((image) => {
      if (!isLargeEnoughImage(image)) {
        return;
      }
      const url = normalizeHttpUrl(image.currentSrc || image.src || image.getAttribute("src"));
      if (!url) {
        return;
      }
      const { width, height } = imageDisplaySize(image);
      const described = describeCandidate({
        url,
        mediaType: "image",
        source: "img_element",
        confidence: "high",
        title: image.getAttribute("alt") || image.getAttribute("title"),
        previewUrl: url,
        width,
        height,
      });
      if (described) {
        candidates.push(described);
      }
    });

    const pictureSources = Array.from(document.querySelectorAll("picture source[srcset], source[type^='image/'][srcset]"));
    pictureSources.forEach((source) => {
      const firstSrc = String(source.getAttribute("srcset") || "").split(",")[0]?.trim()?.split(/\s+/)[0];
      const url = normalizeHttpUrl(firstSrc);
      if (!url) {
        return;
      }
      const described = describeCandidate({
        url,
        mediaType: "image",
        source: "picture_source",
        confidence: "medium",
        previewUrl: url,
      });
      if (described) {
        candidates.push(described);
      }
    });

    const anchors = Array.from(document.querySelectorAll("a[href]")).slice(0, MEDIA_SCAN_LINK_LIMIT);
    anchors.forEach((anchor) => {
      const url = normalizeHttpUrl(anchor.getAttribute("href"));
      if (!url || !DIRECT_IMAGE_EXT_RE.test(url)) {
        return;
      }
      const described = describeCandidate({
        url,
        mediaType: "image",
        source: "direct_link",
        confidence: "medium",
        title: anchor.textContent,
        previewUrl: url,
      });
      if (described) {
        candidates.push(described);
      }
    });

    return dedupeCandidates(candidates, (candidate) => (candidate.width || 0) * (candidate.height || 0));
  }

  function isLikelyAudioUrl(rawUrl) {
    const normalized = normalizeHttpUrl(rawUrl);
    return Boolean(normalized && DIRECT_AUDIO_EXT_RE.test(normalized) && !AUDIO_FRAGMENT_EXT_RE.test(normalized));
  }

  function audioDuration(audio) {
    const duration = Number(audio?.duration);
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  }

  function shouldSkipShortAudio(audio) {
    const duration = audioDuration(audio);
    return duration !== null && duration < MIN_AUDIO_DURATION_SECONDS;
  }

  function collectAudioScanCandidates() {
    const candidates = [];
    const collect = ({ rawUrl, source, title, mimeType, duration, confidence = "medium" }) => {
      const url = normalizeHttpUrl(rawUrl);
      if (!url || !isLikelyAudioUrl(url)) {
        return;
      }
      const described = describeCandidate({
        url,
        mediaType: "audio",
        source,
        confidence,
        title,
        mimeType,
        duration,
      });
      if (described) {
        candidates.push(described);
      }
    };

    Array.from(document.querySelectorAll("audio")).forEach((audio) => {
      if (!(audio instanceof HTMLAudioElement) || shouldSkipShortAudio(audio)) {
        return;
      }
      const duration = audioDuration(audio);
      collect({
        rawUrl: audio.currentSrc || audio.src || audio.getAttribute("src"),
        source: "audio_element",
        title: audio.getAttribute("title") || audio.getAttribute("aria-label") || extractTitle(),
        duration,
        confidence: "high",
      });
      audio.querySelectorAll("source").forEach((source) => {
        collect({
          rawUrl: source.src || source.getAttribute("src"),
          source: "source_element",
          title: source.getAttribute("title") || audio.getAttribute("title") || extractTitle(),
          mimeType: source.getAttribute("type") || "",
          duration,
        });
      });
    });

    Array.from(document.querySelectorAll("a[href]")).slice(0, MEDIA_SCAN_LINK_LIMIT).forEach((anchor) => {
      collect({
        rawUrl: anchor.getAttribute("href"),
        source: "direct_link",
        title: anchor.textContent,
        confidence: "medium",
      });
    });

    const resources = performance.getEntriesByType("resource") || [];
    for (
      let index = resources.length - 1;
      index >= 0 && index > resources.length - PERFORMANCE_SCAN_LIMIT;
      index -= 1
    ) {
      collect({
        rawUrl: resources[index]?.name,
        source: "performance_resource",
        title: urlFilename(resources[index]?.name || ""),
        confidence: "low",
      });
    }

    return dedupeCandidates(candidates, (candidate) => {
      const confidenceScore = candidate.confidence === "high" ? 1000 : candidate.confidence === "medium" ? 500 : 100;
      return confidenceScore + Math.min(Number(candidate.duration || 0), 600);
    });
  }

  function dedupeCandidates(candidates, scoreCandidate) {
    const merged = new Map();
    candidates.forEach((candidate) => {
      if (!candidate?.url) {
        return;
      }
      const existing = merged.get(candidate.url);
      if (!existing || scoreCandidate(candidate) > scoreCandidate(existing)) {
        merged.set(candidate.url, candidate);
      }
    });
    return Array.from(merged.values()).sort((left, right) => scoreCandidate(right) - scoreCandidate(left));
  }

  function collectPageMediaCandidates() {
    const startedAt = Date.now();
    const videos = collectVideoScanCandidates();
    const audios = collectAudioScanCandidates();
    const images = collectImageScanCandidates();
    const total = videos.length + audios.length + images.length;
    let limitedVideos = videos;
    let limitedAudios = audios;
    let limitedImages = images;

    if (total > MEDIA_SCAN_TOTAL_LIMIT) {
      const videoLimit = Math.min(videos.length, Math.ceil(MEDIA_SCAN_TOTAL_LIMIT * 0.5));
      limitedVideos = videos.slice(0, videoLimit);
      const audioLimit = Math.min(audios.length, Math.ceil(MEDIA_SCAN_TOTAL_LIMIT * 0.2));
      limitedAudios = audios.slice(0, audioLimit);
      limitedImages = images.slice(0, MEDIA_SCAN_TOTAL_LIMIT - limitedVideos.length - limitedAudios.length);

      let remaining = MEDIA_SCAN_TOTAL_LIMIT - limitedVideos.length - limitedAudios.length - limitedImages.length;
      if (remaining > 0 && limitedVideos.length < videos.length) {
        const nextVideos = videos.slice(limitedVideos.length, limitedVideos.length + remaining);
        limitedVideos = limitedVideos.concat(nextVideos);
        remaining -= nextVideos.length;
      }
      if (remaining > 0 && limitedAudios.length < audios.length) {
        const nextAudios = audios.slice(limitedAudios.length, limitedAudios.length + remaining);
        limitedAudios = limitedAudios.concat(nextAudios);
        remaining -= nextAudios.length;
      }
      if (remaining > 0 && limitedImages.length < images.length) {
        limitedImages = limitedImages.concat(images.slice(limitedImages.length, limitedImages.length + remaining));
      }
    }

    return {
      success: true,
      scannedAt: Date.now(),
      scanDurationMs: Date.now() - startedAt,
      pageUrl: normalizeHttpUrl(window.location.href) || window.location.href,
      pageTitle: extractTitle(),
      videos: limitedVideos,
      audios: limitedAudios,
      images: limitedImages,
      truncated: total > MEDIA_SCAN_TOTAL_LIMIT,
    };
  }

  function collectPerformanceCandidates(referenceVideo) {
    const resources = performance.getEntriesByType("resource") || [];
    const referenceHosts = new Set();
    const pageHost = (() => {
      try {
        return new URL(window.location.href).hostname.toLowerCase();
      } catch {
        return null;
      }
    })();
    const directVideoUrl = normalizeHttpUrl(referenceVideo?.currentSrc || referenceVideo?.src);
    if (pageHost) {
      referenceHosts.add(pageHost);
    }
    if (directVideoUrl) {
      try {
        referenceHosts.add(new URL(directVideoUrl).hostname.toLowerCase());
      } catch {
        // Ignore invalid host parsing.
      }
    }

    const candidates = [];
    for (
      let index = resources.length - 1;
      index >= 0 && index > resources.length - PERFORMANCE_SCAN_LIMIT;
      index -= 1
    ) {
      const url = normalizeHttpUrl(resources[index]?.name);
      if (!url) {
        continue;
      }

      const type = selectionUtils.classifyVideoCandidateType(url);
      if (type === "unknown") {
        continue;
      }

      try {
        const host = new URL(url).hostname.toLowerCase();
        if (referenceHosts.size > 0 && !referenceHosts.has(host)) {
          continue;
        }
      } catch {
        continue;
      }

      candidates.push({
        url,
        type,
        confidence: type === "manifest_m3u8" ? "medium" : "low",
        source: "performance_resource",
        mediaType: "video",
      });
    }

    return candidates;
  }

  function scoreVideo(video) {
    if (!(video instanceof HTMLVideoElement) || !isRenderableVideo(video)) {
      return -1;
    }

    const rect = video.getBoundingClientRect();
    const areaScore = rect.width * rect.height;
    const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
    const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    const visibleScore = visibleWidth * visibleHeight;
    const playbackBonus = video.paused ? 0 : 200000;
    const readyBonus = video.readyState >= 2 ? 90000 : 0;
    const currentTimeBonus = video.currentTime > 0 ? 45000 : 0;
    const recentPlayBonus = Math.max(0, 60000 - (Date.now() - (playbackTimestamps.get(video) || 0))) * 4;

    return areaScore + visibleScore + playbackBonus + readyBonus + currentTimeBonus + recentPlayBonus;
  }

  function getVisibleVideos(root = document) {
    return Array.from(root.querySelectorAll("video")).filter(isRenderableVideo);
  }

  function resolveBestVideo(root = document) {
    const videos = getVisibleVideos(root);
    if (videos.length === 0) {
      return null;
    }

    return videos
      .map((video) => ({ video, score: scoreVideo(video) }))
      .sort((left, right) => right.score - left.score)[0]?.video || null;
  }

  function resolveVideoFromTarget(target, point = null) {
    if (target instanceof HTMLVideoElement && isRenderableVideo(target)) {
      return target;
    }

    if (target instanceof Element) {
      const direct = target.closest("video");
      if (direct instanceof HTMLVideoElement && isRenderableVideo(direct)) {
        return direct;
      }

      const nested = target.querySelector?.("video");
      if (nested instanceof HTMLVideoElement && isRenderableVideo(nested)) {
        return nested;
      }

      let current = target;
      for (let depth = 0; current instanceof Element && depth < 4; depth += 1) {
        const descendantVideos = getVisibleVideos(current);
        if (descendantVideos.length > 0) {
          return descendantVideos.sort((left, right) => scoreVideo(right) - scoreVideo(left))[0] || null;
        }
        current = current.parentElement;
      }
    }

    if (point && typeof document.elementsFromPoint === "function") {
      const elements = document.elementsFromPoint(point.x, point.y);
      const pointedVideo = elements.find((element) => element instanceof HTMLVideoElement && isRenderableVideo(element));
      if (pointedVideo instanceof HTMLVideoElement) {
        return pointedVideo;
      }
    }

    return null;
  }

  function buildSelectionPayload(referenceVideo, source, fallbackVideoUrl = null) {
    const routeUrl = resolveRouteUrl(referenceVideo);
    const elementCandidates = extractVideoCandidatesFromElement(referenceVideo);
    const performanceCandidates = collectPerformanceCandidates(referenceVideo);
    const directFallbackCandidate = normalizeHttpUrl(fallbackVideoUrl)
      ? [{
          url: normalizeHttpUrl(fallbackVideoUrl),
          type: selectionUtils.classifyVideoCandidateType(fallbackVideoUrl),
          confidence: "medium",
          source: "message_fallback",
          mediaType: "video",
        }]
      : [];
    const videoCandidates = selectionUtils.mergeVideoCandidates(
      elementCandidates,
      performanceCandidates,
      directFallbackCandidate,
    );
    const videoUrl =
      selectionUtils.selectPreferredVideoUrl(videoCandidates) ||
      normalizeHttpUrl(fallbackVideoUrl) ||
      null;
    const pageUrl = resolveSelectionPageUrl(
      routeUrl,
      videoUrl || fallbackVideoUrl,
      normalizeHttpUrl(window.location.href) || window.location.href,
    );

    return {
      url: routeUrl || videoUrl || pageUrl || window.location.href,
      pageUrl: pageUrl || undefined,
      videoUrl: videoUrl || undefined,
      videoCandidates,
      title: extractTitle(),
      selectionScope: SELECTION_SCOPE_CURRENT_ITEM,
      diagnostics: {
        resolver: "generic_video_detector",
        source,
        candidateCount: videoCandidates.length,
      },
    };
  }

  function resolveSelectionPayload(message) {
    const requestedSrcUrl = normalizeHttpUrl(message?.requestedSrcUrl);
    const now = Date.now();

    if (
      message?.source === "context_menu" &&
      lastContextSelection &&
      now - lastContextSelection.createdAt <= CONTEXT_TTL_MS
    ) {
      return buildSelectionPayload(
        lastContextSelection.video,
        "context_menu",
        requestedSrcUrl || lastContextSelection.videoUrl,
      );
    }

    const bestVideo = resolveBestVideo(document);
    if (bestVideo instanceof HTMLVideoElement) {
      return buildSelectionPayload(bestVideo, message?.source || "popup", requestedSrcUrl);
    }

    if (requestedSrcUrl) {
      const pageUrl = resolveSelectionPageUrl(
        null,
        requestedSrcUrl,
        normalizeHttpUrl(window.location.href) || window.location.href,
      );
      return {
        url: requestedSrcUrl || pageUrl || window.location.href,
        pageUrl: pageUrl || undefined,
        videoUrl: requestedSrcUrl,
        videoCandidates: [{
          url: requestedSrcUrl,
          type: selectionUtils.classifyVideoCandidateType(requestedSrcUrl),
          confidence: "medium",
          source: "context_menu_src",
          mediaType: "video",
        }],
        title: extractTitle(),
        selectionScope: SELECTION_SCOPE_CURRENT_ITEM,
        diagnostics: {
          resolver: "generic_video_detector",
          source: message?.source || "fallback",
          candidateCount: 1,
        },
      };
    }

    return null;
  }

  window.AmeowGenericVideoDetectorTestHooks = {
    collectPageMediaCandidates,
    collectAudioScanCandidates,
    normalizeContentUrl,
    normalizeXiaohongshuNoteUrl,
    resolveSelectionPageUrl,
    shouldAvoidCurrentPageFallback,
  };

  function rememberContextSelection(event) {
    const point =
      event instanceof MouseEvent
        ? { x: event.clientX, y: event.clientY }
        : null;
    const video = resolveVideoFromTarget(event.target, point);
    if (!(video instanceof HTMLVideoElement)) {
      return;
    }

    lastContextSelection = {
      video,
      videoUrl: normalizeHttpUrl(video.currentSrc || video.src),
      createdAt: Date.now(),
    };
  }

  document.addEventListener("play", (event) => {
    if (event.target instanceof HTMLVideoElement) {
      playbackTimestamps.set(event.target, Date.now());
    }
  }, true);

  document.addEventListener("playing", (event) => {
    if (event.target instanceof HTMLVideoElement) {
      playbackTimestamps.set(event.target, Date.now());
    }
  }, true);

  document.addEventListener("contextmenu", rememberContextSelection, true);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (
      message?.type !== MESSAGE_RESOLVE_VIDEO_SELECTION
      && message?.type !== MESSAGE_RESOLVE_PASTED_VIDEO_SELECTION
      && message?.type !== MESSAGE_SCAN_PAGE_MEDIA
    ) {
      return false;
    }

    try {
      if (message?.type === MESSAGE_SCAN_PAGE_MEDIA) {
        sendResponse(collectPageMediaCandidates());
        return true;
      }

      const payload = resolveSelectionPayload(message);
      if (!payload) {
        sendResponse({
          success: false,
          reason: "no_video_found",
        });
        return true;
      }

      sendResponse({
        success: true,
        payload,
      });
    } catch (error) {
      console.error("[Ameow Generic] Failed to resolve video selection:", error);
      sendResponse({
        success: false,
        reason: "resolve_failed",
      });
    }

    return true;
  });
})();
