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
  collectCaptureSourceCandidates,
  isHttpSourceCandidate,
  resolveCaptureSourceUrl,
} from "./capture-source.js";
import {
  readAmeowCaptureEvidence,
  readCaptureContentId,
} from "./extension-capture.js";

const DOUYIN_HOST_SUFFIXES = [
  "douyin.com",
  "iesdouyin.com",
  "douyinvod.com",
  "douyincdn.com",
  "bytecdn.com",
  "bytedance.com",
];
const DOUYIN_CONTENT_PATH_PATTERN = /^\/(video|note|gallery)\/(\d{15,20})(?:\/)?$/i;
const DOUYIN_SHARE_VIDEO_PATH_PATTERN = /^\/share\/video\/(\d{15,20})(?:\/)?$/i;
const DOUYIN_CONTENT_ID_PATTERN = /^\d{15,20}$/;

const isDouyinUrl = (value: string | undefined): boolean => {
  if (!value) {
    return false;
  }
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return DOUYIN_HOST_SUFFIXES.some((suffix) => (
      hostname === suffix || hostname.endsWith(`.${suffix}`)
    ));
  } catch {
    return false;
  }
};

const isDirectVideoUrl = (value: string | undefined): boolean => (
  Boolean(value && isDouyinUrl(value) && /\.(mp4|mov|m4v)(?:$|\?)/i.test(value))
);

const isAcceptedDouyinPageSource = (value: string | undefined): boolean => {
  if (!value || !isDouyinUrl(value)) {
    return false;
  }
  try {
    const url = new URL(value);
    return DOUYIN_CONTENT_PATH_PATTERN.test(url.pathname)
      || DOUYIN_SHARE_VIDEO_PATH_PATTERN.test(url.pathname);
  } catch {
    return false;
  }
};

type DouyinContentSource = {
  kind: "video" | "note" | "gallery";
  id: string;
};

const extractDouyinContentSource = (value: string | undefined): DouyinContentSource | undefined => {
  if (!value || !isDouyinUrl(value)) {
    return undefined;
  }
  try {
    const url = new URL(value);
    const pathMatch = url.pathname.match(DOUYIN_CONTENT_PATH_PATTERN);
    if (pathMatch?.[1] && pathMatch?.[2]) {
      return {
        kind: pathMatch[1].toLowerCase() as DouyinContentSource["kind"],
        id: pathMatch[2],
      };
    }

    const shareVideoPathMatch = url.pathname.match(DOUYIN_SHARE_VIDEO_PATH_PATTERN);
    if (shareVideoPathMatch?.[1]) {
      return {
        kind: "video",
        id: shareVideoPathMatch[1],
      };
    }

    const modalId = url.searchParams.get("modal_id")?.trim();
    if (modalId && DOUYIN_CONTENT_ID_PATTERN.test(modalId)) {
      return {
        kind: "video",
        id: modalId,
      };
    }
  } catch {
    return undefined;
  }
  return undefined;
};

const buildDouyinContentSourceUrl = (source: DouyinContentSource): string =>
  `https://www.douyin.com/${source.kind}/${source.id}`;

const buildDouyinShareVideoSourceUrl = (id: string): string =>
  `https://www.iesdouyin.com/share/video/${id}/`;

const buildSynthesizedDouyinSourceUrl = (source: DouyinContentSource): string => (
  source.kind === "video" ? buildDouyinShareVideoSourceUrl(source.id) : buildDouyinContentSourceUrl(source)
);

const synthesizeDouyinSource = (input: RawDownloadInput): string | undefined => {
  const evidenceSource = collectCaptureSourceCandidates(input)
    .map(extractDouyinContentSource)
    .find((source): source is DouyinContentSource => Boolean(source));
  if (evidenceSource) {
    return buildSynthesizedDouyinSourceUrl(evidenceSource);
  }

  const modalId = readCaptureContentId(input, "modal_id", DOUYIN_CONTENT_ID_PATTERN);
  if (modalId) {
    return buildDouyinShareVideoSourceUrl(modalId);
  }

  const contentId = readCaptureContentId(input, "content_id", DOUYIN_CONTENT_ID_PATTERN);
  if (contentId) {
    return buildDouyinShareVideoSourceUrl(contentId);
  }
  return undefined;
};

const hasDouyinCaptureEvidence = (input: RawDownloadInput): boolean => {
  const capture = readAmeowCaptureEvidence(input);
  return [
    capture?.canonicalUrl,
    capture?.ogUrl,
    capture?.targetHref,
    capture?.targetSrc,
    ...(capture?.structuredDataUrls ?? []),
  ].filter(isHttpSourceCandidate).some(isDouyinUrl);
};

const resolveDouyinDlSourceUrl = (input: RawDownloadInput): string =>
  resolveCaptureSourceUrl(input, {
    isAcceptedSource: (value) => isAcceptedDouyinPageSource(value) || isDirectVideoUrl(value),
    synthesizeSource: synthesizeDouyinSource,
    fallback: (value) => value.pageUrl ?? value.url,
  });

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
  advancedQualitySelector: input.advancedQualitySelector,
  advancedQualityLabel: input.advancedQualityLabel,
  extensionData: input.extensionData,
  preferredFormat: "mp4",
});

export const douyinProvider: SiteProvider = {
  id: "douyin",
  matches(input: RawDownloadInput): boolean {
    return input.siteHint === "douyin"
      || isDouyinUrl(input.pageUrl)
      || isDouyinUrl(input.url)
      || isDirectVideoUrl(input.videoUrl)
      || hasDouyinCaptureEvidence(input);
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
