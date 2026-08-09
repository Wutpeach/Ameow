import { z } from "zod";

const youtubeExtensionDataSchema = z.object({
  source: z.enum(["injected", "pasted", "context_menu"]).optional(),
}).catchall(z.unknown());

const ameowCaptureEvidenceSchema = z.object({
  version: z.literal(1),
  action: z.enum(["current_content", "pick_download", "popup_fallback"]),
  pageUrl: z.url(),
  canonicalUrl: z.url().optional(),
  ogUrl: z.url().optional(),
  title: z.string().trim().optional(),
  contentIds: z.record(z.string(), z.string()).optional(),
  structuredDataUrls: z.array(z.url()).max(8).optional(),
  targetHref: z.url().optional(),
  targetSrc: z.url().optional(),
}).catchall(z.unknown());

const downloadExtensionDataSchema = z.object({
  youtube: youtubeExtensionDataSchema.optional(),
  ameowCapture: ameowCaptureEvidenceSchema.optional(),
}).catchall(z.unknown());

export const mediaCandidateSchema = z.object({
  url: z.url(),
  type: z.string().trim().optional(),
  source: z.string().trim().optional(),
  confidence: z.string().trim().optional(),
  mediaType: z.enum(["video", "image"]).optional(),
  label: z.string().trim().optional(),
  width: z.number().finite().positive().optional(),
  height: z.number().finite().positive().optional(),
  bitrate: z.number().finite().positive().optional(),
  qualityIndex: z.number().finite().positive().optional(),
});

/**
 * Application entry schema. Legacy `ytdlpQuality` is normalized once here into
 * the canonical `videoQuality` field consumed by providers/plans; protocol
 * callers may still send either key.
 */
export const rawDownloadInputSchema = z.object({
  url: z.url(),
  pageUrl: z.url().optional(),
  videoUrl: z.url().optional(),
  selectedVideoVariant: mediaCandidateSchema.optional(),
  videoCandidates: z.array(mediaCandidateSchema).optional(),
  title: z.string().trim().optional(),
  cookies: z.string().trim().optional(),
  selectionScope: z.enum(["current_item", "playlist"]).optional(),
  clipStartSec: z.number().finite().nonnegative().optional(),
  clipEndSec: z.number().finite().nonnegative().optional(),
  videoQuality: z.enum(["best", "balanced", "data_saver"]).optional(),
  ytdlpQuality: z.enum(["best", "balanced", "data_saver"]).optional(),
  siteHint: z.string().trim().optional(),
  advancedQualityRequest: z.boolean().optional(),
  advancedQualitySelector: z.string().trim().optional(),
  advancedQualityLabel: z.string().trim().optional(),
  extensionData: downloadExtensionDataSchema.optional(),
  diagnostics: z.record(z.string(), z.unknown()).optional(),
}).transform((input) => ({
  ...input,
  videoQuality: input.videoQuality ?? input.ytdlpQuality,
}));
