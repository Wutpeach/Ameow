import { describe, expect, it } from "vitest";
import type { RawDownloadInput } from "../core/index.js";
import { builtinProviders } from "../sites/index.js";
import { createSiteRegistry } from "../sites/site-registry.js";
import { bundledCapabilityRegistry } from "./seed.js";

const siteRegistry = createSiteRegistry(builtinProviders);

const resolvePlan = (input: RawDownloadInput) => {
  const plan = siteRegistry.resolve(input);
  expect(plan).not.toBeNull();
  if (!plan) {
    throw new Error("Expected a resolved provider plan");
  }
  return plan;
};

const expectPlanAlignedWithStrategy = (
  siteId: string,
  input: RawDownloadInput,
) => {
  const plan = resolvePlan(input);
  const strategy = bundledCapabilityRegistry.getSiteStrategy(siteId);

  expect(strategy).not.toBeNull();
  if (!strategy) {
    throw new Error(`Missing strategy for ${siteId}`);
  }

  expect(plan.providerId).toBe(siteId);
  expect(plan.engines[0]?.engine).toBe(strategy.engineOrder[0]);
  expect(plan.engines.every((enginePlan) => strategy.engineOrder.includes(enginePlan.engine))).toBe(true);
};

describe("manual capability overlay stays aligned with current provider routing", () => {
  it("keeps youtube on the single yt-dlp strategy", () => {
    expectPlanAlignedWithStrategy("youtube", {
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
    });
  });

  it("keeps bilibili on the single yt-dlp strategy", () => {
    expectPlanAlignedWithStrategy("bilibili", {
      url: "https://www.bilibili.com/video/BV1xx411c7mD",
      pageUrl: "https://www.bilibili.com/video/BV1xx411c7mD",
    });
  });

  it("keeps twitter-x on the single yt-dlp strategy", () => {
    expectPlanAlignedWithStrategy("twitter-x", {
      url: "https://x.com/ameow/status/1234567890",
    });
  });

  it("keeps douyin routing on the yt-dlp-only strategy", () => {
    expectPlanAlignedWithStrategy("douyin", {
      url: "https://www.douyin.com/video/123",
      pageUrl: "https://www.douyin.com/video/123",
      videoUrl: "https://www.douyinvod.com/obj/tos-cn-v-0000/example.mp4",
    });
  });

  it("keeps xiaohongshu yt-dlp routing aligned with the manual engine order", () => {
    expectPlanAlignedWithStrategy("xiaohongshu", {
      url: "https://www.xiaohongshu.com/explore/66112233445566778899",
      pageUrl: "https://www.xiaohongshu.com/explore/66112233445566778899",
      videoUrl: "https://sns-video-bd.xhscdn.com/stream/example.mp4",
    });
  });

  it("keeps pinterest direct-hint routing aligned with the manual engine order", () => {
    expectPlanAlignedWithStrategy("pinterest", {
      url: "https://www.pinterest.com/pin/1234567890/",
      pageUrl: "https://www.pinterest.com/pin/1234567890/",
      videoCandidates: [
        {
          url: "https://v1.pinimg.com/videos/iht/expmp4/example.mp4",
          type: "direct_mp4",
        },
      ],
    });
  });

  it("keeps weibo detail routing aligned with the manual engine order", () => {
    expectPlanAlignedWithStrategy("weibo", {
      url: "https://weibo.com/detail/4913212871149937",
    });
  });

  it("keeps the generic fallback on yt-dlp", () => {
    const plan = resolvePlan({
      url: "https://example.com/post/42",
      pageUrl: "https://example.com/post/42",
    });
    const strategy = bundledCapabilityRegistry.getSiteStrategy("generic");

    expect(strategy).not.toBeNull();
    if (!strategy) {
      throw new Error("Missing generic strategy");
    }

    expect(plan.providerId).toBe("generic");
    expect(plan.engines.map((engine) => engine.engine)).toEqual(strategy.engineOrder);
  });

  it("keeps exact candidate order and counts per provider", () => {
    const weibo = resolvePlan({
      url: "https://weibo.com/detail/4913212871149937",
    });
    expect(weibo.engines.map((engine) => engine.engine)).toEqual(["gallery-dl", "yt-dlp"]);
    expect(weibo.engines.map((engine) => engine.when)).toEqual(["primary", "fallback"]);
    expect(weibo.engines[0]?.priority).toBeGreaterThan(weibo.engines[1]?.priority ?? 0);

    const pinterest = resolvePlan({
      url: "https://www.pinterest.com/pin/1234567890/",
      pageUrl: "https://www.pinterest.com/pin/1234567890/",
    });
    expect(pinterest.engines.map((engine) => engine.engine)).toEqual(["gallery-dl"]);

    const instagram = resolvePlan({
      url: "https://www.instagram.com/p/AbCdEfGh123/",
      pageUrl: "https://www.instagram.com/p/AbCdEfGh123/",
    });
    expect(instagram.engines.map((engine) => engine.engine)).toEqual(["yt-dlp", "gallery-dl"]);

    const generic = resolvePlan({
      url: "https://example.com/post/42",
      pageUrl: "https://example.com/post/42",
    });
    expect(generic.engines.map((engine) => engine.engine)).toEqual(["yt-dlp"]);
  });

  it("declares advanced-quality requirements only when the download needs probing", () => {
    const youtube = resolvePlan({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
    });
    const youtubeProbing = resolvePlan({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      advancedQualityRequest: true,
    });
    const youtubeSelected = resolvePlan({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      advancedQualitySelector: "1080p",
    });
    const bilibili = resolvePlan({
      url: "https://www.bilibili.com/video/BV1xx411c7mD",
      pageUrl: "https://www.bilibili.com/video/BV1xx411c7mD",
    });
    const bilibiliProbing = resolvePlan({
      url: "https://www.bilibili.com/video/BV1xx411c7mD",
      pageUrl: "https://www.bilibili.com/video/BV1xx411c7mD",
      advancedQualityRequest: true,
    });
    const twitter = resolvePlan({
      url: "https://x.com/ameow/status/1234567890",
    });

    // Normal downloads express no capability need and accept any engine.
    expect(youtube.requirements).toBeUndefined();
    expect(bilibili.requirements).toBeUndefined();
    expect(twitter.requirements).toBeUndefined();
    // Probing or a selected option requires advanced-quality capability.
    expect(youtubeProbing.requirements).toEqual({ advancedQuality: true });
    expect(youtubeSelected.requirements).toEqual({ advancedQuality: true });
    expect(bilibiliProbing.requirements).toEqual({ advancedQuality: true });
  });
});
