import { describe, expect, it, vi } from "vitest";

import { createDownloadWsAdapter } from "./downloadWsAdapter.mjs";
import type { DownloadWsAdapterOptions } from "./downloadWsAdapter.mjs";

const createOptions = (
  overrides: Partial<DownloadWsAdapterOptions> = {},
): DownloadWsAdapterOptions & {
  queueDownload: ReturnType<typeof vi.fn>;
  syncPreferences: ReturnType<typeof vi.fn>;
} => {
  const queueDownload = vi.fn(async () => ({ accepted: true, traceId: "trace-1" }));
  const syncPreferences = vi.fn(async () => null);
  return {
    queueDownload,
    syncPreferences,
    handlePastedVideoSelectionResult: vi.fn(() => ({ success: true, message: "received" })),
    handleSiteSessionCookieSyncResult: vi.fn(() => ({ success: true, message: "received" })),
    ...overrides,
  };
};

const createAdapter = (
  overrides: Partial<DownloadWsAdapterOptions> = {},
) => createDownloadWsAdapter(createOptions(overrides));

const baseSelectedPayload = {
  url: "https://www.youtube.com/watch?v=abc123",
  pageUrl: "https://www.youtube.com/watch?v=abc123",
  siteHint: "youtube",
  title: "Example",
  selectionScope: "current_item",
  clipStartSec: 35.25,
  clipEndSec: 48.75,
  advancedQualityRequest: false,
  videoQuality: "best",
  extensionData: {
    youtube: { source: "injected" },
  },
};

