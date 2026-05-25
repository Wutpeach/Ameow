import { describe, expect, it } from "vitest";

import {
  normalizeHttpUrl,
  normalizeRequiredVideoRouteUrl,
  normalizeVideoCandidateUrls,
  normalizeVideoCandidates,
  normalizeVideoHintUrl,
  normalizeVideoPageUrl,
  resolveVideoSelectionSiteHint,
} from "./video-candidate-normalization";

describe("normalizeHttpUrl", () => {
  it("trims and keeps valid HTTP(S) URLs", () => {
    expect(normalizeHttpUrl(" https://example.com/watch?v=1 ")).toBe("https://example.com/watch?v=1");
    expect(normalizeHttpUrl("https://example.com/a b")).toBe("https://example.com/a%20b");
  });

  it("drops non-string, empty, non-HTTP(S), and blocked scheme values", () => {
    expect(normalizeHttpUrl(null)).toBeUndefined();
    expect(normalizeHttpUrl("   ")).toBeUndefined();
    expect(normalizeHttpUrl(" blob:https://example.com/id ")).toBeUndefined();
    expect(normalizeHttpUrl(" data:text/plain;base64,SGVsbG8= ")).toBeUndefined();
    expect(normalizeHttpUrl(" file:///tmp/video.mp4 ")).toBeUndefined();
    expect(normalizeHttpUrl(" javascript:alert('xss') ")).toBeUndefined();
    expect(normalizeHttpUrl(" mailto:test@example.com ")).toBeUndefined();
    expect(normalizeHttpUrl(" ftp://example.com/video.mp4 ")).toBeUndefined();
  });
});

describe("normalizeVideoHintUrl", () => {
  it("keeps direct Pinterest MP4 and manifest-like hints", () => {
    expect(normalizeVideoHintUrl("https://v.pinimg.com/videos/iht/expmp4/video.mp4", "pinterest"))
      .toBe("https://v.pinimg.com/videos/iht/expmp4/video.mp4");
    expect(normalizeVideoHintUrl("https://v.pinimg.com/videos/iht/hls/video.m3u8", "pinterest"))
      .toBe("https://v.pinimg.com/videos/iht/hls/video.m3u8");
    expect(normalizeVideoHintUrl("https://v.pinimg.com/videos/iht/hls/video.cmfv", "pinterest"))
      .toBe("https://v.pinimg.com/videos/iht/hls/video.cmfv");
  });

  it("drops Pinterest page, image, and unrelated HTTP(S) hint URLs", () => {
    expect(normalizeVideoHintUrl("https://www.pinterest.com/pin/1234567890/", "pinterest")).toBeUndefined();
    expect(normalizeVideoHintUrl("https://i.pinimg.com/originals/example.jpg", "pinterest")).toBeUndefined();
    expect(normalizeVideoHintUrl("https://cdn.example.com/watch?v=123", "pinterest")).toBeUndefined();
  });

  it("keeps non-Pinterest HTTP(S) hints for runtime-owned validation", () => {
    expect(normalizeVideoHintUrl(" https://sns-video-bd.xhscdn.com/stream/example.mp4 ", "xiaohongshu"))
      .toBe("https://sns-video-bd.xhscdn.com/stream/example.mp4");
  });
});

describe("route and page URL normalization", () => {
  it("uses HTTP(S) normalization for required route and page URLs", () => {
    expect(normalizeRequiredVideoRouteUrl(" https://www.youtube.com/watch?v=abc ")).toBe(
      "https://www.youtube.com/watch?v=abc",
    );
    expect(normalizeVideoPageUrl("https://x.com/Jackywine/status/2042131360048128059/photo/1")).toBe(
      "https://x.com/Jackywine/status/2042131360048128059/photo/1",
    );
    expect(normalizeRequiredVideoRouteUrl("javascript:alert('xss')")).toBeUndefined();
    expect(normalizeVideoPageUrl("ftp://example.com/watch")).toBeUndefined();
  });
});

