import { describe, expect, it } from "vitest";

import { buildXiaohongshuResolvedDragMediaResult } from "./xiaohongshuDragMediaResult.mjs";

describe("buildXiaohongshuResolvedDragMediaResult", () => {
  it("preserves extension-resolved video urls and candidates", () => {
    expect(buildXiaohongshuResolvedDragMediaResult(
      {
        kind: "video",
        pageUrl: "https://www.xiaohongshu.com/explore/69d4d5170000000022024263",
        imageUrl: "https://sns-webpic-qc.xhscdn.com/cover.jpg",
        videoUrl: "https://sns-video-bd.xhscdn.com/stream/example.mp4",
        videoCandidates: [
          {
            url: "https://sns-video-bd.xhscdn.com/stream/example.mp4",
            type: "direct_cdn",
            source: "extension_drag_resolution",
            confidence: "high",
            mediaType: "video",
          },
        ],
        videoIntentConfidence: 1,
        videoIntentSources: ["extension-video-candidate"],
      },
      {
        requiredPageUrl: "https://www.xiaohongshu.com/explore/fallback",
      },
    )).toMatchObject({
      kind: "video",
      pageUrl: "https://www.xiaohongshu.com/explore/69d4d5170000000022024263",
      imageUrl: "https://sns-webpic-qc.xhscdn.com/cover.jpg",
      videoUrl: "https://sns-video-bd.xhscdn.com/stream/example.mp4",
      videoCandidates: [
        {
          url: "https://sns-video-bd.xhscdn.com/stream/example.mp4",
          type: "direct_cdn",
          source: "extension_drag_resolution",
          confidence: "high",
          mediaType: "video",
        },
      ],
      videoIntentConfidence: 1,
      videoIntentSources: ["extension-video-candidate"],
    });
  });

  it("falls back to canonical page hints without trusting invalid media urls", () => {
    expect(buildXiaohongshuResolvedDragMediaResult(
      {
        kind: "video",
        pageUrl: "javascript:alert(1)",
        videoUrl: "blob:https://www.xiaohongshu.com/opaque",
        videoCandidates: [
          { url: "file:///tmp/local.mp4" },
        ],
      },
      {
        requiredPageUrl: "https://www.xiaohongshu.com/explore/fallback",
        detailUrl: "https://www.xiaohongshu.com/discovery/item/abc?xsec_token=token",
      },
    )).toMatchObject({
      kind: "video",
      pageUrl: "https://www.xiaohongshu.com/explore/fallback",
      detailUrl: "https://www.xiaohongshu.com/discovery/item/abc?xsec_token=token",
      videoUrl: null,
      videoCandidates: [],
    });
  });
});
