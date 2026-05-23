import { describe, expect, it } from "vitest";
import type { RawDownloadInput, ResolvedDownloadPlan, VideoDownloadIntent } from "../core/index.js";
import { builtinProviders } from "./index.js";
import { createSiteRegistry } from "./site-registry.js";

const resolvePlan = (input: RawDownloadInput): ResolvedDownloadPlan => {
  const plan = createSiteRegistry(builtinProviders).resolve(input);
  expect(plan).not.toBeNull();
  if (!plan) {
    throw new Error("Expected a resolved download plan");
  }
  return plan;
};

const expectVideoIntent = (intent: ResolvedDownloadPlan["intent"]): VideoDownloadIntent => {
  expect(intent.type).toBe("video");
  if (intent.type !== "video") {
    throw new Error("Expected a video download intent");
  }
  return intent;
};

describe("builtin site providers", () => {
  it("routes direct Douyin asset URLs through douyin-dl only", () => {
    const directUrl = "https://www.douyinvod.com/obj/tos-cn-v-0000/example.mp4";
    const plan = resolvePlan({ url: directUrl });

    expect(plan?.providerId).toBe("douyin");
    expect(plan?.engines.map((engine) => engine.engine)).toEqual(["douyin-dl"]);
    expect(plan?.engines[0]?.sourceUrl).toBe(directUrl);
  });

  it("synthesizes Douyin video page source from extension modal evidence", () => {
    const pageUrl = "https://www.douyin.com/jingxuan?modal_id=7637912431158644014";
    const plan = resolvePlan({
      url: pageUrl,
      pageUrl,
      siteHint: "douyin",
      extensionData: {
        ameowCapture: {
          version: 1,
          action: "current_content",
          pageUrl,
          contentIds: {
            modal_id: "7637912431158644014",
          },
        },
      },
    });
    const intent = expectVideoIntent(plan.intent);

    expect(plan.providerId).toBe("douyin");
    expect(plan.engines).toHaveLength(1);
    expect(plan.engines[0]).toMatchObject({
      engine: "douyin-dl",
      sourceUrl: "https://www.douyin.com/video/7637912431158644014",
    });
    expect(intent.extensionData).toMatchObject({
      ameowCapture: {
        contentIds: {
          modal_id: "7637912431158644014",
        },
      },
    });
  });

  it("prefers accepted Douyin canonical evidence over modal id synthesis", () => {
    const pageUrl = "https://www.douyin.com/jingxuan?modal_id=7637912431158644014";
    const canonicalUrl = "https://www.douyin.com/video/7604129988555574538";
    const plan = resolvePlan({
      url: pageUrl,
      pageUrl,
      siteHint: "douyin",
      extensionData: {
        ameowCapture: {
          version: 1,
          action: "current_content",
          pageUrl,
          canonicalUrl,
          contentIds: {
            modal_id: "7637912431158644014",
          },
        },
      },
    });

    expect(plan.providerId).toBe("douyin");
    expect(plan.engines[0]).toMatchObject({
      engine: "douyin-dl",
      sourceUrl: canonicalUrl,
    });
  });

  it("keeps Douyin page fallback when extension modal evidence is absent", () => {
    const pageUrl = "https://www.douyin.com/jingxuan?modal_id=7637912431158644014";
    const plan = resolvePlan({
      url: pageUrl,
      pageUrl,
      siteHint: "douyin",
    });

    expect(plan.providerId).toBe("douyin");
    expect(plan.engines[0]).toMatchObject({
      engine: "douyin-dl",
      sourceUrl: pageUrl,
    });
  });

  it("routes Xiaohongshu page URLs through yt-dlp with the canonical note URL", () => {
    const directUrl = "https://sns-video-bd.xhscdn.com/stream/example.mp4";
    const pageUrl = "https://www.xiaohongshu.com/explore/66112233445566778899";
    const plan = resolvePlan({
      url: directUrl,
      pageUrl,
    });

    expect(plan?.providerId).toBe("xiaohongshu");
    expect(plan?.engines.map((engine) => engine.engine)).toEqual(["yt-dlp"]);
    expect(plan?.engines[0]?.sourceUrl).toBe(pageUrl);
  });

  it("does not depend on Xiaohongshu direct candidates while using yt-dlp", () => {
    const pageUrl = "https://www.xiaohongshu.com/explore/66112233445566778899";
    const directCandidate = {
      url: "https://sns-video-bd.xhscdn.com/stream/example.mp4",
      type: "direct_mp4",
      source: "extension_resolution",
      confidence: "high" as const,
      mediaType: "video" as const,
    };
    const plan = resolvePlan({
      url: pageUrl,
      pageUrl,
      siteHint: "xiaohongshu",
      cookies: "# Netscape HTTP Cookie File\n.example\tTRUE\t/\tTRUE\t0\ta\tb",
      videoCandidates: [directCandidate],
    });
    const intent = expectVideoIntent(plan.intent);

    expect(plan.providerId).toBe("xiaohongshu");
    expect(plan.engines).toHaveLength(1);
    expect(plan.engines[0]).toMatchObject({
      engine: "yt-dlp",
      sourceUrl: pageUrl,
    });
    expect(intent.cookies).toContain("Netscape HTTP Cookie File");
    expect(intent.candidates).toEqual([]);
  });

  it("does not route bare Xiaohongshu CDN assets through the Xiaohongshu provider", () => {
    const directUrl = "https://sns-video-bd.xhscdn.com/stream/example.mp4";
    const plan = resolvePlan({ url: directUrl });

    expect(plan.providerId).toBe("generic");
    expect(plan.engines).toMatchObject([
      {
        engine: "yt-dlp",
        sourceUrl: directUrl,
      },
    ]);
  });

  it("prefers tokenized Xiaohongshu discovery detail URLs for yt-dlp", () => {
    const detailUrl = "https://www.xiaohongshu.com/discovery/item/674051740000000007027a15?xsec_token=CBgeL8Dxd1ZWBhwqRd568gAZ_iwG-9JIf9tnApNmteU2E%3D";
    const plan = resolvePlan({
      url: detailUrl,
      pageUrl: "https://www.xiaohongshu.com/explore/674051740000000007027a15",
      siteHint: "xiaohongshu",
    });

    expect(plan.providerId).toBe("xiaohongshu");
    expect(plan.engines).toHaveLength(1);
    expect(plan.engines[0]).toMatchObject({
      engine: "yt-dlp",
      sourceUrl: detailUrl,
    });
  });

  it("preserves tokenized Xiaohongshu explore note URLs for yt-dlp", () => {
    const tokenizedExploreUrl = "https://www.xiaohongshu.com/explore/6a01fd150000000035027660?xsec_token=ABiXw-buReZ18demcjA7FtPWnHVcxXkkXA-EowqI8MsT8=&xsec_source=pc_feed";
    const plan = resolvePlan({
      url: tokenizedExploreUrl,
      pageUrl: tokenizedExploreUrl,
      siteHint: "xiaohongshu",
    });

    expect(plan.providerId).toBe("xiaohongshu");
    expect(plan.engines).toHaveLength(1);
    expect(plan.engines[0]).toMatchObject({
      engine: "yt-dlp",
      sourceUrl: tokenizedExploreUrl,
    });
  });

  it("does not treat Xiaohongshu image-tagged candidates as direct video hints", () => {
    const pageUrl = "https://www.xiaohongshu.com/explore/66112233445566778899";
    const plan = resolvePlan({
      url: pageUrl,
      pageUrl,
      siteHint: "xiaohongshu",
      videoCandidates: [
        {
          url: "https://sns-video-bd.xhscdn.com/stream/example.mp4",
          type: "direct_mp4",
          source: "image_element",
          confidence: "high",
          mediaType: "image",
        },
      ],
    });

    expect(plan?.providerId).toBe("xiaohongshu");
    expect(plan?.engines.map((engine) => engine.engine)).toEqual(["yt-dlp"]);
  });

  it("canonicalizes Xiaohongshu profile note urls before handing them to yt-dlp", () => {
    const pageUrl = "https://www.xiaohongshu.com/user/profile/64e721f3000000000200c2b9/69ce44ea000000001b0031bb";
    const plan = resolvePlan({
      url: pageUrl,
      pageUrl,
      siteHint: "xiaohongshu",
    });
    const intent = expectVideoIntent(plan.intent);

    expect(plan.providerId).toBe("xiaohongshu");
    expect(plan.engines).toHaveLength(1);
    expect(plan.engines[0]).toMatchObject({
      engine: "yt-dlp",
      sourceUrl: "https://www.xiaohongshu.com/explore/69ce44ea000000001b0031bb",
    });
    expect(intent.pageUrl).toBe(pageUrl);
    expect(intent.originalUrl).toBe(pageUrl);
  });

  it("preserves Bilibili clip metadata on the resolved provider intent", () => {
    const url = "https://www.bilibili.com/video/BV1xx411c7mD?p=2";
    const plan = resolvePlan({
      url,
      pageUrl: "https://www.bilibili.com/video/BV1xx411c7mD?spm_id_from=333.999.0.0&p=2",
      selectionScope: "current_item",
      clipStartSec: 12,
      clipEndSec: 24,
    });
    const intent = expectVideoIntent(plan?.intent);

    expect(plan?.providerId).toBe("bilibili");
    expect(plan?.engines).toHaveLength(1);
    expect(plan?.engines[0]).toMatchObject({
      engine: "yt-dlp",
      sourceUrl: url,
    });
    expect(intent.siteId).toBe("bilibili");
    expect(intent.selectionScope).toBe("current_item");
    expect(intent.clipStartSec).toBe(12);
    expect(intent.clipEndSec).toBe(24);
  });

  it("routes x.com status URLs to the Twitter/X provider instead of the generic fallback", () => {
    const url = "https://x.com/ameow/status/1234567890";
    const plan = resolvePlan({ url });
    const intent = expectVideoIntent(plan?.intent);

    expect(plan?.providerId).toBe("twitter-x");
    expect(plan?.engines).toHaveLength(1);
    expect(plan?.engines[0]).toMatchObject({
      engine: "yt-dlp",
      sourceUrl: url,
    });
    expect(intent.siteId).toBe("twitter-x");
  });

  it("uses explicit site hints when the route url alone is not enough to identify the provider", () => {
    const url = "https://cdn.example.com/watch?id=123";
    const plan = resolvePlan({
      url,
      siteHint: "twitter-x",
      title: "Queued from extension v2",
    });
    const intent = expectVideoIntent(plan.intent);

    expect(plan.providerId).toBe("twitter-x");
    expect(plan.engines[0]).toMatchObject({
      engine: "yt-dlp",
      sourceUrl: url,
    });
    expect(intent.siteId).toBe("twitter-x");
  });

  it("keeps YouTube current-item routing on yt-dlp with playlist-safe metadata", () => {
    const url = "https://www.youtube.com/watch?v=abc123&list=PL123456";
    const plan = resolvePlan({
      url,
      pageUrl: url,
      selectionScope: "current_item",
      title: "Current item only",
    });
    const intent = expectVideoIntent(plan.intent);

    expect(plan.providerId).toBe("youtube");
    expect(plan.engines).toHaveLength(1);
    expect(plan.engines[0]).toMatchObject({
      engine: "yt-dlp",
      sourceUrl: url,
    });
    expect(intent.siteId).toBe("youtube");
    expect(intent.selectionScope).toBe("current_item");
  });

  it("preserves YouTube clip metadata on the resolved provider intent", () => {
    const url = "https://www.youtube.com/watch?v=clip123";
    const plan = resolvePlan({
      url,
      pageUrl: url,
      selectionScope: "current_item",
      clipStartSec: 5.25,
      clipEndSec: 8.75,
    });
    const intent = expectVideoIntent(plan.intent);

    expect(plan.providerId).toBe("youtube");
    expect(plan.engines).toHaveLength(1);
    expect(plan.engines[0]).toMatchObject({
      engine: "yt-dlp",
      sourceUrl: url,
    });
    expect(intent.siteId).toBe("youtube");
    expect(intent.selectionScope).toBe("current_item");
    expect(intent.clipStartSec).toBe(5.25);
    expect(intent.clipEndSec).toBe(8.75);
  });

  it("uses gallery-dl only for Pinterest even when direct media hints are present", () => {
    const plan = resolvePlan({
      url: "https://www.pinterest.com/pin/1234567890/",
      pageUrl: "https://www.pinterest.com/pin/1234567890/",
      siteHint: "pinterest",
      videoUrl: "https://v1.pinimg.com/videos/iht/expmp4/example.mp4",
      videoCandidates: [
        {
          url: "https://v1.pinimg.com/videos/iht/expmp4/example.mp4",
          type: "direct_mp4",
          source: "network_probe",
          confidence: "high",
        },
      ],
    });
    const intent = expectVideoIntent(plan.intent);

    expect(plan.providerId).toBe("pinterest");
    expect(plan.engines.map((engine) => engine.engine)).toEqual(["gallery-dl"]);
    expect(plan.engines[0]).toMatchObject({
      sourceUrl: "https://www.pinterest.com/pin/1234567890/",
    });
    expect(intent.candidates).toEqual([]);
  });

  it("keeps Pinterest page-only routing on gallery-dl when no direct asset is available", () => {
    const plan = resolvePlan({
      url: "https://www.pinterest.com/pin/1234567890/",
      pageUrl: "https://www.pinterest.com/pin/1234567890/",
      siteHint: "pinterest",
    });

    expect(plan.providerId).toBe("pinterest");
    expect(plan.engines.map((engine) => engine.engine)).toEqual(["gallery-dl"]);
    expect(plan.engines[0]).toMatchObject({
      sourceUrl: "https://www.pinterest.com/pin/1234567890/",
    });
  });

  it("routes gallery-dl-supported sites through gallery-dl before the generic yt-dlp fallback", () => {
    const url = "https://www.instagram.com/p/C7example/";
    const plan = resolvePlan({
      url,
      pageUrl: url,
      title: "Gallery-dl supported page",
    });
    const intent = expectVideoIntent(plan.intent);

    expect(plan.providerId).toBe("gallery-dl-supported");
    expect(plan.engines.map((engine) => engine.engine)).toEqual(["gallery-dl", "yt-dlp"]);
    expect(plan.engines[0]).toMatchObject({
      sourceUrl: url,
    });
    expect(intent.siteId).toBe("instagram.com");
  });

  it("normalizes Weibo layerid links to the canonical detail URL for gallery-dl", () => {
    const plan = resolvePlan({
      url: "https://weibo.com/?layerid=4913212871149937",
    });
    const intent = expectVideoIntent(plan.intent);

    expect(plan.providerId).toBe("weibo");
    expect(plan.engines.map((engine) => engine.engine)).toEqual(["gallery-dl", "yt-dlp"]);
    expect(plan.engines[0]).toMatchObject({
      sourceUrl: "https://weibo.com/detail/4913212871149937",
    });
    expect(plan.engines[1]).toMatchObject({
      sourceUrl: "https://weibo.com/?layerid=4913212871149937",
    });
    expect(intent.siteId).toBe("weibo");
  });

  it("does not guess a synthetic Weibo detail URL from a tv/show fid without a status id", () => {
    const url = "https://weibo.com/tv/show/1034:4913203381993532";
    const plan = resolvePlan({ url });

    expect(plan.providerId).toBe("weibo");
    expect(plan.engines[0]).toMatchObject({
      engine: "yt-dlp",
      sourceUrl: url,
    });
  });

  it("keeps Weibo visitor wrappers for downloader-owned extraction", () => {
    const wrapperUrl = "https://passport.weibo.com/visitor/visitor?entry=krvideo&a=enter&url=https%3A%2F%2Fweibo.com%2Ftv%2Fshow%2F1034%3A5284550214090773%3Ffrom%3Dold_pc_videoshow&domain=.weibo.com";
    const plan = resolvePlan({
      url: wrapperUrl,
      siteHint: "weibo",
    });

    expect(plan.providerId).toBe("weibo");
    expect(plan.engines.map((engine) => engine.engine)).toEqual(["gallery-dl", "yt-dlp"]);
    expect(plan.engines.every((engine) => engine.sourceUrl === wrapperUrl)).toBe(true);
  });

  it("falls back to the generic provider for unknown sites while preserving normalized metadata", () => {
    const url = "https://cdn.example.com/media?id=42";
    const plan = resolvePlan({
      url,
      pageUrl: "https://example.com/post/42",
      siteHint: "generic",
      title: "Unknown provider",
      videoCandidates: [
        {
          url: "https://cdn.example.com/video-720p.mp4",
          type: "direct_mp4",
          source: "page_probe",
        },
      ],
    });
    const intent = expectVideoIntent(plan.intent);

    expect(plan.providerId).toBe("generic");
    expect(plan.engines).toMatchObject([
      {
        engine: "yt-dlp",
        sourceUrl: "https://example.com/post/42",
      },
    ]);
    expect(intent.siteId).toBe("generic");
    expect(intent.candidates).toEqual([
      {
        url: "https://cdn.example.com/video-720p.mp4",
        type: "direct_mp4",
        source: "page_probe",
      },
    ]);
  });
});
