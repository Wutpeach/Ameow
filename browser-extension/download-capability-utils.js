(function initAmeowDownloadCapabilityUtils(root) {
  "use strict";

  const BROWSER_IMAGE_EXTENSIONS = new Set(["avif", "gif", "jpg", "jpeg", "png", "svg", "webp"]);
  const BROWSER_AUDIO_EXTENSIONS = new Set(["aac", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav"]);
  const BROWSER_VIDEO_EXTENSIONS = new Set(["m4v", "mp4", "webm"]);
  const BROWSER_IMAGE_CONTENT_TYPES = new Set([
    "image/avif",
    "image/gif",
    "image/jpeg",
    "image/png",
    "image/svg+xml",
    "image/webp",
  ]);
  const BROWSER_AUDIO_CONTENT_TYPES = new Set([
    "audio/aac",
    "audio/flac",
    "audio/m4a",
    "audio/mp4",
    "audio/mpeg",
    "audio/ogg",
    "audio/opus",
    "audio/wav",
    "audio/webm",
    "audio/x-m4a",
    "audio/x-wav",
  ]);
  const BROWSER_VIDEO_CONTENT_TYPES = new Set([
    "video/mp4",
    "video/webm",
    "video/x-m4v",
  ]);
  const BROWSER_FILE_EXTENSIONS = new Set([
    "7z",
    "csv",
    "doc",
    "docx",
    "gz",
    "json",
    "odt",
    "pdf",
    "ppt",
    "pptx",
    "rar",
    "rtf",
    "tar",
    "txt",
    "xls",
    "xlsx",
    "xml",
    "zip",
  ]);
  const DESKTOP_REQUIRED_EXTENSIONS = new Set(["m3u8", "m4s", "mov", "mpd", "ts"]);
  const DESKTOP_REQUIRED_TYPES = new Set([
    "adaptive_stream",
    "blob",
    "dash",
    "hls",
    "indirect_media",
    "manifest",
    "manifest_m3u8",
    "protected",
    "site_extractor",
    "stream_fragment",
  ]);
  const DESKTOP_REQUIRED_CONTENT_TYPES = new Set([
    "application/dash+xml",
    "application/mpegurl",
    "application/vnd.apple.mpegurl",
    "application/x-mpegurl",
    "audio/mpegurl",
    "audio/x-mpegurl",
    "video/mp2t",
  ]);
  function normalizeScheme(rawUrl) {
    if (typeof rawUrl !== "string") {
      return "";
    }

    const match = rawUrl.trim().match(/^([a-z][a-z0-9+.-]*):/i);
    return match ? match[1].toLowerCase() : "";
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

  function normalizeCandidateMediaType(value) {
    return value === "audio" || value === "image" || value === "video" || value === "file"
      ? value
      : "";
  }

  function normalizeMediaContentType(candidate) {
    const rawValue = typeof candidate?.contentType === "string" && candidate.contentType.trim()
      ? candidate.contentType
      : typeof candidate?.mimeType === "string" && candidate.mimeType.trim()
        ? candidate.mimeType
        : "";
    return rawValue.split(";")[0].trim().toLowerCase();
  }

  function normalizedType(candidate) {
    const explicitType = typeof candidate?.type === "string" ? candidate.type.trim().toLowerCase() : "";
    if (explicitType) {
      return explicitType;
    }

    const genericUtils = root.AmeowGenericVideoSelectionUtils;
    return genericUtils?.classifyVideoCandidateType
      ? genericUtils.classifyVideoCandidateType(candidate?.url)
      : "unknown";
  }

  function explicitCandidateType(candidate) {
    return typeof candidate?.type === "string" ? candidate.type.trim().toLowerCase() : "";
  }

  function resolveDownloadCapability(candidate) {
    const scheme = normalizeScheme(candidate?.url);
    if (scheme && scheme !== "http" && scheme !== "https") {
      return {
        browserDownloadable: false,
        requiresDesktop: true,
        desktopReason: `${scheme}_url`,
      };
    }

    const url = normalizeHttpUrl(candidate?.url);
    if (!url) {
      return {
        browserDownloadable: false,
        requiresDesktop: true,
        desktopReason: "invalid_url",
      };
    }

    const explicitType = explicitCandidateType(candidate);
    if (DESKTOP_REQUIRED_TYPES.has(explicitType)) {
      return {
        browserDownloadable: false,
        requiresDesktop: true,
        desktopReason: explicitType,
      };
    }

    const extension = urlExtension(url);
    if (DESKTOP_REQUIRED_EXTENSIONS.has(extension)) {
      return {
        browserDownloadable: false,
        requiresDesktop: true,
        desktopReason: `${extension}_resource`,
      };
    }

    const mediaType = normalizeCandidateMediaType(candidate?.mediaType);
    const contentType = normalizeMediaContentType(candidate);
    if (DESKTOP_REQUIRED_CONTENT_TYPES.has(contentType)) {
      return {
        browserDownloadable: false,
        requiresDesktop: true,
        desktopReason: `${contentType.replace(/[^a-z0-9]+/g, "_")}_resource`,
      };
    }

    const inferredType = normalizedType(candidate);
    if (DESKTOP_REQUIRED_TYPES.has(inferredType) && inferredType !== "indirect_media") {
      return {
        browserDownloadable: false,
        requiresDesktop: true,
        desktopReason: inferredType,
      };
    }

    const browserDownloadable =
      BROWSER_IMAGE_EXTENSIONS.has(extension)
      || BROWSER_AUDIO_EXTENSIONS.has(extension)
      || BROWSER_VIDEO_EXTENSIONS.has(extension)
      || BROWSER_FILE_EXTENSIONS.has(extension)
      || (mediaType === "image" && BROWSER_IMAGE_EXTENSIONS.has(extension))
      || (mediaType === "audio" && BROWSER_AUDIO_EXTENSIONS.has(extension))
      || (mediaType === "video" && BROWSER_VIDEO_EXTENSIONS.has(extension))
      || (mediaType === "file" && BROWSER_FILE_EXTENSIONS.has(extension))
      || (mediaType === "image" && BROWSER_IMAGE_CONTENT_TYPES.has(contentType))
      || (mediaType === "audio" && BROWSER_AUDIO_CONTENT_TYPES.has(contentType))
      || (mediaType === "video" && BROWSER_VIDEO_CONTENT_TYPES.has(contentType));

    if (browserDownloadable) {
      return {
        browserDownloadable: true,
        requiresDesktop: false,
        desktopReason: null,
      };
    }

    return {
      browserDownloadable: false,
      requiresDesktop: true,
      desktopReason: "unknown_resource",
    };
  }

  function canUseBrowserFallback(candidate) {
    const capability = resolveDownloadCapability(candidate);
    return capability.browserDownloadable === true && capability.requiresDesktop !== true;
  }

  root.AmeowDownloadCapabilityUtils = {
    canUseBrowserFallback,
    resolveDownloadCapability,
    urlExtension,
  };
})(typeof self !== "undefined" ? self : globalThis);
