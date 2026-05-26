import { describe, expect, it } from "vitest";

import type {
  DownloadProgressPayload,
  DownloadResultPayload,
  VideoQueueDetailPayload,
  VideoTranscodeCompletePayload,
  VideoTranscodeQueueStatePayload,
  VideoTranscodeTaskPayload,
} from "../types/videoRuntime";
import {
  applyDownloadProgressEvent,
  applyTranscodeCompleteEvent,
  applyTranscodeProgressEvent,
  applyVideoQueueDetailEvent,
  applyVideoQueueStateEvent,
  applyVideoTranscodeQueueStateEvent,
  clearTranscodeProgressWhenInactive,
  pruneCancellingTraceIdsToQueueDetail,
  pruneDownloadProgressToQueueDetail,
  removeDownloadProgressTrace,
  resolveDownloadCompleteOutcome,
} from "./downloadEventReducers";

const progress = (
  overrides: Partial<DownloadProgressPayload> = {},
): DownloadProgressPayload => ({
  traceId: "trace-1",
  percent: 42,
  stage: "downloading",
  speed: "",
  eta: "",
  ...overrides,
});

const complete = (
  overrides: Partial<DownloadResultPayload> = {},
): DownloadResultPayload => ({
  traceId: "trace-1",
  success: true,
  ...overrides,
});

const transcodeTask = (
  overrides: Partial<VideoTranscodeTaskPayload> = {},
): VideoTranscodeTaskPayload => ({
  traceId: "trace-1",
  label: "clip.mov",
  status: "active",
  stage: "transcoding",
  progressPercent: 42,
  etaSeconds: 12,
  sourcePath: "C:/clip.mov",
  sourceFormat: "mov",
  targetFormat: "mp4",
  error: null,
  ...overrides,
});

describe("download event reducers", () => {
  it("applies progress updates and keeps stage progression monotonic", () => {
    const current = {
      "trace-1": progress({ percent: 55, stage: "downloading" }),
    };

    expect(applyDownloadProgressEvent(current, progress({
      percent: 60,
      stage: "preparing",
      speed: "Resolving media...",
    }))).toEqual({
      "trace-1": {
        ...progress({
          percent: 60,
          stage: "downloading",
          speed: "Resolving media...",
        }),
      },
    });
  });

  it("removes completed progress without changing the same reference for missing traces", () => {
    const current = {
      "trace-1": progress(),
      "trace-2": progress({ traceId: "trace-2" }),
    };

    expect(removeDownloadProgressTrace(current, "trace-1")).toEqual({
      "trace-2": progress({ traceId: "trace-2" }),
    });
    expect(removeDownloadProgressTrace(current, "missing")).toBe(current);
  });

  it("resolves successful download completion", () => {
    expect(resolveDownloadCompleteOutcome(complete(), false)).toEqual({
      success: true,
      cancelled: false,
      errorSummary: null,
    });
  });

  it("resolves failed download completion with summarized error", () => {
    expect(resolveDownloadCompleteOutcome(complete({
      success: false,
      error: "\n  first line  \nsecond line",
    }), false)).toEqual({
      success: false,
      cancelled: false,
      errorSummary: "first line",
    });
  });

  it("treats explicit canceling and backend canceled errors as cancelled", () => {
    expect(resolveDownloadCompleteOutcome(complete(), true)).toEqual({
      success: false,
      cancelled: true,
      errorSummary: null,
    });

    expect(resolveDownloadCompleteOutcome(complete({
      success: false,
      error: "Download was canceled by user",
    }), false)).toEqual({
      success: false,
      cancelled: true,
      errorSummary: "Download was canceled by user",
    });
  });
});

