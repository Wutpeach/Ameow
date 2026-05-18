import type {
  RawDownloadInput,
  ResolvedDownloadPlan,
  SiteProvider,
  VideoDownloadIntent,
} from "../core/index.js";
import { buildEnginePlansFromStrategySources } from "../download-capabilities/strategy-plans.js";
import { getRuntimeManualSiteStrategy } from "../download-capabilities/runtime-site-strategies.js";

const XIAOHONGSHU_HOST_PATTERN = /(xiaohongshu\.com|xhslink\.com)/i;

const isXiaohongshuUrl = (value: string | undefined): boolean => (
  Boolean(value && XIAOHONGSHU_HOST_PATTERN.test(value))
);

const extractXiaohongshuNoteId = (value: string | undefined): string | null => {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    const match = parsed.pathname.match(
      /\/(?:explore|discovery\/item)\/([a-f0-9]+)|^\/user\/profile\/[^/?#]+\/([a-f0-9]+)(?:[/?#]|$)/i,
    );
    return match?.[1] ?? match?.[2] ?? null;
  } catch {
    return null;
  }
};

const canonicalizeXiaohongshuYtdlpUrl = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = new URL(value);
    if (!/(^|\.)xiaohongshu\.com$/i.test(parsed.hostname)) {
      return undefined;
    }

    const noteId = extractXiaohongshuNoteId(value);
    if (!noteId) {
      return undefined;
    }

    const detailPath = parsed.pathname.match(/^\/discovery\/item\/[a-f0-9]+(?:[/?#]|$)/i);
    if (detailPath) {
      parsed.protocol = "https:";
      parsed.hostname = "www.xiaohongshu.com";
      parsed.hash = "";
      return parsed.toString();
    }
  } catch {
    return undefined;
  }

  const noteId = extractXiaohongshuNoteId(value);
  return noteId ? `https://www.xiaohongshu.com/explore/${noteId}` : undefined;
};

const resolveXiaohongshuYtdlpSource = (input: RawDownloadInput): string | undefined => {
  const candidates = [input.url, input.pageUrl].filter((value): value is string => Boolean(value));
  const tokenizedDetailUrl = candidates
    .map(canonicalizeXiaohongshuYtdlpUrl)
    .find((value) => Boolean(value && /\/discovery\/item\/[a-f0-9]+/i.test(value) && /[?&]xsec_token=/i.test(value)));
  return tokenizedDetailUrl
    ?? canonicalizeXiaohongshuYtdlpUrl(input.pageUrl)
    ?? canonicalizeXiaohongshuYtdlpUrl(input.url);
};

export const xiaohongshuProvider: SiteProvider = {
  id: "xiaohongshu",
  matches(input: RawDownloadInput): boolean {
    return Boolean(resolveXiaohongshuYtdlpSource(input))
      && (
        input.siteHint === "xiaohongshu"
        || isXiaohongshuUrl(input.pageUrl)
        || isXiaohongshuUrl(input.url)
      );
  },
  resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan {
    const ytdlpSource = resolveXiaohongshuYtdlpSource(input) ?? input.pageUrl ?? input.url;
    const strategy = getRuntimeManualSiteStrategy("xiaohongshu");
    const intent: VideoDownloadIntent = {
      type: "video",
      siteId: "xiaohongshu",
      originalUrl: input.url,
      pageUrl: input.pageUrl ?? ytdlpSource,
      title: input.title,
      cookies: input.cookies,
      referer: input.pageUrl ?? ytdlpSource,
      priority: 88,
      candidates: [],
      selectionScope: input.selectionScope,
      ytdlpQuality: input.ytdlpQuality,
      preferredFormat: "mp4",
      clipStartSec: input.clipStartSec,
      clipEndSec: input.clipEndSec,
    };

    return {
      providerId: "xiaohongshu",
      label: input.title?.trim() || input.pageUrl || input.url,
      intent,
      engines: buildEnginePlansFromStrategySources(strategy, {
        "yt-dlp": {
          sourceUrl: ytdlpSource,
          reason: "Xiaohongshu downloads use yt-dlp with the canonical note URL",
        },
      }),
    };
  },
};
