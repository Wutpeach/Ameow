import type {
  AmeowCaptureEvidenceV1,
  DownloadProgress,
  MediaCandidate,
  YtdlpQualityPreference,
} from "../../core/index.js";
import { normalizeVideoQualityPreference } from "../../core/index.js";
import {
  normalizeHttpUrl,
  normalizeVideoCandidates as normalizeCanonicalVideoCandidates,
  normalizeVideoHintUrl,
} from "../../core/video-candidate-normalization.js";
import { resolveSiteHint } from "../../core/site-hints.js";
import { ameowCaptureEvidenceSchema } from "../../core/schemas/raw-download-input-schema.js";
import { toSafeDiagnosticUrl } from "../../core/diagnostics/safe-diagnostic.js";
import { createInteractionCapabilityDiagnostic } from "../../download-capabilities/runtime-interaction-capabilities.js";
import type {
  DownloadTerminalOutcome,
  QueueDownloadCommand,
} from "../../application/download-api.js";
import { resolveDownloadDiagnosticCategory } from "../../application/download-diagnostics.js";
import type { RuntimeFailureDiagnostic } from "../../types/errorDiagnostics.js";
import type {
  DownloadProgressPayload,
  DownloadResultPayload,
  PinterestDragDiagnostic,
  PinterestDragDiagnosticFlags,
  PinterestVideoCandidate,
} from "./ipcTypes.js";

/**
 * Wire -> Application compatibility decoder and Application/core -> Renderer
 * payload mappers. One owner for alias handling (quality fields, request ID
 * casing, extension container shapes) and for result/progress/typed-error
 * mapping. Domain/Application never consume this module.
 */

const asObject = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === "object" && !Array.isArray(value))
);

const readOptionalTrimmedString = (
  payload: Record<string, unknown>,
  ...keys: string[]
): string | undefined => {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return undefined;
};

const readOptionalHttpUrlString = (
  payload: Record<string, unknown>,
  ...keys: string[]
): string | undefined => normalizeHttpUrl(readOptionalTrimmedString(payload, ...keys));

const readRequiredHttpUrlString = (
  payload: Record<string, unknown>,
  ...keys: string[]
): string => {
  const rawValue = readOptionalTrimmedString(payload, ...keys);
  if (!rawValue) {
    throw new Error(`Missing required command payload field: ${keys[0]}`);
  }

  const normalized = normalizeHttpUrl(rawValue);
  if (normalized) {
    return normalized;
  }

  throw new Error(`Invalid command payload field: ${keys[0]}`);
};

const resolvePayloadSiteHint = (payload: Record<string, unknown>): string | undefined => resolveSiteHint(
  readOptionalTrimmedString(payload, "siteHint", "site_hint"),
  readOptionalTrimmedString(payload, "pageUrl", "page_url"),
  readOptionalTrimmedString(payload, "url"),
  readOptionalTrimmedString(payload, "videoUrl", "video_url"),
);

const readOptionalVideoHintUrlString = (
  payload: Record<string, unknown>,
  siteHint: string | undefined,
  ...keys: string[]
): string | undefined => normalizeVideoHintUrl(readOptionalTrimmedString(payload, ...keys), siteHint);

/**
 * Legacy quality alias decoder: `videoQuality | ytdlpQualityPreference |
 * ytdlpQuality | defaultVideoDownloadQuality -> canonical videoQuality`.
 * Current and documented historical Extension fields are accepted here and
 * nowhere else.
 */
export const decodeVideoQualityAlias = (
  payload: Record<string, unknown>,
): YtdlpQualityPreference | undefined => (
  normalizeVideoQualityPreference(
    readOptionalTrimmedString(payload, "videoQuality", "video_quality"),
  )
  ?? normalizeVideoQualityPreference(
    readOptionalTrimmedString(payload, "ytdlpQualityPreference", "ytdlp_quality_preference"),
  )
  ?? normalizeVideoQualityPreference(
    readOptionalTrimmedString(payload, "ytdlpQuality", "ytdlp_quality"),
  )
  ?? normalizeVideoQualityPreference(
    readOptionalTrimmedString(payload, "defaultVideoDownloadQuality"),
  )
);

const normalizeBoolean = (value: unknown): boolean => value === true;

/**
 * Maps the Extension container shape (`extensionData` / `extension_data`) to
 * transport-neutral capture evidence. Unsupported compatibility fields are
 * explicitly ignored; only P3-boundary-required capture evidence is migrated.
 * The shared core evidence schema is the single evidence contract: invalid
 * version/action/URL/field shapes are dropped here rather than cast through.
 */
