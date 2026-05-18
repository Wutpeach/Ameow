import type {
  DownloadIntent,
  RawDownloadInput,
  ResolvedDownloadPlan,
  SiteProvider,
  VideoDownloadIntent,
} from "../core/index.js";
import { buildEnginePlansFromStrategySources } from "../download-capabilities/strategy-plans.js";
import { getRuntimeManualSiteStrategy } from "../download-capabilities/runtime-site-strategies.js";

const DOUYIN_HOST_PATTERN = /(douyin\.com|douyinvod\.com|douyincdn\.com|bytecdn|bytedance)/i;

const isDouyinUrl = (value: string | undefined): boolean => Boolean(value && DOUYIN_HOST_PATTERN.test(value));

const isDirectVideoUrl = (value: string | undefined): boolean => (
  Boolean(value && DOUYIN_HOST_PATTERN.test(value) && /\.(mp4|mov|m4v)(?:$|\?)/i.test(value))
);

const buildIntent = (input: RawDownloadInput): DownloadIntent => ({
  type: "video",
  siteId: "douyin",
  originalUrl: input.url,
  pageUrl: input.pageUrl,
  title: input.title,
  cookies: input.cookies,
  referer: input.pageUrl,
  priority: 90,
  candidates: input.videoCandidates ?? [],
  selectionScope: input.selectionScope,
  ytdlpQuality: input.ytdlpQuality,
  preferredFormat: "mp4",
});

export const douyinProvider: SiteProvider = {
  id: "douyin",
  matches(input: RawDownloadInput): boolean {
    return input.siteHint === "douyin"
      || isDouyinUrl(input.pageUrl)
      || isDouyinUrl(input.url)
      || isDirectVideoUrl(input.videoUrl);
  },
  resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan {
    const intent = buildIntent(input) as VideoDownloadIntent;
    const strategy = getRuntimeManualSiteStrategy("douyin");
    const pageSourceUrl = input.pageUrl ?? input.url;

    return {
      providerId: "douyin",
      label: input.title?.trim() || input.pageUrl || input.url,
      intent,
      engines: buildEnginePlansFromStrategySources(strategy, {
        "douyin-dl": {
          sourceUrl: pageSourceUrl,
          reason: "Use douyin-downloader as the only Douyin website extractor",
        },
      }),
    };
  },
};