describe("queue event reducers", () => {
  it("normalizes queue state and reports when cancelling traces should be cleared", () => {
    expect(applyVideoQueueStateEvent({
      activeCount: 1,
      pendingCount: 2,
      totalCount: 999,
      maxConcurrent: 4,
    })).toEqual({
      state: {
        activeCount: 1,
        pendingCount: 2,
        totalCount: 3,
        maxConcurrent: 4,
      },
      shouldClearCancellingTraceIds: false,
    });

    expect(applyVideoQueueStateEvent({
      activeCount: 0,
      pendingCount: 0,
      totalCount: 1,
      maxConcurrent: 0,
    })).toEqual({
      state: {
        activeCount: 0,
        pendingCount: 0,
        totalCount: 0,
        maxConcurrent: 1,
      },
      shouldClearCancellingTraceIds: true,
    });
  });

  it("normalizes queue detail and prunes progress and canceling traces to live tasks", () => {
    const payload: VideoQueueDetailPayload = {
      tasks: [
        { traceId: "live", label: " Live ", status: "active" },
        { traceId: "pending", label: "", status: "pending" },
      ],
    };

    expect(applyVideoQueueDetailEvent(
      {
        live: progress({ traceId: "live" }),
        stale: progress({ traceId: "stale" }),
      },
      ["live", "stale"],
      payload,
    )).toEqual({
      detail: {
        tasks: [
          { traceId: "live", label: "Live", status: "active" },
          { traceId: "pending", label: "pending", status: "pending" },
        ],
      },
      progressByTrace: {
        live: progress({ traceId: "live" }),
      },
      cancellingTraceIds: ["live"],
    });
  });

  it("prunes progress and cancelling traces from an already-normalized queue detail", () => {
    const detail: VideoQueueDetailPayload = {
      tasks: [
        { traceId: "live", label: "Live", status: "active" },
      ],
    };
    const progressByTrace = {
      live: progress({ traceId: "live" }),
      stale: progress({ traceId: "stale" }),
    };

    expect(pruneDownloadProgressToQueueDetail(progressByTrace, detail)).toEqual({
      live: progress({ traceId: "live" }),
    });
    expect(pruneCancellingTraceIdsToQueueDetail(["live", "stale"], detail)).toEqual(["live"]);
  });
});

describe("transcode event reducers", () => {
  it("clears transcode progress when no active transcodes remain", () => {
    const payload: VideoTranscodeQueueStatePayload = {
      activeCount: 0,
      pendingCount: 1,
      failedCount: 0,
      totalCount: 1,
      maxConcurrent: 1,
    };

    expect(applyVideoTranscodeQueueStateEvent(payload, {
      "trace-1": transcodeTask(),
    })).toEqual({
      state: payload,
      progressByTrace: {},
    });
  });

  it("preserves the empty transcode progress reference when there is nothing to clear", () => {
    const current = {};
    const result = applyVideoTranscodeQueueStateEvent({
      activeCount: 0,
      pendingCount: 0,
      failedCount: 0,
      totalCount: 0,
      maxConcurrent: 1,
    }, current);

    expect(result.progressByTrace).toBe(current);
    expect(clearTranscodeProgressWhenInactive(result.state, current)).toBe(current);
  });

  it("applies transcode progress to progress and queue detail as an active task", () => {
    expect(applyTranscodeProgressEvent(
      {
        old: transcodeTask({ traceId: "old" }),
      },
      {
        tasks: [
          transcodeTask({ traceId: "trace-1", status: "pending", progressPercent: null }),
        ],
      },
      transcodeTask({ status: "pending", progressPercent: 64 }),
    )).toEqual({
      progressByTrace: {
        old: transcodeTask({ traceId: "old" }),
        "trace-1": transcodeTask({ status: "active", progressPercent: 64 }),
      },
      detail: {
        tasks: [
          transcodeTask({ status: "active", progressPercent: 64 }),
        ],
      },
    });
  });

  it("ignores invalid transcode progress payloads", () => {
    expect(applyTranscodeProgressEvent({}, { tasks: [] }, {
      traceId: "missing-label",
      label: null as unknown as string,
    })).toBeNull();
  });

  it("applies transcode complete by removing progress and detail task", () => {
    const payload: VideoTranscodeCompletePayload = {
      traceId: "trace-1",
      label: "clip.mov",
      sourcePath: "C:/clip.mov",
      filePath: "C:/clip.mp4",
      sourceFormat: "mov",
      targetFormat: "mp4",
    };

    expect(applyTranscodeCompleteEvent(
      {
        "trace-1": transcodeTask(),
        other: transcodeTask({ traceId: "other" }),
      },
      {
        tasks: [
          transcodeTask(),
          transcodeTask({ traceId: "other" }),
        ],
      },
      payload,
    )).toEqual({
      progressByTrace: {
        other: transcodeTask({ traceId: "other" }),
      },
      detail: {
        tasks: [
          transcodeTask({ traceId: "other" }),
        ],
      },
    });
  });
});
