// Ameow Browser Extension - Popup Script

const directDownloadQuality = window.AmeowDirectDownloadQuality;
const localeUtils = window.AmeowLocaleUtils;
const FALLBACK_LANGUAGE = localeUtils?.FALLBACK_LANGUAGE || "en";
const STATUS_STATE_CONNECTED = "connected";
const STATUS_STATE_CONNECTING = "connecting";
const STATUS_STATE_OFFLINE = "offline";
const REPOSITORY_URL = "https://github.com/Wutpeach/Ameow";
const GETTING_STARTED_URL = "https://github.com/Wutpeach/Ameow/blob/main/docs/getting-started.md";

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

function createExtensionPageUrl(path) {
  return chrome.runtime.getURL(path);
}

function openTab(url) {
  try {
    chrome.tabs.create({ url });
  } catch (error) {
    console.error("[Ameow] Failed to open tab:", error);
  }
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

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function shortHost(value) {
  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function sourceLabel(source, translate = null) {
  const labels = {
    direct_link: ["popup.media.sources.directLink", "link"],
    img_element: ["popup.media.sources.imageElement", "img"],
    open_graph: ["popup.media.sources.openGraph", "og"],
    performance_resource: ["popup.media.sources.performanceResource", "resource"],
    picture_source: ["popup.media.sources.pictureSource", "picture"],
    source_element: ["popup.media.sources.sourceElement", "source"],
    audio_element: ["popup.media.sources.audioElement", "audio"],
    video_element: ["popup.media.sources.videoElement", "video"],
    video_source: ["popup.media.sources.videoSource", "source"],
  };
  const label = labels[source];
  if (label) {
    return typeof translate === "function" ? translate(label[0], label[1]) : label[1];
  }
  return source || (typeof translate === "function" ? translate("popup.media.sources.source", "source") : "source");
}

function ageBucket(ageMs) {
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return null;
  }
  const seconds = Math.round(ageMs / 1000);
  if (seconds < 60) {
    return { unit: "seconds", count: seconds };
  }
  return { unit: "minutes", count: Math.round(seconds / 60) };
}

document.addEventListener("DOMContentLoaded", () => {
  const elements = {
    headerStatus: document.getElementById("headerStatus"),
    statusText: document.getElementById("statusText"),
    contextCard: document.getElementById("contextCard"),
    contextTitle: document.getElementById("contextTitle"),
    contextStatus: document.getElementById("contextStatus"),
    contextCounts: document.getElementById("contextCounts"),
    contextFallbackDownloadButton: document.getElementById("contextFallbackDownloadButton"),
    loginStatePanel: document.getElementById("loginStatePanel"),
    loginStateIcon: document.getElementById("loginStateIcon"),
    loginStateLabel: document.getElementById("loginStateLabel"),
    loginStateTitle: document.getElementById("loginStateTitle"),
    loginStateHint: document.getElementById("loginStateHint"),
    loginStateButton: document.getElementById("loginStateButton"),
    refreshMediaButton: document.getElementById("refreshMediaButton"),
    refreshMediaText: document.getElementById("refreshMediaText"),
    mediaTabs: Array.from(document.querySelectorAll(".ameow-media-tab")),
    mediaSummary: document.getElementById("mediaSummary"),
    mediaList: document.getElementById("mediaList"),
    mediaEmpty: document.getElementById("mediaEmpty"),
    mediaEmptyTitle: document.getElementById("mediaEmptyTitle"),
    mediaEmptyCopy: document.getElementById("mediaEmptyCopy"),
    qualityGrid: document.getElementById("qualityGrid"),
    qualitySummaryText: document.getElementById("qualitySummaryText"),
    highestQualityHint: document.getElementById("highestQualityHint"),
    highestQualityHintText: document.getElementById("highestQualityHintText"),
    qualitySectionTitle: document.getElementById("qualitySectionTitle"),
    launcherSectionTitle: document.getElementById("launcherSectionTitle"),
    launcherStateText: document.getElementById("launcherStateText"),
    hiddenSitesCount: document.getElementById("hiddenSitesCount"),
    launcherSettingsButton: document.getElementById("launcherSettingsButton"),
    launcherSettingsText: document.getElementById("launcherSettingsText"),
    openOptionsButton: document.getElementById("openOptionsButton"),
    footerSettingsText: document.getElementById("footerSettingsText"),
    popupVersion: document.getElementById("popupVersion"),
    moreMenuButton: document.getElementById("moreMenuButton"),
    footerMoreText: document.getElementById("footerMoreText"),
    moreMenu: document.getElementById("moreMenu"),
    repositoryLinkButton: document.getElementById("repositoryLinkButton"),
    gettingStartedLinkButton: document.getElementById("gettingStartedLinkButton"),
  };

  let statusTimer = null;
  let launcherTimer = null;
  let currentBundle = {
    language: FALLBACK_LANGUAGE,
    common: {},
    extension: {},
  };
  let currentStatusState = STATUS_STATE_OFFLINE;
  let currentSiteSessionStatus = null;
  let loginStateBusy = false;
  let currentQualityPreference = directDownloadQuality.DEFAULT_QUALITY_PREFERENCE;
  let currentLauncherStatus = null;
  let currentLauncherConfig = null;
  let currentMediaType = "video";
  let mediaScanResult = null;
  let scanStarted = false;
  let scanInProgress = false;
  let currentPageTitle = "";
  let currentPageUrl = "";
  let openMenuId = null;
  const downloadCooldown = new Set();

  function t(key, fallback) {
    return localeUtils?.translate(currentBundle, key, fallback) || fallback || key;
  }

  function tt(key, values, fallback) {
    return localeUtils?.translateTemplate(currentBundle, key, values, fallback) || fallback || key;
  }

  function openOptionsPage() {
    openTab(createExtensionPageUrl("options.html"));
  }

  function openExternalLink(url) {
    closeMoreMenu();
    openTab(url);
  }

  function setMoreMenuOpen(open) {
    elements.moreMenu.dataset.open = open ? "true" : "false";
    elements.moreMenuButton.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function closeMoreMenu() {
    setMoreMenuOpen(false);
  }

  function toggleMoreMenu() {
    setMoreMenuOpen(elements.moreMenu.dataset.open !== "true");
  }

  function formatAge(ageMs) {
    const bucket = ageBucket(ageMs);
    if (!bucket) {
      return "";
    }
    return tt(
      bucket.unit === "seconds" ? "popup.media.age.seconds" : "popup.media.age.minutes",
      { count: bucket.count },
      bucket.unit === "seconds" ? `${bucket.count}s ago` : `${bucket.count}m ago`,
    );
  }

  function renderStaticCopy() {
    renderMediaTabs();
    elements.loginStateLabel.textContent = t("popup.sections.loginState", "Login state");
    elements.refreshMediaText.textContent = t("popup.media.refresh", "Refresh");
    elements.refreshMediaButton.title = t("popup.media.refreshTitle", "Refresh current page media");
    elements.refreshMediaButton.setAttribute("aria-label", t("popup.media.refreshTitle", "Refresh current page media"));
    elements.qualitySectionTitle.textContent = t("popup.sections.quality", "Quality");
    elements.launcherSectionTitle.textContent = t("popup.sections.launcher", "Launcher");
    elements.contextFallbackDownloadButton.textContent = t("launcher.popup.fallback", "Download this page");
    elements.launcherSettingsText.textContent = t("popup.footer.settings", "Settings");
    elements.footerSettingsText.textContent = t("popup.footer.settings", "Settings");
    elements.openOptionsButton.title = t("popup.footer.openSettings", "Open settings");
    elements.openOptionsButton.setAttribute("aria-label", t("popup.footer.openSettings", "Open settings"));
    elements.footerMoreText.textContent = t("popup.footer.more", "More");
    elements.moreMenuButton.setAttribute("aria-label", t("popup.footer.more", "More"));
    elements.repositoryLinkButton.textContent = t("popup.footer.repository", "GitHub repository");
    elements.gettingStartedLinkButton.textContent = t("popup.footer.gettingStarted", "Getting started");
    elements.popupVersion.textContent = `v${chrome.runtime.getManifest().version}`;
    document.title = t("app.name", "Ameow");
  }

  function pageHost(value) {
    try {
      return new URL(value).hostname.replace(/^www\./i, "");
    } catch {
      return "";
    }
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
    elements.headerStatus.dataset.state = nextState;
    elements.headerStatus.title = copy.hint;
    elements.statusText.textContent = copy.label;
    renderContextCard();
    renderLoginStatePanel();
  }

  async function checkStatus() {
    const response = await sendRuntimeMessage({ type: "get_status" });
    currentSiteSessionStatus = response?.siteSession || null;
    updateStatus(normalizeConnectionState(response));
  }

  function currentSiteSessionName() {
    const site = currentSiteSessionStatus?.currentSiteSession;
    return safeText(site?.displayName, site?.siteId || shortHost(currentSiteSessionStatus?.currentTabUrl));
  }

  function renderLoginStateIcon(site, fallbackLabel) {
    const icons = globalThis.AmeowSiteSessionIcons;
    const knownKey = icons?.resolveKnownIconKey?.(site) || null;
    const path = knownKey ? icons?.KNOWN_ICON_PATHS?.[knownKey] : null;
    if (path) {
      elements.loginStateIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" focusable="false" aria-hidden="true"><path d="${path}"></path></svg>`;
      return;
    }
    elements.loginStateIcon.textContent = icons?.placeholderLabel?.(fallbackLabel) || "?";
  }

  function renderLoginStatePanel(feedback = null) {
    const siteSession = currentSiteSessionStatus || {};
    const site = siteSession.currentSiteSession || null;
    const pageHost = shortHost(siteSession.currentTabUrl);
    const connected = currentStatusState === STATUS_STATE_CONNECTED;
    const canSync = connected && siteSession.canSyncCurrentSite === true && site;
    const canEnable = connected && siteSession.canEnableCurrentSite === true;
    const shouldShow = Boolean(canSync || canEnable || feedback);

    elements.loginStatePanel.hidden = !shouldShow;
    if (!shouldShow) {
      return;
    }

    const siteName = currentSiteSessionName();
    renderLoginStateIcon(site, site?.displayName || site?.siteId || pageHost);
    elements.loginStatePanel.dataset.state = feedback?.tone || (canSync ? "sync" : "enable");
    elements.loginStateTitle.textContent = feedback?.title || (
      canSync
        ? tt("popup.loginState.syncTitle", { site: siteName }, `Sync ${siteName}`)
        : tt("popup.loginState.enableTitle", { host: pageHost }, `Enable ${pageHost}`)
    );
    elements.loginStateHint.textContent = feedback?.hint || (
      canSync
        ? t("popup.loginState.syncHint", "Use this browser's login cookies for future downloads.")
        : t("popup.loginState.enableHint", "Allow Ameow to use cookies for this exact host.")
    );
    elements.loginStateButton.textContent = loginStateBusy
      ? t("popup.loginState.working", "Syncing")
      : canSync
        ? t("popup.loginState.syncButton", "Sync")
        : t("popup.loginState.enableButton", "Enable");
    elements.loginStateButton.disabled = loginStateBusy || (!canSync && !canEnable);
  }

  function mediaTabLabel(mediaType) {
    const fallback = mediaType === "audio" ? "Audio" : mediaType === "image" ? "Image" : "Video";
    return t(`popup.media.tabs.${mediaType}`, fallback);
  }

  function renderMediaTabs() {
    const counts = mediaCounts();
    elements.mediaTabs.forEach((button) => {
      const mediaType = button.dataset.mediaType || "video";
      button.textContent = `${mediaTabLabel(mediaType)} ${counts[mediaType] || 0}`;
    });
  }

  function setMediaType(mediaType) {
    currentMediaType = mediaType === "audio" || mediaType === "image" ? mediaType : "video";
    elements.mediaTabs.forEach((button) => {
      button.classList.toggle("active", button.dataset.mediaType === currentMediaType);
    });
    renderMediaTabs();
    renderMediaState();
  }

  function renderLauncherStatus(status, config = currentLauncherConfig) {
    currentLauncherStatus = status;
    currentLauncherConfig = config || currentLauncherConfig;

    if (!status) {
      elements.contextFallbackDownloadButton.hidden = true;
      elements.launcherStateText.textContent = t("launcher.status.checking", "Checking");
      renderHiddenSites(config?.disabledSitePatterns || [], false);
      renderContextCard();
      return;
    }

    const enabled = status?.enabled !== false;
    const mounted = status?.mounted === true && status?.visible !== false;
    const hiddenForSite = status?.hiddenForSite === true;
    elements.contextFallbackDownloadButton.hidden = mounted || !enabled;

    if (!enabled) {
      elements.launcherStateText.textContent = t("launcher.status.disabled", "Hidden");
    } else if (mounted) {
      elements.launcherStateText.textContent = t("launcher.status.visible", "Visible");
    } else if (hiddenForSite) {
      elements.launcherStateText.textContent = t("launcher.status.hidden", "Hidden here");
    } else {
      elements.launcherStateText.textContent = t("launcher.status.unavailable", "Unavailable");
    }

    renderHiddenSites(config?.disabledSitePatterns || [], hiddenForSite);
    renderContextCard();
  }

  async function refreshLauncherControls() {
    const response = await sendRuntimeMessage({ type: "get_launcher_controls_state" });
    const status = response?.status || response;
    const config = response?.config || null;
    renderLauncherStatus(status, config);
  }

  function renderQualityOptions(selectedValue) {
    const normalizedSelectedValue = directDownloadQuality.normalizeQualityPreference(selectedValue);
    currentQualityPreference = normalizedSelectedValue;
    elements.qualityGrid.innerHTML = "";

    directDownloadQuality.QUALITY_PREFERENCE_OPTIONS.forEach((option) => {
      const button = document.createElement("button");
      const label = document.createElement("span");

      button.type = "button";
      button.className = "ameow-quality-btn";
      button.dataset.quality = option.value;
      if (option.value === normalizedSelectedValue) {
        button.classList.add("active");
        elements.qualitySummaryText.textContent = t(option.labelKey, option.value);
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

      elements.qualityGrid.appendChild(button);
    });

    renderHighestQualityHint(normalizedSelectedValue);
  }

  function renderHighestQualityHint(selectedValue) {
    const normalizedSelectedValue = directDownloadQuality.normalizeQualityPreference(selectedValue);
    const hintVisible = normalizedSelectedValue === "best";
    elements.highestQualityHintText.textContent = t(
      "popup.preferences.highest.hint",
      "Some high-quality videos may enter the transcode queue after download.",
    );
    elements.highestQualityHint.dataset.visible = hintVisible ? "true" : "false";
    elements.highestQualityHint.hidden = !hintVisible;
    elements.highestQualityHint.setAttribute("aria-hidden", hintVisible ? "false" : "true");
    elements.highestQualityHint.style.display = hintVisible ? "flex" : "none";
  }

  function renderHiddenSites(patterns, hiddenForSite = false) {
    const hiddenSites = Array.isArray(patterns) ? patterns.filter(Boolean) : [];
    if (hiddenForSite) {
      elements.hiddenSitesCount.textContent = t("popup.sites.hiddenHere", "Hidden here");
      return;
    }
    elements.hiddenSitesCount.textContent = tt(
      "popup.sites.count",
      { count: hiddenSites.length },
      `${hiddenSites.length} hidden sites`,
    );
  }

  function mediaCounts() {
    return {
      video: mediaScanResult?.videos?.length || 0,
      audio: mediaScanResult?.audios?.length || 0,
      image: mediaScanResult?.images?.length || 0,
    };
  }

  function formatMediaCounts() {
    const counts = mediaCounts();
    return tt(
      "popup.media.summary.counts",
      { videoCount: counts.video, audioCount: counts.audio, imageCount: counts.image },
      `${counts.video} video / ${counts.audio} audio / ${counts.image} image`,
    );
  }

  function renderContextCard() {
    const host = pageHost(mediaScanResult?.pageUrl || currentPageUrl);
    const title = host || safeText(mediaScanResult?.pageTitle, safeText(currentPageTitle, t("popup.context.thisPage", "This page")));
    const statusCopy = getStatusCopy(currentStatusState);
    const launcherState = currentLauncherStatus || {};
    const launcherEnabled = launcherState.enabled !== false;
    const launcherMounted = launcherState.mounted === true && launcherState.visible !== false;
    const launcherHidden = launcherState.hiddenForSite === true;
    const scanUnavailable = mediaScanResult?.success === false;

    elements.contextTitle.textContent = title;
    elements.contextCounts.textContent = formatMediaCounts();
    elements.contextFallbackDownloadButton.hidden = launcherMounted || !launcherEnabled || mediaScanResult?.reason === "scan_restricted_page";
    elements.refreshMediaButton.disabled = scanInProgress;

    if (scanUnavailable) {
      elements.contextCard.dataset.state = "unavailable";
      elements.contextStatus.textContent = t("popup.context.scanUnavailable", "Cannot scan this page");
      return;
    }

    if (currentStatusState === STATUS_STATE_OFFLINE) {
      elements.contextCard.dataset.state = "offline";
      elements.contextStatus.textContent = t("popup.context.offline", "Desktop app required for downloads");
      return;
    }

    if (scanInProgress && mediaScanResult) {
      elements.contextCard.dataset.state = "scanning";
      elements.contextStatus.textContent = t("popup.context.refreshing", "Refreshing media resources");
      return;
    }

    if (scanInProgress) {
      elements.contextCard.dataset.state = "scanning";
      elements.contextStatus.textContent = t("popup.context.scanning", "Scanning media resources");
      return;
    }

    if (launcherHidden) {
      elements.contextCard.dataset.state = "hidden";
      elements.contextStatus.textContent = t("popup.context.launcherHidden", "Launcher hidden on this site");
      return;
    }

    if (!launcherEnabled) {
      elements.contextCard.dataset.state = "disabled";
      elements.contextStatus.textContent = t("popup.context.launcherDisabled", "Launcher hidden globally");
      return;
    }

    if (launcherMounted) {
      elements.contextCard.dataset.state = "ready";
      elements.contextStatus.textContent = t("popup.context.launcherActive", "Launcher active");
      return;
    }

    elements.contextCard.dataset.state = currentStatusState;
    elements.contextStatus.textContent = statusCopy.hint;
  }

  function renderMediaState() {
    closeRowMenus();
    const candidates = Array.isArray(mediaScanResult?.[`${currentMediaType}s`])
      ? mediaScanResult[`${currentMediaType}s`]
      : [];
    elements.mediaList.innerHTML = "";
    renderMediaTabs();

    if (!scanStarted && !mediaScanResult) {
      elements.mediaList.dataset.visible = "false";
      elements.mediaEmpty.style.display = "flex";
      elements.mediaEmptyTitle.textContent = t("popup.media.empty.scanning.title", "Scanning");
      elements.mediaEmptyCopy.textContent = t("popup.media.empty.scanning.copy", "Checking the active page for media resources.");
      elements.mediaSummary.textContent = t("popup.media.summary.scanning", "Scanning current page");
      renderContextCard();
      return;
    }

    if (mediaScanResult?.success === false) {
      elements.mediaList.dataset.visible = "false";
      elements.mediaEmpty.style.display = "flex";
      elements.mediaEmptyTitle.textContent = t("popup.media.empty.unavailable.title", "Cannot scan this page");
      elements.mediaEmptyCopy.textContent = mediaScanResult.reason || t("popup.media.empty.unavailable.copy", "The active page is unavailable to the extension.");
      elements.mediaSummary.textContent = t("popup.media.summary.unavailable", "Scan unavailable");
      renderContextCard();
      return;
    }

    const ageCopy = formatAge(Date.now() - Number(mediaScanResult?.scannedAt || Date.now()));
    const ageSuffix = ageCopy ? ` / ${ageCopy}` : "";
    elements.mediaSummary.textContent = tt(
      "popup.media.summary.results",
      {
        videoCount: mediaCounts().video,
        audioCount: mediaCounts().audio,
        imageCount: mediaCounts().image,
        age: ageSuffix,
      },
      `${formatMediaCounts()}${ageSuffix}`,
    );

    if (candidates.length === 0) {
      elements.mediaList.dataset.visible = "false";
      elements.mediaEmpty.style.display = "flex";
      const emptyTitleKey = currentMediaType === "audio"
        ? "popup.media.empty.audio.title"
        : currentMediaType === "image"
          ? "popup.media.empty.image.title"
          : "popup.media.empty.video.title";
      const emptyTitleFallback = currentMediaType === "audio"
        ? "No audio found"
        : currentMediaType === "image"
          ? "No images found"
          : "No videos found";
      elements.mediaEmptyTitle.textContent = t(emptyTitleKey, emptyTitleFallback);
      elements.mediaEmptyCopy.textContent = t("popup.media.empty.none.copy", "Try another media type or refresh after the page finishes loading.");
      renderContextCard();
      return;
    }

    elements.mediaEmpty.style.display = "none";
    elements.mediaList.dataset.visible = "true";
    candidates.forEach((candidate) => {
      elements.mediaList.appendChild(createMediaRow(candidate));
    });
    renderContextCard();
  }

  function createMediaRow(candidate) {
    const row = document.createElement("div");
    const preview = document.createElement("span");
    const main = document.createElement("div");
    const title = document.createElement("div");
    const meta = document.createElement("div");
    const menuButton = document.createElement("button");
    const menu = document.createElement("div");

    const id = safeText(candidate.id, `${candidate.mediaType}-${Math.random().toString(16).slice(2)}`);
    row.className = "ameow-media-row";
    row.dataset.candidateId = id;
    preview.className = "ameow-media-preview";
    preview.dataset.type = candidate.mediaType === "audio" || candidate.mediaType === "image"
      ? candidate.mediaType
      : "video";
    preview.textContent = candidate.mediaType === "audio"
      ? t("popup.media.type.audioShort", "AUD")
      : candidate.mediaType === "image"
        ? t("popup.media.type.imageShort", "IMG")
        : t("popup.media.type.videoShort", "VID");
    if (candidate.previewUrl) {
      const image = document.createElement("img");
      image.src = candidate.previewUrl;
      image.alt = "";
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
      image.addEventListener("load", () => {
        preview.dataset.hasPreview = "true";
      }, { once: true });
      image.addEventListener("error", () => {
        image.remove();
        preview.dataset.hasPreview = "false";
      }, { once: true });
      preview.appendChild(image);
    }

    main.className = "ameow-media-row-main";
    title.className = "ameow-media-title";
    title.textContent = safeText(candidate.title, candidate.url);
    meta.className = "ameow-media-meta";
    meta.textContent = [
      candidate.host || shortHost(candidate.url),
      sourceLabel(candidate.source, t),
      candidate.extension || candidate.type,
      candidate.duration ? `${candidate.duration}s` : "",
      candidate.width && candidate.height ? `${candidate.width}x${candidate.height}` : "",
    ].filter(Boolean).join(" / ");
    main.append(title, meta);

    menuButton.type = "button";
    menuButton.className = "ameow-row-menu-btn";
    menuButton.textContent = "...";
    menuButton.setAttribute("aria-label", t("popup.media.actions.open", "Candidate actions"));
    menuButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const nextOpen = openMenuId !== id;
      closeRowMenus();
      if (nextOpen) {
        openMenuId = id;
        menuButton.dataset.open = "true";
        menu.dataset.open = "true";
      }
    });

    menu.className = "ameow-row-menu";
    menu.append(
      createMenuItem(t("popup.media.actions.download", "Download"), () => downloadCandidate(candidate, row)),
      createMenuItem(t("popup.media.actions.copy", "Copy link"), () => copyCandidateLink(candidate, row)),
      createMenuItem(t("popup.media.actions.source", "View source"), () => showCandidateSource(candidate, row)),
    );

    row.append(preview, main, menuButton, menu);
    return row;
  }

  function createMenuItem(label, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ameow-menu-item";
    button.textContent = label;
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      closeRowMenus();
      await onClick();
    });
    return button;
  }

  function closeRowMenus() {
    openMenuId = null;
    document.querySelectorAll(".ameow-row-menu").forEach((menu) => {
      menu.dataset.open = "false";
    });
    document.querySelectorAll(".ameow-row-menu-btn").forEach((button) => {
      button.dataset.open = "false";
    });
  }

  function setRowFeedback(row, message) {
    const meta = row?.querySelector(".ameow-media-meta");
    if (!meta) {
      return;
    }
    const previous = meta.textContent;
    meta.textContent = message;
    window.setTimeout(() => {
      meta.textContent = previous;
    }, 1600);
  }

  async function downloadCandidate(candidate, row) {
    const key = candidate.url;
    if (downloadCooldown.has(key)) {
      return;
    }
    downloadCooldown.add(key);
    setRowFeedback(row, t("popup.media.feedback.submitting", "Submitting"));
    const response = await sendRuntimeMessage({
      type: "download_media_candidate",
      candidate,
    });
    setRowFeedback(row, response?.success
      ? t("popup.media.feedback.submitted", "Submitted")
      : (response?.connected === false
        ? t("popup.media.feedback.offline", "Desktop offline")
        : t("popup.media.feedback.failed", "Failed")));
    window.setTimeout(() => downloadCooldown.delete(key), 700);
  }

  async function copyCandidateLink(candidate, row) {
    try {
      await navigator.clipboard.writeText(candidate.url);
      setRowFeedback(row, t("popup.media.feedback.copied", "Copied"));
    } catch {
      const input = document.createElement("textarea");
      input.value = candidate.url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
      setRowFeedback(row, t("popup.media.feedback.copied", "Copied"));
    }
  }

  function showCandidateSource(candidate, row) {
    setRowFeedback(row, `${sourceLabel(candidate.source, t)} / ${shortHost(candidate.url)}`);
  }

  async function scanPageMedia() {
    if (scanInProgress) {
      return;
    }
    scanStarted = true;
    scanInProgress = true;
    elements.refreshMediaButton.disabled = true;
    elements.refreshMediaButton.dataset.scanning = "true";
    elements.refreshMediaText.textContent = t("popup.media.scanning", "Scanning");
    elements.refreshMediaButton.title = t("popup.media.scanning", "Scanning");
    elements.refreshMediaButton.setAttribute("aria-label", t("popup.media.scanning", "Scanning"));
    if (!mediaScanResult) {
      elements.mediaList.dataset.visible = "false";
      elements.mediaEmpty.style.display = "flex";
      elements.mediaEmptyTitle.textContent = t("popup.media.empty.scanning.title", "Scanning");
      elements.mediaEmptyCopy.textContent = t("popup.media.empty.scanning.copy", "Checking the active page for media resources.");
      elements.mediaSummary.textContent = t("popup.media.summary.scanning", "Scanning current page");
    }
    renderContextCard();

    const response = await sendRuntimeMessage({ type: "scan_page_media" });
    mediaScanResult = response && typeof response === "object"
      ? response
      : { success: false, reason: "scan_failed" };
    currentPageUrl = mediaScanResult.pageUrl || currentPageUrl;
    currentPageTitle = mediaScanResult.pageTitle || currentPageTitle;
    scanInProgress = false;
    elements.refreshMediaButton.disabled = false;
    elements.refreshMediaButton.dataset.scanning = "false";
    elements.refreshMediaText.textContent = t("popup.media.refresh", "Refresh");
    elements.refreshMediaButton.title = t("popup.media.refreshTitle", "Refresh current page media");
    elements.refreshMediaButton.setAttribute("aria-label", t("popup.media.refreshTitle", "Refresh current page media"));
    renderMediaState();
  }

  async function loadMediaCache() {
    const response = await sendRuntimeMessage({ type: "get_media_scan_cache" });
    currentPageUrl = response?.pageUrl || currentPageUrl;
    currentPageTitle = response?.pageTitle || currentPageTitle;
    if (response?.cached && response.result && response.stale !== true) {
      scanStarted = true;
      mediaScanResult = response.result;
      renderMediaState();
      return;
    }
    renderMediaState();
  }

  async function applyLanguage(nextLanguage) {
    currentBundle = await localeUtils.loadLocaleBundle(nextLanguage);
    document.documentElement.lang = currentBundle.language;
    renderStaticCopy();
    renderQualityOptions(currentQualityPreference);
    updateStatus(currentStatusState);
    renderLoginStatePanel();
    renderLauncherStatus(currentLauncherStatus, currentLauncherConfig);
    renderMediaState();
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

    if (message.type === "site_session_registry_update") {
      void checkStatus();
      return;
    }

    if (message.type === "language_update") {
      const nextLanguage = localeUtils.normalizeAppLanguage(message.language);
      if (nextLanguage) {
        void applyLanguage(nextLanguage);
      }
    }
  });

  if (chrome?.storage?.onChanged && directDownloadQuality) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") {
        return;
      }
      const changedValue =
        changes?.[directDownloadQuality.STORAGE_KEY]?.newValue
        ?? changes?.[directDownloadQuality.LEGACY_STORAGE_KEY]?.newValue;
      if (typeof changedValue !== "string") {
        return;
      }
      currentQualityPreference = directDownloadQuality.normalizeQualityPreference(changedValue);
      renderQualityOptions(currentQualityPreference);
    });
  }

  window.addEventListener("click", () => {
    closeRowMenus();
    closeMoreMenu();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeRowMenus();
      closeMoreMenu();
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

  elements.mediaTabs.forEach((button) => {
    button.addEventListener("click", () => setMediaType(button.dataset.mediaType || "video"));
  });
  elements.refreshMediaButton.addEventListener("click", () => {
    void scanPageMedia();
  });
  elements.contextFallbackDownloadButton.addEventListener("click", async () => {
    await sendRuntimeMessage({ type: "download_current_content" });
    window.close();
  });
  elements.loginStateButton.addEventListener("click", async () => {
    if (loginStateBusy) {
      return;
    }
    const canSync = currentSiteSessionStatus?.canSyncCurrentSite === true;
    const canEnable = currentSiteSessionStatus?.canEnableCurrentSite === true;
    if (!canSync && !canEnable) {
      return;
    }

    loginStateBusy = true;
    renderLoginStatePanel();
    const response = await sendRuntimeMessage({
      type: canSync ? "sync_current_site_session" : "enable_current_site_session",
    });
    loginStateBusy = false;

    if (response?.success) {
      renderLoginStatePanel({
        tone: "success",
        title: t("popup.loginState.syncedTitle", "Login state synced"),
        hint: t("popup.loginState.syncedHint", "Ameow saved cookies for future downloads."),
      });
      window.setTimeout(() => {
        void checkStatus();
      }, 900);
      return;
    }

    renderLoginStatePanel({
      tone: "error",
      title: t("popup.loginState.failedTitle", "Sync failed"),
      hint: response?.connected === false
        ? t("popup.loginState.offlineHint", "Open the desktop app, then try again.")
        : t("popup.loginState.failedHint", "Log in to this site in the browser, then retry."),
    });
  });
  elements.launcherSettingsButton.addEventListener("click", openOptionsPage);
  elements.openOptionsButton.addEventListener("click", openOptionsPage);
  elements.moreMenuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMoreMenu();
  });
  elements.repositoryLinkButton.addEventListener("click", () => openExternalLink(REPOSITORY_URL));
  elements.gettingStartedLinkButton.addEventListener("click", () => openExternalLink(GETTING_STARTED_URL));

  void (async () => {
    setMediaType("video");
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
    void refreshLauncherControls();
    void (async () => {
      await loadMediaCache();
      void scanPageMedia();
    })();

    const themeResponse = await sendRuntimeMessage({ type: "get_theme" });
    applyTheme(themeResponse?.theme || "black");

    statusTimer = window.setInterval(() => {
      void checkStatus();
    }, 1200);
    launcherTimer = window.setInterval(() => {
      void refreshLauncherControls();
    }, 1500);
  })();
});
