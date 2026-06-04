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
      source:
        rawYouTubeExtensionData.source === "injected"
        || rawYouTubeExtensionData.source === "pasted"
        || rawYouTubeExtensionData.source === "context_menu"
          ? rawYouTubeExtensionData.source
          : undefined,
    };

    if (
      typeof normalized.source === "undefined"
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
