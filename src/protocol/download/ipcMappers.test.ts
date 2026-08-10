import { describe, expect, it } from "vitest";
import { DownloadRuntimeError, rawDownloadInputSchema } from "../../core/index.js";
import { toRawDownloadInput } from "../../application/download-api.js";
import {
  decodeCaptureEvidence,
  decodeQueueDownloadCommand,
  decodeVideoQualityAlias,
  toDownloadProgressPayload,
  toDownloadResultPayload,
} from "./ipcMappers.js";

describe("decodeVideoQualityAlias", () => {
  it("normalizes the current videoQuality field", () => {
    expect(decodeVideoQualityAlias({ videoQuality: "balanced" })).toBe("balanced");
    expect(decodeVideoQualityAlias({ videoQuality: "high" })).toBe("balanced");
    expect(decodeVideoQualityAlias({ videoQuality: "standard" })).toBe("data_saver");
  });

  it("accepts documented legacy aliases with stable priority", () => {
    expect(decodeVideoQualityAlias({ ytdlpQualityPreference: "best" })).toBe("best");
    expect(decodeVideoQualityAlias({ ytdlpQuality: "data_saver" })).toBe("data_saver");
    expect(decodeVideoQualityAlias({ defaultVideoDownloadQuality: "balanced" })).toBe("balanced");
    // Priority: videoQuality > ytdlpQualityPreference > ytdlpQuality > default.
    expect(decodeVideoQualityAlias({
      videoQuality: "best",
      ytdlpQualityPreference: "balanced",
    })).toBe("best");
    expect(decodeVideoQualityAlias({
      ytdlpQualityPreference: "balanced",
      ytdlpQuality: "data_saver",
    })).toBe("balanced");
    expect(decodeVideoQualityAlias({
      ytdlpQuality: "best",
      defaultVideoDownloadQuality: "data_saver",
    })).toBe("best");
  });

  it("accepts snake_case quality aliases", () => {
    expect(decodeVideoQualityAlias({ ytdlp_quality_preference: "balanced" })).toBe("balanced");
    expect(decodeVideoQualityAlias({ ytdlp_quality: "best" })).toBe("best");
    expect(decodeVideoQualityAlias({ video_quality: "data_saver" })).toBe("data_saver");
  });

  it("returns undefined for missing or invalid values", () => {
    expect(decodeVideoQualityAlias({})).toBeUndefined();
    expect(decodeVideoQualityAlias({ videoQuality: "ultra" })).toBeUndefined();
    expect(decodeVideoQualityAlias({ videoQuality: 42 })).toBeUndefined();
  });
});

describe("decodeCaptureEvidence", () => {
  it("maps extensionData.ameowCapture to canonical capture evidence", () => {
    expect(decodeCaptureEvidence({
      ameowCapture: {
        version: 1,
        action: "current_content",
        pageUrl: "https://www.douyin.com/jingxuan?modal_id=1",
        contentIds: { modal_id: "1" },
      },
    })).toEqual({
      version: 1,
      action: "current_content",
      pageUrl: "https://www.douyin.com/jingxuan?modal_id=1",
      contentIds: { modal_id: "1" },
    });
  });

  it("returns undefined for missing/invalid capture containers", () => {
    expect(decodeCaptureEvidence(undefined)).toBeUndefined();
    expect(decodeCaptureEvidence({})).toBeUndefined();
    expect(decodeCaptureEvidence({ ameowCapture: { version: 2 } })).toBeUndefined();
    expect(decodeCaptureEvidence({ ameowCapture: "nope" })).toBeUndefined();
  });

  it("rejects invalid versions, actions and page urls", () => {
    expect(decodeCaptureEvidence({
      ameowCapture: {
        version: 2,
        action: "current_content",
        pageUrl: "https://www.douyin.com/jingxuan?modal_id=1",
      },
    })).toBeUndefined();
    expect(decodeCaptureEvidence({
      ameowCapture: {
        version: "1",
        action: "current_content",
        pageUrl: "https://www.douyin.com/jingxuan?modal_id=1",
      },
    })).toBeUndefined();
    expect(decodeCaptureEvidence({
      ameowCapture: {
        version: 1,
        action: "random_action",
        pageUrl: "https://www.douyin.com/jingxuan?modal_id=1",
      },
    })).toBeUndefined();
    expect(decodeCaptureEvidence({
      ameowCapture: {
        version: 1,
        action: "current_content",
        pageUrl: "not-a-url",
      },
    })).toBeUndefined();
    expect(decodeCaptureEvidence({
      ameowCapture: {
        version: 1,
        action: "current_content",
      },
    })).toBeUndefined();
  });

  it("rejects malformed capture-evidence field shapes", () => {
    expect(decodeCaptureEvidence({
      ameowCapture: {
        version: 1,
        action: "current_content",
        pageUrl: "https://www.douyin.com/jingxuan?modal_id=1",
        contentIds: { modal_id: 42 },
      },
    })).toBeUndefined();
    expect(decodeCaptureEvidence({
      ameowCapture: {
        version: 1,
        action: "current_content",
        pageUrl: "https://www.douyin.com/jingxuan?modal_id=1",
        structuredDataUrls: ["not-a-url"],
      },
    })).toBeUndefined();
    expect(decodeCaptureEvidence({
      ameowCapture: {
        version: 1,
        action: "current_content",
        pageUrl: "https://www.douyin.com/jingxuan?modal_id=1",
        contentIds: "nope",
      },
    })).toBeUndefined();
  });

  it("drops invalid capture evidence before the Application command", () => {
    const command = decodeQueueDownloadCommand({
      url: "https://www.douyin.com/jingxuan?modal_id=1",
      siteHint: "douyin",
      extensionData: {
        ameowCapture: {
          version: 2,
          action: "current_content",
          pageUrl: "https://www.douyin.com/jingxuan?modal_id=1",
        },
      },
    });

    expect(command.captureEvidence).toBeUndefined();
  });
});

