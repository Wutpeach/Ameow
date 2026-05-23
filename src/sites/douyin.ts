import type {
  DownloadIntent,
  RawDownloadInput,
  ResolvedDownloadPlan,
  SiteProvider,
  VideoDownloadIntent,
} from "../core/index.js";
import { buildEnginePlansFromStrategySources } from "../download-capabilities/strategy-plans.js";
import { getRuntimeManualSiteStrategy } from "../download-capabilities/runtime-site-strategies.js";
import {
  readAmeowCaptureEvidence,
  readCaptureContentId,
} from "./extension-capture.js";

const DOUYIN_HOST_PATTERN = /(douyin\.com|douyinvod\.com|douyincdn\.com|bytecdn|bytedance)/i;

const isDouyinUrl = (value: string | undefined): boolean => Boolean(value && DOUYIN_HOST_PATTERN.test(value));

const isDirectVideoUrl = (value: string | undefined): boolean => (
  Boolean(value && DOUYIN_HOST_PATTERN.test(value) && /\.(mp4|mov|m4v)(?:$|\?)/i.test(value))
);

const isAcceptedDouyinPageSource = (value: string | undefined): boolean => {
  if (!value || !isDouyinUrl(value)) {
    return false;
  }
  try {
    const url = new URL(value);
    return /^\/(?:video|note|gallery)\/\d{15,20}(?:\/)?$/i.test(url.pathname);
  } catch {
    return false;
  }
};

const synthesizeDouyinVideoSourceFromCapture = (
  input: RawDownloadInput,
): string | undefined => {
  const modalId = readCaptureContentId(input, "modal_id", /^\d{15,20}$/);
  return modalId ? `https://www.douyin.com/video/${modalId}` : undefined;
};

const resolveDouyinDlSourceUrl = (input: RawDownloadInput): string => {
  const captureEvidence = readAmeowCaptureEvidence(input);
  const canonicalSource = captureEvidence?.canonicalUrl;
  const ogSource = captureEvidence?.ogUrl;
  const pageSourceUrl = input.pageUrl ?? input.url;

  if (typeof canonicalSource === "string" && isAcceptedDouyinPageSource(canonicalSource)) {
    return canonicalSource;
  }
  if (typeof ogSource === "string" && isAcceptedDouyinPageSource(ogSource)) {
    return ogSource;
  }

  return synthesizeDouyinVideoSourceFromCapture(input) ?? pageSourceUrl;
};

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
  videoQuality: input.videoQuality,
  extensionData: input.extensionData,
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
    const sourceUrl = resolveDouyinDlSourceUrl(input);

    return {
      providerId: "douyin",
      label: input.title?.trim() || input.pageUrl || input.url,
      intent,
      engines: buildEnginePlansFromStrategySources(strategy, {
        "douyin-dl": {
          sourceUrl,
          reason: "Use douyin-downloader with a provider-owned accepted Douyin page source",
        },
      }),
    };
  },
};
