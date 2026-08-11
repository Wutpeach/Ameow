import type {
  ErrorDiagnosticCategory,
  ErrorDiagnosticCopyPayload,
  ErrorDiagnosticCopyRequest,
  ErrorDiagnosticSurface,
  RuntimeFailureDiagnostic,
} from "../src/types/errorDiagnostics.js";
import {
  DOWNLOAD_DIAGNOSTIC_CATEGORIES,
  sanitizeDiagnosticText,
  toSafeDiagnosticUrl,
  type DownloadDiagnosticCategory,
  type DownloadErrorCode,
  type DownloadFailureClassification,
} from "../src/core/index.js";
import type {
  AttemptDiagnosticSummary,
  DownloadDiagnosticNetwork,
  DownloadTerminalDiagnosticSummary,
} from "../src/application/download-diagnostics.js";

type BuildErrorDiagnosticCopyTextOptions = {
  request: ErrorDiagnosticCopyRequest;
  appVersion: string;
  platform?: string;
  arch?: string;
  readRecentRuntimeLogLines(limit: number): Promise<string[]>;
  now?(): Date;
};

const RUNTIME_LOG_LINE_LIMIT = 120;

const asObject = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const normalizeOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
};

const normalizeSafeString = (
  value: unknown,
  maxLength = 160,
): string | undefined => {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return undefined;
  }
  return sanitizeDiagnosticText(normalized, maxLength).trim() || undefined;
};

const normalizeCategory = (value: unknown): ErrorDiagnosticCategory => {
  const normalized = normalizeOptionalString(value);
  switch (normalized) {
    case "auth_login_state":
    case "network_proxy":
    case "content_unavailable":
    case "output_write":
    case "quality_format_unavailable":
    case "runtime_downloader_unavailable":
    case "transcode_merge":
    case "unclassified":
      return normalized;
    default:
      return "unclassified";
  }
};

const normalizeDiagnosticCategory = (
  value: unknown,
): DownloadDiagnosticCategory | undefined => (
  typeof value === "string"
  && DOWNLOAD_DIAGNOSTIC_CATEGORIES.includes(value as DownloadDiagnosticCategory)
    ? value as DownloadDiagnosticCategory
    : undefined
);

const normalizeSurface = (value: unknown): ErrorDiagnosticSurface => (
  normalizeOptionalString(value) === "transcode" ? "transcode" : "download"
);

const FAILURE_CLASSIFICATIONS: readonly DownloadFailureClassification[] = [
  "retry_same_engine",
  "fallback_to_other_engine",
  "terminal_for_site",
  "input_invalid",
  "auth_required",
  "cancelled",
];

const normalizeFailureClassification = (
  value: unknown,
): DownloadFailureClassification | null => (
  typeof value === "string"
  && FAILURE_CLASSIFICATIONS.includes(value as DownloadFailureClassification)
    ? value as DownloadFailureClassification
    : null
);

const isNetworkRouteKind = (value: unknown): value is DownloadDiagnosticNetwork["routeKind"] => (
  value === "direct" || value === "proxy" || value === "complex"
);

const isNetworkSource = (value: unknown): value is DownloadDiagnosticNetwork["source"] => (
  value === "manual"
  || value === "system"
  || value === "environment"
  || value === "direct"
  || value === "fallback"
);

const isNetworkProxyProtocol = (
  value: unknown,
): value is DownloadDiagnosticNetwork["proxyProtocol"] => (
  value === "http"
  || value === "https"
  || value === "socks4"
  || value === "socks5"
  || value === null
);

const normalizeAttemptSummary = (value: unknown): AttemptDiagnosticSummary | null => {
  const attempt = asObject(value);
  if (!attempt) {
    return null;
  }
  const attemptIndex = Number(attempt.attemptIndex);
  const attemptId = normalizeSafeString(attempt.attemptId);
  const engineId = normalizeSafeString(attempt.engineId);
  const cycle = attempt.cycle === "auth_recovery" ? "auth_recovery" : "initial";
  const outcome = attempt.outcome === "succeeded" ? "succeeded" : "failed";
  if (!Number.isInteger(attemptIndex) || attemptIndex < 1 || !attemptId || !engineId) {
    return null;
  }
  const rawNetwork = asObject(attempt.network);
  const routeKind = isNetworkRouteKind(rawNetwork?.routeKind)
    ? rawNetwork?.routeKind
    : null;
  const source = isNetworkSource(rawNetwork?.source) ? rawNetwork?.source : null;
  const consumer = normalizeSafeString(rawNetwork?.consumer);
  const proxyProtocol = isNetworkProxyProtocol(rawNetwork?.proxyProtocol)
    ? rawNetwork?.proxyProtocol
    : null;
  const normalizedNetwork = (routeKind && source && consumer) ? {
    routeKind,
    source,
    consumer,
    appliedToEngine: rawNetwork?.appliedToEngine === true,
    proxyProtocol,
    failureClassification: normalizeSafeString(rawNetwork?.failureClassification) ?? null,
  } : undefined;

  return {
    attemptIndex,
    attemptId,
    engineId,
    cycle,
    outcome,
    errorCode: normalizeSafeString(attempt.errorCode, 80) as DownloadErrorCode | undefined ?? null,
    classification: normalizeFailureClassification(attempt.classification),
    category: normalizeDiagnosticCategory(attempt.category) ?? null,
    network: normalizedNetwork,
  };
};

