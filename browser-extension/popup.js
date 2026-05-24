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
    popupTitle: document.getElementById("popupTitle"),
    popupSubtitle: document.getElementById("popupSubtitle"),
    headerStatus: document.getElementById("headerStatus"),
    statusText: document.getElementById("statusText"),
    contextCard: document.getElementById("contextCard"),
    contextTitle: document.getElementById("contextTitle"),
    contextStatus: document.getElementById("contextStatus"),
    contextCounts: document.getElementById("contextCounts"),
    contextRestoreLauncherButton: document.getElementById("contextRestoreLauncherButton"),
    contextFallbackDownloadButton: document.getElementById("contextFallbackDownloadButton"),
    refreshMediaButton: document.getElementById("refreshMediaButton"),
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
    launcherToggleButton: document.getElementById("launcherToggleButton"),
    launcherToggleTitle: document.getElementById("launcherToggleTitle"),
    launcherToggleHint: document.getElementById("launcherToggleHint"),
    restoreLauncherButton: document.getElementById("restoreLauncherButton"),
    launcherSideLeft: document.getElementById("launcherSideLeft"),
    launcherSideRight: document.getElementById("launcherSideRight"),
    resetLauncherPositionButton: document.getElementById("resetLauncherPositionButton"),
    sitesSectionTitle: document.getElementById("sitesSectionTitle"),
    hiddenSitesCount: document.getElementById("hiddenSitesCount"),
    hiddenSitesList: document.getElementById("hiddenSitesList"),
    restoreAllSitesButton: document.getElementById("restoreAllSitesButton"),
  };

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
    elements.popupTitle.textContent = t("app.name", "Ameow");
    elements.popupSubtitle.textContent = t("popup.subtitle", "Extension");
    renderMediaTabs();
    elements.refreshMediaButton.textContent = t("popup.media.refresh", "Refresh");
    elements.refreshMediaButton.title = t("popup.media.refreshTitle", "Refresh current page media");
    elements.refreshMediaButton.setAttribute("aria-label", t("popup.media.refreshTitle", "Refresh current page media"));
    elements.qualitySectionTitle.textContent = t("popup.sections.quality", "Quality");
    elements.launcherSectionTitle.textContent = t("popup.sections.launcher", "Launcher");
    elements.launcherToggleTitle.textContent = t("launcher.popup.toggleTitle", "Edge launcher");
    elements.restoreLauncherButton.textContent = t("launcher.popup.restore", "Restore on this site");
    elements.contextRestoreLauncherButton.textContent = t("launcher.popup.restore", "Restore on this site");
    elements.contextFallbackDownloadButton.textContent = t("launcher.popup.fallback", "Download this page");
    elements.launcherSideLeft.textContent = t("popup.controls.side.left", "Left");
    elements.launcherSideRight.textContent = t("popup.controls.side.right", "Right");
    elements.resetLauncherPositionButton.textContent = t("popup.controls.resetPosition", "Reset");
    elements.sitesSectionTitle.textContent = t("popup.sections.hiddenSites", "Hidden sites");
    elements.restoreAllSitesButton.textContent = t("popup.sites.restoreAll", "Restore all");
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
  }

  async function checkStatus() {
    const response = await sendRuntimeMessage({ type: "get_status" });
    updateStatus(normalizeConnectionState(response));
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
      elements.launcherToggleButton.dataset.enabled = "true";
      elements.launcherToggleButton.setAttribute("aria-checked", "true");
      elements.launcherToggleHint.textContent = t("launcher.popup.toggleOn", "Show in pages");
      elements.restoreLauncherButton.hidden = true;
      elements.contextRestoreLauncherButton.hidden = true;
      elements.contextFallbackDownloadButton.hidden = true;
      elements.launcherStateText.textContent = t("launcher.status.checking", "Checking");
      renderSideButtons(config?.side);
      renderContextCard();
      return;
    }

    const enabled = status?.enabled !== false;
    const mounted = status?.mounted === true && status?.visible !== false;
    const hiddenForSite = status?.hiddenForSite === true;
    elements.launcherToggleButton.dataset.enabled = enabled ? "true" : "false";
    elements.launcherToggleButton.setAttribute("aria-checked", enabled ? "true" : "false");
    elements.launcherToggleHint.textContent = enabled
      ? t("launcher.popup.toggleOn", "Show in pages")
      : t("launcher.popup.toggleOff", "Hidden globally");
    elements.restoreLauncherButton.hidden = !enabled || !hiddenForSite;
    elements.contextRestoreLauncherButton.hidden = !enabled || !hiddenForSite;
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

    renderSideButtons(config?.side || status?.side);
    renderContextCard();
  }

  function renderSideButtons(side) {
    const normalizedSide = side === "left" ? "left" : "right";
    elements.launcherSideLeft.classList.toggle("active", normalizedSide === "left");
    elements.launcherSideRight.classList.toggle("active", normalizedSide === "right");
  }

  async function refreshLauncherControls() {
    const response = await sendRuntimeMessage({ type: "get_launcher_controls_state" });
    const status = response?.status || response;
    const config = response?.config || null;
    renderLauncherStatus(status, config);
    renderHiddenSites(config?.disabledSitePatterns || []);
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

  function renderHiddenSites(patterns) {
    const hiddenSites = Array.isArray(patterns) ? patterns.filter(Boolean) : [];
    elements.hiddenSitesCount.textContent = String(hiddenSites.length);
    elements.restoreAllSitesButton.hidden = hiddenSites.length === 0;
    elements.hiddenSitesList.innerHTML = "";

    if (hiddenSites.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ameow-media-empty";
      const mark = document.createElement("div");
      const title = document.createElement("div");
      const copy = document.createElement("div");
      mark.className = "ameow-empty-mark";
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = "ok";
      title.className = "ameow-empty-title";
      title.textContent = t("popup.sites.empty.title", "No hidden sites");
      copy.className = "ameow-empty-copy";
      copy.textContent = t("popup.sites.empty.copy", "Sites hidden from the launcher will appear here.");
      empty.append(mark, title, copy);
      elements.hiddenSitesList.appendChild(empty);
      return;
    }

    hiddenSites.forEach((pattern) => {
      const row = document.createElement("div");
      const mark = document.createElement("span");
      const host = document.createElement("span");
      const restore = document.createElement("button");

      row.className = "ameow-site-row";
      mark.className = "ameow-site-mark";
      mark.textContent = "x";
      host.className = "ameow-site-host";
      host.textContent = pattern;
      restore.type = "button";
      restore.className = "ameow-site-restore";
      restore.title = tt("popup.sites.restoreOne", { pattern }, `Restore ${pattern}`);
      restore.setAttribute("aria-label", tt("popup.sites.restoreOne", { pattern }, `Restore ${pattern}`));
      restore.addEventListener("click", async () => {
        await sendRuntimeMessage({ type: "restore_hidden_site", pattern });
        await refreshLauncherControls();
      });

      row.append(mark, host, restore);
      elements.hiddenSitesList.appendChild(row);
    });
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
    elements.contextRestoreLauncherButton.hidden = !(launcherEnabled && launcherHidden);
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
    elements.refreshMediaButton.textContent = t("popup.media.scanning", "Scanning");
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
    elements.refreshMediaButton.textContent = t("popup.media.refresh", "Refresh");
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

  window.addEventListener("click", closeRowMenus);
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
  const restoreLauncherForSite = async () => {
    await sendRuntimeMessage({ type: "restore_launcher_for_site" });
    await refreshLauncherControls();
  };
  elements.restoreLauncherButton.addEventListener("click", restoreLauncherForSite);
  elements.contextRestoreLauncherButton.addEventListener("click", restoreLauncherForSite);
  elements.launcherToggleButton.addEventListener("click", async () => {
    const nextEnabled = elements.launcherToggleButton.dataset.enabled !== "true";
    renderLauncherStatus({
      ...(currentLauncherStatus || {}),
      enabled: nextEnabled,
      mounted: nextEnabled ? currentLauncherStatus?.mounted : false,
      visible: nextEnabled ? currentLauncherStatus?.visible : false,
    }, currentLauncherConfig);
    await sendRuntimeMessage({ type: "set_launcher_enabled", enabled: nextEnabled });
    await refreshLauncherControls();
  });
  elements.contextFallbackDownloadButton.addEventListener("click", async () => {
    await sendRuntimeMessage({ type: "download_current_content" });
    window.close();
  });
  elements.launcherSideLeft.addEventListener("click", async () => {
    await sendRuntimeMessage({ type: "set_launcher_side", side: "left" });
    await refreshLauncherControls();
  });
  elements.launcherSideRight.addEventListener("click", async () => {
    await sendRuntimeMessage({ type: "set_launcher_side", side: "right" });
    await refreshLauncherControls();
  });
  elements.resetLauncherPositionButton.addEventListener("click", async () => {
    await sendRuntimeMessage({ type: "reset_launcher_position" });
    await refreshLauncherControls();
  });
  elements.restoreAllSitesButton.addEventListener("click", async () => {
    const count = currentLauncherConfig?.disabledSitePatterns?.length || 0;
    if (count > 0 && !window.confirm(tt(
      "popup.sites.restoreAllConfirm",
      { count },
      `Restore all ${count} hidden sites?`,
    ))) {
      return;
    }
    await sendRuntimeMessage({ type: "restore_all_hidden_sites" });
    await refreshLauncherControls();
  });

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
