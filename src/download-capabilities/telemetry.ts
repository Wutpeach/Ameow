import { z } from "zod";
import type {
  DownloadDiagnosticCategory,
  DownloadErrorCode,
  DownloadFailureClassification,
  DownloadRuntimeError,
  RawDownloadInput,
  ResolvedDownloadPlan,
} from "../core/index.js";
import {
  DOWNLOAD_DIAGNOSTIC_CATEGORIES,
  engineIdSchema,
  resolveSiteHint,
} from "../core/index.js";
import { interactionModeSchema } from "./schema.js";

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

export const downloadTelemetryNetworkSchema = z.object({
  preference: z.enum(["manual", "system"]),
  source: z.enum(["manual", "system", "environment", "direct", "fallback"]),
  resolvedFor: z.string().trim().min(1).nullable(),
  routeMode: z.enum(["direct", "proxy", "complex"]),
  proxyProtocol: z.enum(["http", "https", "socks4", "socks5"]).nullable(),
  resolutionStatus: z.enum(["resolved", "fallback", "failed"]),
  engine: z.string().trim().min(1).nullable(),
  appliedToEngine: z.boolean(),
  failureClassification: z.string().trim().min(1).nullable(),
});

const downloadDiagnosticCategorySchema = z.enum(DOWNLOAD_DIAGNOSTIC_CATEGORIES);

const downloadTelemetryAttemptNetworkSchema = z.object({
  routeKind: z.enum(["direct", "proxy", "complex"]),
  source: z.enum(["manual", "system", "environment", "direct", "fallback"]),
  consumer: z.string().trim().min(1),
  appliedToEngine: z.boolean(),
  proxyProtocol: z.enum(["http", "https", "socks4", "socks5"]).nullable(),
  failureClassification: z.string().trim().min(1).nullable(),
});

const downloadTelemetryAttemptSchema = z.object({
  attemptIndex: z.number().int().positive(),
  engineId: engineIdSchema,
  cycle: z.enum(["initial", "auth_recovery"]),
  outcome: z.enum(["succeeded", "failed"]),
  errorCode: z.string().trim().min(1).nullable(),
  classification: z.enum([
    "retry_same_engine",
    "fallback_to_other_engine",
    "terminal_for_site",
    "input_invalid",
    "auth_required",
    "cancelled",
  ]).nullable(),
  category: downloadDiagnosticCategorySchema.nullable(),
  network: downloadTelemetryAttemptNetworkSchema.optional(),
});

export const downloadTelemetryEventSchema = z.object({
  schemaVersion: z.literal(1),
  eventType: z.literal("download_outcome"),
  recordedAt: z.iso.datetime(),
  traceId: z.string().trim().min(1),
  siteId: z.string().trim().min(1),
  providerId: z.string().trim().min(1),
  interactionMode: downloadTelemetryInteractionModeSchema,
  engineChain: z.array(engineIdSchema),
  chosenEngine: engineIdSchema.nullable(),
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
  diagnosticCategory: downloadDiagnosticCategorySchema.nullable().optional(),
  attemptCount: z.number().int().nonnegative().optional(),
  attempts: z.array(downloadTelemetryAttemptSchema).max(8).optional(),
  downloadProfile: downloadTelemetryProfileSchema.optional(),
  compatibility: downloadTelemetryCompatibilitySchema.optional(),
  network: downloadTelemetryNetworkSchema.optional(),
});

export type DownloadTelemetryInteractionMode = z.infer<
  typeof downloadTelemetryInteractionModeSchema
>;
export type DownloadTelemetryCompatibility = z.infer<
  typeof downloadTelemetryCompatibilitySchema
>;
export type DownloadTelemetryProfile = z.infer<typeof downloadTelemetryProfileSchema>;
export type DownloadTelemetryNetwork = z.infer<typeof downloadTelemetryNetworkSchema>;
export type DownloadTelemetryEvent = z.infer<typeof downloadTelemetryEventSchema>;

export type DownloadTelemetryDiagnosticSummaryInput = {
  attemptCount: number;
  attempts: ReadonlyArray<{
    attemptIndex: number;
    engineId: string;
    cycle: "initial" | "auth_recovery";
    outcome: "succeeded" | "failed";
    errorCode: DownloadErrorCode | null;
    classification: DownloadFailureClassification | null;
    category: DownloadDiagnosticCategory | null;
    network?: {
      routeKind: "direct" | "proxy" | "complex";
      source: "manual" | "system" | "environment" | "direct" | "fallback";
      consumer: string;
      appliedToEngine: boolean;
      proxyProtocol: "http" | "https" | "socks4" | "socks5" | null;
      failureClassification: string | null;
    };
  }>;
  finalCategory: DownloadDiagnosticCategory | null;
};

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
  diagnosticSummary?: DownloadTelemetryDiagnosticSummaryInput;
  downloadProfile?: DownloadTelemetryProfile | null;
  compatibility?: DownloadTelemetryCompatibility | null;
  network?: DownloadTelemetryNetwork | null;
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
  // Raw downloader/process messages are intentionally not persisted. Code,
  // policy classification, category and bounded attempt history are enough.
  errorMessage: null,
  diagnosticCategory: input.diagnosticSummary?.finalCategory ?? null,
  attemptCount: input.diagnosticSummary?.attemptCount,
  attempts: input.diagnosticSummary?.attempts.map((attempt) => ({
    attemptIndex: attempt.attemptIndex,
    engineId: attempt.engineId,
    cycle: attempt.cycle,
    outcome: attempt.outcome,
    errorCode: attempt.errorCode,
    classification: attempt.classification,
    category: attempt.category,
    network: attempt.network,
  })),
  downloadProfile: input.downloadProfile ?? undefined,
  compatibility: input.compatibility ?? undefined,
  network: input.network ?? undefined,
});

export const isFailureTelemetryClassification = (
  value: DownloadFailureClassification | null,
): value is DownloadFailureClassification => value !== null;