const normalizeTerminalSummary = (
  value: unknown,
): DownloadTerminalDiagnosticSummary | undefined => {
  const summary = asObject(value);
  if (!summary) {
    return undefined;
  }
  const traceId = normalizeSafeString(summary.traceId);
  const status = summary.status === "succeeded"
    || summary.status === "failed"
    || summary.status === "cancelled"
    ? summary.status
    : null;
  if (!traceId || !status) {
    return undefined;
  }
  const attempts = Array.isArray(summary.attempts)
    ? summary.attempts.map(normalizeAttemptSummary).filter((attempt): attempt is AttemptDiagnosticSummary => Boolean(attempt)).slice(-8)
    : [];
  const attemptCount = Number(summary.attemptCount);
  return {
    traceId,
    status,
    finalEngineId: normalizeSafeString(summary.finalEngineId) ?? null,
    attemptCount: Number.isInteger(attemptCount) && attemptCount >= attempts.length
      ? attemptCount
      : attempts.length,
    attempts,
    finalCode: normalizeSafeString(summary.finalCode, 80) as DownloadErrorCode | undefined ?? null,
    finalClassification: normalizeFailureClassification(summary.finalClassification),
    finalCategory: normalizeDiagnosticCategory(summary.finalCategory) ?? null,
  };
};

export const redactRuntimeLogLine = (line: string): string => sanitizeDiagnosticText(line, 4_000);

export const redactDiagnosticContext = (
  _context?: Record<string, unknown>,
): Record<string, unknown> | undefined => undefined;

export const normalizeErrorDiagnosticCopyRequest = (
  payload: unknown,
): ErrorDiagnosticCopyRequest => {
  const request = asObject(payload) ?? {};
  const rawFailure = asObject(request.failure);
  const rawSafeUrl = asObject(rawFailure?.safeUrl);
  const reducedUrl = toSafeDiagnosticUrl(
    normalizeOptionalString(rawSafeUrl?.origin)
      ?? normalizeOptionalString(rawFailure?.userUrl),
  );
  const normalizedSafeUrl = reducedUrl
    ? {
        origin: reducedUrl.origin,
        hasQuery: rawSafeUrl ? rawSafeUrl.hasQuery === true : reducedUrl.hasQuery,
        hasFragment: rawSafeUrl ? rawSafeUrl.hasFragment === true : reducedUrl.hasFragment,
      }
    : undefined;
  const failure: RuntimeFailureDiagnostic | null = rawFailure
    ? {
        code: normalizeSafeString(rawFailure.code, 80),
        classification: normalizeSafeString(rawFailure.classification, 80),
        rawMessage: normalizeOptionalString(rawFailure.rawMessage),
        safeUrl: normalizedSafeUrl,
        diagnosticCategory: normalizeDiagnosticCategory(rawFailure.diagnosticCategory),
        attemptSummary: normalizeTerminalSummary(rawFailure.attemptSummary),
      }
    : null;

  return {
    surface: normalizeSurface(request.surface),
    traceId: normalizeSafeString(request.traceId),
    userMessage: normalizeOptionalString(request.userMessage) ?? "",
    category: normalizeCategory(request.category),
    language: normalizeOptionalString(request.language),
    failure,
  };
};

export const buildErrorDiagnosticCopyPayload = async (
  options: BuildErrorDiagnosticCopyTextOptions,
): Promise<ErrorDiagnosticCopyPayload> => {
  let runtimeLogLines: string[];
  try {
    runtimeLogLines = await options.readRecentRuntimeLogLines(RUNTIME_LOG_LINE_LIMIT);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    runtimeLogLines = [`<runtime log unavailable: ${sanitizeDiagnosticText(message)}>`];
  }

  const failure = options.request.failure ?? null;
  const payload: ErrorDiagnosticCopyPayload = {
    schemaVersion: 1,
    generatedAt: (options.now?.() ?? new Date()).toISOString(),
    app: {
      version: options.appVersion,
      platform: options.platform,
      arch: options.arch,
      language: options.request.language,
    },
    failure: {
      surface: options.request.surface,
      traceId: normalizeSafeString(options.request.traceId),
      userMessage: sanitizeDiagnosticText(options.request.userMessage),
      category: options.request.category,
      url: failure?.safeUrl ?? toSafeDiagnosticUrl(failure?.userUrl),
      code: normalizeSafeString(failure?.code, 80),
      classification: normalizeSafeString(failure?.classification, 80),
      rawMessage: failure?.diagnosticCategory
        ? undefined
        : failure?.rawMessage
          ? sanitizeDiagnosticText(failure.rawMessage)
          : undefined,
      diagnosticCategory: failure?.diagnosticCategory,
      attemptSummary: failure?.attemptSummary,
    },
    runtimeLog: {
      excerptLineCount: runtimeLogLines.length,
      lines: runtimeLogLines.map(redactRuntimeLogLine),
    },
    redaction: {
      applied: true,
      urlReducedToOrigin: true,
    },
  };

  return payload;
};

export const buildErrorDiagnosticCopyText = async (
  options: BuildErrorDiagnosticCopyTextOptions,
): Promise<string> => {
  const payload = await buildErrorDiagnosticCopyPayload(options);
  return JSON.stringify(payload, null, 2);
};
