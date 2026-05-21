import {
  normalizeVideoCandidates,
  normalizeVideoHintUrl,
  normalizeVideoPageUrl,
} from "./videoHintNormalization.mjs";

type XiaohongshuDragMediaFallback = {
  pageUrl?: string | null;
  imageUrl?: string | null;
  detailUrl?: string | null;
  sourcePageUrl?: string | null;
  videoIntentConfidence?: number | null;
  videoIntentSources?: unknown[] | null;
};

type XiaohongshuResolvedDragMediaResult = {
  kind: "video" | "image" | "unknown";
  pageUrl: string;
  imageUrl: string | null;
  videoUrl: string | null;
  videoCandidates: ReturnType<typeof normalizeVideoCandidates>;
  videoIntentConfidence: number | null;
  videoIntentSources: string[];
  detailUrl?: string | null;
  sourcePageUrl?: string | null;
};

const asObject = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const normalizeKind = (value: unknown): XiaohongshuResolvedDragMediaResult["kind"] => (
  value === "video" || value === "image" ? value : "unknown"
);

const normalizeOptionalNumber = (value: unknown): number | null => (
  typeof value === "number" && Number.isFinite(value) ? value : null
);

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
};

export const buildXiaohongshuResolvedDragMediaResult = (
  payload: unknown,
  fallback: XiaohongshuDragMediaFallback & { requiredPageUrl: string },
): XiaohongshuResolvedDragMediaResult | null => {
  const record = asObject(payload);
  if (!record) {
    return null;
  }

  const pageUrl = normalizeVideoPageUrl(record.pageUrl ?? record.page_url)
    ?? normalizeVideoPageUrl(fallback.pageUrl)
    ?? fallback.requiredPageUrl;
  const detailUrl = normalizeVideoPageUrl(record.detailUrl ?? record.detail_url)
    ?? normalizeVideoPageUrl(fallback.detailUrl)
    ?? null;
  const sourcePageUrl = normalizeVideoPageUrl(record.sourcePageUrl ?? record.source_page_url)
    ?? normalizeVideoPageUrl(fallback.sourcePageUrl)
    ?? null;

  return {
    kind: normalizeKind(record.kind),
    pageUrl,
    imageUrl: normalizeVideoPageUrl(record.imageUrl ?? record.image_url)
      ?? normalizeVideoPageUrl(fallback.imageUrl)
      ?? null,
    videoUrl: normalizeVideoHintUrl(record.videoUrl ?? record.video_url, "xiaohongshu") ?? null,
    videoCandidates: normalizeVideoCandidates(
      record.videoCandidates ?? record.video_candidates,
      "xiaohongshu",
    ),
    videoIntentConfidence:
      normalizeOptionalNumber(record.videoIntentConfidence ?? record.video_intent_confidence)
      ?? normalizeOptionalNumber(fallback.videoIntentConfidence),
    videoIntentSources: normalizeStringArray(record.videoIntentSources ?? record.video_intent_sources).length > 0
      ? normalizeStringArray(record.videoIntentSources ?? record.video_intent_sources)
      : normalizeStringArray(fallback.videoIntentSources),
    ...(detailUrl ? { detailUrl } : { detailUrl: null }),
    ...(sourcePageUrl ? { sourcePageUrl } : { sourcePageUrl: null }),
  };
};
