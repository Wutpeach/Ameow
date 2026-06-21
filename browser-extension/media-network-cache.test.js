import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const selectionUtilsPath = path.resolve("browser-extension/generic-video-selection-utils.js");
const helperPath = path.resolve("browser-extension/media-network-cache.js");
const selectionUtilsSource = readFileSync(selectionUtilsPath, "utf8");
const helperSource = readFileSync(helperPath, "utf8");

const loadHelper = () => {
  const context = {
    self: {},
    globalThis: {},
    URL,
  };
  vm.runInNewContext(selectionUtilsSource, context, { filename: selectionUtilsPath });
  vm.runInNewContext(helperSource, context, { filename: helperPath });
  return context.self.AmeowMediaNetworkCache;
};

const responseDetails = (overrides = {}) => ({
  url: "https://cdn.example.com/video.mp4?token=secret",
  tabId: 7,
  responseHeaders: [
    { name: "content-type", value: "video/mp4; charset=binary" },
    { name: "content-length", value: "12345" },
    { name: "set-cookie", value: "must-not-be-copied=true" },
  ],
  ...overrides,
});

describe("media network cache helper", () => {
  it("normalizes media response details without persisting sensitive headers", () => {
    const helper = loadHelper();
    const entry = helper.normalizeNetworkMediaEntry(
      responseDetails(),
      { id: 7, url: "https://example.com/watch/1" },
      { now: 10_000 },
    );

    expect(entry).toMatchObject({
      url: "https://cdn.example.com/video.mp4?token=secret",
      tabId: 7,
      pageUrl: "https://example.com/watch/1",
      mediaType: "video",
      source: "web_request",
      contentType: "video/mp4",
      contentLength: 12345,
      extension: "mp4",
      type: "direct_mp4",
      capturedAt: 10_000,
    });
    expect(JSON.stringify(entry)).not.toContain("set-cookie");
    expect(JSON.stringify(entry)).not.toContain("must-not-be-copied");
  });

  it("rejects non-http, non-tab, and non-media responses", () => {
    const helper = loadHelper();
    const tab = { id: 7, url: "https://example.com/watch/1" };

    expect(helper.normalizeNetworkMediaEntry(responseDetails({ url: "blob:https://example.com/1" }), tab)).toBeNull();
    expect(helper.normalizeNetworkMediaEntry(responseDetails({ tabId: -1 }), tab)).toBeNull();
    expect(helper.normalizeNetworkMediaEntry(responseDetails({
      url: "https://cdn.example.com/app.js",
      responseHeaders: [{ name: "content-type", value: "application/javascript" }],
    }), tab)).toBeNull();
  });

  it("detects manifest media from extension when content type is absent", () => {
    const helper = loadHelper();
    const entry = helper.normalizeNetworkMediaEntry(
      responseDetails({
        url: "https://cdn.example.com/playlist.m3u8",
        responseHeaders: [],
      }),
      { id: 7, url: "https://example.com/watch/1" },
      { now: 10_000 },
    );

    expect(entry).toMatchObject({
      mediaType: "video",
      type: "manifest_m3u8",
      extension: "m3u8",
      confidence: "low",
    });
  });

  it("skips Pinterest manifest variants while keeping direct pin media", () => {
    const helper = loadHelper();
    const tab = { id: 7, url: "https://www.pinterest.com/pin/1011902610019399684/" };

    expect(helper.normalizeNetworkMediaEntry(
      responseDetails({
        url: "https://v1.pinimg.com/videos/iht/av1-control-v2/f1/84/f5/example.m3u8",
        responseHeaders: [{ name: "content-type", value: "application/vnd.apple.mpegurl" }],
      }),
      tab,
      { now: 10_000 },
    )).toBeNull();
    expect(helper.normalizeNetworkMediaEntry(
      responseDetails({
        url: "https://v1.pinimg.com/videos/iht/av1-control-v2/f1/84/f5/example.mpd",
        responseHeaders: [{ name: "content-type", value: "application/dash+xml" }],
      }),
      tab,
      { now: 10_000 },
    )).toBeNull();
    expect(helper.normalizeNetworkMediaEntry(
      responseDetails({
        url: "https://v1.pinimg.com/videos/iht/hls/f1/84/f5/example.cmfv",
        responseHeaders: [{ name: "content-type", value: "video/mp4" }],
      }),
      tab,
      { now: 10_000 },
    )).toBeNull();
    expect(helper.normalizeNetworkMediaEntry(
      responseDetails({
        url: "https://v1.pinimg.com/videos/iht/720p/f1/84/f5/example.mp4",
        responseHeaders: [{ name: "content-type", value: "video/mp4" }],
      }),
      tab,
      { now: 10_000 },
    )).toMatchObject({
      mediaType: "video",
      extension: "mp4",
      type: "direct_mp4",
    });
    expect(helper.normalizeNetworkMediaEntry(
      responseDetails({
        url: "https://i.pinimg.com/originals/34/e4/e6/example.jpg",
        responseHeaders: [{ name: "content-type", value: "image/jpeg" }],
      }),
      tab,
      { now: 10_000 },
    )).toMatchObject({
      mediaType: "image",
      extension: "jpg",
      previewUrl: "https://i.pinimg.com/originals/34/e4/e6/example.jpg",
    });
  });

  it("dedupes Pinterest direct video variants to the best asset candidate", () => {
    const helper = loadHelper();
    const result = helper.mergeNetworkCandidatesIntoScanResult({
      success: true,
      pageUrl: "https://www.pinterest.com/pin/1011902610019399684/",
      pageTitle: "Pin page",
      videos: [],
      audios: [],
      images: [],
    }, [
      {
        url: "https://v1.pinimg.com/videos/iht/av1Mp4-enabled-v2/f1/84/f5/f184f5f60381938333397bb7adbd7703_240w.mp4",
        mediaType: "video",
        source: "web_request",
        extension: "mp4",
        contentLength: 1_000_000,
      },
      {
        url: "https://v1.pinimg.com/videos/iht/av1Mp4-enabled-v2/f1/84/f5/f184f5f60381938333397bb7adbd7703_720w.mp4",
        mediaType: "video",
        source: "web_request",
        extension: "mp4",
        contentLength: 4_000_000,
      },
      {
        url: "https://v1.pinimg.com/videos/iht/720p/f1/84/f5/f184f5f60381938333397bb7adbd7703.mp4",
        mediaType: "video",
        source: "web_request",
        extension: "mp4",
        contentLength: 3_000_000,
      },
    ], {
      totalLimit: 10,
    });

    expect(result.videos.map((candidate) => candidate.url)).toEqual([
      "https://v1.pinimg.com/videos/iht/av1Mp4-enabled-v2/f1/84/f5/f184f5f60381938333397bb7adbd7703_720w.mp4",
    ]);
  });

  it("uses image resource URLs as their own popup preview", () => {
    const helper = loadHelper();
    const entry = helper.normalizeNetworkMediaEntry(
      responseDetails({
        url: "https://cdn.example.com/photo.webp",
        responseHeaders: [{ name: "content-type", value: "image/webp" }],
      }),
      { id: 7, url: "https://example.com/gallery/1" },
      { now: 10_000 },
    );

    expect(entry).toMatchObject({
      mediaType: "image",
      previewUrl: "https://cdn.example.com/photo.webp",
    });
  });

  it("skips high-volume stream fragments", () => {
    const helper = loadHelper();
    const tab = { id: 7, url: "https://example.com/watch/1" };

    expect(helper.normalizeNetworkMediaEntry(responseDetails({
      url: "https://cdn.example.com/segment.m4s",
      responseHeaders: [],
    }), tab)).toBeNull();
    expect(helper.normalizeNetworkMediaEntry(responseDetails({
      url: "https://cdn.example.com/segment.ts",
      responseHeaders: [{ name: "content-type", value: "video/mp2t" }],
    }), tab)).toBeNull();
  });

  it("skips Bilibili m4s fragments even when they have renderable content type", () => {
    const helper = loadHelper();
    expect(helper.normalizeNetworkMediaEntry(
      responseDetails({
        url: "https://xy123x456x789xy.mcdn.bilivideo.cn/upgcxcode/example/index.m4s",
        responseHeaders: [
          { name: "content-type", value: "video/mp4" },
          { name: "content-length", value: "12345" },
        ],
      }),
      { id: 7, url: "https://www.bilibili.com/video/BV1xfJ36cERC/" },
      { now: 10_000 },
    )).toBeNull();
  });

  it("keeps per-tab and total cache sizes bounded while dropping stale entries", () => {
    const helper = loadHelper();
    const cache = {
      7: {
        tabId: 7,
        pageUrl: "https://example.com/watch/1",
        updatedAt: 10_000,
        entries: [
          { url: "https://cdn.example.com/stale.mp4", tabId: 7, pageUrl: "https://example.com/watch/1", mediaType: "video", capturedAt: 1_000 },
          { url: "https://cdn.example.com/recent-a.mp4", tabId: 7, pageUrl: "https://example.com/watch/1", mediaType: "video", capturedAt: 9_950 },
          { url: "https://cdn.example.com/recent-b.mp4", tabId: 7, pageUrl: "https://example.com/watch/1", mediaType: "video", capturedAt: 9_960 },
        ],
      },
      8: {
        tabId: 8,
        pageUrl: "https://other.example/watch",
        updatedAt: 9_970,
        entries: [
          { url: "https://cdn.example.com/other.mp4", tabId: 8, pageUrl: "https://other.example/watch", mediaType: "video", capturedAt: 9_970 },
        ],
      },
    };

    const next = helper.pruneNetworkMediaCache(cache, {
      url: "https://cdn.example.com/current.mp4",
      tabId: 7,
      pageUrl: "https://example.com/watch/1",
      mediaType: "video",
      capturedAt: 10_000,
    }, {
      now: 10_000,
      ttlMs: 500,
      perTabLimit: 2,
      totalLimit: 3,
    });

    expect(next["7"].entries.map((entry) => entry.url)).toEqual([
      "https://cdn.example.com/current.mp4",
      "https://cdn.example.com/recent-b.mp4",
    ]);
    expect(JSON.stringify(next)).not.toContain("stale.mp4");
    expect(Object.values(next).flatMap((bucket) => bucket.entries)).toHaveLength(3);
  });

  it("returns only entries for the active tab and current page URL", () => {
    const helper = loadHelper();
    const cache = {
      7: {
        tabId: 7,
        pageUrl: "https://example.com/watch/1",
        updatedAt: 10_000,
        entries: [
          { url: "https://cdn.example.com/current.mp4", tabId: 7, pageUrl: "https://example.com/watch/1", mediaType: "video", capturedAt: 10_000 },
          { url: "https://cdn.example.com/old-page.mp4", tabId: 7, pageUrl: "https://example.com/watch/old", mediaType: "video", capturedAt: 10_000 },
        ],
      },
      8: {
        tabId: 8,
        pageUrl: "https://example.com/watch/1",
        updatedAt: 10_000,
        entries: [
          { url: "https://cdn.example.com/other-tab.mp4", tabId: 8, pageUrl: "https://example.com/watch/1", mediaType: "video", capturedAt: 10_000 },
        ],
      },
    };

    expect(helper.getNetworkMediaEntriesForTab(
      cache,
      { id: 7, url: "https://example.com/watch/1" },
      { now: 10_100, ttlMs: 1_000 },
    ).map((entry) => entry.url)).toEqual(["https://cdn.example.com/current.mp4"]);
  });

  it("merges network candidates after DOM candidates and dedupes by URL", () => {
    const helper = loadHelper();
    const result = helper.mergeNetworkCandidatesIntoScanResult({
      success: true,
      pagePreviewUrl: "https://cdn.example.com/covers/page.jpg",
      videos: [{ url: "https://cdn.example.com/dom.mp4", mediaType: "video", source: "video_element" }],
      audios: [],
      images: [{ url: "https://cdn.example.com/image.jpg", mediaType: "image", source: "img_element" }],
    }, [
      { url: "https://cdn.example.com/dom.mp4", mediaType: "video", source: "web_request" },
      { url: "https://cdn.example.com/network.m3u8", mediaType: "video", source: "web_request" },
      { url: "https://cdn.example.com/audio.mp3", mediaType: "audio", source: "web_request" },
    ], {
      totalLimit: 4,
    });

    expect(result.videos.map((candidate) => candidate.url)).toEqual([
      "https://cdn.example.com/dom.mp4",
      "https://cdn.example.com/network.m3u8",
    ]);
    expect(result.videos[1].previewUrl).toBe("https://cdn.example.com/covers/page.jpg");
    expect(result.audios).toHaveLength(1);
    expect(result.images).toHaveLength(1);
    expect(result.networkCandidateCount).toBe(3);
    expect(result.mergedNetworkCandidateCount).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it("uses cleaned Bilibili page title for network video candidates", () => {
    const helper = loadHelper();
    const result = helper.mergeNetworkCandidatesIntoScanResult({
      success: true,
      pageUrl: "https://www.bilibili.com/video/BV1xfJ36cERC/",
      pageTitle: "Blender 波纹纹理映射修复巧 - 曲线纹理畸变 / 动态循环动画_哔哩哔哩_bilibili",
      pagePreviewUrl: "https://i0.hdslb.com/bfs/archive/current.jpg",
      videos: [],
      audios: [],
      images: [],
    }, [
      {
        url: "https://xy123x456x789xy.mcdn.bilivideo.cn/upgcxcode/example/video.mp4",
        mediaType: "video",
        source: "web_request",
        title: "video.mp4",
      },
    ], {
      totalLimit: 4,
    });

    expect(result.videos[0]).toMatchObject({
      title: "Blender 波纹纹理映射修复巧 - 曲线纹理畸变 / 动态循环动画",
      previewUrl: "https://i0.hdslb.com/bfs/archive/current.jpg",
    });
  });
});