export const decodeCaptureEvidence = (
  extensionData: unknown,
): AmeowCaptureEvidenceV1 | undefined => {
  const parsed = ameowCaptureEvidenceSchema.safeParse(asObject(extensionData).ameowCapture);
  return parsed.success ? parsed.data : undefined;
};

const normalizeDragDiagnosticFlags = (
  value: unknown,
): PinterestDragDiagnosticFlags | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const flags = value as Record<string, unknown>;
  return {
    hasEmbeddedPayload: normalizeBoolean(flags.hasEmbeddedPayload),
    hasVideoTag: normalizeBoolean(flags.hasVideoTag),
    hasVideoList: normalizeBoolean(flags.hasVideoList),
    hasStoryPinData: normalizeBoolean(flags.hasStoryPinData),
    hasCarouselData: normalizeBoolean(flags.hasCarouselData),
    hasMp4: normalizeBoolean(flags.hasMp4),
    hasM3u8: normalizeBoolean(flags.hasM3u8),
    hasCmfv: normalizeBoolean(flags.hasCmfv),
    hasPinimgVideoHost: normalizeBoolean(flags.hasPinimgVideoHost),
  };
};

const normalizeDragDiagnostic = (
  payload: Record<string, unknown>,
  normalizedVideoCandidates: PinterestVideoCandidate[],
): PinterestDragDiagnostic | undefined => {
  const siteHint = resolvePayloadSiteHint(payload);
  if (siteHint !== "pinterest") {
    return undefined;
  }

  const rawDiagnostic = payload.dragDiagnostic ?? payload.drag_diagnostic;
  if (!rawDiagnostic || typeof rawDiagnostic !== "object" || Array.isArray(rawDiagnostic)) {
    return undefined;
  }

  const diagnostic = rawDiagnostic as Record<string, unknown>;
  const flags = normalizeDragDiagnosticFlags(diagnostic.flags);
  if (!flags) {
    return undefined;
  }

  const htmlLength = Number(diagnostic.htmlLength ?? diagnostic.html_length);
  const htmlPreview = readOptionalTrimmedString(diagnostic, "htmlPreview", "html_preview");

  if (!Number.isFinite(htmlLength) || htmlLength < 0 || !htmlPreview) {
    return undefined;
  }

  const dragCandidates = Array.isArray(diagnostic.videoCandidates)
    ? normalizeCanonicalVideoCandidates(diagnostic.videoCandidates, "pinterest") as PinterestVideoCandidate[]
    : normalizedVideoCandidates;
  const imageUrl = readOptionalHttpUrlString(diagnostic, "imageUrl", "image_url") ?? null;
  const videoUrl = readOptionalVideoHintUrlString(
    diagnostic,
    "pinterest",
    "videoUrl",
    "video_url",
  ) ?? null;
  const videoCandidatesCountRaw = Number(
    diagnostic.videoCandidatesCount ?? diagnostic.video_candidates_count,
  );

  return {
    htmlLength,
    htmlPreview,
    flags,
    imageUrl,
    videoUrl,
    videoCandidatesCount: Number.isFinite(videoCandidatesCountRaw) && videoCandidatesCountRaw >= 0
      ? Math.floor(videoCandidatesCountRaw)
      : dragCandidates.length,
    videoCandidates: dragCandidates,
  };
};

const normalizeSelectedVideoVariant = (
  payload: Record<string, unknown>,
  siteHint: string | undefined,
): MediaCandidate | undefined => {
  const raw = payload.selectedVideoVariant ?? payload.selected_video_variant;
  if (!isRecord(raw)) {
    return undefined;
  }

  const url = normalizeVideoHintUrl(raw.url, siteHint);
  if (!url) {
    return undefined;
  }

  const candidate: MediaCandidate = {
    url,
    type: readOptionalTrimmedString(raw, "type"),
    source: readOptionalTrimmedString(raw, "source"),
    confidence: readOptionalTrimmedString(raw, "confidence"),
    mediaType: raw.mediaType === "video" || raw.mediaType === "image"
      ? raw.mediaType
      : undefined,
    label: readOptionalTrimmedString(raw, "label"),
  };
  for (const key of ["width", "height", "bitrate", "qualityIndex"] as const) {
    const value = Number(raw[key]);
    if (Number.isFinite(value) && value > 0) {
      candidate[key] = value;
    }
  }
  return candidate;
};

/**
 * Decodes an untrusted Renderer/Extension queue payload into the canonical
 * Application command. Required primary URL and selection fields reject
 * invalid types/non-HTTP(S) values before Application invocation; optional
 * and legacy fields follow explicit compatibility behavior.
 */
