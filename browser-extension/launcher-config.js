(function initAmeowLauncherConfig(root) {
  "use strict";

  const STORAGE_KEY = "ameowFloatingLauncherConfig";
  const DEFAULT_CONFIG = Object.freeze({
    enabled: true,
    side: "right",
    verticalPosition: 0.62,
    locked: false,
    disabledSitePatterns: [],
  });

  function isValidSide(value) {
    return value === "left" || value === "right";
  }

  function clampVerticalPosition(value) {
    return Number.isFinite(value)
      ? Math.min(0.9, Math.max(0.12, value))
      : DEFAULT_CONFIG.verticalPosition;
  }

  function normalizeDisabledSitePatterns(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((entry) => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 200);
  }

  function normalizeConfig(value) {
    const source = value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};

    return {
      enabled: typeof source.enabled === "boolean" ? source.enabled : DEFAULT_CONFIG.enabled,
      side: isValidSide(source.side) ? source.side : DEFAULT_CONFIG.side,
      verticalPosition: clampVerticalPosition(Number(source.verticalPosition)),
      locked: typeof source.locked === "boolean" ? source.locked : DEFAULT_CONFIG.locked,
      disabledSitePatterns: normalizeDisabledSitePatterns(source.disabledSitePatterns),
    };
  }

  function storageGet(keys) {
    return new Promise((resolve) => {
      if (!root.chrome?.storage?.local) {
        resolve({});
        return;
      }
      root.chrome.storage.local.get(keys, (result) => {
        resolve(result || {});
      });
    });
  }

  function storageSet(payload) {
    return new Promise((resolve, reject) => {
      if (!root.chrome?.storage?.local) {
        resolve();
        return;
      }
      root.chrome.storage.local.set(payload, () => {
        if (root.chrome.runtime?.lastError) {
          reject(root.chrome.runtime.lastError);
          return;
        }
        resolve();
      });
    });
  }

  async function getConfig() {
    const result = await storageGet(STORAGE_KEY);
    return normalizeConfig(result?.[STORAGE_KEY]);
  }

  async function setConfig(nextConfig) {
    const normalized = normalizeConfig(nextConfig);
    await storageSet({ [STORAGE_KEY]: normalized });
    return normalized;
  }

  async function updateConfig(updater) {
    const current = await getConfig();
    const next = typeof updater === "function" ? updater(current) : updater;
    return setConfig({ ...current, ...next });
  }

  function normalizeHostPattern(rawUrl) {
    if (typeof rawUrl !== "string") {
      return null;
    }
    try {
      const parsed = new URL(rawUrl);
      return parsed.hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  function isSiteDisabled(config, rawUrl) {
    const hostname = normalizeHostPattern(rawUrl);
    if (!hostname) {
      return false;
    }
    return normalizeConfig(config).disabledSitePatterns.some((pattern) => (
      hostname === pattern || hostname.endsWith(`.${pattern}`)
    ));
  }

  function addDisabledSitePattern(config, rawUrl) {
    const hostname = normalizeHostPattern(rawUrl);
    const normalized = normalizeConfig(config);
    if (!hostname || normalized.disabledSitePatterns.includes(hostname)) {
      return normalized;
    }
    return {
      ...normalized,
      disabledSitePatterns: [...normalized.disabledSitePatterns, hostname],
    };
  }

  function removeDisabledSitePattern(config, rawUrl) {
    const hostname = normalizeHostPattern(rawUrl);
    const normalized = normalizeConfig(config);
    if (!hostname) {
      return normalized;
    }
    return {
      ...normalized,
      disabledSitePatterns: normalized.disabledSitePatterns.filter((pattern) => pattern !== hostname),
    };
  }

  function removeDisabledPatternValue(config, patternValue) {
    const normalized = normalizeConfig(config);
    const pattern = typeof patternValue === "string" ? patternValue.trim().toLowerCase() : "";
    if (!pattern) {
      return normalized;
    }
    return {
      ...normalized,
      disabledSitePatterns: normalized.disabledSitePatterns.filter((entry) => entry !== pattern),
    };
  }

  function clearDisabledSitePatterns(config) {
    return {
      ...normalizeConfig(config),
      disabledSitePatterns: [],
    };
  }

  function setSide(config, side) {
    return {
      ...normalizeConfig(config),
      side: isValidSide(side) ? side : DEFAULT_CONFIG.side,
    };
  }

  function resetPosition(config) {
    return {
      ...normalizeConfig(config),
      side: DEFAULT_CONFIG.side,
      verticalPosition: DEFAULT_CONFIG.verticalPosition,
    };
  }

  root.AmeowLauncherConfig = {
    STORAGE_KEY,
    DEFAULT_CONFIG,
    normalizeConfig,
    getConfig,
    setConfig,
    updateConfig,
    isSiteDisabled,
    addDisabledSitePattern,
    removeDisabledSitePattern,
    removeDisabledPatternValue,
    clearDisabledSitePatterns,
    setSide,
    resetPosition,
  };
})(typeof self !== "undefined" ? self : globalThis);
