// Ameow Browser Extension - Popup Script

const directDownloadQuality = window.AmeowDirectDownloadQuality;
const downloadCapabilityUtils = window.AmeowDownloadCapabilityUtils;
const localeUtils = window.AmeowLocaleUtils;
const FALLBACK_LANGUAGE = localeUtils?.FALLBACK_LANGUAGE || "en";
const STATUS_STATE_CONNECTED = "connected";
const STATUS_STATE_CONNECTING = "connecting";
const STATUS_STATE_OFFLINE = "offline";
const REPOSITORY_URL = "https://github.com/Wutpeach/Ameow";
const DOCS_SITE_URL = "https://wutpeach.github.io/Ameow";

function getGettingStartedUrl(language = FALLBACK_LANGUAGE) {
  const normalized = typeof language === "string" ? language.trim().toLowerCase() : "";
  const localePrefix = normalized.startsWith("zh") ? "" : "/en";
  return `${DOCS_SITE_URL}${localePrefix}/docs/getting-started/`;
}

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
    current_page: ["popup.media.sources.currentPage", "page"],
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
    mediaPreviewSlot: document.getElementById("mediaPreviewSlot"),
    mediaList: document.getElementById("mediaList"),
    mediaEmpty: document.getElementById("mediaEmpty"),
    mediaEmptyTitle: document.getElementById("mediaEmptyTitle"),
    mediaEmptyCopy: document.getElementById("mediaEmptyCopy"),
    qualityGrid: document.getElementById("qualityGrid"),
    qualitySummaryText: document.getElementById("qualitySummaryText"),
    highestQualityHint: document.getElementById("highestQualityHint"),
    highestQualityHintText: document.getElementById("highestQualityHintText"),
    qualitySectionTitle: document.getElementById("qualitySectionTitle"),
    openOptionsButton: document.getElementById("openOptionsButton"),
    footerSettingsIcon: document.getElementById("footerSettingsIcon"),
    footerStatusDot: document.getElementById("footerStatusDot"),
    footerSettingsText: document.getElementById("footerSettingsText"),
    popupVersion: document.getElementById("popupVersion"),
    moreMenuButton: document.getElementById("moreMenuButton"),
    footerMoreText: document.getElementById("footerMoreText"),
    moreMenu: document.getElementById("moreMenu"),
    repositoryLinkButton: document.getElementById("repositoryLinkButton"),
    gettingStartedLinkButton: document.getElementById("gettingStartedLinkButton"),
    imageLightbox: document.getElementById("imageLightbox"),
    imageLightboxBackdrop: document.getElementById("imageLightboxBackdrop"),
    imageLightboxClose: document.getElementById("imageLightboxClose"),
    imageLightboxImage: document.getElementById("imageLightboxImage"),
    imageLightboxCaption: document.getElementById("imageLightboxCaption"),
  };

  let statusTimer = null;
  let currentBundle = {
    language: FALLBACK_LANGUAGE,
    common: {},
    extension: {},
  };
  let currentStatusState = STATUS_STATE_OFFLINE;
  let currentSiteSessionStatus = null;
  let loginStateBusy = false;
  let currentQualityPreference = directDownloadQuality.DEFAULT_QUALITY_PREFERENCE;
  let currentMediaType = "video";
  let mediaScanResult = null;
  let scanStarted = false;
  let scanInProgress = false;
  let openMenuId = null;
  let activeVideoPreviewId = null;
  let activeAudioPreviewId = null;
  let activeImagePreviewId = null;
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
    elements.footerMoreText.textContent = t("popup.footer.more", "More");
    elements.moreMenuButton.setAttribute("aria-label", t("popup.footer.more", "More"));
    elements.repositoryLinkButton.textContent = t("popup.footer.repository", "GitHub repository");
    elements.gettingStartedLinkButton.textContent = t("popup.footer.gettingStarted", "Getting started");
    elements.popupVersion.textContent = `v${chrome.runtime.getManifest().version}`;
    renderFooterStatus();
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
    renderFooterStatus();
    renderLoginStatePanel();
  }

  function renderFooterStatus() {
    const connected = currentStatusState === STATUS_STATE_CONNECTED;
    const copy = getStatusCopy(currentStatusState);
    const settingsLabel = t("popup.footer.settings", "Settings");
    const settingsTitle = t("popup.footer.openSettings", "Open settings");

    elements.openOptionsButton.dataset.state = connected ? "settings" : currentStatusState;
    elements.footerSettingsIcon.hidden = !connected;
    elements.footerStatusDot.hidden = connected;
    elements.footerStatusDot.dataset.state = currentStatusState;
    elements.footerSettingsText.textContent = connected ? settingsLabel : copy.label;
    elements.openOptionsButton.title = connected ? settingsTitle : copy.hint;
    elements.openOptionsButton.setAttribute(
      "aria-label",
      connected ? settingsTitle : `${copy.label}. ${copy.hint}`,
    );
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
    const siteName = currentSiteSessionName();

    renderLoginStateIcon(site, site?.displayName || site?.siteId || pageHost);

    if (feedback) {
      elements.loginStatePanel.dataset.state = feedback.tone || "sync";
      elements.loginStateTitle.textContent = feedback.title;
      elements.loginStateHint.textContent = feedback.hint;
    } else if (loginStateBusy) {
      elements.loginStatePanel.dataset.state = "working";
      elements.loginStateTitle.textContent = t("popup.loginState.workingTitle", "Syncing login state");
      elements.loginStateHint.textContent = siteName || t("popup.loginState.workingHint", "Saving browser cookies for downloads.");
    } else if (!connected) {
      elements.loginStatePanel.dataset.state = "offline";
      elements.loginStateTitle.textContent = t("popup.loginState.offlineTitle", "Desktop offline");
      elements.loginStateHint.textContent = t("popup.loginState.offlineHint", "Open the desktop app, then try again.");
    } else if (canSync) {
      elements.loginStatePanel.dataset.state = "sync";
      elements.loginStateTitle.textContent = tt("popup.loginState.syncTitle", { site: siteName }, `Sync ${siteName}`);
      elements.loginStateHint.textContent = t("popup.loginState.syncHint", "Use this browser's login cookies for future downloads.");
    } else if (canEnable) {
      elements.loginStatePanel.dataset.state = "enable";
      elements.loginStateTitle.textContent = tt("popup.loginState.enableTitle", { host: pageHost }, `Enable ${pageHost}`);
      elements.loginStateHint.textContent = t("popup.loginState.enableHint", "Allow Ameow to use cookies for this exact host.");
    } else {
      elements.loginStatePanel.dataset.state = "unavailable";
      elements.loginStateTitle.textContent = t("popup.loginState.unavailableTitle", "Unavailable");
      elements.loginStateHint.textContent = t("popup.loginState.unavailableHint", "This page does not support login sync.");
    }

    elements.loginStateButton.textContent = loginStateBusy
      ? t("popup.loginState.working", "Syncing")
      : canSync
        ? t("popup.loginState.syncButton", "Sync")
        : canEnable
          ? t("popup.loginState.enableButton", "Enable")
          : t("popup.loginState.syncButton", "Sync");
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

  function clearActivePreviewState() {
    activeVideoPreviewId = null;
    activeAudioPreviewId = null;
  }

  function imagePreviewUrl(candidate) {
    return safeText(candidate?.previewUrl, safeText(candidate?.url, ""));
  }

  function openImageLightbox(candidate, id) {
    const url = imagePreviewUrl(candidate);
    if (!url) {
      return;
    }
    activeImagePreviewId = id;
    elements.imageLightbox.dataset.candidateId = activeImagePreviewId;
    closeRowMenus();
    closeMoreMenu();
    elements.imageLightboxImage.src = url;
    elements.imageLightboxImage.alt = safeText(candidate?.title, t("popup.media.type.imageShort", "Image"));
    elements.imageLightboxCaption.textContent = [
      safeText(candidate?.title, ""),
      candidate?.width && candidate?.height ? `${candidate.width}x${candidate.height}` : "",
      imageFormatLabel(candidate),
    ].filter(Boolean).join(" / ");
    elements.imageLightbox.hidden = false;
    elements.imageLightbox.dataset.open = "true";
    elements.imageLightbox.setAttribute("aria-hidden", "false");
  }

  function closeImageLightbox() {
    if (elements.imageLightbox.dataset.open !== "true") {
      return;
    }
    activeImagePreviewId = null;
    elements.imageLightbox.dataset.open = "false";
    elements.imageLightbox.dataset.candidateId = "";
    elements.imageLightbox.setAttribute("aria-hidden", "true");
    elements.imageLightbox.hidden = true;
    elements.imageLightboxImage.removeAttribute("src");
    elements.imageLightboxImage.alt = "";
    elements.imageLightboxCaption.textContent = "";
  }

  function setMediaType(mediaType) {
    const previousMediaType = currentMediaType;
    currentMediaType = mediaType === "audio" || mediaType === "image" ? mediaType : "video";
    if (previousMediaType !== currentMediaType) {
      clearActivePreviewState();
    }
    elements.mediaTabs.forEach((button) => {
      button.classList.toggle("active", button.dataset.mediaType === currentMediaType);
    });
    renderMediaTabs();
    renderMediaState();
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

  function candidateStableId(candidate, index = 0) {
    return safeText(
      candidate?.id,
      [
        candidate?.mediaType || currentMediaType,
        candidate?.source || "candidate",
        candidate?.url || candidate?.previewUrl || index,
      ].join(":"),
    );
  }

  function currentPreviewIdForType(mediaType) {
    return mediaType === "audio" ? activeAudioPreviewId : activeVideoPreviewId;
  }

  function isCandidatePreviewable(candidate) {
    const capability = downloadCapabilityUtils?.resolveDownloadCapability?.(candidate) || null;
    return capability?.requiresDesktop !== true && capability?.browserDownloadable === true;
  }

  function candidateCapability(candidate) {
    return downloadCapabilityUtils?.resolveDownloadCapability?.(candidate) || null;
  }

  function candidateDisplayTitle(candidate) {
    return safeText(candidate?.title, safeText(candidate?.url, ""));
  }

  function normalizeDisplayKeyPart(value) {
    return typeof value === "string"
      ? value.trim().toLowerCase().replace(/\s+/g, " ")
      : "";
  }

  function normalizeDisplayUrl(value) {
    if (typeof value !== "string" || !value.trim()) {
      return "";
    }
    try {
      const url = new URL(value.trim());
      url.hash = "";
      return url.toString();
    } catch {
      return "";
    }
  }

  function roundedDurationBucket(candidate) {
    const duration = Number(candidate?.duration);
    return Number.isFinite(duration) && duration > 0 ? String(Math.round(duration)) : "";
  }

  function dimensionsKey(candidate) {
    return candidate?.width && candidate?.height ? `${candidate.width}x${candidate.height}` : "";
  }

  function sameKnownValue(left, right) {
    return !left || !right || left === right;
  }

  function candidatePageUrl(candidate) {
    return normalizeDisplayUrl(candidate?.pageUrl || mediaScanResult?.pageUrl || "");
  }

  function isCurrentPageCandidate(candidate) {
    const candidateUrl = normalizeDisplayUrl(candidate?.url);
    const pageUrl = candidatePageUrl(candidate);
    return Boolean(
      candidate
      && currentMediaType !== "image"
      && (
        candidate.source === "current_page"
        || candidate.source === "site_extractor"
        || candidateUrl && pageUrl && candidateUrl === pageUrl
      )
    );
  }

  function arePageScopedMediaCandidates(left, right) {
    if (currentMediaType === "image" || !left || !right) {
      return false;
    }
    if ((left.mediaType || currentMediaType) !== (right.mediaType || currentMediaType)) {
      return false;
    }

    const leftPageUrl = candidatePageUrl(left);
    const rightPageUrl = candidatePageUrl(right);
    if (!leftPageUrl || !rightPageUrl || leftPageUrl !== rightPageUrl) {
      return false;
    }

    const leftDesktop = candidateCapability(left)?.requiresDesktop === true;
    const rightDesktop = candidateCapability(right)?.requiresDesktop === true;
    const leftPreviewable = isCandidatePreviewable(left);
    const rightPreviewable = isCandidatePreviewable(right);
    const hasCurrentPageDesktop =
      (leftDesktop && isCurrentPageCandidate(left))
      || (rightDesktop && isCurrentPageCandidate(right));
    return hasCurrentPageDesktop && ((leftDesktop && rightPreviewable) || (rightDesktop && leftPreviewable));
  }

  function candidateGroupKey(candidate) {
    const explicit = safeText(candidate?.groupId, safeText(candidate?.canonicalId, ""));
    if (explicit) {
      return `explicit:${currentMediaType}:${explicit}`;
    }

    const pageUrl = normalizeDisplayKeyPart(candidate?.pageUrl || mediaScanResult?.pageUrl || "");
    const title = normalizeDisplayKeyPart(candidate?.title || "");
    const host = normalizeDisplayKeyPart(candidate?.host || shortHost(candidate?.url));
    const duration = roundedDurationBucket(candidate);
    const dimensions = dimensionsKey(candidate);

    if (title && (duration || dimensions)) {
      return `meta:${currentMediaType}:${pageUrl}:${title}:${duration}:${dimensions}`;
    }

    if (title && host) {
      return `title-host:${currentMediaType}:${pageUrl}:${title}:${host}`;
    }

    const url = safeText(candidate?.url, "");
    return `url:${currentMediaType}:${url}`;
  }

  function areCandidatesCompatible(left, right) {
    if (!left || !right) {
      return false;
    }

    return arePageScopedMediaCandidates(left, right);
  }

  function preferPreviewCandidate(left, right) {
    if (!left) {
      return right;
    }
    if (!right) {
      return left;
    }

    const leftPreviewable = isCandidatePreviewable(left);
    const rightPreviewable = isCandidatePreviewable(right);
    if (rightPreviewable !== leftPreviewable) {
      return rightPreviewable ? right : left;
    }

    const leftHasPreview = Boolean(left.previewUrl);
    const rightHasPreview = Boolean(right.previewUrl);
    if (rightHasPreview !== leftHasPreview) {
      return rightHasPreview ? right : left;
    }

    return left;
  }

  function preferDesktopCandidate(left, right) {
    if (!left) {
      return right;
    }
    if (!right) {
      return left;
    }

    const leftRequiresDesktop = candidateCapability(left)?.requiresDesktop === true;
    const rightRequiresDesktop = candidateCapability(right)?.requiresDesktop === true;
    if (rightRequiresDesktop !== leftRequiresDesktop) {
      return rightRequiresDesktop ? right : left;
    }

    return left;
  }

  function createDisplayCandidate(group, index) {
    const previewCandidate = group.previewCandidate || group.primaryCandidate;
    const desktopCandidate = group.desktopCandidate || group.primaryCandidate;
    const capability = group.hasDesktopCapability
      ? { browserDownloadable: Boolean(candidateCapability(previewCandidate)?.browserDownloadable), requiresDesktop: true, desktopReason: "desktop_capable" }
      : candidateCapability(previewCandidate) || candidateCapability(group.primaryCandidate);
    const title = candidateDisplayTitle(desktopCandidate) || candidateDisplayTitle(previewCandidate);
    return {
      ...previewCandidate,
      id: group.id || candidateStableId(previewCandidate, index),
      title,
      mediaType: previewCandidate?.mediaType || desktopCandidate?.mediaType || currentMediaType,
      previewCandidate,
      desktopCandidate,
      browserFallbackCandidate: previewCandidate,
      displayCapability: capability,
      displayCandidates: group.candidates,
    };
  }

  function mergeDisplayCandidates(candidates) {
    const groups = [];
    const groupsByKey = new Map();

    candidates.forEach((candidate, index) => {
      const key = candidateGroupKey(candidate);
      let group = groupsByKey.get(key) || null;
      if (!group && currentMediaType !== "image") {
        group = groups.find((existingGroup) => areCandidatesCompatible(existingGroup.primaryCandidate, candidate)) || null;
      }

      if (!group) {
        group = {
          id: key,
          primaryCandidate: candidate,
          previewCandidate: null,
          desktopCandidate: null,
          hasDesktopCapability: false,
          candidates: [],
          firstIndex: index,
        };
        groups.push(group);
        groupsByKey.set(key, group);
      }

      group.candidates.push(candidate);
      group.previewCandidate = preferPreviewCandidate(group.previewCandidate, candidate);
      group.desktopCandidate = preferDesktopCandidate(group.desktopCandidate, candidate);
      group.hasDesktopCapability = group.hasDesktopCapability || candidateCapability(candidate)?.requiresDesktop === true;
    });

    return groups
      .sort((left, right) => left.firstIndex - right.firstIndex)
      .map((group, index) => createDisplayCandidate(group, index));
  }

  function activePreviewCandidate(candidates) {
    if (currentMediaType !== "video" && currentMediaType !== "audio") {
      return null;
    }
    const activeId = currentPreviewIdForType(currentMediaType);
    if (!activeId) {
      return null;
    }
    return candidates.find((candidate, index) => candidateStableId(candidate, index) === activeId) || null;
  }

  function renderMediaPreviewSlot(candidates) {
    elements.mediaPreviewSlot.innerHTML = "";
    elements.mediaPreviewSlot.hidden = true;
    elements.mediaPreviewSlot.dataset.visible = "false";
    elements.mediaPreviewSlot.dataset.mediaType = currentMediaType;

    const candidate = activePreviewCandidate(candidates);
    const previewCandidate = candidate?.previewCandidate || candidate;
    if (!candidate || !isCandidatePreviewable(previewCandidate)) {
      return;
    }

    const panel = document.createElement("div");
    const title = document.createElement("div");
    const titleText = document.createElement("span");
    const mediaHost = document.createElement("div");

    panel.className = "ameow-inline-preview-panel";
    panel.dataset.mediaType = currentMediaType;
    title.className = "ameow-inline-preview-title";
    titleText.textContent = safeText(candidate.title, previewCandidate.url);
    title.appendChild(titleText);
    mediaHost.className = "ameow-inline-preview-media";

    if (currentMediaType === "video") {
      const video = document.createElement("video");
      video.controls = true;
      video.preload = "metadata";
      video.playsInline = true;
      video.src = previewCandidate.url;
      if (previewCandidate.previewUrl) {
        video.poster = previewCandidate.previewUrl;
      }
      mediaHost.appendChild(video);
    } else if (currentMediaType === "audio") {
      mediaHost.appendChild(createAudioSampler(previewCandidate));
    }

    panel.append(title, mediaHost);
    elements.mediaPreviewSlot.appendChild(panel);
    elements.mediaPreviewSlot.hidden = false;
    elements.mediaPreviewSlot.dataset.visible = "true";
  }

  function formatAudioTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) {
      return "0:00";
    }
    const totalSeconds = Math.floor(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const remainder = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${remainder}`;
  }

  function createAudioSampler(candidate) {
    const sampler = document.createElement("div");
    const audio = document.createElement("audio");
    const button = document.createElement("button");
    const icon = document.createElement("span");
    const time = document.createElement("span");
    const range = document.createElement("input");

    sampler.className = "ameow-audio-sampler";
    sampler.style.setProperty("--audio-progress", "0%");
    audio.className = "ameow-audio-engine";
    audio.preload = "metadata";
    audio.src = candidate.url;

    button.type = "button";
    button.className = "ameow-audio-sampler-toggle";
    button.setAttribute("aria-label", t("popup.media.preview.play", "Preview"));
    icon.className = "ameow-audio-sampler-icon";
    icon.textContent = ">";
    button.appendChild(icon);

    time.className = "ameow-audio-sampler-time";
    time.textContent = "0:00 / 0:00";

    range.type = "range";
    range.className = "ameow-audio-sampler-range";
    range.min = "0";
    range.max = "1000";
    range.value = "0";
    range.step = "1";
    range.setAttribute("aria-label", t("popup.media.preview.audioProgress", "Audio progress"));

    const syncUi = () => {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      const progress = duration > 0 ? Math.min(100, Math.max(0, (current / duration) * 100)) : 0;
      range.value = duration > 0 ? String(Math.round((current / duration) * 1000)) : "0";
      sampler.style.setProperty("--audio-progress", `${progress}%`);
      time.textContent = `${formatAudioTime(current)} / ${formatAudioTime(duration)}`;
      icon.textContent = audio.paused ? ">" : "||";
      button.setAttribute(
        "aria-label",
        audio.paused ? t("popup.media.preview.play", "Preview") : t("popup.media.preview.pause", "Stop preview"),
      );
    };

    button.addEventListener("click", async () => {
      if (audio.paused) {
        try {
          await audio.play();
        } catch {
          setRowFeedback(elements.mediaPreviewSlot, t("popup.media.preview.unavailable", "Preview unavailable"));
        }
      } else {
        audio.pause();
      }
      syncUi();
    });
    range.addEventListener("input", () => {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      if (!duration) {
        return;
      }
      audio.currentTime = (Number(range.value) / 1000) * duration;
      syncUi();
    });
    audio.addEventListener("loadedmetadata", syncUi);
    audio.addEventListener("timeupdate", syncUi);
    audio.addEventListener("play", syncUi);
    audio.addEventListener("pause", syncUi);
    audio.addEventListener("ended", syncUi);

    sampler.append(audio, button, range, time);
    return sampler;
  }

  function renderMediaState() {
    closeRowMenus();
    const candidates = Array.isArray(mediaScanResult?.[`${currentMediaType}s`])
      ? mediaScanResult[`${currentMediaType}s`]
      : [];
    const displayCandidates = mergeDisplayCandidates(candidates);
    elements.mediaList.innerHTML = "";
    elements.mediaList.dataset.mediaType = currentMediaType;
    renderMediaPreviewSlot(displayCandidates);
    renderMediaTabs();

    if (!scanStarted && !mediaScanResult) {
      elements.mediaList.dataset.visible = "false";
      elements.mediaPreviewSlot.hidden = true;
      elements.mediaPreviewSlot.dataset.visible = "false";
      elements.mediaEmpty.style.display = "flex";
      elements.mediaEmptyTitle.textContent = t("popup.media.empty.scanning.title", "Scanning");
      elements.mediaEmptyCopy.textContent = t("popup.media.empty.scanning.copy", "Checking the active page for media resources.");
      elements.mediaSummary.textContent = t("popup.media.summary.scanning", "Scanning current page");
      return;
    }

    if (mediaScanResult?.success === false) {
      elements.mediaList.dataset.visible = "false";
      elements.mediaPreviewSlot.hidden = true;
      elements.mediaPreviewSlot.dataset.visible = "false";
      elements.mediaEmpty.style.display = "flex";
      elements.mediaEmptyTitle.textContent = t("popup.media.empty.unavailable.title", "Cannot scan this page");
      elements.mediaEmptyCopy.textContent = mediaScanResult.reason || t("popup.media.empty.unavailable.copy", "The active page is unavailable to the extension.");
      elements.mediaSummary.textContent = t("popup.media.summary.unavailable", "Scan unavailable");
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

    if (displayCandidates.length === 0) {
      elements.mediaList.dataset.visible = "false";
      elements.mediaPreviewSlot.hidden = true;
      elements.mediaPreviewSlot.dataset.visible = "false";
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
      return;
    }

    elements.mediaEmpty.style.display = "none";
    elements.mediaList.dataset.visible = "true";
    displayCandidates.forEach((candidate, index) => {
      if (currentMediaType === "image") {
        elements.mediaList.appendChild(createImageCard(candidate, index));
        return;
      }
      elements.mediaList.appendChild(createMediaRow(candidate, index));
    });
  }

  function createPreviewToggle(candidate, id, active, previewable, row) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ameow-preview-toggle";
    button.dataset.active = active ? "true" : "false";
    button.dataset.previewable = previewable ? "true" : "false";
    button.title = previewable
      ? active
        ? t("popup.media.preview.pause", "Stop preview")
        : t("popup.media.preview.play", "Preview")
      : t("popup.media.preview.unavailable", "Preview unavailable");
    button.setAttribute("aria-label", button.title);
    button.appendChild(createPreviewIcon(active, previewable));
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!previewable) {
        setRowFeedback(row, t("popup.media.preview.unavailable", "Preview unavailable"));
        return;
      }
      if (candidate.mediaType === "audio") {
        activeAudioPreviewId = active ? null : id;
        activeVideoPreviewId = null;
      } else {
        activeVideoPreviewId = active ? null : id;
        activeAudioPreviewId = null;
      }
      renderMediaState();
    });
    return button;
  }

  function createPreviewIcon(active, previewable) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    svg.setAttribute("class", "ameow-preview-toggle-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    if (!previewable) {
      path.setAttribute("d", "M12 3.75a8.25 8.25 0 1 0 0 16.5a8.25 8.25 0 0 0 0-16.5Zm0 1.5a6.75 6.75 0 0 1 5.26 10.98L7.77 6.74A6.72 6.72 0 0 1 12 5.25Zm-5.26 2.52l9.49 9.49A6.75 6.75 0 0 1 6.74 7.77Z");
    } else if (active) {
      path.setAttribute("d", "M8 5.75h3v12.5H8V5.75Zm5 0h3v12.5h-3V5.75Z");
    } else {
      path.setAttribute("d", "M8 5.5v13l10-6.5L8 5.5Z");
    }
    svg.appendChild(path);
    return svg;
  }

  function appendPreviewImage(container, candidate) {
    if (!candidate.previewUrl) {
      return;
    }
    const image = document.createElement("img");
    image.src = candidate.previewUrl;
    image.alt = "";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("load", () => {
      container.dataset.hasPreview = "true";
    }, { once: true });
    image.addEventListener("error", () => {
      image.remove();
      container.dataset.hasPreview = "false";
    }, { once: true });
    container.appendChild(image);
  }

  function appendDesktopBadge(container, capability) {
    if (!capability?.requiresDesktop) {
      return;
    }
    const desktopBadge = document.createElement("span");
    desktopBadge.className = "ameow-media-desktop-badge";
    desktopBadge.textContent = t("popup.media.badges.desktop", "Desktop");
    desktopBadge.title = t("popup.media.badges.desktopTitle", "Requires the desktop app");
    container.appendChild(desktopBadge);
  }

  function createMediaRow(candidate, index = 0) {
    const row = document.createElement("div");
    const preview = document.createElement("span");
    const main = document.createElement("div");
    const title = document.createElement("div");
    const meta = document.createElement("div");
    const menuButton = document.createElement("button");
    const menu = document.createElement("div");

    const previewCandidate = candidate.previewCandidate || candidate;
    const id = candidateStableId(candidate, index);
    const capability = candidate.displayCapability || candidateCapability(candidate);
    const previewable = isCandidatePreviewable(previewCandidate);
    const active = candidate.mediaType === "audio"
      ? activeAudioPreviewId === id
      : activeVideoPreviewId === id;
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
    appendPreviewImage(preview, previewCandidate);
    if (candidate.mediaType === "video" || candidate.mediaType === "audio") {
      preview.appendChild(createPreviewToggle(candidate, id, active, previewable, row));
    }

    main.className = "ameow-media-row-main";
    title.className = "ameow-media-title";
    const titleText = document.createElement("span");
    titleText.className = "ameow-media-title-text";
    titleText.textContent = safeText(candidate.title, previewCandidate.url);
    title.appendChild(titleText);
    appendDesktopBadge(title, capability);
    meta.className = "ameow-media-meta";
    meta.textContent = [
      candidate.host || shortHost(candidate.url),
      sourceLabel(previewCandidate.source || candidate.source, t),
      previewCandidate.extension || previewCandidate.type || candidate.extension || candidate.type,
      previewCandidate.duration ? `${previewCandidate.duration}s` : "",
      previewCandidate.width && previewCandidate.height ? `${previewCandidate.width}x${previewCandidate.height}` : "",
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

  function imageFormatLabel(candidate) {
    const extension = safeText(
      candidate.extension,
      downloadCapabilityUtils?.urlExtension?.(candidate.url) || candidate.type || "",
    );
    return extension ? extension.toUpperCase() : t("popup.media.type.imageShort", "IMG");
  }

  function createImageCard(candidate, index = 0) {
    const card = document.createElement("div");
    const thumbnail = document.createElement("span");
    const body = document.createElement("div");
    const title = document.createElement("div");
    const titleText = document.createElement("span");
    const meta = document.createElement("div");
    const menuButton = document.createElement("button");
    const menu = document.createElement("div");

    const id = candidateStableId(candidate, index);
    const capability = downloadCapabilityUtils?.resolveDownloadCapability?.(candidate) || null;
    const dimensions = candidate.width && candidate.height ? `${candidate.width}x${candidate.height}` : "";
    const metaParts = [imageFormatLabel(candidate), dimensions].filter(Boolean);

    card.className = "ameow-image-card";
    card.dataset.candidateId = id;
    thumbnail.className = "ameow-image-card-thumb";
    thumbnail.dataset.imagePreviewTarget = "true";
    thumbnail.textContent = t("popup.media.type.imageShort", "IMG");
    thumbnail.setAttribute("role", "button");
    thumbnail.tabIndex = 0;
    thumbnail.title = t("popup.media.preview.image", "Preview image");
    thumbnail.setAttribute("aria-label", t("popup.media.preview.image", "Preview image"));
    appendPreviewImage(thumbnail, {
      ...candidate,
      previewUrl: candidate.previewUrl || candidate.url,
    });
    thumbnail.addEventListener("click", (event) => {
      event.stopPropagation();
      openImageLightbox(candidate, id);
    });
    thumbnail.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      openImageLightbox(candidate, id);
    });

    body.className = "ameow-image-card-body";
    title.className = "ameow-image-card-title";
    titleText.className = "ameow-image-card-title-text";
    titleText.textContent = safeText(candidate.title, candidate.url);
    title.appendChild(titleText);
    appendDesktopBadge(title, capability);
    meta.className = "ameow-image-card-meta";
    meta.textContent = metaParts.join(" / ");

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
      createMenuItem(t("popup.media.actions.download", "Download"), () => downloadCandidate(candidate, card)),
      createMenuItem(t("popup.media.actions.copy", "Copy link"), () => copyCandidateLink(candidate, card)),
      createMenuItem(t("popup.media.actions.source", "View source"), () => showCandidateSource(candidate, card)),
    );

    body.append(title, meta);
    card.append(thumbnail, body, menuButton, menu);
    return card;
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
    const meta = row?.querySelector(".ameow-media-meta, .ameow-image-card-meta");
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
    const key = candidate.url || candidate.desktopCandidate?.url || candidate.browserFallbackCandidate?.url;
    if (downloadCooldown.has(key)) {
      return;
    }
    downloadCooldown.add(key);
    setRowFeedback(row, t("popup.media.feedback.submitting", "Submitting"));
    const response = await sendRuntimeMessage({
      type: "download_media_candidate",
      candidate,
    });
    const failureFeedback = response?.reason === "desktop_required"
      ? t("popup.media.feedback.desktopRequired", "Desktop required")
      : response?.reason === "browser_download_failed"
        ? t("popup.media.feedback.browserFailed", "Browser download failed")
        : response?.connected === false
          ? t("popup.media.feedback.offline", "Desktop offline")
          : t("popup.media.feedback.failed", "Failed");
    if (response?.success && response?.downloadedBy !== "browser") {
      setRowFeedback(row, t("popup.media.feedback.submitted", "Submitted"));
    } else if (!response?.success) {
      setRowFeedback(row, failureFeedback);
    }
    window.setTimeout(() => downloadCooldown.delete(key), 700);
  }

  async function copyCandidateLink(candidate, row) {
    const link = candidate.previewCandidate?.url || candidate.browserFallbackCandidate?.url || candidate.url;
    try {
      await navigator.clipboard.writeText(link);
      setRowFeedback(row, t("popup.media.feedback.copied", "Copied"));
    } catch {
      const input = document.createElement("textarea");
      input.value = link;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
      setRowFeedback(row, t("popup.media.feedback.copied", "Copied"));
    }
  }

  function showCandidateSource(candidate, row) {
    const sourceCandidate = candidate.previewCandidate || candidate.browserFallbackCandidate || candidate;
    setRowFeedback(row, `${sourceLabel(sourceCandidate.source, t)} / ${shortHost(sourceCandidate.url)}`);
  }

  async function scanPageMedia() {
    if (scanInProgress) {
      return;
    }
    scanStarted = true;
    scanInProgress = true;
    clearActivePreviewState();
    elements.mediaPreviewSlot.innerHTML = "";
    elements.mediaPreviewSlot.hidden = true;
    elements.mediaPreviewSlot.dataset.visible = "false";
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
    } else {
      elements.mediaSummary.textContent = t("popup.media.summary.refreshing", "Refreshing current page media");
    }

    const response = await sendRuntimeMessage({ type: "scan_page_media" });
    mediaScanResult = response && typeof response === "object"
      ? response
      : { success: false, reason: "scan_failed" };
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
      closeImageLightbox();
      closeRowMenus();
      closeMoreMenu();
    }
  });
  window.addEventListener("beforeunload", () => {
    if (statusTimer !== null) {
      clearInterval(statusTimer);
      statusTimer = null;
    }
  });

  elements.mediaTabs.forEach((button) => {
    button.addEventListener("click", () => setMediaType(button.dataset.mediaType || "video"));
  });
  elements.refreshMediaButton.addEventListener("click", () => {
    void scanPageMedia();
  });
  elements.loginStateButton.addEventListener("click", async () => {
    if (loginStateBusy) {
      return;
    }
    const connected = currentStatusState === STATUS_STATE_CONNECTED;
    const canSync = connected
      && currentSiteSessionStatus?.canSyncCurrentSite === true
      && currentSiteSessionStatus?.currentSiteSession;
    const canEnable = connected && currentSiteSessionStatus?.canEnableCurrentSite === true;
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
  elements.openOptionsButton.addEventListener("click", openOptionsPage);
  elements.moreMenuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMoreMenu();
  });
  elements.imageLightboxBackdrop.addEventListener("click", closeImageLightbox);
  elements.imageLightboxClose.addEventListener("click", closeImageLightbox);
  elements.repositoryLinkButton.addEventListener("click", () => openExternalLink(REPOSITORY_URL));
  elements.gettingStartedLinkButton.addEventListener("click", () => {
    openExternalLink(getGettingStartedUrl(currentBundle.language));
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
    void (async () => {
      await loadMediaCache();
      void scanPageMedia();
    })();

    const themeResponse = await sendRuntimeMessage({ type: "get_theme" });
    applyTheme(themeResponse?.theme || "black");

    statusTimer = window.setInterval(() => {
      void checkStatus();
    }, 1200);
  })();
});
