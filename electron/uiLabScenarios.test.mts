import { describe, expect, it, vi } from "vitest";

import {
  createUiLabReadyRuntimeGateState,
  createUiLabReadyRuntimeStatus,
  createUiLabScenariosController,
} from "./uiLabScenarios.mjs";

const createController = (overrides = {}) => {
  const emitAppEvent = vi.fn();
  const setRuntimeOverrides = vi.fn();
  const clearRuntimeOverrides = vi.fn();
  const emitLiveVideoQueueState = vi.fn();
  const getRuntimeDependencyGateState = vi.fn(async () => ({
    phase: "ready",
    missingComponents: [],
    lastError: null,
    updatedAtMs: 9,
    currentComponent: null,
    currentStage: null,
    progressPercent: null,
    downloadedBytes: null,
    totalBytes: null,
    nextComponent: null,
  }));
  const controller = createUiLabScenariosController({
    emitAppEvent,
    setRuntimeOverrides,
    clearRuntimeOverrides,
    getRuntimeMaxConcurrent: vi.fn(() => 3),
    emitLiveVideoQueueState,
    getRuntimeDependencyGateState,
    nowTimestampMs: vi.fn(() => 1234),
    uiLabResetEvent: "ui-lab-reset",
    fallbackVideoQueueMaxConcurrent: 3,
    ...overrides,
  });

  return {
    clearRuntimeOverrides,
    controller,
    emitAppEvent,
    emitLiveVideoQueueState,
    getRuntimeDependencyGateState,
    setRuntimeOverrides,
  };
};

describe("runtime fixtures", () => {
  it("creates stable ready runtime and gate snapshots", () => {
    expect(createUiLabReadyRuntimeStatus()).toEqual({
      ytDlp: {
        state: "ready",
        source: "bundled",
        path: "D:/ui-lab/yt-dlp.exe",
        error: null,
      },
      galleryDl: {
        state: "ready",
        source: "bundled",
        path: "D:/ui-lab/gallery-dl.exe",
        error: null,
      },
      ffmpeg: {
        state: "ready",
        source: "managed",
        path: "D:/ui-lab/ffmpeg.exe",
        error: null,
      },
      deno: {
        state: "ready",
        source: "managed",
        path: "D:/ui-lab/deno.exe",
        error: null,
      },
    });

    expect(createUiLabReadyRuntimeGateState(() => 42)).toEqual({
      phase: "ready",
      missingComponents: [],
      lastError: null,
      updatedAtMs: 42,
      currentComponent: null,
      currentStage: null,
      progressPercent: null,
      downloadedBytes: null,
      totalBytes: null,
      nextComponent: null,
    });
  });
});

describe("createUiLabScenariosController", () => {
  it("restores live state with reset event, queue state, and runtime gate state", async () => {
    const {
      clearRuntimeOverrides,
      controller,
      emitAppEvent,
      emitLiveVideoQueueState,
    } = createController();

    await controller.restoreLiveState();

    expect(clearRuntimeOverrides).toHaveBeenCalledTimes(1);
    expect(emitAppEvent).toHaveBeenCalledWith("ui-lab-reset", { restoreLive: true });
    expect(emitLiveVideoQueueState).toHaveBeenCalledTimes(1);
    expect(emitAppEvent).toHaveBeenCalledWith("runtime-dependency-gate-state", expect.objectContaining({
      updatedAtMs: 9,
    }));
  });

  it("applies runtime auto-config preview with missing runtime status", () => {
    const {
      controller,
      emitAppEvent,
      setRuntimeOverrides,
    } = createController();

    controller.applyScenarioPreview("runtime-auto-config");

    expect(emitAppEvent).toHaveBeenCalledWith("ui-lab-reset", { restoreLive: false });
    expect(setRuntimeOverrides).toHaveBeenCalledWith(
      expect.objectContaining({
        ffmpeg: expect.objectContaining({ state: "missing" }),
        deno: expect.objectContaining({ state: "missing" }),
      }),
      expect.objectContaining({
        phase: "downloading",
        currentComponent: "ffmpeg",
        progressPercent: 42,
      }),
    );
    expect(emitAppEvent).toHaveBeenCalledWith("runtime-dependency-gate-state", expect.objectContaining({
      phase: "downloading",
    }));
  });

  it("emits active download queue and progress preview", () => {
    const { controller, emitAppEvent } = createController();

    controller.applyScenarioPreview("download-active");

    expect(emitAppEvent).toHaveBeenCalledWith("video-queue-count", {
      activeCount: 1,
      pendingCount: 0,
      totalCount: 1,
      maxConcurrent: 3,
    });
    expect(emitAppEvent).toHaveBeenCalledWith("video-download-progress", {
      traceId: "ui-lab-download-active",
      percent: 46,
      stage: "downloading",
      speed: "8.2 MB/s",
      eta: "00:12",
    });
  });

  it("emits queued download preview with pending tasks", () => {
    const { controller, emitAppEvent } = createController();

    controller.applyScenarioPreview("download-queued");

    expect(emitAppEvent).toHaveBeenCalledWith("video-queue-count", {
      activeCount: 1,
      pendingCount: 2,
      totalCount: 3,
      maxConcurrent: 3,
    });
    expect(emitAppEvent).toHaveBeenCalledWith("video-queue-detail", {
      tasks: expect.arrayContaining([
        expect.objectContaining({ status: "active" }),
        expect.objectContaining({ status: "pending" }),
      ]),
    });
  });

  it("emits failed transcode terminal preview", () => {
    const { controller, emitAppEvent } = createController();

    controller.applyScenarioPreview("transcode-failed");

    expect(emitAppEvent).toHaveBeenCalledWith("video-transcode-failed", expect.objectContaining({
      traceId: "ui-lab-transcode-failed",
      status: "failed",
      error: "FFmpeg exited with code 1 while finalizing the MP4 output.",
    }));
  });

  it("emits mixed busy download and transcode previews", () => {
    const { controller, emitAppEvent } = createController();

    controller.applyScenarioPreview("mixed-busy");

    expect(emitAppEvent).toHaveBeenCalledWith("video-download-progress", expect.objectContaining({
      traceId: "ui-lab-mixed-download",
      stage: "merging",
    }));
    expect(emitAppEvent).toHaveBeenCalledWith("video-transcode-progress", expect.objectContaining({
      traceId: "ui-lab-mixed-transcode",
      stage: "finalizing_mp4",
    }));
  });

  it("rejects unsupported scenarios", () => {
    const { controller } = createController();

    expect(() => controller.applyScenarioPreview("unknown")).toThrow(
      "Unsupported UI Lab scenario: unknown",
    );
  });
});
