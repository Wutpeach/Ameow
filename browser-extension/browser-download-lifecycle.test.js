import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const helperPath = path.resolve("browser-extension/browser-download-lifecycle.js");
const helperSource = readFileSync(helperPath, "utf8");

function loadHelper() {
  const context = {
    self: {},
    globalThis: {},
    Date,
    Map,
    Number,
  };
  vm.runInNewContext(helperSource, context, { filename: helperPath });
  return context.self.AmeowBrowserDownloadLifecycle;
}

describe("browser download lifecycle helper", () => {
  it("records accepted browser downloads", () => {
    const helper = loadHelper();
    const tracker = helper.createBrowserDownloadTracker({ ttlMs: 1000, totalLimit: 10 });

    expect(tracker.recordAccepted({
      downloadId: 12,
      url: "https://cdn.example.com/file.mp4",
      filename: "file.mp4",
      createdAt: 100,
    })).toMatchObject({
      downloadId: 12,
      url: "https://cdn.example.com/file.mp4",
      filename: "file.mp4",
      status: "accepted",
      createdAt: 100,
      updatedAt: 100,
    });
    expect(tracker.getState(12)).toMatchObject({ status: "accepted" });
  });

  it("updates tracked downloads from complete and interrupted changes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    try {
      const helper = loadHelper();
      const tracker = helper.createBrowserDownloadTracker({ ttlMs: 10_000, totalLimit: 10 });
      tracker.recordAccepted({ downloadId: 12, createdAt: 100 });
      tracker.recordAccepted({ downloadId: 13, createdAt: 100 });

      expect(tracker.handleChanged({ id: 12, state: { current: "in_progress" } })).toMatchObject({
        downloadId: 12,
        status: "accepted",
      });
      expect(tracker.handleChanged({ id: 12, state: { current: "complete" } })).toMatchObject({
        downloadId: 12,
        status: "complete",
        completedAt: 1_000,
      });
      expect(tracker.handleChanged({
        id: 13,
        state: { current: "interrupted" },
        error: { current: "NETWORK_FAILED" },
      })).toMatchObject({
        downloadId: 13,
        status: "interrupted",
        error: "NETWORK_FAILED",
        interruptedAt: 1_000,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores untracked download changes", () => {
    const helper = loadHelper();
    const tracker = helper.createBrowserDownloadTracker();

    expect(tracker.handleChanged({ id: 999, state: { current: "complete" } })).toBeNull();
  });

  it("keeps tracked download state bounded", () => {
    const helper = loadHelper();
    const tracker = helper.createBrowserDownloadTracker({ ttlMs: 10_000, totalLimit: 2 });

    tracker.recordAccepted({ downloadId: 1, createdAt: 100 });
    tracker.recordAccepted({ downloadId: 2, createdAt: 200 });
    tracker.recordAccepted({ downloadId: 3, createdAt: 300 });

    expect(tracker.snapshot().map((state) => state.downloadId).sort()).toEqual([2, 3]);
  });
});
