(function initAmeowActionIconIndicator(root) {
  "use strict";

  const BASE_ICON_PATHS = {
    16: "icons/icon16.png",
    48: "icons/icon48.png",
    128: "icons/icon128.png",
  };

  const SYNC_DOT_COLOR = "#f59e0b";
  const SYNC_DOT_ICON_PATHS = {
    16: "icons/icon16-sync-dot.png",
    48: "icons/icon48-sync-dot.png",
    128: "icons/icon128-sync-dot.png",
  };

  function resolveActionIconPaths(showDot) {
    return showDot ? SYNC_DOT_ICON_PATHS : BASE_ICON_PATHS;
  }

  function resolveActionIndicatorState(showDot) {
    return {
      badgeText: "",
      iconPath: resolveActionIconPaths(showDot),
    };
  }

  root.AmeowActionIconIndicator = {
    BASE_ICON_PATHS,
    SYNC_DOT_COLOR,
    SYNC_DOT_ICON_PATHS,
    resolveActionIconPaths,
    resolveActionIndicatorState,
  };
})(typeof self !== "undefined" ? self : globalThis);