export const decodeQueueDownloadCommand = (
  payload: unknown,
  options: { videoQuality?: unknown } = {},
): QueueDownloadCommand => {
  const request = asObject(payload);
  const siteHint = resolvePayloadSiteHint(request);
  const normalizedVideoCandidates = normalizeCanonicalVideoCandidates(
    request.videoCandidates ?? request.video_candidates,
    siteHint,
  );
  const dragDiagnostic = normalizeDragDiagnostic(request, normalizedVideoCandidates);
  const rawDiagnostics = asObject(request.diagnostics);
  const diagnosticsSource = readOptionalTrimmedString(rawDiagnostics, "source")
    ?? readOptionalTrimmedString(request, "source");
  const diagnostics = (() => {
    if (Object.keys(rawDiagnostics).length === 0 && !dragDiagnostic) {
      return undefined;
    }

    return {
      ...rawDiagnostics,
      ...(diagnosticsSource ? { source: diagnosticsSource } : {}),
      interactionCapability: createInteractionCapabilityDiagnostic({
        siteHint,
        pageUrl: readOptionalHttpUrlString(request, "pageUrl", "page_url"),
        url: readRequiredHttpUrlString(request, "url"),
        source: diagnosticsSource,
        hasDragPayload: Boolean(dragDiagnostic),
      }),
    };
  })();
  const extensionData = request.extensionData ?? request.extension_data;
  const selectionScopeRaw = readOptionalTrimmedString(
    request,
    "selectionScope",
    "selection_scope",
  );

  return {
    url: readRequiredHttpUrlString(request, "url"),
    pageUrl: readOptionalHttpUrlString(request, "pageUrl", "page_url"),
    videoUrl: readOptionalVideoHintUrlString(request, siteHint, "videoUrl", "video_url"),
    selectedVideoVariant: normalizeSelectedVideoVariant(request, siteHint),
    videoCandidates: normalizedVideoCandidates.length > 0 ? normalizedVideoCandidates : undefined,
    title: readOptionalTrimmedString(request, "title"),
    selectionScope: selectionScopeRaw === "playlist"
      ? "playlist"
      : selectionScopeRaw === "current_item"
        ? "current_item"
        : undefined,
    clipStartSec: (() => {
      const raw = request.clipStartSec ?? request.clip_start_sec;
      const value = Number(raw);
      return Number.isFinite(value) && value >= 0 ? value : undefined;
    })(),
    clipEndSec: (() => {
      const raw = request.clipEndSec ?? request.clip_end_sec;
      const value = Number(raw);
      return Number.isFinite(value) && value >= 0 ? value : undefined;
    })(),
    videoQuality: normalizeVideoQualityPreference(options.videoQuality)
      ?? decodeVideoQualityAlias(request),
    siteHint,
    advancedQualityRequested: request.advancedQualityRequest === true,
    captureEvidence: decodeCaptureEvidence(extensionData),
    dragDiagnostic,
    diagnostics,
  };
};

/**
 * Core progress -> Renderer progress payload. Kept as an explicit boundary so
 * protocol key drift cannot leak into Domain/Application.
 */
export const toDownloadProgressPayload = (
  progress: DownloadProgress,
): DownloadProgressPayload => ({
  traceId: progress.traceId,
  percent: progress.percent,
  stage: progress.stage,
  speed: progress.speed,
  eta: progress.eta,
});

/**
 * The one terminal outcome mapper: ordinary success, typed failure, pending
 * cancellation and advanced-quality probe failure all serialize here with
 * stable keys (`file_path`, `error`, `failure` code/classification).
 */
export const toDownloadResultPayload = (
  outcome: DownloadTerminalOutcome,
): DownloadResultPayload => {
  if (outcome.failure) {
    const diagnosticCategory = outcome.diagnosticSummary?.finalCategory
      ?? resolveDownloadDiagnosticCategory(outcome.failure);
    const failure: RuntimeFailureDiagnostic = {
      code: outcome.failure.code,
      classification: outcome.failure.classification,
      diagnosticCategory,
      safeUrl: toSafeDiagnosticUrl(outcome.userUrl),
      attemptSummary: outcome.diagnosticSummary,
    };
    return {
      traceId: outcome.traceId,
      success: false,
      // New structured payloads never expose raw downloader/process output.
      error: outcome.presentationMessage
        ?? (outcome.failure.classification === "cancelled"
          ? "Download cancelled"
          : `Download failed (${outcome.failure.code})`),
      failure,
    };
  }
  return {
    traceId: outcome.traceId,
    success: outcome.result.success,
    file_path: outcome.result.filePath,
    title: outcome.result.title,
    error: outcome.result.error,
  };
};
