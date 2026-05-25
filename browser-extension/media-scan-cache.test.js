import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const helperPath = path.resolve("browser-extension/media-scan-cache.js");
const helperSource = readFileSync(helperPath, "utf8");

const loadHelper = () => {
  const context = {
    self: {},
    globalThis: {},
  };
  vm.runInNewContext(helperSource, context, { filename: helperPath });
  return context.self.AmeowMediaScanCache;
};

describe("media scan cache helper", () => {
  it("drops stale entries before applying the bounded cache size", () => {
    const helper = loadHelper();
    const cache = {};

    cache.stale = {
      scannedAt: 0,
      pageUrl: "https://example.com/stale",
    };
    for (let index = 0; index < 4; index += 1) {
      cache[`tab-${index}`] = {
        scannedAt: 9_500 + index,
        pageUrl: `https://example.com/page-${index}`,
      };
    }

    const pruned = helper.pruneMediaScanCacheEntries(cache, "current", {
      scannedAt: 10_000,
      pageUrl: "https://example.com/current",
    }, {
      now: 10_000,
      ttlMs: 1_000,
      totalLimit: 24,
    });

    expect(Object.keys(pruned)).toHaveLength(5);
    expect(pruned.current).toMatchObject({
      pageUrl: "https://example.com/current",
    });
    expect(pruned.stale).toBeUndefined();
  });

  it("keeps only the newest entries within the configured cache limit", () => {
    const helper = loadHelper();
    const cache = {};

    for (let index = 0; index < 30; index += 1) {
      cache[`tab-${index}`] = {
        scannedAt: 10_000 + index,
        pageUrl: `https://example.com/page-${index}`,
      };
    }

    const pruned = helper.pruneMediaScanCacheEntries(cache, "current", {
      scannedAt: 20_000,
      pageUrl: "https://example.com/current",
    }, {
      now: 20_000,
      ttlMs: 60_000,
      totalLimit: 24,
    });

    expect(Object.keys(pruned)).toHaveLength(24);
    expect(pruned.current).toMatchObject({
      pageUrl: "https://example.com/current",
    });
    expect(pruned["tab-0"]).toBeUndefined();
    expect(pruned["tab-29"]).toBeDefined();
  });
});
