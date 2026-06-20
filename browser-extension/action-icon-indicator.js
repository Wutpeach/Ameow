(function initAmeowActionIconIndicator(root) {
  "use strict";

  const BASE_ICON_PATHS = {
    16: "icons/icon16.png",
    48: "icons/icon48.png",
    128: "icons/icon128.png",
  };

  const CONNECTION_STATES = {
    CONNECTED: "connected",
    OFFLINE: "offline",
  };

  const CONNECTION_ICON_PATHS = {
    [CONNECTION_STATES.CONNECTED]: {
      16: "icons/icon16-connected-dot.png",
      48: "icons/icon48-connected-dot.png",
      128: "icons/icon128-connected-dot.png",
    },
    [CONNECTION_STATES.OFFLINE]: {
      16: "icons/icon16-offline-dot.png",
      48: "icons/icon48-offline-dot.png",
      128: "icons/icon128-offline-dot.png",
    },
  };

  function normalizeConnectionState(state) {
    return state === CONNECTION_STATES.CONNECTED
      ? CONNECTION_STATES.CONNECTED
      : CONNECTION_STATES.OFFLINE;
  }

  function resolveActionIconPaths(state) {
    return CONNECTION_ICON_PATHS[normalizeConnectionState(state)] || BASE_ICON_PATHS;
  }

  function resolveActionIndicatorState(state) {
    return {
      badgeText: "",
      iconPath: resolveActionIconPaths(state),
    };
  }

  root.AmeowActionIconIndicator = {
    BASE_ICON_PATHS,
    CONNECTION_STATES,
    CONNECTION_ICON_PATHS,
    normalizeConnectionState,
    resolveActionIconPaths,
    resolveActionIndicatorState,
  };
})(typeof self !== "undefined" ? self : globalThis);
