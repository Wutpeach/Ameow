import type { RawDownloadInput, ResolvedDownloadPlan, SiteProvider } from "../core/index.js";
import {
  buildGalleryDlVideoIntent,
  isGalleryDlSupportedUrl,
  resolveComparableUrlHost,
  resolveGalleryDlSiteId,
} from "./gallery-dl-support.js";
import {
  readAmeowCaptureEvidence,
  readCaptureContentId,
} from "./extension-capture.js";

const INSTAGRAM_SHORTCODE_PATTERN = /^[A-Za-z0-9_-]{5,}$/;
const INSTAGRAM_PATH_PATTERN = /^(p|reel|tv)$/i;
const INSTAGRAM_SITE_ID = "instagram";

const isAcceptedInstagramPermalink = (value: string | undefined): boolean => {
  if (!value) {
    return false;
  }
  try {
    const url = new URL(value);
    const host = resolveComparableUrlHost(value);
    return host === "instagram.com"
      && /^\/(?:p|reel|tv)\/[A-Za-z0-9_-]+\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
};

const resolveInstagramSourceFromCapture = (input: RawDownloadInput): string | undefined => {
  const capture = readAmeowCaptureEvidence(input);
  const directEvidenceUrls = [
    capture?.canonicalUrl,
    capture?.ogUrl,
    capture?.targetHref,
    capture?.targetSrc,
    ...(capture?.structuredDataUrls ?? []),
    input.pageUrl,
    input.url,
  ];
  const acceptedEvidenceUrl = directEvidenceUrls.find(isAcceptedInstagramPermalink);
  if (acceptedEvidenceUrl) {
    return acceptedEvidenceUrl;
  }

  const shortcode = readCaptureContentId(input, "instagram_shortcode", INSTAGRAM_SHORTCODE_PATTERN);
  const pathSegment = readCaptureContentId(input, "instagram_shortcode_path", INSTAGRAM_PATH_PATTERN) ?? "p";
  return shortcode ? `https://www.instagram.com/${pathSegment}/${shortcode}/` : undefined;
};

const resolveGalleryDlSupportedSourceUrl = (input: RawDownloadInput): string => (
  resolveInstagramSourceFromCapture(input) ?? input.pageUrl ?? input.url
);

const isInstagramSite = (siteId: string, sourceUrl: string | undefined): boolean => (
  siteId === INSTAGRAM_SITE_ID || resolveComparableUrlHost(sourceUrl) === "instagram.com"
);

const resolveCanonicalGalleryDlSupportedSiteId = (
  sourceUrl: string | undefined,
  siteHint?: string,
): string => {
  const siteId = resolveGalleryDlSiteId(sourceUrl, siteHint);
  return isInstagramSite(siteId, sourceUrl) ? INSTAGRAM_SITE_ID : siteId;
};

export const galleryDlSupportedProvider: SiteProvider = {
  id: "gallery-dl-supported",
  matches(input: RawDownloadInput): boolean {
    return isGalleryDlSupportedUrl(input.pageUrl) || isGalleryDlSupportedUrl(input.url);
  },
  resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan {
    const sourceUrl = resolveGalleryDlSupportedSourceUrl(input);
    const siteId = resolveCanonicalGalleryDlSupportedSiteId(sourceUrl, input.siteHint);
    const engines = isInstagramSite(siteId, sourceUrl)
      ? [
        {
          engine: "yt-dlp" as const,
          priority: 88,
          when: "primary" as const,
          reason: "Use yt-dlp first for Instagram video extraction",
          sourceUrl,
          fallbackOn: "any" as const,
        },
        {
          engine: "gallery-dl" as const,
          priority: 52,
          when: "fallback" as const,
          reason: "Use gallery-dl as the Instagram fallback when yt-dlp cannot complete the extraction",
          sourceUrl,
          fallbackOn: "any" as const,
        },
      ]
      : [
        {
          engine: "gallery-dl" as const,
          priority: 88,
          when: "primary" as const,
          reason: "This site is listed by gallery-dl and should use its maintained extractor first",
          sourceUrl,
          fallbackOn: "any" as const,
        },
        {
          engine: "yt-dlp" as const,
          priority: 52,
          when: "fallback" as const,
          reason: "Use yt-dlp as the generic fallback when gallery-dl cannot complete the extraction",
          sourceUrl,
          fallbackOn: "any" as const,
        },
      ];

    return {
      providerId: "gallery-dl-supported",
      label: input.title?.trim() || input.pageUrl || input.url,
      intent: buildGalleryDlVideoIntent(input, siteId),
      engines,
    };
  },
};