describe("normalizeVideoCandidates", () => {
  it("returns an empty array for missing or non-array candidate input", () => {
    expect(normalizeVideoCandidates(null)).toEqual([]);
    expect(normalizeVideoCandidates({ url: "https://example.com/video.mp4" })).toEqual([]);
  });

  it("filters invalid entries and dedupes by normalized URL", () => {
    expect(normalizeVideoCandidates([
      null,
      "bad",
      { url: " javascript:alert('xss') ", type: "direct_mp4" },
      { url: " https://example.com/video.mp4 ", type: " direct_mp4 " },
      { url: "https://example.com/video.mp4", type: "duplicate" },
    ])).toEqual([
      {
        url: "https://example.com/video.mp4",
        type: "direct_mp4",
        source: undefined,
        confidence: undefined,
        mediaType: undefined,
      },
    ]);
  });

  it("preserves candidate metadata and legacy media_type fields", () => {
    expect(normalizeVideoCandidates([
      {
        url: " https://sns-video-bd.xhscdn.com/stream/example.mp4 ",
        type: " direct_mp4 ",
        source: " video_element ",
        confidence: " high ",
        media_type: "video",
      },
      {
        url: " https://www.xiaohongshu.com/explore/66112233445566778899 ",
        type: " page_url ",
        mediaType: "image",
      },
    ], "xhs")).toEqual([
      {
        url: "https://sns-video-bd.xhscdn.com/stream/example.mp4",
        type: "direct_mp4",
        source: "video_element",
        confidence: "high",
        mediaType: "video",
      },
      {
        url: "https://www.xiaohongshu.com/explore/66112233445566778899",
        type: "page_url",
        source: undefined,
        confidence: undefined,
        mediaType: "image",
      },
    ]);
  });

  it("prioritizes Pinterest direct MP4 hints ahead of manifests", () => {
    expect(normalizeVideoCandidateUrls([
      { url: "https://www.pinterest.com/pin/1234567890/" },
      { url: "https://v.pinimg.com/videos/iht/hls/video.m3u8", type: "manifest_m3u8" },
      { url: "https://i.pinimg.com/originals/example.jpg" },
      { url: " https://v.pinimg.com/videos/iht/expmp4/video.mp4 ", type: "direct_mp4" },
    ], "pinterest")).toEqual([
      "https://v.pinimg.com/videos/iht/expmp4/video.mp4",
      "https://v.pinimg.com/videos/iht/hls/video.m3u8",
    ]);
  });

  it("keeps Douyin direct candidates in runtime-owned quality order", () => {
    expect(normalizeVideoCandidates([
      {
        url: "https://www.douyinvod.com/aweme/v1/play/video_540p.mp4",
        type: "direct_mp4",
        source: "video_element",
      },
      {
        url: "https://www.douyin.com/video/1234567890",
        type: "page_url",
      },
      {
        url: "https://www.douyinvod.com/aweme/v1/play/video_1080p.mp4",
        type: "direct_mp4",
        source: "network_probe",
      },
    ], "douyin")).toEqual([
      {
        url: "https://www.douyinvod.com/aweme/v1/play/video_1080p.mp4",
        type: "direct_mp4",
        source: "network_probe",
        confidence: undefined,
        mediaType: undefined,
      },
      {
        url: "https://www.douyinvod.com/aweme/v1/play/video_540p.mp4",
        type: "direct_mp4",
        source: "video_element",
        confidence: undefined,
        mediaType: undefined,
      },
      {
        url: "https://www.douyin.com/video/1234567890",
        type: "page_url",
        source: undefined,
        confidence: undefined,
        mediaType: undefined,
      },
    ]);
  });
});

describe("resolveVideoSelectionSiteHint", () => {
  it("normalizes aliases and falls back to URL detection", () => {
    expect(resolveVideoSelectionSiteHint("xhs")).toBe("xiaohongshu");
    expect(resolveVideoSelectionSiteHint(undefined, "https://x.com/ameow/status/123")).toBe("twitter-x");
  });
});
