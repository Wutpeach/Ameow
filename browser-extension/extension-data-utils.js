(function initAmeowExtensionDataUtils(root) {
  "use strict";

  function isRecord(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function normalizeYouTubeExtensionData(rawYouTubeExtensionData) {
    if (!isRecord(rawYouTubeExtensionData)) {
      return null;
    }

    const normalized = {
      forceExtended: typeof rawYouTubeExtensionData.forceExtended === "boolean"
        ? rawYouTubeExtensionData.forceExtended
        : typeof rawYouTubeExtensionData.force_extended === "boolean"
          ? rawYouTubeExtensionData.force_extended
          : undefined,
      allowCookies: typeof rawYouTubeExtensionData.allowCookies === "boolean"
        ? rawYouTubeExtensionData.allowCookies
        : typeof rawYouTubeExtensionData.allow_cookies === "boolean"
          ? rawYouTubeExtensionData.allow_cookies
          : undefined,
      source:
        rawYouTubeExtensionData.source === "injected"
        || rawYouTubeExtensionData.source === "pasted"
        || rawYouTubeExtensionData.source === "context_menu"
          ? rawYouTubeExtensionData.source
          : undefined,
    };

    if (
      typeof normalized.forceExtended === "undefined"
      && typeof normalized.allowCookies === "undefined"
      && typeof normalized.source === "undefined"
    ) {
      return null;
    }

    return normalized;
  }

  function normalizeExtensionData(rawExtensionData) {
    if (!isRecord(rawExtensionData)) {
      return undefined;
    }

    const normalizedExtensionData = { ...rawExtensionData };
    const normalizedYouTube = normalizeYouTubeExtensionData(rawExtensionData.youtube);

    if (normalizedYouTube) {
      normalizedExtensionData.youtube = normalizedYouTube;
    } else {
      delete normalizedExtensionData.youtube;
    }

    return Object.keys(normalizedExtensionData).length > 0
      ? normalizedExtensionData
      : undefined;
  }

  root.AmeowExtensionDataUtils = {
    normalizeExtensionData,
    normalizeYouTubeExtensionData,
  };
})(typeof self !== "undefined" ? self : globalThis);
