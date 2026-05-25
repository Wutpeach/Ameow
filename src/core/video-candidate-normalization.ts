import { resolveSiteHint } from "./site-hints.js";
import { orderVideoCandidatesForSite } from "./video-candidate-order.js";
import type { MediaCandidate } from "./types/media-candidate.js";

type CandidateWithLegacyMediaType = Partial<MediaCandidate> & {
  media_type?: unknown;
};

export const normalizeHttpUrl = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^(?:blob|data|file|javascript|mailto):/i.test(trimmed)) {
    return undefined;
  }

  try {
    const normalized = new URL(trimmed).toString();
    return /^https?:\/\//i.test(normalized) ? normalized : undefined;
  } catch {
    return undefined;
  }
};

const isDirectPinterestMp4Url = (value: string): boolean => {
  const lower = value.toLowerCase();
  return /\.mp4(?:[?#]|$)/i.test(value) || lower.includes("/videos/iht/expmp4/");
};

const isPinterestManifestLikeUrl = (value: string): boolean => (
  /\.m3u8(?:[?#]|$)/i.test(value)
  || /\.cmfv(?:[?#]|$)/i.test(value)
  || /\/videos\/iht\/hls\//i.test(value)
);

const isPinterestVideoHintUrl = (value: string): boolean => (
  isDirectPinterestMp4Url(value) || isPinterestManifestLikeUrl(value)
);

const normalizeOptionalLabel = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
};

const normalizeMediaType = (value: unknown): "video" | "image" | undefined => (
  value === "video" || value === "image" ? value : undefined
);

export function resolveVideoSelectionSiteHint(...values: unknown[]): string | undefined {
  return resolveSiteHint(
    ...values.map((value) => (typeof value === "string" ? value : undefined)),
  );
}

export function normalizeVideoHintUrl(value: unknown, siteHint?: string): string | undefined {
  const normalized = normalizeHttpUrl(value);
  if (!normalized) {
    return undefined;
  }

  const resolvedSiteHint = resolveVideoSelectionSiteHint(siteHint, normalized);
  if (resolvedSiteHint === "pinterest") {
    return isPinterestVideoHintUrl(normalized) ? normalized : undefined;
  }

  return normalized;
}

export function normalizeRequiredVideoRouteUrl(value: unknown): string | undefined {
  return normalizeHttpUrl(value);
}

export function normalizeVideoPageUrl(value: unknown): string | undefined {
  return normalizeHttpUrl(value);
}

const normalizeVideoCandidateForSite = <TCandidate extends CandidateWithLegacyMediaType>(
  candidate: TCandidate | null | undefined,
  siteHint: string | undefined,
): MediaCandidate | null => {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  const url = normalizeVideoHintUrl(candidate.url, siteHint);
  if (!url) {
    return null;
  }

  return {
    url,
    type: normalizeOptionalLabel(candidate.type),
    source: normalizeOptionalLabel(candidate.source),
    confidence: normalizeOptionalLabel(candidate.confidence),
    mediaType: normalizeMediaType(candidate.mediaType ?? candidate.media_type),
  };
};

export function normalizeVideoCandidates(
  candidates: unknown,
  siteHint?: string,
): MediaCandidate[] {
  if (!Array.isArray(candidates)) {
    return [];
  }

  const seen = new Set<string>();
  const resolvedSiteHint = resolveVideoSelectionSiteHint(siteHint);
  const result: MediaCandidate[] = [];

  for (const candidate of candidates) {
    const normalized = normalizeVideoCandidateForSite(candidate as CandidateWithLegacyMediaType, resolvedSiteHint);
    if (!normalized || seen.has(normalized.url)) {
      continue;
    }
    seen.add(normalized.url);
    result.push(normalized);
  }

  return orderVideoCandidatesForSite(result, resolvedSiteHint);
}

export function normalizeVideoCandidateUrls(candidates: unknown, siteHint?: string): string[] {
  return normalizeVideoCandidates(candidates, siteHint).map((candidate) => candidate.url);
}
