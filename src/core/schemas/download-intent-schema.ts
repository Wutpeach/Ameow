import { z } from "zod";
import { mediaCandidateSchema } from "./raw-download-input-schema.js";

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

const baseIntentSchema = z.object({
  siteId: z.string().trim().min(1),
  originalUrl: z.url(),
  pageUrl: z.url().optional(),
  title: z.string().trim().optional(),
  cookies: z.string().trim().optional(),
  userAgent: z.string().trim().optional(),
  referer: z.string().trim().optional(),
  priority: z.number().int(),
  candidates: z.array(mediaCandidateSchema),
  selectedVideoVariant: mediaCandidateSchema.optional(),
  selectionScope: z.enum(["current_item", "playlist"]).optional(),
  videoQuality: z.enum(["best", "balanced", "data_saver"]).optional(),
  advancedQualitySelector: z.string().trim().optional(),
  advancedQualityLabel: z.string().trim().optional(),
  extensionData: downloadExtensionDataSchema.optional(),
});

export const videoDownloadIntentSchema = baseIntentSchema.extend({
  type: z.literal("video"),
  preferredFormat: z.enum(["mp4", "webm", "best"]),
  clipStartSec: z.number().finite().nonnegative().optional(),
  clipEndSec: z.number().finite().nonnegative().optional(),
});

export const imageDownloadIntentSchema = baseIntentSchema.extend({
  type: z.literal("image"),
  saveAsAlbum: z.boolean().optional(),
});

export const segmentDownloadIntentSchema = baseIntentSchema.extend({
  type: z.literal("segment"),
  startTime: z.number().finite().nonnegative(),
  endTime: z.number().finite().nonnegative(),
});

export const batchDownloadIntentSchema = baseIntentSchema.extend({
  type: z.literal("batch"),
  itemCountHint: z.number().int().nonnegative().optional(),
});

export const downloadIntentSchema = z.discriminatedUnion("type", [
  videoDownloadIntentSchema,
  imageDownloadIntentSchema,
  segmentDownloadIntentSchema,
  batchDownloadIntentSchema,
]);