describe("decodeQueueDownloadCommand", () => {
  it("decodes a full queue payload into the canonical command", () => {
    const command = decodeQueueDownloadCommand({
      url: "https://weibo.com/detail/N12345",
      pageUrl: "https://weibo.com/detail/N12345",
      videoUrl: "https://f.video.weibocdn.com/best-1080.mp4",
      selectedVideoVariant: {
        url: "https://f.video.weibocdn.com/best-1080.mp4",
        label: "1080p",
        type: "direct_mp4",
        mediaType: "video",
      },
      videoCandidates: [
        { url: "https://f.video.weibocdn.com/best-720.mp4", mediaType: "video" },
      ],
      title: "Example",
      selectionScope: "current_item",
      clipStartSec: 35.25,
      clipEndSec: 48.75,
      siteHint: "weibo",
      advancedQualityRequest: true,
      videoQuality: "best",
      diagnostics: { source: "popup" },
    });

    expect(command).toEqual({
      url: "https://weibo.com/detail/N12345",
      pageUrl: "https://weibo.com/detail/N12345",
      videoUrl: "https://f.video.weibocdn.com/best-1080.mp4",
      selectedVideoVariant: {
        url: "https://f.video.weibocdn.com/best-1080.mp4",
        label: "1080p",
        type: "direct_mp4",
        mediaType: "video",
      },
      videoCandidates: [
        { url: "https://f.video.weibocdn.com/best-720.mp4", mediaType: "video" },
      ],
      title: "Example",
      selectionScope: "current_item",
      clipStartSec: 35.25,
      clipEndSec: 48.75,
      videoQuality: "best",
      siteHint: "weibo",
      advancedQualityRequested: true,
      diagnostics: expect.objectContaining({ source: "popup" }),
    });
    expect(command.diagnostics).toHaveProperty("interactionCapability");
    // Canonical command carries no wire aliases or request ids.
    expect(command).not.toHaveProperty("requestId");
    expect(command).not.toHaveProperty("extensionData");
    expect(command).not.toHaveProperty("ytdlpQuality");
    expect(command).not.toHaveProperty("advancedQualitySelector");
  });

  it("maps extensionData.ameowCapture into canonical captureEvidence", () => {
    const command = decodeQueueDownloadCommand({
      url: "https://www.douyin.com/jingxuan?modal_id=7637912431158644014",
      pageUrl: "https://www.douyin.com/jingxuan?modal_id=7637912431158644014",
      siteHint: "douyin",
      extensionData: {
        ameowCapture: {
          version: 1,
          action: "current_content",
          pageUrl: "https://www.douyin.com/jingxuan?modal_id=7637912431158644014",
          contentIds: { modal_id: "7637912431158644014" },
        },
      },
    });

    expect(command.captureEvidence).toMatchObject({
      version: 1,
      contentIds: { modal_id: "7637912431158644014" },
    });
    // Transport container and unsupported namespaces are not forwarded.
    expect(command).not.toHaveProperty("extensionData");
  });

  it("accepts the snake_case extension_data container", () => {
    const command = decodeQueueDownloadCommand({
      url: "https://www.douyin.com/jingxuan?modal_id=1",
      siteHint: "douyin",
      extension_data: {
        ameowCapture: {
          version: 1,
          action: "popup_fallback",
          pageUrl: "https://www.douyin.com/jingxuan?modal_id=1",
        },
        youtube: { source: "pasted" },
      },
    });

    expect(command.captureEvidence).toMatchObject({ action: "popup_fallback" });
    expect(command).not.toHaveProperty("extensionData");
  });

  it("preserves an explicit opaque site hint through command decode", () => {
    const command = decodeQueueDownloadCommand({
      url: "https://example.com/video/1",
      siteHint: "fakesite",
      diagnostics: { source: "popup" },
    });

    expect(command.siteHint).toBe("fakesite");
    expect(command.diagnostics?.interactionCapability).toMatchObject({
      siteId: "generic",
      interactionStatus: "unknown",
    });
  });

  it("preserves the selected video variant through the canonical command", () => {
    const command = decodeQueueDownloadCommand({
      url: "https://weibo.com/detail/N12345",
      siteHint: "weibo",
      selectedVideoVariant: {
        url: "https://f.video.weibocdn.com/best-1080.mp4",
        label: "1080p",
        type: "direct_mp4",
        mediaType: "video",
      },
    });

    expect(command.selectedVideoVariant).toEqual({
      url: "https://f.video.weibocdn.com/best-1080.mp4",
      label: "1080p",
      type: "direct_mp4",
      mediaType: "video",
    });
  });

  it("accepts the snake_case selected_video_variant alias", () => {
    const command = decodeQueueDownloadCommand({
      url: "https://weibo.com/detail/N12345",
      siteHint: "weibo",
      selected_video_variant: {
        url: "https://f.video.weibocdn.com/best-720.mp4",
        label: "720p",
      },
    });

    expect(command.selectedVideoVariant).toMatchObject({
      url: "https://f.video.weibocdn.com/best-720.mp4",
      label: "720p",
    });
  });

  it("drops invalid selected variants instead of queueing them", () => {
    const command = decodeQueueDownloadCommand({
      url: "https://weibo.com/detail/N12345",
      siteHint: "weibo",
      selectedVideoVariant: { url: "not-a-url" },
    });

    expect(command.selectedVideoVariant).toBeUndefined();
  });

  it("regression: selectedVideoVariant survives the complete wire-to-Application chain", () => {
    // Wire (IPC/WS) -> compatibility decoder -> canonical Application command
    // -> runtime input -> orchestrator schema: the field must reach the final
    // Application invocation input, not merely the first builder hop.
    const command = decodeQueueDownloadCommand({
      url: "https://weibo.com/detail/N12345",
      pageUrl: "https://weibo.com/detail/N12345",
      siteHint: "weibo",
      selectedVideoVariant: {
        url: "https://f.video.weibocdn.com/best-1080.mp4",
        label: "1080p",
        type: "direct_mp4",
        mediaType: "video",
      },
    });

    const input = toRawDownloadInput(command);
    expect(input.selectedVideoVariant).toEqual({
      url: "https://f.video.weibocdn.com/best-1080.mp4",
      label: "1080p",
      type: "direct_mp4",
      mediaType: "video",
    });

    const parsed = rawDownloadInputSchema.parse(input);
    expect(parsed.selectedVideoVariant).toEqual({
      url: "https://f.video.weibocdn.com/best-1080.mp4",
      label: "1080p",
      type: "direct_mp4",
      mediaType: "video",
    });
  });

  it("decodes legacy quality aliases to canonical videoQuality", () => {
    expect(decodeQueueDownloadCommand({
      url: "https://example.com/1",
      ytdlpQualityPreference: "balanced",
    }).videoQuality).toBe("balanced");
    expect(decodeQueueDownloadCommand({
      url: "https://example.com/1",
      ytdlpQuality: "data_saver",
    }).videoQuality).toBe("data_saver");
    expect(decodeQueueDownloadCommand({
      url: "https://example.com/1",
      defaultVideoDownloadQuality: "best",
    }).videoQuality).toBe("best");
  });

  it("lets the injected quality preference override wire quality", () => {
    expect(decodeQueueDownloadCommand(
      { url: "https://example.com/1", videoQuality: "best" },
      { videoQuality: "data_saver" },
    ).videoQuality).toBe("data_saver");
  });

  it("rejects missing and non-HTTP(S) primary urls", () => {
    expect(() => decodeQueueDownloadCommand({})).toThrow("Missing required command payload field: url");
    expect(() => decodeQueueDownloadCommand({ url: "ftp://example.com/f" }))
      .toThrow("Invalid command payload field: url");
    expect(() => decodeQueueDownloadCommand({ url: "javascript:alert(1)" }))
      .toThrow("Invalid command payload field: url");
    expect(() => decodeQueueDownloadCommand(null)).toThrow("Missing required command payload field: url");
  });

  it("normalizes optional fields with explicit compatibility behavior", () => {
    const command = decodeQueueDownloadCommand({
      url: "https://example.com/1",
      pageUrl: "not-a-url",
      clipStartSec: -5,
      clipEndSec: "abc",
      selectionScope: "random",
    });

    expect(command.pageUrl).toBeUndefined();
    expect(command.clipStartSec).toBeUndefined();
    expect(command.clipEndSec).toBeUndefined();
    expect(command.selectionScope).toBeUndefined();
  });

  it("preserves Pinterest drag diagnostics for runtime telemetry", () => {
    const command = decodeQueueDownloadCommand({
      url: "https://www.pinterest.com/pin/123/",
      siteHint: "pinterest",
      dragDiagnostic: {
        htmlLength: 1234,
        htmlPreview: "<html><body>pin</body></html>",
        flags: { hasMp4: true },
        imageUrl: "https://i.pinimg.com/originals/1/2.jpg",
        videoUrl: "https://v.pinimg.com/videos/iht/expmp4/1.mp4",
        videoCandidatesCount: 1,
        videoCandidates: [
          { url: "https://v.pinimg.com/videos/iht/expmp4/1.mp4", mediaType: "video" },
        ],
      },
    });

    expect(command.dragDiagnostic).toMatchObject({
      htmlLength: 1234,
      flags: { hasMp4: true },
    });
    expect(command.diagnostics).toMatchObject({
      interactionCapability: expect.objectContaining({ interactionMode: "drag" }),
    });
  });
});

