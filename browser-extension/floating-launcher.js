(function initAmeowFloatingLauncher() {
  "use strict";

  const launcherConfig = window.AmeowLauncherConfig;
  const captureEvidence = window.AmeowCaptureEvidence;
  const localeUtils = window.AmeowLocaleUtils;
  const directDownloadQuality = window.AmeowDirectDownloadQuality;
  const ROOT_ID = "ameow-floating-launcher-root";
  const PING_MESSAGE = "ameow_launcher_ping";
  const STATUS_MESSAGE = "ameow_launcher_status";
  const DOWNLOAD_CURRENT_MESSAGE = "ameow_download_current_content";
  const CAPTURE_CURRENT_MESSAGE = "ameow_capture_current_content";
  const RESTORE_MESSAGE = "ameow_launcher_restore";
  const CONFIG_UPDATE_MESSAGE = "ameow_launcher_config_update";

  if (!launcherConfig || !captureEvidence || !chrome?.runtime) {
    return;
  }

  if (window.top !== window) {
    return;
  }

  if (document.getElementById(ROOT_ID)) {
    return;
  }

  let config = launcherConfig.normalizeConfig();
  let launcher = null;
  let rootHost = null;
  let pickerStyle = null;
  let pickerState = null;
  let dragState = null;
  let connectionState = "offline";
  let qualityPreference = directDownloadQuality?.DEFAULT_QUALITY_PREFERENCE || "balanced";
  let storageChangeListener = null;
  let feedbackTimer = null;
  let suppressNextHandleClick = false;
  let localeBundle = {
    language: "en",
    _namespaces: ["extension", "common"],
    extension: {},
    common: {},
  };

  function t(key, fallback) {
    return localeUtils?.translate(localeBundle, key, fallback) || fallback || key;
  }

  async function loadLocale() {
    if (!localeUtils?.resolveCurrentLanguage || !localeUtils?.loadLocaleBundle) {
      return;
    }
    const language = await localeUtils.resolveCurrentLanguage();
    localeBundle = await localeUtils.loadLocaleBundle(language);
  }

  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");

    const nodes = {
      cat: ['<path d="M11.75 6.4c-1.48 0-1.63.16-2.39.16C8.72 6.56 6.8 5 5.85 5S3.77 5.56 3.77 7.19v1.87c0 .5.18 2 .88 1.6-.83.98-.91 2.12-.9 3.22-.22.06-.45.14-.67.21-.68.24-1.41.54-1.74.75a.75.75 0 0 0 .82 1.26c.15-.1.72-.35 1.4-.58l.23-.08c.05.43.16.83.33 1.19l-.02.01c-.41.22-.79.47-1.03.63l-.12.07a.75.75 0 1 0 .82 1.26l.13-.09c.24-.16.56-.36.9-.54.08-.04.16-.08.23-.12C6.76 19.48 9.87 20 11.75 20s4.99-.52 6.72-2.15c.07.04.15.08.23.12.34.18.66.38.9.54l.13.09a.75.75 0 0 0 .82-1.26l-.12-.07a13 13 0 0 0-1.03-.63l-.02-.01c.17-.36.28-.76.33-1.19l.23.08c.69.23 1.25.48 1.41.58a.75.75 0 0 0 .81-1.26c-.33-.21-1.05-.51-1.74-.75-.22-.07-.45-.15-.67-.21.01-1.1-.07-2.24-.9-3.22.7.4.88-1.1.88-1.6V7.19C19.73 5.56 18.61 5 17.66 5s-2.88 1.56-3.51 1.56c-.77 0-.92-.16-2.4-.16Zm-.67 9.2c.2-.07.44-.1.67-.1s.48.03.68.1c.1.03.22.09.33.17.1.09.24.25.24.48s-.14.39-.24.48c-.11.08-.23.14-.33.17-.2.07-.44.1-.68.1s-.47-.03-.67-.1c-.1-.03-.23-.09-.33-.17a.62.62 0 0 1-.25-.48c0-.23.14-.39.25-.48.1-.08.23-.14.33-.17Zm2.84-3.1c.14-.23.41-.5.81-.5s.67.27.81.5c.14.24.21.53.21.81s-.07.57-.21.81c-.14.23-.41.5-.81.5s-.67-.27-.81-.5a1.6 1.6 0 0 1-.21-.81c0-.28.07-.57.21-.81Zm-5.96 0c.14-.23.41-.5.81-.5s.67.27.81.5c.14.24.21.53.21.81s-.07.57-.21.81c-.14.23-.41.5-.81.5s-.67-.27-.81-.5a1.6 1.6 0 0 1-.21-.81c0-.28.07-.57.21-.81Z"/>'],
      pick: ['<circle cx="12" cy="12" r="7"/>', '<path d="M12 3v3"/>', '<path d="M12 18v3"/>', '<path d="M3 12h3"/>', '<path d="M18 12h3"/>', '<circle cx="12" cy="12" r="1"/>'],
      download: ['<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>', '<path d="M7 10l5 5 5-5"/>', '<path d="M12 15V3"/>'],
      sliders: ['<path d="M4 21v-7"/>', '<path d="M4 10V3"/>', '<path d="M12 21v-9"/>', '<path d="M12 8V3"/>', '<path d="M20 21v-5"/>', '<path d="M20 12V3"/>', '<path d="M2 14h4"/>', '<path d="M10 8h4"/>', '<path d="M18 16h4"/>'],
      more: ['<circle cx="12" cy="12" r="1"/>', '<circle cx="19" cy="12" r="1"/>', '<circle cx="5" cy="12" r="1"/>'],
      lock: ['<rect width="14" height="10" x="5" y="11" rx="2"/>', '<path d="M8 11V7a4 4 0 0 1 8 0v4"/>'],
      unlock: ['<rect width="14" height="10" x="5" y="11" rx="2"/>', '<path d="M8 11V7a4 4 0 0 1 7.48-2"/>'],
      eyeOff: ['<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>', '<path d="M6.61 6.61C3.98 8.36 2 12 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>', '<path d="M2 2l20 20"/>', '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>'],
      switchSide: ['<path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3"/>', '<path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/>', '<path d="M12 8l-3 4 3 4"/>', '<path d="M12 8l3 4-3 4"/>'],
    }[name] || [];

    svg.innerHTML = nodes.join("");
    return svg;
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime?.lastError) {
          resolve(null);
          return;
        }
        resolve(response || null);
      });
    });
  }

  async function loadQualityPreference() {
    if (!directDownloadQuality?.getQualityPreference) {
      qualityPreference = "balanced";
      return qualityPreference;
    }
    qualityPreference = await directDownloadQuality.getQualityPreference();
    refreshQualitySelection();
    return qualityPreference;
  }

  function deriveSiteHint(rawUrl = root.location?.href) {
    const value = typeof rawUrl === "string" ? rawUrl.toLowerCase() : "";
    if (!value) return "generic";
    if (value.includes("douyin.com/")) return "douyin";
    if (value.includes("instagram.com/")) return "instagram";
    if (value.includes("youtube.com/") || value.includes("youtu.be/")) return "youtube";
    if (value.includes("bilibili.com/") || value.includes("b23.tv/")) return "bilibili";
    if (value.includes("twitter.com/") || value.includes("x.com/")) return "twitter-x";
    if (value.includes("xiaohongshu.com/") || value.includes("xhslink.com/")) return "xiaohongshu";
    if (value.includes("pinterest.com/")) return "pinterest";
    if (value.includes("weibo.com/") || value.includes("weibo.cn/")) return "weibo";
    return "generic";
  }

  function capabilityCopy() {
    if (connectionState === "offline") {
      return t("launcher.capability.offline", "Desktop offline");
    }
    if (connectionState === "connecting") {
      return t("launcher.capability.connecting", "Connecting");
    }

    const payload = captureEvidence.buildCurrentContentPayload?.();
    const evidence = payload?.extensionData?.ameowCapture;
    const hasPageEvidence = Boolean(
      evidence?.canonicalUrl
      || evidence?.ogUrl
      || evidence?.targetHref
      || evidence?.targetSrc
      || (evidence?.contentIds && Object.keys(evidence.contentIds).length > 0),
    );
    const siteHint = deriveSiteHint(evidence?.pageUrl);

    if (siteHint !== "generic" || hasPageEvidence) {
      return t("launcher.capability.ready", "Ready to capture");
    }

    return t("launcher.capability.generic", "Try current page");
  }

  function updateLauncherConfig(nextConfig) {
    config = launcherConfig.normalizeConfig(nextConfig);
    if (!launcher) {
      return;
    }
    launcher.dataset.side = config.side;
    launcher.dataset.locked = config.locked ? "true" : "false";
    launcher.style.setProperty("--ameow-launcher-top", `${(config.verticalPosition * 100).toFixed(2)}vh`);
    refreshHandleTooltip();
  }

  function unmountLauncher() {
    stopDrag();
    closeMenu();
    stopPicker();
    rootHost?.remove();
    rootHost = null;
    launcher = null;
  }

  function closeMenu() {
    if (launcher) {
      launcher.dataset.menuOpen = "false";
    }
  }

  function setFeedback(kind, message, options = {}) {
    if (!launcher) {
      return;
    }
    const feedback = launcher.querySelector(".ameow-launcher-feedback");
    if (!feedback) {
      return;
    }
    if (feedbackTimer !== null) {
      window.clearTimeout(feedbackTimer);
      feedbackTimer = null;
    }
    feedback.textContent = message;
    feedback.dataset.kind = kind;
    feedback.dataset.visible = "true";
    const durationMs = typeof options.durationMs === "number" ? options.durationMs : 1800;
    if (durationMs > 0) {
      feedbackTimer = window.setTimeout(() => {
        feedback.dataset.visible = "false";
        feedbackTimer = null;
      }, durationMs);
    }
  }

  function responseFeedback(response) {
    if (response?.success) {
      return {
        kind: "success",
        message: t("launcher.feedback.submitted", "Submitted"),
      };
    }
    if (response?.connected === false || response?.reason === "not_connected") {
      return {
        kind: "danger",
        message: t("launcher.feedback.offline", "Open desktop app"),
      };
    }
    return {
      kind: "danger",
      message: t("launcher.feedback.failed", "Failed"),
    };
  }

  function qualityLabel(value) {
    const option = directDownloadQuality?.QUALITY_PREFERENCE_OPTIONS?.find((entry) => entry.value === value);
    return t(option?.labelKey || "", value);
  }

  async function hideOnThisSite() {
    const nextConfig = await launcherConfig.updateConfig((current) => (
      launcherConfig.addDisabledSitePattern(current, window.location.href)
    ));
    updateLauncherConfig(nextConfig);
    unmountLauncher();
  }

  async function switchSide() {
    const nextConfig = await launcherConfig.updateConfig((current) => ({
      ...current,
      side: current.side === "right" ? "left" : "right",
    }));
    updateLauncherConfig(nextConfig);
    closeMenu();
  }

  async function toggleLocked() {
    const nextConfig = await launcherConfig.updateConfig((current) => ({
      ...current,
      locked: !current.locked,
    }));
    updateLauncherConfig(nextConfig);
    refreshLauncherLabels();
    closeMenu();
  }

  async function downloadCurrentContent() {
    const payload = captureEvidence.buildCurrentContentPayload();
    if (!payload) {
      setFeedback("danger", t("launcher.feedback.unavailable", "Cannot capture page"));
      return;
    }
    setFeedback("pending", t("launcher.feedback.submitting", "Submitting"), { durationMs: 0 });
    const response = await sendMessage({
      type: DOWNLOAD_CURRENT_MESSAGE,
      payload,
    });
    const feedback = responseFeedback(response);
    setFeedback(feedback.kind, feedback.message);
    closeMenu();
  }

  function getTargetRect(target) {
    if (!(target instanceof Element)) {
      return null;
    }
    const rect = target.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    return rect;
  }

  function stopPicker() {
    if (!pickerState) {
      return;
    }
    document.removeEventListener("mousemove", pickerState.handleMove, true);
    document.removeEventListener("click", pickerState.handleClick, true);
    document.removeEventListener("contextmenu", pickerState.handleContextMenu, true);
    document.removeEventListener("keydown", pickerState.handleKeyDown, true);
    pickerState.box.remove();
    pickerState.tip.remove();
    pickerState.overlay.remove();
    pickerStyle?.remove();
    pickerStyle = null;
    pickerState = null;
    if (launcher) {
      launcher.dataset.pickerActive = "false";
    }
  }

  function startPicker() {
    stopPicker();
    closeMenu();

    const overlay = document.createElement("div");
    const box = document.createElement("div");
    const tip = document.createElement("div");
    pickerStyle = document.createElement("style");
    pickerStyle.textContent = `
      .ameow-picker-overlay{position:fixed;inset:0;z-index:2147483646;pointer-events:none}
      .ameow-picker-box{position:fixed;z-index:2147483647;border:2px solid #60a5fa;border-radius:8px;background:rgba(96,165,250,.12);box-shadow:0 0 0 9999px rgba(0,0,0,.12);pointer-events:none}
      .ameow-picker-tip{position:fixed;z-index:2147483647;left:50%;top:18px;transform:translateX(-50%);padding:7px 10px;border-radius:999px;background:rgba(32,31,37,.94);color:#f3f4f6;font:600 12px/1.2 "SF Pro Text","Segoe UI",Arial,sans-serif;box-shadow:0 12px 28px rgba(0,0,0,.32);pointer-events:none}
    `;
    overlay.className = "ameow-picker-overlay";
    box.className = "ameow-picker-box";
    tip.className = "ameow-picker-tip";
    tip.textContent = t(
      "launcher.picker.instruction",
      "Click the content to download. Right-click or press Esc to cancel.",
    );
    document.documentElement.append(pickerStyle, overlay, box, tip);
    if (launcher) {
      launcher.dataset.pickerActive = "true";
    }

    const updateBox = (target) => {
      const rect = getTargetRect(target);
      if (!rect) {
        box.style.display = "none";
        return;
      }
      box.style.display = "block";
      box.style.left = `${Math.max(0, rect.left)}px`;
      box.style.top = `${Math.max(0, rect.top)}px`;
      box.style.width = `${Math.max(1, rect.width)}px`;
      box.style.height = `${Math.max(1, rect.height)}px`;
    };

    const handleMove = (event) => {
      updateBox(event.target);
    };

    const handleClick = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const payload = captureEvidence.buildPickDownloadPayload(event.target);
      stopPicker();
      if (payload) {
        setFeedback("pending", t("launcher.feedback.submitting", "Submitting"), { durationMs: 0 });
        const response = await sendMessage({
          type: DOWNLOAD_CURRENT_MESSAGE,
          payload,
        });
        const feedback = responseFeedback(response);
        setFeedback(feedback.kind, feedback.message);
      } else {
        setFeedback("danger", t("launcher.feedback.unavailable", "Cannot capture page"));
      }
    };

    const handleContextMenu = (event) => {
      event.preventDefault();
      event.stopPropagation();
      stopPicker();
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        stopPicker();
      }
    };

    pickerState = {
      overlay,
      box,
      tip,
      handleMove,
      handleClick,
      handleContextMenu,
      handleKeyDown,
    };

    document.addEventListener("mousemove", handleMove, true);
    document.addEventListener("click", handleClick, true);
    document.addEventListener("contextmenu", handleContextMenu, true);
    document.addEventListener("keydown", handleKeyDown, true);
  }

  function createActionButton(name, label, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ameow-launcher-action";
    button.dataset.action = name;
    if (label) {
      button.dataset.tooltip = label;
    }
    button.setAttribute("aria-label", label);
    button.appendChild(icon(name));
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  function createMenuItem(name, label, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ameow-launcher-menu-item";
    button.dataset.menuItem = name;
    const labelText = document.createElement("span");
    labelText.className = "ameow-launcher-menu-label";
    labelText.textContent = label;
    button.appendChild(icon(name));
    button.appendChild(labelText);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  function setActionLabel(name, label) {
    const button = launcher?.querySelector(`[data-action="${name}"]`);
    if (!button) {
      return;
    }
    if (label) {
      button.dataset.tooltip = label;
    } else {
      delete button.dataset.tooltip;
    }
    button.setAttribute("aria-label", label);
  }

  function setActionIcon(name, iconName) {
    const button = launcher?.querySelector(`[data-action="${name}"]`);
    if (!button) {
      return;
    }
    const currentIcon = button.querySelector("svg");
    currentIcon?.remove();
    button.prepend(icon(iconName));
  }

  function refreshHandleTooltip() {
    const handle = launcher?.querySelector(".ameow-launcher-handle");
    if (!handle) {
      return;
    }
    const actionLabel = t("launcher.actions.current", "Download current content");
    const statusLabel = capabilityCopy();
    handle.dataset.tooltip = `${actionLabel} · ${statusLabel}`;
    handle.setAttribute("aria-label", `${actionLabel}. ${statusLabel}`);
  }

  function setMenuLabel(name, label) {
    const labelText = launcher?.querySelector(`[data-menu-item="${name}"] .ameow-launcher-menu-label`);
    if (labelText) {
      labelText.textContent = label;
    }
  }

  function refreshQualitySelection() {
    if (!launcher) {
      return;
    }
    const normalized = directDownloadQuality?.normalizeQualityPreference
      ? directDownloadQuality.normalizeQualityPreference(qualityPreference)
      : qualityPreference;
    launcher.querySelectorAll(".ameow-launcher-quality-option").forEach((button) => {
      const active = button.dataset.quality === normalized;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    const qualityButton = launcher.querySelector('[data-action="quality"]');
    const label = t("launcher.actions.quality", "Quality");
    if (qualityButton) {
      delete qualityButton.dataset.tooltip;
      qualityButton.setAttribute("aria-label", `${label}: ${qualityLabel(normalized)}`);
    }
  }

  function refreshLauncherLabels() {
    setActionLabel("pick", t("launcher.actions.pick", "Pick download"));
    setActionLabel("eyeOff", t("launcher.menu.hideSite", "Hide on this site"));
    setActionLabel(
      "lock",
      config.locked
        ? t("launcher.actions.unlock", "Unlock position")
        : t("launcher.actions.lock", "Lock position"),
    );
    setActionIcon("lock", config.locked ? "lock" : "unlock");
    setActionLabel("more", t("launcher.actions.more", "More"));
    setMenuLabel("eyeOff", t("launcher.menu.hideSite", "Hide on this site"));
    setMenuLabel("switchSide", t("launcher.menu.switchSide", "Switch side"));
    refreshHandleTooltip();
    if (launcher) {
      launcher.querySelectorAll(".ameow-launcher-quality-option").forEach((button) => {
        const option = directDownloadQuality?.QUALITY_PREFERENCE_OPTIONS?.find((entry) => entry.value === button.dataset.quality);
        const label = t(option?.labelKey || "", button.dataset.quality || "");
        const labelText = button.querySelector(".ameow-launcher-quality-label");
        if (labelText) {
          labelText.textContent = label;
        }
      });
      refreshQualitySelection();
    }
    if (pickerState?.tip) {
      pickerState.tip.textContent = t(
        "launcher.picker.instruction",
        "Click the content to download. Right-click or press Esc to cancel.",
      );
    }
  }

  function getViewportHeight() {
    return Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
  }

  function normalizeVerticalFromClientY(clientY) {
    const viewportHeight = getViewportHeight();
    return Math.min(0.9, Math.max(0.12, clientY / viewportHeight));
  }

  function stopDrag() {
    if (!dragState) {
      return;
    }
    document.removeEventListener("pointermove", dragState.handleMove, true);
    document.removeEventListener("pointerup", dragState.handleEnd, true);
    document.removeEventListener("pointercancel", dragState.handleEnd, true);
    dragState.captureTarget?.releasePointerCapture?.(dragState.pointerId);
    if (launcher) {
      launcher.dataset.dragging = "false";
    }
    dragState = null;
  }

  function startDrag(event) {
    if (!launcher || config.locked || event.button !== 0) {
      return;
    }

    closeMenu();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;

    const handleMove = (moveEvent) => {
      const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
      if (!dragState.moved && distance < 4) {
        return;
      }
      dragState.moved = true;
      moveEvent.preventDefault();
      moveEvent.stopPropagation();
      const nextSide = moveEvent.clientX < window.innerWidth / 2 ? "left" : "right";
      const nextVertical = normalizeVerticalFromClientY(moveEvent.clientY);
      config = launcherConfig.normalizeConfig({
        ...config,
        side: nextSide,
        verticalPosition: nextVertical,
      });
      launcher.dataset.dragging = "true";
      updateLauncherConfig(config);
    };

    const handleEnd = async (endEvent) => {
      const moved = dragState?.moved === true;
      stopDrag();
      if (!moved) {
        return;
      }
      suppressNextHandleClick = true;
      window.setTimeout(() => {
        suppressNextHandleClick = false;
      }, 250);
      endEvent.preventDefault();
      endEvent.stopPropagation();
      const nextConfig = await launcherConfig.updateConfig((current) => ({
        ...current,
        side: config.side,
        verticalPosition: config.verticalPosition,
      }));
      updateLauncherConfig(nextConfig);
    };

    dragState = {
      pointerId,
      moved: false,
      captureTarget: event.currentTarget,
      handleMove,
      handleEnd,
    };

    event.currentTarget?.setPointerCapture?.(pointerId);
    document.addEventListener("pointermove", handleMove, true);
    document.addEventListener("pointerup", handleEnd, true);
    document.addEventListener("pointercancel", handleEnd, true);
  }

  function handleLauncherClick(event) {
    event.preventDefault();
    event.stopPropagation();
    if (suppressNextHandleClick) {
      suppressNextHandleClick = false;
      return;
    }
    void downloadCurrentContent();
  }

  function createQualityControl() {
    const wrapper = document.createElement("div");
    wrapper.className = "ameow-launcher-quality";

    const trigger = createActionButton("sliders", t("launcher.actions.quality", "Quality"), () => {});
    trigger.dataset.action = "quality";
    delete trigger.dataset.tooltip;

    const flyout = document.createElement("div");
    flyout.className = "ameow-launcher-quality-flyout";

    const options = directDownloadQuality?.QUALITY_PREFERENCE_OPTIONS || [];
    options.forEach((option) => {
      const button = document.createElement("button");
      const label = document.createElement("span");
      button.type = "button";
      button.className = "ameow-launcher-quality-option";
      button.dataset.quality = option.value;
      button.setAttribute("aria-pressed", "false");
      label.className = "ameow-launcher-quality-label";
      label.textContent = t(option.labelKey, option.value);
      button.appendChild(label);
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
          const savedValue = directDownloadQuality?.setQualityPreference
            ? await directDownloadQuality.setQualityPreference(option.value)
            : option.value;
          qualityPreference = savedValue;
          refreshQualitySelection();
        } catch (error) {
          console.error("[Ameow] Failed to save launcher quality preference:", error);
        }
      });
      flyout.appendChild(button);
    });

    wrapper.append(trigger, flyout);
    return wrapper;
  }

  function enableLauncherTransitionsAfterStylesheet(stylesheet) {
    let settled = false;
    let fallbackTimer = null;

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      stylesheet.removeEventListener("load", finish);
      stylesheet.removeEventListener("error", finish);
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer);
      }

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (launcher?.dataset.mounting === "true") {
            launcher.dataset.mounting = "false";
          }
        });
      });
    };

    stylesheet.addEventListener("load", finish, { once: true });
    stylesheet.addEventListener("error", finish, { once: true });
    fallbackTimer = window.setTimeout(finish, 400);
  }

  function mountLauncher() {
    if (launcher || rootHost?.isConnected) {
      return;
    }
    rootHost = document.createElement("div");
    rootHost.id = ROOT_ID;
    const shadow = rootHost.attachShadow({ mode: "open" });
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = chrome.runtime.getURL("floating-launcher.css");

    launcher = document.createElement("div");
    launcher.className = "ameow-launcher";
    launcher.dataset.mounting = "true";
    launcher.dataset.connectionState = connectionState;
    launcher.dataset.menuOpen = "false";
    launcher.dataset.pickerActive = "false";

    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "ameow-launcher-handle";
    handle.setAttribute("aria-label", "Ameow");
    handle.appendChild(icon("cat"));
    handle.addEventListener("pointerdown", startDrag);
    handle.addEventListener("click", handleLauncherClick);

    const handleWrap = document.createElement("div");
    handleWrap.className = "ameow-launcher-handle-wrap";
    handleWrap.append(
      handle,
      createActionButton("eyeOff", t("launcher.menu.hideSite", "Hide on this site"), () => void hideOnThisSite()),
      createActionButton("lock", t("launcher.actions.lock", "Lock position"), toggleLocked),
    );
    handleWrap.querySelectorAll(".ameow-launcher-action").forEach((button) => {
      button.classList.add("ameow-launcher-icon-control");
    });

    const topActions = document.createElement("div");
    topActions.className = "ameow-launcher-actions ameow-launcher-actions-top";
    topActions.append(
      createActionButton("pick", t("launcher.actions.pick", "Pick download"), startPicker),
    );

    const bottomActions = document.createElement("div");
    bottomActions.className = "ameow-launcher-actions ameow-launcher-actions-bottom";
    bottomActions.append(
      createQualityControl(),
      createActionButton("more", t("launcher.actions.more", "More"), () => {
        launcher.dataset.menuOpen = launcher.dataset.menuOpen === "true" ? "false" : "true";
      }),
    );

    const menu = document.createElement("div");
    menu.className = "ameow-launcher-menu";
    menu.append(
      createMenuItem("switchSide", t("launcher.menu.switchSide", "Switch side"), () => void switchSide()),
    );
    const feedback = document.createElement("div");
    feedback.className = "ameow-launcher-feedback";
    feedback.dataset.visible = "false";
    feedback.dataset.kind = "pending";

    launcher.append(topActions, handleWrap, bottomActions, menu, feedback);
    updateLauncherConfig(config);
    refreshLauncherLabels();
    refreshQualitySelection();
    enableLauncherTransitionsAfterStylesheet(stylesheet);
    shadow.append(stylesheet, launcher);
    document.documentElement.appendChild(rootHost);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === PING_MESSAGE) {
      sendResponse({
        ok: true,
        requestId: message.requestId,
        mounted: Boolean(launcher),
        visible: Boolean(launcher && rootHost?.isConnected),
        enabled: config.enabled,
        hiddenForSite: launcherConfig.isSiteDisabled(config, window.location.href),
        side: config.side,
        locked: config.locked,
        version: 1,
      });
      return true;
    }

    if (message?.type === CAPTURE_CURRENT_MESSAGE) {
      sendResponse({
        success: true,
        payload: captureEvidence.buildCurrentContentPayload(),
      });
      return true;
    }

    if (message?.type === RESTORE_MESSAGE) {
      void (async () => {
        config = await launcherConfig.getConfig();
        if (config.enabled && !launcherConfig.isSiteDisabled(config, window.location.href)) {
          mountLauncher();
        }
        sendResponse({
          success: Boolean(launcher),
          mounted: Boolean(launcher),
          side: config.side,
        });
      })();
      return true;
    }

    if (message?.type === CONFIG_UPDATE_MESSAGE) {
      config = launcherConfig.normalizeConfig(message.config);
      if (!config.enabled || launcherConfig.isSiteDisabled(config, window.location.href)) {
        unmountLauncher();
      } else if (!launcher) {
        mountLauncher();
      } else {
        updateLauncherConfig(config);
      }
      sendResponse({
        success: true,
        mounted: Boolean(launcher),
        visible: Boolean(launcher && rootHost?.isConnected),
        enabled: config.enabled,
        side: config.side,
        locked: config.locked,
      });
      return true;
    }

    if (message?.type === "connection_update") {
      connectionState = message.state || (message.connected ? "connected" : "offline");
      if (launcher) {
        launcher.dataset.connectionState = connectionState;
        refreshHandleTooltip();
      }
    }

    if (message?.type === "language_update") {
      void (async () => {
        await loadLocale();
        refreshLauncherLabels();
      })();
    }

    return false;
  });

  if (chrome?.storage?.onChanged && directDownloadQuality) {
    storageChangeListener = (changes, areaName) => {
      if (areaName !== "local") {
        return;
      }
      const changedValue =
        changes?.[directDownloadQuality.STORAGE_KEY]?.newValue
        ?? changes?.[directDownloadQuality.LEGACY_STORAGE_KEY]?.newValue;
      if (typeof changedValue !== "string") {
        return;
      }
      qualityPreference = directDownloadQuality.normalizeQualityPreference(changedValue);
      refreshQualitySelection();
    };
    chrome.storage.onChanged.addListener(storageChangeListener);
  }

  void (async () => {
    await loadLocale();
    await loadQualityPreference();
    config = await launcherConfig.getConfig();
    if (!config.enabled || launcherConfig.isSiteDisabled(config, window.location.href)) {
      return;
    }
    mountLauncher();
    const statusResponse = await sendMessage({ type: "get_status" });
    connectionState = statusResponse?.state || (statusResponse?.connected ? "connected" : "offline");
    if (launcher) {
      launcher.dataset.connectionState = connectionState;
      refreshHandleTooltip();
    }
    await sendMessage({ type: STATUS_MESSAGE, mounted: true });
  })();
})();
