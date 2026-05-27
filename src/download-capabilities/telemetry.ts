import { z } from "zod";
import type {
  DownloadFailureClassification,
  DownloadRuntimeError,
  RawDownloadInput,
  ResolvedDownloadPlan,
} from "../core/index.js";
import { resolveSiteHint } from "../core/index.js";
import { capabilityEngineIdSchema, interactionModeSchema } from "./schema.js";

export const downloadTelemetryInteractionModeSchema = z.union([
  interactionModeSchema,
  z.literal("unknown"),
]);

export const downloadTelemetryCompatibilityDecisionSchema = z.enum([
  "skip_compatible",
  "remux_only",
  "audio_transcode",
  "full_transcode",
  "probe_failure_full_transcode",
]);

export const downloadTelemetryCompatibilitySchema = z.object({
  sourceExtension: z.string().trim().min(1).max(16).nullable().optional(),
  containerNames: z.array(z.string().trim().min(1).max(32)).max(16).optional(),
  videoCodec: z.string().trim().min(1).max(32).nullable().optional(),
  audioCodec: z.string().trim().min(1).max(32).nullable().optional(),
  decision: downloadTelemetryCompatibilityDecisionSchema.nullable().optional(),
  probeFailed: z.boolean().optional(),
  probeErrorSummary: z.string().trim().min(1).max(240).nullable().optional(),
});

export const downloadTelemetryProfileSchema = z.object({
  qualityPreference: z.enum(["best", "balanced", "data_saver"]),
  ytdlpProfileKey: z.string().trim().min(1).max(32).nullable(),
  ytdlpMergeOutputFormat: z.enum(["mp4", "mp4/mkv"]).nullable(),
  ytdlpFormatSort: z.string().trim().min(1).max(80).nullable(),
});

export const downloadTelemetryEventSchema = z.object({
  schemaVersion: z.literal(1),
  eventType: z.literal("download_outcome"),
  recordedAt: z.iso.datetime(),
  traceId: z.string().trim().min(1),
  siteId: z.string().trim().min(1),
  providerId: z.string().trim().min(1),
  interactionMode: downloadTelemetryInteractionModeSchema,
  engineChain: z.array(capabilityEngineIdSchema),
  chosenEngine: capabilityEngineIdSchema.nullable(),
  outcome: z.enum(["success", "failure"]),
  errorCode: z.string().trim().min(1).nullable(),
  errorClassification: z.enum([
    "retry_same_engine",
    "fallback_to_other_engine",
    "terminal_for_site",
    "input_invalid",
    "auth_required",
    "cancelled",
  ]).nullable(),
  errorMessage: z.string().trim().min(1).nullable(),
  downloadProfile: downloadTelemetryProfileSchema.optional(),
  compatibility: downloadTelemetryCompatibilitySchema.optional(),
});

export type DownloadTelemetryInteractionMode = z.infer<
  typeof downloadTelemetryInteractionModeSchema
>;
export type DownloadTelemetryCompatibility = z.infer<
  typeof downloadTelemetryCompatibilitySchema
>;
export type DownloadTelemetryProfile = z.infer<typeof downloadTelemetryProfileSchema>;
export type DownloadTelemetryEvent = z.infer<typeof downloadTelemetryEventSchema>;

const resolveDiagnosticsSource = (request: RawDownloadInput): string | undefined => {
  const diagnostics = request.diagnostics;
  if (!diagnostics || typeof diagnostics !== "object") {
    return undefined;
  }

  const source = diagnostics.source;
  return typeof source === "string" ? source.trim().toLowerCase() : undefined;
};

export const resolveDownloadTelemetryInteractionMode = (
  request: RawDownloadInput,
): DownloadTelemetryInteractionMode => {
  const source = resolveDiagnosticsSource(request);
  if ((request as { dragDiagnostic?: unknown }).dragDiagnostic) {
    return "drag";
  }
  if (source === "context_menu") {
    return "context_menu";
  }
  if (source === "popup" || source === "injected_button" || source === "page_action") {
    return "injected_button";
  }
  if (request.pageUrl || request.url) {
    return "paste";
  }
  return "unknown";
};

const resolveTelemetrySiteId = (
  request: RawDownloadInput,
  plan: ResolvedDownloadPlan | null | undefined,
): string => (
  plan?.intent.siteId
  || resolveSiteHint(
    request.siteHint,
    request.pageUrl,
    request.url,
    request.videoUrl,
  )
  || "unknown"
);

export const createDownloadTelemetryEvent = (input: {
  traceId: string;
  request: RawDownloadInput;
  plan?: ResolvedDownloadPlan | null;
  chosenEngine?: ResolvedDownloadPlan["engines"][number]["engine"] | null;
  error?: Pick<DownloadRuntimeError, "code" | "classification" | "message"> | null;
  downloadProfile?: DownloadTelemetryProfile | null;
  compatibility?: DownloadTelemetryCompatibility | null;
}): DownloadTelemetryEvent => downloadTelemetryEventSchema.parse({
  schemaVersion: 1,
  eventType: "download_outcome",
  recordedAt: new Date().toISOString(),
  traceId: input.traceId,
  siteId: resolveTelemetrySiteId(input.request, input.plan),
  providerId: input.plan?.providerId ?? "unresolved",
  interactionMode: resolveDownloadTelemetryInteractionMode(input.request),
  engineChain: input.plan?.engines.map((enginePlan) => enginePlan.engine) ?? [],
  chosenEngine: input.chosenEngine ?? null,
  outcome: input.error ? "failure" : "success",
  errorCode: input.error?.code ?? null,
  errorClassification: input.error?.classification ?? null,
  errorMessage: input.error?.message ?? null,
  downloadProfile: input.downloadProfile ?? undefined,
  compatibility: input.compatibility ?? undefined,
});

export const isFailureTelemetryClassification = (
  value: DownloadFailureClassification | null,
): value is DownloadFailureClassification => value !== null;
