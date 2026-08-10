import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

// Behavior tests for the media scan commit guards: the real page-context
// store, scan cache, and network cache modules wired through the scan ops
// module with a fake tab/message harness — the same composition background.js
// uses. An old scan completing after a newer scan, a same-URL reload, or a
// tab switch must be rejected before it writes the cache.

const loadWorld = () => {
  const context = { self: {}, globalThis: {}, Map, Date, URL, Promise, console, setTimeout, clearTimeout };
  for (const file of [
    "page-context.js",
    "media-scan-cache.js",
    "media-network-cache.js",
    "media-scan-ops.js",
  ]) {
    const source = readFileSync(path.resolve(`browser-extension/${file}`), "utf8");
    vm.runInNewContext(source, context, { filename: file });
  }
  return context.self;
};

const createHarness = () => {
  const root = loadWorld();
  const pageContextStore = root.AmeowPageContext.createPageContextStore();
  const pageSnapshotValidator = root.AmeowPageContext.createPageSnapshotValidator({
    getActiveTab: async () => activeTab,
    pageContextStore,
  });

  let activeTab = null;
  const scanGenerations = new Map();
  const selectionGenerations = new Map();
  const stored = {};
  const scanQueue = { responses: [] }; // queued content-script responses, consumed in order
  let extensionStoreUpdates = 0;

  const extensionStore = {
    async update(key, reducer) {
      extensionStoreUpdates += 1;
      stored[key] = reducer(stored[key]);
    },
  };

  const nextScanGeneration = (tabId) => {
    const next = (scanGenerations.get(tabId) || 0) + 1;
    scanGenerations.set(tabId, next);
    return next;
  };
  const getScanGeneration = (tabId) => scanGenerations.get(tabId) || 0;
  const nextSelectionGeneration = (tabId) => {
    const next = (selectionGenerations.get(tabId) || 0) + 1;
    selectionGenerations.set(tabId, next);
    return next;
  };

  const ops = root.AmeowMediaScanOps.createMediaScanOps({
    getActiveTab: async () => activeTab,
    sendMessageToTab: async () => scanQueue.responses.shift() || { success: false, reason: "no_response" },
    storageGet: async (key) => ({ [key]: stored[key] }),
    getNetworkMediaEntriesForTab: async () => [],
    extensionStore,
    mediaScanCache: root.AmeowMediaScanCache,
    mediaNetworkCache: root.AmeowMediaNetworkCache,
    pageContextStore,
    pageSnapshotValidator,
    nextScanGeneration,
    getScanGeneration,
    nextSelectionGeneration,
    normalizeHttpUrl: (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
    hashString: (value) => String(value),
    storageKey: "ameowMediaScanCache",
    ttlMs: 60000,
    cacheTtlMs: 300000,
    totalLimit: 24,
    scanTotalLimit: 100,
    scanTimeoutMs: 5000,
  });

  const setTab = (tab) => {
    activeTab = tab;
  };
  const navigate = (tabId, url) => {
    pageContextStore.advanceNavigation(tabId);
    if (activeTab?.id === tabId) {
      activeTab = { ...activeTab, url };
    }
  };

  return { ops, setTab, navigate, stored, extensionStoreUpdates, scanQueue };
};

const scanResult = (url, videos = []) => ({
  success: true,
  pageUrl: url,
  pageTitle: "Page",
  videos,
  audios: [],
  images: [],
  scannedAt: Date.now() - 10,
  scanDurationMs: 5,
  truncated: false,
});

describe("media scan commit guards", () => {
  it("commits a fresh scan to the cache with its page context and generations", async () => {
    const harness = createHarness();
    const { ops, setTab, stored } = harness;

    setTab({ id: 1, url: "https://a.com/page" });
    harness.scanQueue.responses = [scanResult("https://a.com/page", [{ url: "https://a.com/v.mp4" }])];

    const result = await ops.scanPageMediaForActiveTab();
    expect(result.success).toBe(true);
    expect(result.generation).toBe(1);
    expect(result.selectionGeneration).toBe(1);
    expect(result.pageContextKey).toContain("https://a.com/page#0");
    expect(stored.ameowMediaScanCache).toBeTruthy();
    const entry = Object.values(stored.ameowMediaScanCache)[0];
    expect(entry.pageContextKey).toBe(result.pageContextKey);
    expect(entry.generation).toBe(1);
    expect(entry.selectionGeneration).toBe(1);
  });

  it("rejects an old scan that completes after a newer scan of a different page", async () => {
    const harness = createHarness();
    const { ops, setTab, navigate } = harness;

    // Scan A starts against page 1 and stays in flight.
    setTab({ id: 1, url: "https://a.com/one" });
    let resolveA;
    harness.scanQueue.responses = [new Promise((resolve) => { resolveA = resolve; })];
    const scanA = ops.scanPageMediaForActiveTab();
    // Let scan A capture its tab and start awaiting the in-flight response.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The user navigates to page 2 and scans there; scan B completes.
    navigate(1, "https://a.com/two");
    setTab({ id: 1, url: "https://a.com/two" });
    harness.scanQueue.responses = [scanResult("https://a.com/two", [{ url: "https://a.com/two/v.mp4" }])];
    const scanB = await ops.scanPageMediaForActiveTab();
    expect(scanB.success).toBe(true);
    expect(scanB.generation).toBe(2);

    // Scan A's late completion must not write the cache or become current.
    resolveA(scanResult("https://a.com/one", [{ url: "https://a.com/one/v.mp4" }]));
    const resultA = await scanA;
    expect(resultA.success).toBe(false);
    expect(resultA.reason).toBe("stale_page_context");

    const cacheEntries = Object.values(harness.stored.ameowMediaScanCache || {});
    expect(cacheEntries).toHaveLength(1);
    expect(cacheEntries[0].pageUrl).toBe("https://a.com/two");
  });

  it("rejects an old scan response after a same-URL reload without writing the cache", async () => {
    const harness = createHarness();
    const { ops, setTab, navigate, stored } = harness;

    setTab({ id: 1, url: "https://a.com/page" });
    let resolveScan;
    harness.scanQueue.responses = [new Promise((resolve) => { resolveScan = resolve; })];
    const scanPromise = ops.scanPageMediaForActiveTab();
    // Let the scan capture its page context before the reload happens.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Same-URL reload: the loading event advances the navigation generation
    // while the tab URL stays identical.
    navigate(1, "https://a.com/page");
    resolveScan(scanResult("https://a.com/page", [{ url: "https://a.com/v.mp4" }]));

    const result = await scanPromise;
    expect(result.success).toBe(false);
    expect(result.reason).toBe("stale_page_context");
    expect(stored.ameowMediaScanCache).toBeUndefined();
  });

  it("rejects a scan that completes after the tab lost active status", async () => {
    const harness = createHarness();
    const { ops, setTab, stored } = harness;

    setTab({ id: 1, url: "https://a.com/page" });
    let resolveScan;
    harness.scanQueue.responses = [new Promise((resolve) => { resolveScan = resolve; })];
    const scanPromise = ops.scanPageMediaForActiveTab();
    // Let the scan capture its tab before the switch.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Another tab became active while the scan was in flight.
    setTab({ id: 2, url: "https://b.com/other" });
    resolveScan(scanResult("https://a.com/page", []));

    const result = await scanPromise;
    expect(result.success).toBe(false);
    expect(result.reason).toBe("stale_page_context");
    expect(stored.ameowMediaScanCache).toBeUndefined();
  });

  it("keeps page-scoped scan state isolated between tabs", async () => {
    const harness = createHarness();
    const { ops, setTab, stored } = harness;

    // Tab 1 scans and commits.
    setTab({ id: 1, url: "https://a.com/one" });
    harness.scanQueue.responses = [scanResult("https://a.com/one", [{ url: "https://a.com/one/v.mp4" }])];
    const tab1 = await ops.scanPageMediaForActiveTab();
    expect(tab1.success).toBe(true);

    // Tab 2 scans and commits; tab 1's cache entry must survive.
    setTab({ id: 2, url: "https://b.com/two" });
    harness.scanQueue.responses = [scanResult("https://b.com/two", [{ url: "https://b.com/two/v.mp4" }])];
    const tab2 = await ops.scanPageMediaForActiveTab();
    expect(tab2.success).toBe(true);

    const entries = Object.values(stored.ameowMediaScanCache);
    expect(entries).toHaveLength(2);

    // Cache reads are page-context aware per tab.
    setTab({ id: 1, url: "https://a.com/one" });
    const read1 = await ops.getMediaScanCacheForActiveTab();
    expect(read1.cached).toBe(true);
    expect(read1.result.pageUrl).toBe("https://a.com/one");

    // Same-URL reload makes the cached snapshot unreadable.
    harness.navigate(1, "https://a.com/one");
    const readAfterReload = await ops.getMediaScanCacheForActiveTab();
    expect(readAfterReload.cached).toBe(false);
  });
});
