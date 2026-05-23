// Ameow Browser Extension - Popup Script

const directDownloadQuality = window.AmeowDirectDownloadQuality;
const localeUtils = window.AmeowLocaleUtils;
const FALLBACK_LANGUAGE = localeUtils?.FALLBACK_LANGUAGE || "en";
const STATUS_STATE_CONNECTED = "connected";
const STATUS_STATE_CONNECTING = "connecting";
const STATUS_STATE_OFFLINE = "offline";

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

function normalizeConnectionState(response) {
  if (!response || typeof response !== "object") {
    return STATUS_STATE_OFFLINE;
  }

  if (
    response.state === STATUS_STATE_CONNECTED ||
    response.state === STATUS_STATE_CONNECTING ||
    response.state === STATUS_STATE_OFFLINE
  ) {
    return response.state;
  }

  if (response.connected === true) {
    return STATUS_STATE_CONNECTED;
  }

  if (response.statusText === "Connecting" || response.connecting === true) {
    return STATUS_STATE_CONNECTING;
  }

  return STATUS_STATE_OFFLINE;
}

document.addEventListener("DOMContentLoaded", () => {
  const statusText = document.getElementById("statusText");
  const statusCard = document.getElementById("statusCard");
  const statusHint = document.getElementById("statusHint");
  const qualityGrid = document.getElementById("qualityGrid");
  const highestQualityHint = document.getElementById("highestQualityHint");
  const highestQualityHintText = document.getElementById("highestQualityHintText");
  const popupTitle = document.getElementById("popupTitle");
  const popupSubtitle = document.getElementById("popupSubtitle");
  const qualitySectionTitle = document.getElementById("qualitySectionTitle");
  const launcherSectionTitle = document.getElementById("launcherSectionTitle");
  const launcherStateText = document.getElementById("launcherStateText");
  const launcherToggleButton = document.getElementById("launcherToggleButton");
  const launcherToggleTitle = document.getElementById("launcherToggleTitle");
  const launcherToggleHint = document.getElementById("launcherToggleHint");
  const restoreLauncherButton = document.getElementById("restoreLauncherButton");
  const fallbackDownloadButton = document.getElementById("fallbackDownloadButton");
  let statusTimer = null;
  let launcherTimer = null;
  let currentBundle = {
    language: FALLBACK_LANGUAGE,
    common: {},
    extension: {},
  };
  let currentStatusState = STATUS_STATE_OFFLINE;
  let currentQualityPreference = directDownloadQuality.DEFAULT_QUALITY_PREFERENCE;
  let currentLauncherStatus = null;

  function t(key, fallback) {
    return localeUtils?.translate(currentBundle, key, fallback) || fallback || key;
  }

  function renderStaticCopy() {
    popupTitle.textContent = t("app.name", "Ameow");
    popupSubtitle.textContent = t("popup.subtitle", "Extension");
    qualitySectionTitle.textContent = t("popup.sections.quality", "Quality");
    launcherSectionTitle.textContent = t("popup.sections.launcher", "Launcher");
    launcherToggleTitle.textContent = t("launcher.popup.toggleTitle", "Edge launcher");
    restoreLauncherButton.textContent = t("launcher.popup.restore", "Restore on this site");
    fallbackDownloadButton.textContent = t("launcher.popup.fallback", "Download this page");
    document.title = t("app.name", "Ameow");
  }

  function getStatusCopy(state) {
    if (state === STATUS_STATE_CONNECTED) {
      return {
        label: t("popup.status.connected.label", "Connected"),
        hint: t("popup.status.connected.hint", "Desktop app ready."),
      };
    }

    if (state === STATUS_STATE_CONNECTING) {
      return {
        label: t("popup.status.connecting.label", "Connecting"),
        hint: t("popup.status.connecting.hint", "Trying desktop app..."),
      };
    }

    return {
      label: t("popup.status.offline.label", "Offline"),
      hint: t("popup.status.offline.hint", "Open desktop app to connect."),
    };
  }

  function updateStatus(nextState) {
    currentStatusState = nextState;
    const copy = getStatusCopy(nextState);
    statusCard.dataset.connected = nextState === STATUS_STATE_CONNECTED ? "true" : "false";
    statusCard.dataset.state = nextState;
    statusText.textContent = copy.label;
    statusHint.textContent = copy.hint;
  }

  async function checkStatus() {
    const response = await sendRuntimeMessage({ type: "get_status" });
    updateStatus(normalizeConnectionState(response));
  }

  function renderLauncherStatus(status) {
    if (!status) {
      launcherToggleButton.dataset.enabled = "true";
      launcherToggleButton.setAttribute("aria-checked", "true");
      launcherToggleHint.textContent = t("launcher.popup.toggleOn", "Show in pages");
      restoreLauncherButton.hidden = true;
      fallbackDownloadButton.hidden = true;
      launcherStateText.textContent = t("launcher.status.checking", "Checking");
      return;
    }

    const enabled = status?.enabled !== false;
    const mounted = status?.mounted === true && status?.visible !== false;
    const hiddenForSite = status?.hiddenForSite === true;
    launcherToggleButton.dataset.enabled = enabled ? "true" : "false";
    launcherToggleButton.setAttribute("aria-checked", enabled ? "true" : "false");
    launcherToggleHint.textContent = enabled
      ? t("launcher.popup.toggleOn", "Show in pages")
      : t("launcher.popup.toggleOff", "Hidden globally");
    restoreLauncherButton.hidden = !enabled || !hiddenForSite;
    fallbackDownloadButton.hidden = mounted;

    if (!enabled) {
      launcherStateText.textContent = t("launcher.status.disabled", "Hidden");
      return;
    }

    if (mounted) {
      launcherStateText.textContent = t("launcher.status.visible", "Visible");
      return;
    }

    if (hiddenForSite) {
      launcherStateText.textContent = t("launcher.status.hidden", "Hidden here");
      return;
    }

    launcherStateText.textContent = t("launcher.status.unavailable", "Unavailable");
  }

  async function checkLauncherStatus() {
    const response = await sendRuntimeMessage({ type: "get_launcher_status" });
    currentLauncherStatus = response;
    renderLauncherStatus(response);
  }

  function renderQualityOptions(selectedValue) {
    const normalizedSelectedValue = directDownloadQuality.normalizeQualityPreference(selectedValue);
    currentQualityPreference = normalizedSelectedValue;
    qualityGrid.innerHTML = "";

    directDownloadQuality.QUALITY_PREFERENCE_OPTIONS.forEach((option) => {
      const button = document.createElement("button");
      const label = document.createElement("span");

      button.type = "button";
      button.className = "ameow-quality-btn";
      button.dataset.quality = option.value;
      if (option.value === normalizedSelectedValue) {
        button.classList.add("active");
      }

      label.className = "ameow-quality-value";
      label.textContent = t(option.labelKey, option.value);
      button.title = t(option.descriptionKey, "");
      button.appendChild(label);

      button.addEventListener("click", async () => {
        try {
          const savedValue = await directDownloadQuality.setQualityPreference(option.value);
          renderQualityOptions(savedValue);
        } catch (error) {
          console.error("[Ameow] Failed to save quality preference:", error);
        }
      });

      qualityGrid.appendChild(button);
    });

    renderHighestQualityHint(normalizedSelectedValue);
  }

  function renderHighestQualityHint(selectedValue) {
    const normalizedSelectedValue = directDownloadQuality.normalizeQualityPreference(selectedValue);
    const hintVisible = normalizedSelectedValue === "best";
    highestQualityHintText.textContent = t(
      "popup.preferences.highest.hint",
      "Some high-quality videos may enter the transcode queue after download."
    );
    highestQualityHint.dataset.visible = hintVisible ? "true" : "false";
    highestQualityHint.hidden = !hintVisible;
    highestQualityHint.setAttribute("aria-hidden", hintVisible ? "false" : "true");
    highestQualityHint.style.display = hintVisible ? "flex" : "none";
  }

  async function applyLanguage(nextLanguage) {
    currentBundle = await localeUtils.loadLocaleBundle(nextLanguage);
    document.documentElement.lang = currentBundle.language;
    renderStaticCopy();
    renderQualityOptions(currentQualityPreference);
    updateStatus(currentStatusState);
    renderLauncherStatus(currentLauncherStatus);
  }

  async function resolveInitialLanguage() {
    return localeUtils.resolveCurrentLanguage(navigator.language);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "theme_update") {
      applyTheme(message.theme);
      return;
    }

    if (message.type === "connection_update") {
      updateStatus(normalizeConnectionState(message));
      return;
    }

    if (message.type === "language_update") {
      const nextLanguage = localeUtils.normalizeAppLanguage(message.language);
      if (nextLanguage) {
        void applyLanguage(nextLanguage);
      }
    }
  });

  window.addEventListener("beforeunload", () => {
    if (statusTimer !== null) {
      clearInterval(statusTimer);
      statusTimer = null;
    }
    if (launcherTimer !== null) {
      clearInterval(launcherTimer);
      launcherTimer = null;
    }
  });

  restoreLauncherButton.addEventListener("click", async () => {
    await sendRuntimeMessage({ type: "restore_launcher_for_site" });
    await checkLauncherStatus();
  });

  launcherToggleButton.addEventListener("click", async () => {
    const nextEnabled = launcherToggleButton.dataset.enabled !== "true";
    currentLauncherStatus = {
      ...(currentLauncherStatus || {}),
      enabled: nextEnabled,
      mounted: nextEnabled ? currentLauncherStatus?.mounted : false,
      visible: nextEnabled ? currentLauncherStatus?.visible : false,
    };
    renderLauncherStatus(currentLauncherStatus);
    await sendRuntimeMessage({ type: "set_launcher_enabled", enabled: nextEnabled });
    await checkLauncherStatus();
  });

  fallbackDownloadButton.addEventListener("click", async () => {
    await sendRuntimeMessage({ type: "download_current_content" });
    window.close();
  });

  void (async () => {
    await applyLanguage(await resolveInitialLanguage());

    try {
      currentQualityPreference = await directDownloadQuality.getQualityPreference();
      renderQualityOptions(currentQualityPreference);
    } catch (error) {
      console.error("[Ameow] Failed to load quality preference:", error);
    }

    chrome.runtime.sendMessage({ type: "connect" }, () => {
      if (chrome.runtime?.lastError) {
        return;
      }
    });
    void checkStatus();
    void checkLauncherStatus();

    const themeResponse = await sendRuntimeMessage({ type: "get_theme" });
    applyTheme(themeResponse?.theme || "black");

    statusTimer = window.setInterval(() => {
      void checkStatus();
    }, 1200);
    launcherTimer = window.setInterval(() => {
      void checkLauncherStatus();
    }, 1500);
  })();
});
