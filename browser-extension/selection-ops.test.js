import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

// Behavior tests for selection/capture commit guards: the real page-context
// store wired through the selection ops module with a fake tab harness —
// the same composition background.js uses. Selection intents bind to the
// page context and their own selection generation; captures bind to their
// own capture generation; a stale intent/capture is rejected before any
// submission happens.

const loadWorld = () => {
  const context = { self: {}, globalThis: {}, Map, Date, URL, Promise };
  const source = readFileSync(path.resolve("browser-extension/page-context.js"), "utf8");
  vm.runInNewContext(source, context, { filename: "page-context.js" });
  const opsSource = readFileSync(path.resolve("browser-extension/selection-ops.js"), "utf8");
  vm.runInNewContext(opsSource, context, { filename: "selection-ops.js" });
  return context.self;
};

const createHarness = (overrides = {}) => {
  const root = loadWorld();
  const pageContextStore = root.AmeowPageContext.createPageContextStore();

  let activeTab = null;
  let connected = true;
  const selectionGenerations = new Map();
  const captureGenerations = new Map();
  const submitted = [];

  const pageSnapshotValidator = root.AmeowPageContext.createPageSnapshotValidator({
    getActiveTab: async () => activeTab,
    pageContextStore,
  });

  const ops = root.AmeowSelectionOps.createSelectionOps({
    getActiveTab: async () => activeTab,
    pageContextStore,
    pageSnapshotValidator,
    getSelectionGeneration: (tabId) => selectionGenerations.get(tabId) || 0,
    nextCaptureGeneration: (tabId) => {
      const next = (captureGenerations.get(tabId) || 0) + 1;
      captureGenerations.set(tabId, next);
      return next;
    },
    getCaptureGeneration: (tabId) => captureGenerations.get(tabId) || 0,
    isConnected: () => connected,
    isConnecting: () => false,
    downloadCapabilityUtils: {
      resolveDownloadCapability: (candidate) => ({
        browserDownloadable: candidate?.browserDownloadable === true,
        requiresDesktop: candidate?.requiresDesktop !== false,
        desktopReason: "desktop_required",
      }),
      canUseBrowserFallback: (candidate) => candidate?.browserDownloadable === true,
    },
    normalizeHttpUrl: (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
    selectFirstHttpUrl: (...values) => values.find(Boolean) || null,
    normalizeSelectedVideoVariant: (value) => (value && typeof value === "object" ? value : null),
    deriveBrowserDownloadFilename: () => "file.mp4",
    startBrowserDownload: async (request) => ({ ...request, downloadedBy: "browser" }),
    isRecoverableDesktopConnectionFailure: (result) => result?.reason === "desktop_offline",
    submitVideoSelection: async (payload, context) => {
      submitted.push({ kind: "video", payload, context });
      return { success: true, connected: true };
    },
    submitImageSelection: async (payload, context) => {
      submitted.push({ kind: "image", payload, context });
      return { success: true, connected: true };
    },
    submitSelectionPayload: async (payload, context) => {
      submitted.push({ kind: "capture", payload, context });
      return { success: true, connected: true };
    },
    sendMessageToTab: async () => ({
      success: true,
      payload: { type: "video_selection", url: "https://a.com/v.mp4", pageUrl: "https://a.com/page" },
    }),
    ...overrides,
  });

  const setTab = (tab) => {
    activeTab = tab;
  };
  const bumpSelection = (tabId) => {
    const next = (selectionGenerations.get(tabId) || 0) + 1;
    selectionGenerations.set(tabId, next);
  };

  return { ops, setTab, bumpSelection, pageContextStore, submitted, setConnected: (v) => { connected = v; } };
};

const candidate = (overrides = {}) => ({
  url: "https://a.com/v.mp4",
  pageUrl: "https://a.com/page",
  mediaType: "video",
  requiresDesktop: true,
  title: "Video",
  selectedVideoVariant: { url: "https://a.com/variant.mp4", label: "1080p", type: "mp4" },
  ...overrides,
});

describe("selection commit guards", () => {
  it("rejects a stale selection intent after the page navigated", async () => {
    const harness = createHarness();
    const { ops, setTab, pageContextStore } = harness;

    setTab({ id: 1, url: "https://a.com/page" });
    const keyBefore = pageContextStore.pageContextKey({ tabId: 1, frameId: 0, pageUrl: "https://a.com/page" });

    // Same-URL reload changes the page context (navigation generation).
    pageContextStore.advanceNavigation(1);

    const result = await ops.downloadCandidate(candidate({ pageContextKey: keyBefore, selectionGeneration: 1 }));
    expect(result).toMatchObject({ success: false, reason: "stale_page_context" });
    expect(harness.submitted).toHaveLength(0);
  });

  it("rejects a stale selection intent after a newer selection snapshot", async () => {
    const harness = createHarness();
    const { ops, setTab, pageContextStore, bumpSelection } = harness;

    setTab({ id: 1, url: "https://a.com/page" });
    const key = pageContextStore.pageContextKey({ tabId: 1, frameId: 0, pageUrl: "https://a.com/page" });
    bumpSelection(1);
    bumpSelection(1);

    // The intent was built against snapshot 1; snapshot 2 is current now.
    const result = await ops.downloadCandidate(candidate({ pageContextKey: key, selectionGeneration: 1 }));
    expect(result).toMatchObject({ success: false, reason: "stale_selection" });
    expect(harness.submitted).toHaveLength(0);
  });

  it("submits a current selection intent with the selected variant preserved", async () => {
    const harness = createHarness();
    const { ops, setTab, pageContextStore, bumpSelection, submitted } = harness;

    setTab({ id: 1, url: "https://a.com/page" });
    const key = pageContextStore.pageContextKey({ tabId: 1, frameId: 0, pageUrl: "https://a.com/page" });
    bumpSelection(1);

    const result = await ops.downloadCandidate(candidate({ pageContextKey: key, selectionGeneration: 1 }));
    expect(result.success).toBe(true);
    expect(submitted).toHaveLength(1);
    const submission = submitted[0];
    expect(submission.payload.selectedVideoVariant).toMatchObject({
      url: "https://a.com/variant.mp4",
      label: "1080p",
    });
    expect(submission.payload.videoUrl).toBe("https://a.com/variant.mp4");
    // P3 wire representation is preserved by the submit operation.
    expect(submission.payload.extensionData.ameowCapture.action).toBe("popup_fallback");
  });

  it("falls back to a browser download for browser-downloadable candidates while offline", async () => {
    const harness = createHarness();
    const { ops, setTab, pageContextStore, bumpSelection, setConnected } = harness;

    setConnected(false);
    setTab({ id: 1, url: "https://a.com/page" });
    const key = pageContextStore.pageContextKey({ tabId: 1, frameId: 0, pageUrl: "https://a.com/page" });
    bumpSelection(1);

    const result = await ops.downloadCandidate(candidate({
      pageContextKey: key,
      selectionGeneration: 1,
      // No selected variant: the browser-downloadable fallback candidate is
      // the only fallback path.
      selectedVideoVariant: null,
      browserDownloadable: true,
      browserFallbackCandidate: { url: "https://a.com/fallback.mp4", browserDownloadable: true },
    }));
    expect(result.downloadedBy).toBe("browser");
    expect(result.url).toBe("https://a.com/fallback.mp4");
  });
});

describe("capture commit guards", () => {
  it("submits a fresh capture for the current page", async () => {
    const harness = createHarness();
    const { ops, setTab, submitted } = harness;

    setTab({ id: 1, url: "https://a.com/page" });
    const result = await ops.captureCurrentContent({ id: 1, url: "https://a.com/page", title: "Page" });
    expect(result.success).toBe(true);
    expect(submitted).toHaveLength(1);
    expect(submitted[0].kind).toBe("capture");
  });

  it("rejects a capture that finished after a same-URL reload", async () => {
    const harness = createHarness();
    const { ops, setTab, pageContextStore, submitted } = harness;

    setTab({ id: 1, url: "https://a.com/page" });
    let resolveCapture;
    const sendMessageToTab = () => new Promise((resolve) => { resolveCapture = resolve; });
    const root = loadWorld();
    const pageSnapshotValidator = root.AmeowPageContext.createPageSnapshotValidator({
      getActiveTab: async () => ({ id: 1, url: "https://a.com/page" }),
      pageContextStore,
    });
    const captureOps = root.AmeowSelectionOps.createSelectionOps({
      getActiveTab: async () => ({ id: 1, url: "https://a.com/page" }),
      pageContextStore,
      pageSnapshotValidator,
      getSelectionGeneration: () => 0,
      nextCaptureGeneration: () => 1,
      getCaptureGeneration: () => 1,
      isConnected: () => true,
      isConnecting: () => false,
      sendMessageToTab,
      submitSelectionPayload: async (payload, context) => {
        submitted.push({ kind: "capture", payload, context });
        return { success: true, connected: true };
      },
    });

    const capturePromise = captureOps.captureCurrentContent({ id: 1, url: "https://a.com/page", title: "Page" });
    // Let the capture reach the in-flight content response.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Same-URL reload advances the navigation generation while the tab URL
    // stays identical.
    pageContextStore.advanceNavigation(1);
    resolveCapture({ success: true, payload: { type: "video_selection", url: "https://a.com/v.mp4" } });

    const result = await capturePromise;
    expect(result).toMatchObject({ success: false, reason: "stale_capture" });
    expect(submitted).toHaveLength(0);
  });

  it("keeps capture and selection generations distinct", async () => {
    const harness = createHarness();
    const { ops, setTab, pageContextStore, bumpSelection } = harness;

    // A capture bumps the capture generation only; a scan bump advances the
    // selection generation only. They must not alias each other.
    setTab({ id: 1, url: "https://a.com/page" });
    await ops.captureCurrentContent({ id: 1, url: "https://a.com/page" });

    const key = pageContextStore.pageContextKey({ tabId: 1, frameId: 0, pageUrl: "https://a.com/page" });
    const result = await ops.downloadCandidate(candidate({ pageContextKey: key, selectionGeneration: 0 }));
    // selection generation 0 is still current after a capture (no scan
    // happened): the intent must not be rejected by the capture.
    expect(result.success).toBe(true);
  });
});