describe("createDownloadWsAdapter", () => {
  it("queues a valid video_selected_v2 payload and returns the trace", async () => {
    const options = createOptions();
    const adapter = createDownloadWsAdapter(options);

    const response = await adapter.handle("video_selected_v2", baseSelectedPayload, "req-1");

    expect(response).toEqual({
      success: true,
      message: "Download queued",
      data: { requestId: "req-1", traceId: "trace-1" },
    });
    expect(options.queueDownload).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      siteHint: "youtube",
      title: "Example",
      selectionScope: "current_item",
      clipStartSec: 35.25,
      clipEndSec: 48.75,
      advancedQualityRequested: false,
      videoQuality: "best",
    }));
  });

  it("rejects video_selected_v2 with missing data", async () => {
    const options = createOptions();
    const adapter = createDownloadWsAdapter(options);

    const response = await adapter.handle("video_selected_v2", null, "req-1");

    expect(response).toEqual({
      success: false,
      message: "Missing data",
      data: { requestId: "req-1", code: "missing_data" },
    });
    expect(options.queueDownload).not.toHaveBeenCalled();
  });

  it("rejects video_selected_v2 with a missing url", async () => {
    const options = createOptions();
    const adapter = createDownloadWsAdapter(options);

    const response = await adapter.handle("video_selected_v2", { pageUrl: "https://x.com/" }, "req-1");

    expect(response).toEqual({
      success: false,
      message: "Missing url in data",
      data: { requestId: "req-1", code: "missing_url" },
    });
    expect(options.queueDownload).not.toHaveBeenCalled();
  });

  it("rejects video_selected_v2 with a non-HTTP(S) url", async () => {
    const options = createOptions();
    const adapter = createDownloadWsAdapter(options);

    const response = await adapter.handle("video_selected_v2", { url: "ftp://x.com/f" }, "req-1");

    expect(response).toEqual({
      success: false,
      message: expect.stringContaining("Invalid command payload field: url"),
      data: { requestId: "req-1", code: "queue_video_download_failed" },
    });
    expect(options.queueDownload).not.toHaveBeenCalled();
  });

  it("preserves the selected video variant into the Application command", async () => {
    const options = createOptions();
    const adapter = createDownloadWsAdapter(options);

    await adapter.handle("video_selected_v2", {
      url: "https://weibo.com/detail/N12345",
      pageUrl: "https://weibo.com/detail/N12345",
      siteHint: "weibo",
      selectedVideoVariant: {
        url: "https://f.video.weibocdn.com/best-1080.mp4",
        label: "1080p",
        type: "direct_mp4",
        mediaType: "video",
      },
    }, "req-1");

    expect(options.queueDownload).toHaveBeenCalledWith(expect.objectContaining({
      selectedVideoVariant: {
        url: "https://f.video.weibocdn.com/best-1080.mp4",
        label: "1080p",
        type: "direct_mp4",
        mediaType: "video",
      },
    }));
  });

  it("preserves snake_case extension metadata and clip fields", async () => {
    const options = createOptions();
    const adapter = createDownloadWsAdapter(options);

    await adapter.handle("video_selected_v2", {
      url: "https://www.youtube.com/watch?v=pasted123",
      extension_data: {
        ameowCapture: {
          version: 1,
          action: "pick_download",
          pageUrl: "https://www.youtube.com/watch?v=pasted123",
        },
        youtube: { source: "pasted" },
      },
    }, "req-1");

    const command = options.queueDownload.mock.calls[0][0];
    expect(command).toMatchObject({
      url: "https://www.youtube.com/watch?v=pasted123",
      captureEvidence: {
        version: 1,
        action: "pick_download",
      },
    });
    // Transport container and unsupported namespaces are not forwarded.
    expect(command).not.toHaveProperty("extensionData");
    expect(command.captureEvidence).not.toHaveProperty("youtube");
  });

  it("lets synced quality override incoming video selection quality", async () => {
    const options = createOptions({
      syncPreferences: vi.fn(async () => ({ quality: "balanced" })),
    });
    const adapter = createDownloadWsAdapter(options);

    await adapter.handle("video_selected_v2", {
      ...baseSelectedPayload,
      videoQuality: "best",
    }, "req-1");

    expect(options.queueDownload).toHaveBeenCalledWith(expect.objectContaining({
      videoQuality: "balanced",
    }));
  });

  it("accepts current and legacy quality aliases at the compatibility decoder", async () => {
    for (const qualityField of ["videoQuality", "ytdlpQualityPreference", "ytdlpQuality", "defaultVideoDownloadQuality"]) {
      const options = createOptions();
      const adapter = createDownloadWsAdapter(options);

      await adapter.handle("video_selected_v2", {
        url: "https://www.bilibili.com/video/BV1xx411c7mD",
        [qualityField]: "data_saver",
      }, "req-1");

      expect(options.queueDownload, qualityField).toHaveBeenCalledWith(expect.objectContaining({
        videoQuality: "data_saver",
      }));
      expect(options.syncPreferences, qualityField).toHaveBeenCalledWith(expect.objectContaining({
        [qualityField]: "data_saver",
      }));
    }
  });

  it("preserves advanced quality request intent", async () => {
    const options = createOptions();
    const adapter = createDownloadWsAdapter(options);

    await adapter.handle("video_selected_v2", {
      url: "https://www.youtube.com/watch?v=abc123",
      advancedQualityRequest: true,
    }, "req-1");

    expect(options.queueDownload).toHaveBeenCalledWith(expect.objectContaining({
      advancedQualityRequested: true,
    }));
  });

  it("maps an immediate Application error to the failure envelope", async () => {
    const options = createOptions({
      queueDownload: vi.fn(async () => {
        throw new Error("runtime unavailable");
      }),
    });
    const adapter = createDownloadWsAdapter(options);

    const response = await adapter.handle("video_selected_v2", {
      url: "https://example.com/watch",
    }, "req-1");

    expect(response).toEqual({
      success: false,
      message: "Error: runtime unavailable",
      data: { requestId: "req-1", code: "queue_video_download_failed" },
    });
  });

  it("echoes snake_case request ids in the acknowledgement envelope", async () => {
    const options = createOptions();
    const adapter = createDownloadWsAdapter(options);

    const response = await adapter.handle("video_selected_v2", {
      ...baseSelectedPayload,
      request_id: "snake-req",
    }, "snake-req");

    expect(response.data).toMatchObject({
      requestId: "snake-req",
      traceId: "trace-1",
    });
  });

  it("omits requestId from the envelope when none was sent", async () => {
    const options = createOptions();
    const adapter = createDownloadWsAdapter(options);

    const response = await adapter.handle("video_selected_v2", baseSelectedPayload, null);

    expect(response).toEqual({
      success: true,
      message: "Download queued",
      data: { traceId: "trace-1" },
    });
  });

  it("syncs download preferences and echoes stored values", async () => {
    const options = createOptions({
      syncPreferences: vi.fn(async () => ({
        quality: "balanced",
        aeFriendlyConversionEnabled: false,
      })),
    });
    const adapter = createDownloadWsAdapter(options);

    const response = await adapter.handle("sync_download_preferences", {
      ytdlpQualityPreference: "balanced",
    }, "req-1");

    expect(response).toEqual({
      success: true,
      message: "Download preferences synced",
      data: {
        requestId: "req-1",
        quality: "balanced",
        aeFriendlyConversionEnabled: false,
      },
    });
  });

  it("fails preference sync when no preference fields are present", async () => {
    const adapter = createAdapter();

    const response = await adapter.handle("sync_download_preferences", {}, "req-1");

    expect(response).toEqual({
      success: false,
      message: "Missing download preference fields",
      data: { requestId: "req-1", code: "missing_download_preference_fields" },
    });
  });

  it("fails preference sync with missing data", async () => {
    const adapter = createAdapter();

    const response = await adapter.handle("sync_download_preferences", null, "req-1");

    expect(response).toEqual({
      success: false,
      message: "Missing data",
      data: { requestId: "req-1", code: "missing_data" },
    });
  });

  it("delegates pasted video selection results to the correlation bridge", async () => {
    const handlePastedVideoSelectionResult = vi.fn(() => ({
      success: false,
      message: "Unknown pasted video correlation request",
      code: "unknown_correlation_request",
    }));
    const adapter = createAdapter({ handlePastedVideoSelectionResult });

    const response = await adapter.handle("pasted_video_selection_result", {
      correlationRequestId: "missing-1",
    }, "req-1");

    expect(handlePastedVideoSelectionResult).toHaveBeenCalledWith({
      correlationRequestId: "missing-1",
    });
    expect(response).toEqual({
      success: false,
      message: "Unknown pasted video correlation request",
      data: { requestId: "req-1", code: "unknown_correlation_request" },
    });
  });

  it("delegates site-session cookie sync results to the correlation bridge", async () => {
    const handleSiteSessionCookieSyncResult = vi.fn(() => ({ success: true, message: "received" }));
    const adapter = createAdapter({ handleSiteSessionCookieSyncResult });

    const response = await adapter.handle("site_session_cookie_sync_result", {
      correlationRequestId: "sync-1",
    }, null);

    expect(handleSiteSessionCookieSyncResult).toHaveBeenCalledWith({
      correlationRequestId: "sync-1",
    });
    expect(response).toEqual({
      success: true,
      message: "received",
      data: null,
    });
  });

  it("returns an unknown_action failed acknowledgement for unknown actions", async () => {
    const options = createOptions();
    const adapter = createDownloadWsAdapter(options);

    const response = await adapter.handle("mystery_action", {}, "req-1");

    expect(response).toEqual({
      success: false,
      message: "Unknown action: mystery_action",
      data: { requestId: "req-1", code: "unknown_action" },
    });
    expect(options.queueDownload).not.toHaveBeenCalled();
  });

  it("treats a non-string action as an unknown action", async () => {
    const adapter = createAdapter();

    const response = await adapter.handle(42, {}, "req-1");

    expect(response).toEqual({
      success: false,
      message: "Unknown action: 42",
      data: { requestId: "req-1", code: "unknown_action" },
    });
  });

  it("keeps the Extension queue-ack-only: no progress/result/cancel capability is exposed", async () => {
    const options = createOptions();
    const adapter = createDownloadWsAdapter(options);

    for (const action of ["video_download_progress", "video_download_complete", "video_download_cancel"]) {
      const response = await adapter.handle(action, {}, "req-1");
      expect(response.data).toMatchObject({ code: "unknown_action" });
    }
    expect(options.queueDownload).not.toHaveBeenCalled();
  });
});
