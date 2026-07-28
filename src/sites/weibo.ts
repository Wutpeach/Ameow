import type { RawDownloadInput, ResolvedDownloadPlan, SiteProvider } from "../core/index.js";
import { buildEnginePlansFromStrategySources } from "../download-capabilities/strategy-plans.js";
import { getRuntimeManualSiteStrategy } from "../download-capabilities/runtime-site-strategies.js";
import {
  buildGalleryDlVideoIntent,
  isWeiboTvShowUrl,
  resolveWeiboSourceUrl,
  resolveWeiboGalleryDlSourceUrl,
} from "./gallery-dl-support.js";

const resolveSelectedWeiboVariantUrl = (input: RawDownloadInput): string | undefined => {
  if (!input.selectedVideoVariant?.url || input.siteHint !== "weibo") {
    return undefined;
  }
  try {
    const parsed = new URL(input.selectedVideoVariant.url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
};

export const weiboProvider: SiteProvider = {
  id: "weibo",
  matches(input: RawDownloadInput): boolean {
    return input.siteHint === "weibo"
      || Boolean(resolveWeiboSourceUrl(input.pageUrl))
      || Boolean(resolveWeiboSourceUrl(input.url));
  },
  resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan {
    const originalSourceUrl = input.pageUrl ?? input.url;
    const resolvedSourceUrl = resolveWeiboSourceUrl(originalSourceUrl) ?? originalSourceUrl;
    const strategy = getRuntimeManualSiteStrategy("weibo");
    const selectedVariantUrl = resolveSelectedWeiboVariantUrl(input);
    const selectedVariant = input.selectedVideoVariant;
    if (selectedVariantUrl && selectedVariant) {
      return {
        providerId: "weibo",
        label: input.title?.trim()
          || selectedVariant.label?.trim()
          || input.pageUrl
          || input.url,
        intent: {
          ...buildGalleryDlVideoIntent(input, "weibo"),
          candidates: [selectedVariant],
          selectedVideoVariant: selectedVariant,
          preferredFormat: "mp4",
        },
        engines: [{
          engine: "yt-dlp",
          priority: 100,
          when: "primary",
          reason: "Use the Weibo quality variant explicitly selected in the browser extension",
          sourceUrl: selectedVariantUrl,
        }],
      };
    }

    if (isWeiboTvShowUrl(resolvedSourceUrl)) {
      return {
        providerId: "weibo",
        label: input.title?.trim() || input.pageUrl || input.url,
        intent: buildGalleryDlVideoIntent(input, "weibo"),
        engines: buildEnginePlansFromStrategySources(strategy, {
          "yt-dlp": {
            sourceUrl: resolvedSourceUrl,
            reason: "Weibo tv/show pages are supported by yt-dlp but not by gallery-dl",
          },
        }),
      };
    }

    const galleryDlSourceUrl = resolveWeiboGalleryDlSourceUrl(resolvedSourceUrl) ?? resolvedSourceUrl;

    return {
      providerId: "weibo",
      label: input.title?.trim() || input.pageUrl || input.url,
      intent: buildGalleryDlVideoIntent(input, "weibo"),
      engines: buildEnginePlansFromStrategySources(strategy, {
        "gallery-dl": {
          sourceUrl: galleryDlSourceUrl,
          reason: galleryDlSourceUrl === originalSourceUrl
            ? "Weibo downloads should prefer gallery-dl extraction"
            : "Normalize Weibo links to a canonical detail URL before gallery-dl extraction",
        },
        "yt-dlp": {
          sourceUrl: resolvedSourceUrl,
          reason: "Use yt-dlp as a safe fallback when gallery-dl cannot resolve the Weibo page",
        },
      }),
    };
  },
};
