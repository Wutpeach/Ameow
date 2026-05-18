import { describe, expect, it, vi } from "vitest";

import { createVideoDownloadCommandBridge } from "./videoDownloadCommands.mjs";
import type { ElectronDownloadRuntime } from "../src/electron-runtime/index.js";
import type { ExtensionRequestBridge } from "./extensionRequestBridge.mjs";

const readyStatus = {
  state: "ready",
  source: "managed",
  path: "/runtime/tool",
  error: null,
} as const;

const createRuntimeStub = (): ElectronDownloadRuntime & {
  queueVideoDownload: ReturnType<typeof vi.fn>;
  cancelDownload: ReturnType<typeof vi.fn>;
} => ({
  maxConcurrent: 3,
  getRuntimeDependencyStatus: vi.fn(() => ({
    ytDlp: readyStatus,
    galleryDl: readyStatus,
    douyinDl: readyStatus,
    ffmpeg: readyStatus,
    deno: readyStatus,
  })),
  getRuntimeDependencyGateState: vi.fn(() => ({
    phase: "ready",
    missingComponents: [],
    lastError: null,
    updatedAtMs: 1,
    currentComponent: null,
    currentStage: null,
    progressPercent: null,
    downloadedBytes: null,
    totalBytes: null,
    nextComponent: null,
  })),
  refreshRuntimeDependencyGateState: vi.fn(),
  startRuntimeDependencyBootstrap: vi.fn(),
  queueVideoDownload: vi.fn(async (request) => ({
    accepted: true,
    traceId: request.url,
  })),
  cancelDownload: vi.fn(async () => true),
  cancelTranscode: vi.fn(async () => false),
  retryTranscode: vi.fn(async () => false),
  removeTranscode: vi.fn(async () => false),
  getQueueState: vi.fn(() => ({
    activeCount: 0,
    pendingCount: 0,
    totalCount: 0,
    maxConcurrent: 3,
  })),
  getQueueDetail: vi.fn(() => ({ tasks: [] })),
  getTranscodeQueueState: vi.fn(() => ({
    activeCount: 0,
    pendingCount: 0,
    failedCount: 0,
    totalCount: 0,
    maxConcurrent: 1,
  })),
  getTranscodeQueueDetail: vi.fn(() => ({ tasks: [] })),
});

const createExtensionBridgeStub = (
  resolution: Parameters<ExtensionRequestBridge["requestPastedVideoSelectionResolution"]>[0] | null,
): ExtensionRequestBridge & {
  requestPastedVideoSelectionResolution: ReturnType<typeof vi.fn>;
} => ({
  requestPastedVideoSelectionResolution: vi.fn(async () => {
    if (!resolution) {
      throw new Error("Browser extension is not connected");
    }
    return {
      success: true,
      videoCandidates: [],
      ...resolution,
    };
  }),
  handlePastedVideoSelectionResult: vi.fn(),
});

const createBridge = (
  runtime = createRuntimeStub(),
  extensionBridge: ExtensionRequestBridge = createExtensionBridgeStub(null),
) => createVideoDownloadCommandBridge({
  runtime,
  extensionBridge,
  readConfigObject: vi.fn(async () => ({ defaultVideoDownloadQuality: "balanced" })),
  getRuntimeDependencyStatus: vi.fn(),
  getRuntimeDependencyGateState: vi.fn(),
  refreshRuntimeDependencyGateState: vi.fn(),
  startRuntimeDependencyBootstrap: vi.fn(),
  checkYtdlpVersion: vi.fn(),
  getGalleryDlInfo: vi.fn(),
  logInjectedDebug: vi.fn(),
});

describe("createVideoDownloadCommandBridge", () => {
  it("dispatches normal queue requests through the runtime router", async () => {
    const runtime = createRuntimeStub();
    const bridge = createBridge(runtime);

    await bridge.invoke("queue_video_download", {
      url: "https://www.youtube.com/watch?v=abc123",
      page_url: "https://www.youtube.com/watch?v=abc123",
    });

    expect(runtime.queueVideoDownload).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      ytdlpQuality: "balanced",
    }));
  });

  it("uses extension-assisted pasted payloads before queueing", async () => {
    const runtime = createRuntimeStub();
    const extensionBridge = createExtensionBridgeStub({
      url: "https://www.youtube.com/watch?v=resolved",
      pageUrl: "https://www.youtube.com/watch?v=resolved",
      siteHint: "youtube",
    });
    const bridge = createBridge(runtime, extensionBridge);

    await bridge.invoke("queue_pasted_video_download", {
      url: "https://www.youtube.com/watch?v=abc123",
    });

    expect(extensionBridge.requestPastedVideoSelectionResolution).toHaveBeenCalledWith({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      siteHint: "youtube",
    });
    expect(runtime.queueVideoDownload).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://www.youtube.com/watch?v=resolved",
      pageUrl: "https://www.youtube.com/watch?v=resolved",
      siteHint: "youtube",
    }));
  });

  it("queues pasted Douyin URLs directly without requesting extension assistance", async () => {
    const runtime = createRuntimeStub();
    const extensionBridge = createExtensionBridgeStub(null);
    const bridge = createBridge(runtime, extensionBridge);

    await bridge.invoke("queue_pasted_video_download", {
      url: "https://v.douyin.com/5qqlazbdEoU/",
    });

    expect(extensionBridge.requestPastedVideoSelectionResolution).not.toHaveBeenCalled();
    expect(runtime.queueVideoDownload).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://v.douyin.com/5qqlazbdEoU/",
      siteHint: "douyin",
      ytdlpQuality: "balanced",
    }));
  });

  it("falls back to the original pasted URL when extension assistance fails", async () => {
    const runtime = createRuntimeStub();
    const bridge = createBridge(runtime, createExtensionBridgeStub(null));

    await bridge.invoke("queue_pasted_video_download", {
      url: "https://www.youtube.com/watch?v=abc123",
    });

    expect(runtime.queueVideoDownload).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://www.youtube.com/watch?v=abc123",
    }));
  });

  it("dispatches cancel requests to the runtime", async () => {
    const runtime = createRuntimeStub();
    const bridge = createBridge(runtime);

    await expect(bridge.invoke("cancel_download", { traceId: "trace-1" })).resolves.toBe(true);

    expect(runtime.cancelDownload).toHaveBeenCalledWith("trace-1");
  });
});
