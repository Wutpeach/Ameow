// Ameow Browser Extension - Options Page

const localeUtils = window.AmeowLocaleUtils;
const FALLBACK_LANGUAGE = localeUtils?.FALLBACK_LANGUAGE || "en";

function applyTheme(theme) {
  document.body.classList.toggle("ameow-theme-white", theme === "white");
  document.body.classList.toggle("ameow-theme-black", theme !== "white");
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime?.lastError) {
          resolve(null);
          return;
        }
        resolve(response ?? null);
      });
    } catch (error) {
      console.error("[Ameow] Failed to send runtime message:", error);
      resolve(null);
    }
  });
}

function normalizeConfig(value) {
  return window.AmeowLauncherConfig?.normalizeConfig
    ? window.AmeowLauncherConfig.normalizeConfig(value)
    : {
        enabled: value?.enabled !== false,
        side: value?.side === "left" ? "left" : "right",
        disabledSitePatterns: Array.isArray(value?.disabledSitePatterns) ? value.disabledSitePatterns : [],
      };
}

document.addEventListener("DOMContentLoaded", () => {
  const elements = {
    optionsKicker: document.getElementById("optionsKicker"),
    optionsTitle: document.getElementById("optionsTitle"),
    optionsStatus: document.getElementById("optionsStatus"),
    launcherSettingsTitle: document.getElementById("launcherSettingsTitle"),
    launcherSettingsDescription: document.getElementById("launcherSettingsDescription"),
    launcherEnabledButton: document.getElementById("launcherEnabledButton"),
    launcherEnabledTitle: document.getElementById("launcherEnabledTitle"),
    launcherEnabledHint: document.getElementById("launcherEnabledHint"),
    launcherSideTitle: document.getElementById("launcherSideTitle"),
    launcherSideHint: document.getElementById("launcherSideHint"),
    launcherSideLeft: document.getElementById("launcherSideLeft"),
    launcherSideRight: document.getElementById("launcherSideRight"),
    resetLauncherPositionButton: document.getElementById("resetLauncherPositionButton"),
    resetLauncherPositionTitle: document.getElementById("resetLauncherPositionTitle"),
    resetLauncherPositionHint: document.getElementById("resetLauncherPositionHint"),
    hiddenSitesTitle: document.getElementById("hiddenSitesTitle"),
    hiddenSitesDescription: document.getElementById("hiddenSitesDescription"),
    hiddenSitesCount: document.getElementById("hiddenSitesCount"),
    restoreAllSitesButton: document.getElementById("restoreAllSitesButton"),
    hiddenSitesList: document.getElementById("hiddenSitesList"),
  };

  let currentBundle = {
    language: FALLBACK_LANGUAGE,
    common: {},
    extension: {},
  };
  let currentConfig = normalizeConfig(null);

  function t(key, fallback) {
    return localeUtils?.translate(currentBundle, key, fallback) || fallback || key;
  }

  function tt(key, values, fallback) {
    return localeUtils?.translateTemplate(currentBundle, key, values, fallback) || fallback || key;
  }

  function renderStaticCopy() {
    const title = t("options.launcher.title", "Launcher settings");
    document.documentElement.lang = currentBundle.language;
    document.title = `${t("app.name", "Ameow")} - ${title}`;
    elements.optionsKicker.textContent = t("options.kicker", "Extension settings");
    elements.optionsTitle.textContent = title;
    elements.launcherSettingsTitle.textContent = title;
    elements.launcherSettingsDescription.textContent = t(
      "options.launcher.description",
      "Control the page-edge launcher without crowding the popup.",
    );
    elements.launcherEnabledTitle.textContent = t("options.launcher.enabled.title", "Show launcher");
    elements.launcherEnabledHint.textContent = t(
      "options.launcher.enabled.hint",
      "Show the page-edge launcher on supported pages.",
    );
    elements.launcherSideTitle.textContent = t("options.launcher.side.title", "Launcher side");
    elements.launcherSideHint.textContent = t(
      "options.launcher.side.hint",
      "Choose which edge the launcher uses.",
    );
    elements.launcherSideLeft.textContent = t("popup.controls.side.left", "Left");
    elements.launcherSideRight.textContent = t("popup.controls.side.right", "Right");
    elements.resetLauncherPositionTitle.textContent = t("options.launcher.reset.title", "Reset position");
    elements.resetLauncherPositionHint.textContent = t(
      "options.launcher.reset.hint",
      "Return the launcher to its default edge position.",
    );
    elements.hiddenSitesTitle.textContent = t("options.hiddenSites.title", "Hidden sites");
    elements.hiddenSitesDescription.textContent = t(
      "options.hiddenSites.description",
      "Sites hidden from the launcher are managed here.",
    );
    elements.restoreAllSitesButton.textContent = t("options.hiddenSites.restoreAll", "Restore all");
  }

  function renderConfig(config) {
    currentConfig = normalizeConfig(config);
    const hiddenSites = currentConfig.disabledSitePatterns.filter(Boolean);
    const enabled = currentConfig.enabled !== false;
    const side = currentConfig.side === "left" ? "left" : "right";

    elements.optionsStatus.textContent = enabled
      ? t("launcher.status.visible", "Visible")
      : t("launcher.status.disabled", "Hidden");
    elements.launcherEnabledButton.dataset.enabled = enabled ? "true" : "false";
    elements.launcherEnabledButton.setAttribute("aria-checked", enabled ? "true" : "false");
    elements.launcherSideLeft.classList.toggle("active", side === "left");
    elements.launcherSideRight.classList.toggle("active", side === "right");
    elements.hiddenSitesCount.textContent = tt(
      "options.hiddenSites.count",
      { count: hiddenSites.length },
      `${hiddenSites.length} hidden sites`,
    );
    elements.restoreAllSitesButton.hidden = hiddenSites.length === 0;
    renderHiddenSites(hiddenSites);
  }

  function renderHiddenSites(hiddenSites) {
    elements.hiddenSitesList.innerHTML = "";

    if (hiddenSites.length === 0) {
      const empty = document.createElement("div");
      const title = document.createElement("div");
      const copy = document.createElement("div");
      empty.className = "ameow-sites-empty";
      title.className = "ameow-sites-empty-title";
      title.textContent = t("popup.sites.empty.title", "No hidden sites");
      copy.className = "ameow-sites-empty-copy";
      copy.textContent = t("popup.sites.empty.copy", "Sites hidden from the launcher will appear here.");
      empty.append(title, copy);
      elements.hiddenSitesList.appendChild(empty);
      return;
    }

    hiddenSites.forEach((pattern) => {
      const row = document.createElement("div");
      const host = document.createElement("div");
      const restore = document.createElement("button");

      row.className = "ameow-site-row";
      host.className = "ameow-site-host";
      host.textContent = pattern;
      restore.type = "button";
      restore.className = "ameow-site-restore";
      restore.title = tt("popup.sites.restoreOne", { pattern }, `Restore ${pattern}`);
      restore.setAttribute("aria-label", tt("popup.sites.restoreOne", { pattern }, `Restore ${pattern}`));
      restore.addEventListener("click", async () => {
        await applyConfigMessage({ type: "restore_hidden_site", pattern });
      });

      row.append(host, restore);
      elements.hiddenSitesList.appendChild(row);
    });
  }

  async function applyConfigMessage(message, optimisticConfig = null) {
    const previousConfig = currentConfig;
    if (optimisticConfig) {
      renderConfig(optimisticConfig);
    }

    const response = await sendRuntimeMessage(message);
    if (response?.success && response.config) {
      renderConfig(response.config);
      return true;
    }

    if (response?.success) {
      return refreshLauncherControls();
    }

    renderConfig(previousConfig);
    return false;
  }

  async function refreshLauncherControls() {
    const response = await sendRuntimeMessage({ type: "get_launcher_controls_state" });
    if (!response?.config) {
      return false;
    }
    renderConfig(response.config);
    return true;
  }

  async function applyLanguage(nextLanguage) {
    currentBundle = await localeUtils.loadLocaleBundle(nextLanguage);
    renderStaticCopy();
    renderConfig(currentConfig);
  }

  async function resolveInitialLanguage() {
    return localeUtils.resolveCurrentLanguage(navigator.language);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "theme_update") {
      applyTheme(message.theme);
      return;
    }

    if (message.type === "language_update") {
      const nextLanguage = localeUtils.normalizeAppLanguage(message.language);
      if (nextLanguage) {
        void applyLanguage(nextLanguage);
      }
    }
  });

  if (chrome?.storage?.onChanged && window.AmeowLauncherConfig?.STORAGE_KEY) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes?.[window.AmeowLauncherConfig.STORAGE_KEY]) {
        return;
      }
      renderConfig(changes[window.AmeowLauncherConfig.STORAGE_KEY].newValue);
    });
  }

  elements.launcherEnabledButton.addEventListener("click", async () => {
    const nextEnabled = elements.launcherEnabledButton.dataset.enabled !== "true";
    await applyConfigMessage(
      { type: "set_launcher_enabled", enabled: nextEnabled },
      { ...currentConfig, enabled: nextEnabled },
    );
  });

  elements.launcherSideLeft.addEventListener("click", async () => {
    await applyConfigMessage(
      { type: "set_launcher_side", side: "left" },
      { ...currentConfig, side: "left" },
    );
  });

  elements.launcherSideRight.addEventListener("click", async () => {
    await applyConfigMessage(
      { type: "set_launcher_side", side: "right" },
      { ...currentConfig, side: "right" },
    );
  });

  elements.resetLauncherPositionButton.addEventListener("click", async () => {
    await applyConfigMessage({ type: "reset_launcher_position" });
  });

  elements.restoreAllSitesButton.addEventListener("click", async () => {
    const count = currentConfig.disabledSitePatterns.length;
    if (count > 0 && !window.confirm(tt(
      "options.hiddenSites.restoreAllConfirm",
      { count },
      `Restore all ${count} hidden sites?`,
    ))) {
      return;
    }
    await applyConfigMessage({ type: "restore_all_hidden_sites" });
  });

  void (async () => {
    await applyLanguage(await resolveInitialLanguage());
    await refreshLauncherControls();
    const themeResponse = await sendRuntimeMessage({ type: "get_theme" });
    applyTheme(themeResponse?.theme || "black");
  })();
});
