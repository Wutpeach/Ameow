import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const popupJs = readFileSync(path.resolve("browser-extension/popup.js"), "utf8");
const popupCss = readFileSync(path.resolve("browser-extension/popup.css"), "utf8");
const popupHtml = readFileSync(path.resolve("browser-extension/popup.html"), "utf8");
const backgroundJs = readFileSync(path.resolve("browser-extension/background.js"), "utf8");
const portSource = readFileSync(path.resolve("browser-extension/desktop-port.js"), "utf8");

describe("browser extension popup download capability UI", () => {
  it("renders only the compact Desktop capability badge from download capability state", () => {
    expect(popupJs).toContain("resolveDownloadCapability");
    expect(popupJs).toContain("ameow-media-desktop-badge");
    expect(popupJs).toContain("\"Desktop\"");
    expect(popupJs).not.toContain("Desktop+");
  });

  it("styles the desktop badge as a compact orange label", () => {
    expect(popupCss).toContain(".ameow-media-desktop-badge");
    expect(popupCss).toMatch(/\.ameow-media-desktop-badge\s*\{[\s\S]*?rgba\(245,\s*158,\s*11/);
    expect(popupCss).toMatch(/\.ameow-media-desktop-badge\s*\{[\s\S]*?font-size:\s*9px;/);
  });

  it("adds a dedicated popup preview slot before the scrollable media list", () => {
    expect(popupHtml).toContain('id="mediaPreviewSlot"');
    expect(popupHtml.indexOf('id="mediaPreviewSlot"')).toBeLessThan(popupHtml.indexOf('id="mediaList"'));
    expect(popupJs).toContain("mediaPreviewSlot: document.getElementById(\"mediaPreviewSlot\")");
    expect(popupCss).toContain(".ameow-media-preview-slot[data-visible=\"true\"] + .ameow-media-list");
  });

  it("gates playable previews through download capability state", () => {
    expect(popupJs).toContain("function isCandidatePreviewable(candidate)");
    expect(popupJs).toContain("resolveDownloadCapability?.(candidate)");
    expect(popupJs).toContain("capability?.requiresDesktop !== true");
    expect(popupJs).toContain("capability?.browserDownloadable === true");
    expect(popupJs).toContain("Preview unavailable");
  });

  it("uses stable SVG hooks for play, pause, and unavailable preview affordances", () => {
    expect(popupJs).toContain("function createPreviewIcon(active, previewable)");
    expect(popupJs).toContain("document.createElementNS(\"http://www.w3.org/2000/svg\", \"svg\")");
    expect(popupJs).toContain("ameow-preview-toggle-icon");
    expect(popupJs).toContain("button.appendChild(createPreviewIcon(active, previewable))");
    expect(popupCss).toContain(".ameow-preview-toggle-icon");
    expect(popupCss).not.toContain(".ameow-preview-toggle::before");
  });

  it("renders native video and custom audio previews without autoplay", () => {
    expect(popupJs).toContain("document.createElement(\"video\")");
    expect(popupJs).toContain("video.controls = true");
    expect(popupJs).toContain("video.preload = \"metadata\"");
    expect(popupJs).toContain("video.playsInline = true");
    expect(popupJs).toContain("video.poster = previewCandidate.previewUrl");
    expect(popupJs).toContain("document.createElement(\"audio\")");
    expect(popupJs).toContain("function createAudioSampler(candidate)");
    expect(popupJs).toContain("audio.className = \"ameow-audio-engine\"");
    expect(popupJs).toContain("audio.preload = \"metadata\"");
    expect(popupJs).toContain("await audio.play()");
    expect(popupJs).not.toContain("autoplay");
    expect(popupJs).not.toContain("audio.controls = true");
    expect(popupCss).toContain(".ameow-audio-sampler");
    expect(popupCss).toContain(".ameow-audio-sampler-range");
  });

  it("uses explicit play/pause preview state and clears it on tab changes and refresh", () => {
    expect(popupJs).toContain("let activeVideoPreviewId = null");
    expect(popupJs).toContain("let activeAudioPreviewId = null");
    expect(popupJs).toContain("function clearActivePreviewState()");
    expect(popupJs).toContain("activeAudioPreviewId = active ? null : id");
    expect(popupJs).toContain("activeVideoPreviewId = active ? null : id");
    expect(popupJs).toContain("clearActivePreviewState();");
  });

  it("groups duplicate display candidates while preserving preview and desktop routing candidates", () => {
    expect(popupJs).toContain("function mergeDisplayCandidates(candidates)");
    expect(popupJs).toContain("function createDisplayCandidate(group, index)");
    expect(popupJs).toContain("function arePageScopedMediaCandidates(left, right)");
    expect(popupJs).toContain("function isCurrentPageCandidate(candidate)");
    expect(popupJs).toContain("candidate.source === \"current_page\"");
    expect(popupJs).toContain("hasCurrentPageDesktop");
    expect(popupJs).toContain("const title = candidateDisplayTitle(desktopCandidate) || candidateDisplayTitle(previewCandidate)");
    expect(popupJs).toContain("return arePageScopedMediaCandidates(left, right)");
    expect(popupJs).not.toContain("const hasSharedDuration");
    expect(popupJs).not.toContain("const hasSharedDimensions");
    expect(popupJs).toContain("previewCandidate");
    expect(popupJs).toContain("desktopCandidate");
    expect(popupJs).toContain("browserFallbackCandidate");
    expect(popupJs).toContain("displayCapability");
    expect(popupJs).toContain("renderMediaPreviewSlot(displayCandidates)");
    expect(popupJs).toContain("downloadCandidate(candidate, row)");
    // Candidate routing lives in the selection operations module; the
    // service worker delegates to it.
    const selectionOpsSource = readFileSync(path.resolve("browser-extension/selection-ops.js"), "utf8");
    expect(selectionOpsSource).toContain("candidate.desktopCandidate");
    expect(selectionOpsSource).toContain("candidate.browserFallbackCandidate");
    expect(selectionOpsSource).toContain("candidate.selectedVideoVariant");
    expect(selectionOpsSource).toContain("downloadCapabilityUtils.canUseBrowserFallback(fallbackCandidate)");
    expect(backgroundJs).toContain("selectionOps?.downloadCandidate(candidate)");
    expect(backgroundJs).toContain("selectedVideoVariant: normalized.selectedVideoVariant");
    expect(selectionOpsSource).toContain("canUseBrowserFallback");
  });

  it("renders a row-level quality selector for grouped video variants", () => {
    expect(popupJs).toContain("function createVariantSelector(candidate, row)");
    expect(popupJs).toContain("const variants = normalizeVariantList(candidate?.variants)");
    expect(popupJs).toContain("if (variants.length <= 1)");
    expect(popupJs).toContain("document.createElement(\"select\")");
    expect(popupJs).toContain("selector.className = \"ameow-variant-select\"");
    expect(popupJs).toContain("candidate.selectedVideoVariant = nextVariant");
    expect(popupJs).toContain("candidate.preferredVariantUrl = nextVariant.url");
    expect(popupCss).toContain(".ameow-variant-select");
  });

  it("merges direct media rows with grouped variant rows when the direct URL is a variant", () => {
    expect(popupJs).toContain("function areVariantLinkedCandidates(left, right)");
    expect(popupJs).toContain("const leftVariants = variantUrlSet(left)");
    expect(popupJs).toContain("const rightVariants = variantUrlSet(right)");
    expect(popupJs).toContain("rightVariants.has(leftUrl)");
    expect(popupJs).toContain("leftVariants.has(rightUrl)");
    expect(popupJs).toContain("return arePageScopedMediaCandidates(left, right)");
    expect(popupJs).toContain("|| areVariantLinkedCandidates(left, right)");
  });

  it("merges Weibo direct player rows with grouped desktop variant rows for the same status id", () => {
    expect(popupJs).toContain("function areSameWeiboStatusCandidates(left, right)");
    expect(popupJs).toContain("function candidateWeiboStatusId(candidate)");
    expect(popupJs).toContain("weiboStatusIdFromUrl(mediaScanResult?.pageUrl)");
    expect(popupJs).toContain("isWeiboGroupedCandidate(left)");
    expect(popupJs).toContain("isCurrentWeiboDirectCandidate(directCandidate)");
    expect(popupJs).toContain("|| areSameWeiboStatusCandidates(left, right)");
  });

  it("tracks browser download lifecycle without building a popup download manager", () => {
    expect(backgroundJs).toContain("browser-download-lifecycle.js");
    expect(backgroundJs).toContain("createBrowserDownloadTracker");
    expect(backgroundJs).toContain("browserDownloadTracker?.recordAccepted");
    expect(backgroundJs).toContain("browserDownloadStatus: downloadState?.status || 'accepted'");
    expect(backgroundJs).toContain("chrome.downloads.onChanged.addListener");
    expect(backgroundJs).toContain("handleBrowserDownloadChanged(delta)");
    expect(backgroundJs).toContain("get_browser_download_state");
    expect(popupJs).toContain("response?.downloadedBy !== \"browser\"");
    expect(popupJs).not.toContain("popup.media.feedback.browserStarted");
    expect(popupJs).not.toContain("Browser download started");
    expect(popupJs).not.toContain("chrome.downloads.onChanged.addListener");
  });

  it("renders image candidates with a dedicated grid card layout and existing actions", () => {
    expect(popupJs).toContain("elements.mediaList.dataset.mediaType = currentMediaType");
    expect(popupJs).toContain("createImageCard(candidate, index)");
    expect(popupJs).toContain("ameow-image-card");
    expect(popupJs).toContain("ameow-image-card-thumb");
    expect(popupJs).toContain("imageFormatLabel(candidate)");
    expect(popupJs).toContain("candidate.width && candidate.height");
    expect(popupJs).toContain("formatByteSize(candidateByteSize(candidate))");
    expect(popupJs).toContain("footer.className = \"ameow-image-card-footer\"");
    expect(popupJs).toContain("meta.textContent = metaParts.join(\" / \") || imageFormatLabel(candidate)");
    expect(popupJs).toContain("footer.append(meta, menuButton)");
    expect(popupJs).toContain("body.append(footer)");
    expect(popupJs).not.toContain("ameow-image-card-title");
    expect(popupJs).not.toContain("imageTitleLabel");
    expect(popupJs).toContain("downloadCandidate(candidate, card)");
    expect(popupJs).toContain("copyCandidateLink(candidate, card)");
    expect(popupJs).toContain("showCandidateSource(candidate, card)");
    expect(popupCss).toContain(".ameow-media-list[data-media-type=\"image\"][data-visible=\"true\"]");
    expect(popupCss).toContain("grid-auto-rows: 154px");
    expect(popupCss).toContain("align-content: start");
    expect(popupCss).toContain(".ameow-image-card");
    expect(popupCss).toMatch(/\.ameow-image-card\s*\{[\s\S]*?height:\s*154px;/);
    expect(popupCss).toContain("grid-template-rows: 112px 22px");
    expect(popupCss).toContain(".ameow-image-card-footer");
    expect(popupCss).toContain("grid-template-columns: minmax(0, 1fr) 22px");
    expect(popupCss).not.toContain(".ameow-image-card-title");
  });

  it("renders useful media detail metadata instead of host/source/link text", () => {
    expect(popupJs).toContain("function candidateDetailLabel(candidate)");
    expect(popupJs).toContain("function formatByteSize(bytes)");
    expect(popupJs).toContain("function formatDuration(seconds)");
    expect(popupJs).toContain("[format, size, duration, dimensions].filter(Boolean).join(\" / \")");
    expect(popupJs).toContain("meta.textContent = candidateDetailLabel(candidate) || candidateDetailLabel(previewCandidate)");
    expect(popupJs).not.toContain("sourceLabel(previewCandidate.source || candidate.source, t)");
    expect(popupJs).not.toContain("candidate.host || shortHost(candidate.url)");
  });

  it("adds popup-local image lightbox behavior without hijacking image card menus", () => {
    expect(popupHtml).toContain('id="imageLightbox"');
    expect(popupHtml).toContain('id="imageLightboxBackdrop"');
    expect(popupHtml).toContain('id="imageLightboxClose"');
    expect(popupHtml).toContain('id="imageLightboxImage"');
    expect(popupJs).toContain("function openImageLightbox(candidate, id)");
    expect(popupJs).toContain("function closeImageLightbox()");
    expect(popupJs).toContain("thumbnail.dataset.imagePreviewTarget = \"true\"");
    expect(popupJs).toContain("openImageLightbox(candidate, id)");
    expect(popupJs).toContain("elements.imageLightboxBackdrop.addEventListener(\"click\", closeImageLightbox)");
    expect(popupJs).toContain("elements.imageLightboxClose.addEventListener(\"click\", closeImageLightbox)");
    expect(popupJs).toContain("if (event.key === \"Escape\")");
    expect(popupJs).toContain("event.stopPropagation();");
    expect(popupCss).toContain(".ameow-image-lightbox[data-open=\"true\"]");
    expect(popupCss).toContain("cursor: zoom-in");
  });

  it("renders the popup quick-action grid and popup-contained drawers", () => {
    expect(popupHtml).toContain("ameow-quick-actions");
    expect(popupHtml).toContain('id="downloadSettingsAction"');
    expect(popupHtml).toContain('id="pickDownloadAction"');
    expect(popupHtml).toContain('id="loginStateAction"');
    expect(popupHtml).toContain('id="helpDocsAction"');
    expect(popupHtml).toContain('id="drawerOverlay"');
    expect(popupHtml).toContain('id="downloadSettingsDrawer"');
    expect(popupHtml).toContain('id="loginStateDrawer"');
    expect(popupCss).toContain(".ameow-quick-actions");
    expect(popupCss).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(popupCss).toContain(".ameow-drawer-overlay");
    expect(popupCss).toContain(".ameow-drawer-panel");
    expect(popupCss).toContain(".ameow-drawer-panel[hidden]");
    expect(popupCss).toContain(".ameow-drawer-panel[data-open=\"true\"]");
    expect(popupCss).toContain("transform: translateY(14px) scale(0.985)");
    expect(popupJs).toContain("function openDrawer(drawerId");
    expect(popupJs).toContain("function closeDrawer()");
    expect(popupJs).toContain("drawerCloseTimer");
    expect(popupJs).toContain("getBrowserExtensionDocsUrl");
  });

  it("keeps the media browser height stable when scan results are sparse", () => {
    expect(popupCss).toMatch(/\.ameow-media-panel\s*\{[\s\S]*?height:\s*344px;/);
    expect(popupCss).toMatch(/\.ameow-media-list\s*\{[\s\S]*?flex:\s*1 1 auto;/);
    expect(popupCss).toMatch(/\.ameow-media-empty\s*\{[\s\S]*?flex:\s*1 1 auto;/);
  });

  it("moves download quality into the drawer while keeping the quick-action summary", () => {
    expect(popupHtml).toContain('id="qualitySummaryText"');
    expect(popupHtml).toContain('id="qualityGrid"');
    expect(popupHtml.indexOf('id="qualitySummaryText"')).toBeLessThan(popupHtml.indexOf('id="qualityGrid"'));
    expect(popupJs).toContain("renderQualityOptions(currentQualityPreference)");
    expect(popupJs).toContain("elements.qualitySummaryText.textContent");
    expect(popupJs).toContain("openDrawer(\"download-settings\"");
  });

  it("starts the floating-launcher picker from the popup instead of duplicating picker UI", () => {
    const launcherJs = readFileSync(path.resolve("browser-extension/floating-launcher.js"), "utf8");
    expect(popupJs).toContain('sendRuntimeMessage({ type: "start_pick_download" })');
    expect(backgroundJs).toContain("INTERNAL_START_PICKER_MESSAGE = 'ameow_start_picker'");
    expect(backgroundJs).toContain("async function startPickDownloadForActiveTab()");
    expect(backgroundJs).toContain("type: INTERNAL_START_PICKER_MESSAGE");
    expect(launcherJs).toContain('const START_PICKER_MESSAGE = "ameow_start_picker"');
    expect(launcherJs).toContain("startPicker();");
  });

  it("uses desktop-authoritative synchronized login summaries in the popup drawer", () => {
    const electronMain = readFileSync(path.resolve("electron/main.mts"), "utf8");
    expect(popupJs).toContain('sendRuntimeMessage({ type: "get_site_session_drawer_state" })');
    expect(popupJs).toContain("renderLoginDrawerSites");
    expect(popupJs).toContain("No synchronized sites yet");
    expect(backgroundJs).toContain("async function getSiteSessionDrawerState()");
    // The raw Desktop action and offline projection live in the site-session
    // operations module; the service worker delegates to it.
    const siteSessionOpsSource = readFileSync(path.resolve("browser-extension/site-session-ops.js"), "utf8");
    expect(portSource).toContain("site_session_synced_summary");
    expect(siteSessionOpsSource).toContain("desktopPort?.getSiteSessionSummary");
    expect(siteSessionOpsSource).toContain("reason: \"desktop_offline\"");
    expect(backgroundJs).toContain("siteSessionOps?.getDrawerState()");
    expect(electronMain).toContain("async function buildSiteSessionSyncedSummaryPayload()");
    expect(electronMain).toContain('state.availability !== "ready" && state.availability !== "partial"');
    expect(electronMain).toContain("typeof state.updatedAtMs !== \"number\"");
  });
});