describe("toDownloadProgressPayload", () => {
  it("maps core progress to the protocol payload preserving stage tokens", () => {
    expect(toDownloadProgressPayload({
      traceId: "trace-1",
      percent: 42,
      stage: "downloading",
      speed: "1.2MiB/s",
      eta: "00:12",
    })).toEqual({
      traceId: "trace-1",
      percent: 42,
      stage: "downloading",
      speed: "1.2MiB/s",
      eta: "00:12",
    });
  });
});

describe("toDownloadResultPayload", () => {
  it("maps a success outcome to the stable protocol payload", () => {
    expect(toDownloadResultPayload({
      traceId: "trace-1",
      result: {
        traceId: "trace-1",
        success: true,
        filePath: "/out/movie.mp4",
        title: "Movie",
      },
      failure: null,
    })).toEqual({
      traceId: "trace-1",
      success: true,
      file_path: "/out/movie.mp4",
      title: "Movie",
      error: undefined,
    });
  });

  it("serializes typed failures with stable code and classification", () => {
    const failure = new DownloadRuntimeError(
      "E_ABORTED",
      "Download cancelled",
      { classification: "cancelled" },
    );
    expect(toDownloadResultPayload({
      traceId: "trace-1",
      result: { traceId: "trace-1", success: false, error: "Download cancelled" },
      failure,
      userUrl: "https://example.com/1",
    })).toEqual({
      traceId: "trace-1",
      success: false,
      error: "Download cancelled",
      failure: {
        code: "E_ABORTED",
        classification: "cancelled",
        rawMessage: "Download cancelled",
        userUrl: "https://example.com/1",
        context: undefined,
      },
    });
  });

  it("serializes pending-cancel and probe-failure outcomes through the same mapper", () => {
    const probeFailure = new DownloadRuntimeError("E_EXECUTION_FAILED", "probe exploded");
    const mapped = toDownloadResultPayload({
      traceId: "trace-1",
      result: { traceId: "trace-1", success: false, error: "更多画质探测失败" },
      failure: probeFailure,
    });

    expect(mapped).toMatchObject({
      success: false,
      error: "更多画质探测失败",
      failure: {
        code: "E_EXECUTION_FAILED",
        rawMessage: "probe exploded",
      },
    });
  });

  it("keeps failure context when present", () => {
    const failure = new DownloadRuntimeError(
      "E_EXECUTION_FAILED",
      "boom",
      { context: { networkFailureClassification: "NETWORK_PROXY_UNSUPPORTED" } },
    );
    const mapped = toDownloadResultPayload({
      traceId: "t",
      result: { traceId: "t", success: false, error: "boom" },
      failure,
    });

    expect(mapped.failure?.context).toEqual({
      networkFailureClassification: "NETWORK_PROXY_UNSUPPORTED",
    });
  });
});
