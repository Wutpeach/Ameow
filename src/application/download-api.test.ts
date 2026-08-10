import { describe, expect, it } from "vitest";
import { toRawDownloadInput } from "./download-api.js";
import type { QueueDownloadCommand } from "./download-api.js";

const baseCommand = (): QueueDownloadCommand => ({
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
  captureEvidence: {
    version: 1,
    action: "pick_download",
    pageUrl: "https://weibo.com/detail/N12345",
    contentIds: { modal_id: "x" },
  },
  diagnostics: { source: "popup" },
});

describe("DownloadApplicationApi canonical models", () => {
  it("maps a canonical command to the runtime input with canonical fields only", () => {
    const input = toRawDownloadInput(baseCommand());

    expect(input).toEqual({
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
      advancedQualityRequest: true,
      captureEvidence: {
        version: 1,
        action: "pick_download",
        pageUrl: "https://weibo.com/detail/N12345",
        contentIds: { modal_id: "x" },
      },
      diagnostics: { source: "popup" },
    });
    // No wire aliases, request IDs, or transport containers on the input.
    expect(input).not.toHaveProperty("requestId");
    expect(input).not.toHaveProperty("ytdlpQuality");
    expect(input).not.toHaveProperty("extensionData");
    expect(input).not.toHaveProperty("advancedQualitySelector");
  });

  it("preserves the renderer drag diagnostic as an untracked telemetry property", () => {
    const command = {
      ...baseCommand(),
      advancedQualityRequested: false,
      dragDiagnostic: { htmlLength: 10, htmlPreview: "<html>", flags: {} },
    };
    const input = toRawDownloadInput(command) as RawDownloadInputWithDrag;

    expect(input.dragDiagnostic).toEqual({
      htmlLength: 10,
      htmlPreview: "<html>",
      flags: {},
    });
  });

  it("keeps optional fields absent when not provided", () => {
    const input = toRawDownloadInput({ url: "https://example.com/1" });

    expect(input).toEqual({ url: "https://example.com/1" });
  });
});

type RawDownloadInputWithDrag = ReturnType<typeof toRawDownloadInput> & {
  dragDiagnostic?: unknown;
};
