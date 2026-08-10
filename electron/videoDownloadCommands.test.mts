import { describe, expect, it, vi } from "vitest";

import { createVideoDownloadCommandBridge } from "./videoDownloadCommands.mjs";
import type { ElectronDownloadRuntime } from "../src/electron-runtime/index.js";

const readyStatus = {
  state: "ready",
  source: "managed",
  path: "/runtime/tool",
  error: null,
} as const;

const createRuntimeStub = (): ElectronDownloadRuntime & {
  cancelTranscode: ReturnType<typeof vi.fn>;
  retryTranscode: ReturnType<typeof vi.fn>;
  removeTranscode: ReturnType<typeof vi.fn>;
} => ({
  maxConcurrent: 3,
  getRuntimeDependencyStatus: vi.fn(() => ({
    python: { ...readyStatus, source: "bundled" },
    ytDlp: readyStatus,
    galleryDl: readyStatus,
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
  queueDownload: vi.fn(),
  queuePastedDownload: vi.fn(),
  queueVideoDownload: vi.fn(),
  selectAdvancedQualityOption: vi.fn(),
  cancelDownload: vi.fn(),
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

const createBridge = (runtime = createRuntimeStub()) => createVideoDownloadCommandBridge({
  runtime,
  getRuntimeDependencyStatus: vi.fn(),
  getRuntimeDependencyGateState: vi.fn(),
  refreshRuntimeDependencyGateState: vi.fn(),
  startRuntimeDependencyBootstrap: vi.fn(),
  checkYtdlpVersion: vi.fn(async () => ({ version: "2026.1.1" })),
  getGalleryDlInfo: vi.fn(async () => ({ version: "v1.28.0" })),
});

describe("createVideoDownloadCommandBridge (operational download-adjacent commands)", () => {
  it("dispatches cancel_transcode with the trace id", async () => {
    const runtime = createRuntimeStub();
    const bridge = createBridge(runtime);

    await bridge.invoke("cancel_transcode", { traceId: "trace-1" });

    expect(runtime.cancelTranscode).toHaveBeenCalledWith("trace-1");
  });

  it("normalizes snake_case transcode payloads", async () => {
    const runtime = createRuntimeStub();
    const bridge = createBridge(runtime);

    await bridge.invoke("retry_transcode", { trace_id: "trace-2" });
    await bridge.invoke("remove_transcode", { trace_id: "trace-3" });

    expect(runtime.retryTranscode).toHaveBeenCalledWith("trace-2");
    expect(runtime.removeTranscode).toHaveBeenCalledWith("trace-3");
  });

  it("dispatches runtime dependency queries to the injected handlers", async () => {
    const getRuntimeDependencyStatus = vi.fn(() => ({ phase: "ready" }));
    const getRuntimeDependencyGateState = vi.fn(() => ({ phase: "ready" }));
    const refreshRuntimeDependencyGateState = vi.fn(() => ({ phase: "ready" }));
    const bridge = createVideoDownloadCommandBridge({
      runtime: createRuntimeStub(),
      getRuntimeDependencyStatus,
      getRuntimeDependencyGateState,
      refreshRuntimeDependencyGateState,
      startRuntimeDependencyBootstrap: vi.fn(),
      checkYtdlpVersion: vi.fn(),
      getGalleryDlInfo: vi.fn(),
    });

    await bridge.invoke("get_runtime_dependency_status");
    await bridge.invoke("get_runtime_dependency_gate_state");
    await bridge.invoke("refresh_runtime_dependency_gate_state");

    expect(getRuntimeDependencyStatus).toHaveBeenCalledTimes(1);
    expect(getRuntimeDependencyGateState).toHaveBeenCalledTimes(1);
    expect(refreshRuntimeDependencyGateState).toHaveBeenCalledTimes(1);
  });

  it("dispatches downloader version/info queries", async () => {
    const checkYtdlpVersion = vi.fn(async () => ({ version: "2026.1.1" }));
    const getGalleryDlInfo = vi.fn(async () => ({ version: "v1.28.0" }));
    const bridge = createVideoDownloadCommandBridge({
      runtime: createRuntimeStub(),
      getRuntimeDependencyStatus: vi.fn(),
      getRuntimeDependencyGateState: vi.fn(),
      refreshRuntimeDependencyGateState: vi.fn(),
      startRuntimeDependencyBootstrap: vi.fn(),
      checkYtdlpVersion,
      getGalleryDlInfo,
    });

    await bridge.invoke("check_ytdlp_version");
    await bridge.invoke("get_gallery_dl_info");

    expect(checkYtdlpVersion).toHaveBeenCalledTimes(1);
    expect(getGalleryDlInfo).toHaveBeenCalledTimes(1);
  });

  it("does not claim ordinary download commands (owned by the IPC adapter)", async () => {
    const bridge = createBridge();

    expect(bridge.supports("cancel_transcode")).toBe(true);
    expect(bridge.supports("get_runtime_dependency_status")).toBe(true);
    expect(bridge.supports("queue_video_download")).toBe(false);
    expect(bridge.supports("queue_pasted_video_download")).toBe(false);
    expect(bridge.supports("cancel_download")).toBe(false);
    expect(bridge.supports("select_advanced_quality_option")).toBe(false);
  });
});
