import type {
  RawDownloadInput,
  ResolvedDownloadPlan,
  SiteProvider,
  VideoDownloadIntent,
} from "../core/index.js";
import { buildEnginePlansFromStrategySources } from "../download-capabilities/strategy-plans.js";
import { getRuntimeManualSiteStrategy } from "../download-capabilities/runtime-site-strategies.js";

const isPinterestUrl = (value: string | undefined): boolean =>
  Boolean(value && /pinterest\./i.test(value));

export const pinterestProvider: SiteProvider = {
  id: "pinterest",
  matches(input: RawDownloadInput): boolean {
    return input.siteHint === "pinterest" || isPinterestUrl(input.pageUrl) || isPinterestUrl(input.url);
  },
  resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan {
    const strategy = getRuntimeManualSiteStrategy("pinterest");
    const pageSourceUrl = input.pageUrl ?? input.url;
    const intent: VideoDownloadIntent = {
      type: "video",
      siteId: "pinterest",
      originalUrl: input.url,
      pageUrl: input.pageUrl,
      title: input.title,
      cookies: input.cookies,
      referer: input.pageUrl,
      priority: 95,
      candidates: [],
      selectionScope: input.selectionScope,
      videoQuality: input.videoQuality,
      preferredFormat: "mp4",
    };

    return {
      providerId: "pinterest",
      label: input.title?.trim() || input.pageUrl || input.url,
      intent,
      engines: buildEnginePlansFromStrategySources(strategy, {
        "gallery-dl": {
          sourceUrl: pageSourceUrl,
          reason: "Pinterest resources are handled by gallery-dl",
        },
      }),
    };
  },
};
