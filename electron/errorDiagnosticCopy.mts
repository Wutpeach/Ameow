import type {
  ErrorDiagnosticCategory,
  ErrorDiagnosticCopyPayload,
  ErrorDiagnosticCopyRequest,
  ErrorDiagnosticSurface,
  RuntimeFailureDiagnostic,
} from "../src/types/errorDiagnostics.js";

type BuildErrorDiagnosticCopyTextOptions = {
  request: ErrorDiagnosticCopyRequest;
  appVersion: string;
  platform?: string;
  arch?: string;
  readRecentRuntimeLogLines(limit: number): Promise<string[]>;
  now?(): Date;
};

const RUNTIME_LOG_LINE_LIMIT = 120;
const REDACTED = "[REDACTED]";

const SENSITIVE_KEY_PATTERN = /(?:cookie|authorization|bearer|token|password|passwd|secret|session|account|user(?:name)?|email)/i;
const URL_KEY_PATTERN = /(?:^|_)(?:url|uri)(?:$|_)/i;

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

const normalizeSurface = (value: unknown): ErrorDiagnosticSurface => (
  normalizeOptionalString(value) === "transcode" ? "transcode" : "download"
);

const redactStringValue = (value: string): string => value
  .replace(/\b(Cookie|Set-Cookie)\s*:\s*[^\r\n]+/gi, `$1: ${REDACTED}`)
  .replace(/\bAuthorization\s*:\s*[^\r\n]+/gi, `Authorization: ${REDACTED}`)
  .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`)
  .replace(/\b(cookie|cookies|authorization|token|access[_-]?token|refresh[_-]?token|password|passwd|secret|session(?:id)?|account|email)\s*([:=])\s*("[^"]*"|'[^']*'|[^\s,;}&]+)/gi, (_match, key: string, separator: string) => `${key}${separator}${separator === ":" ? " " : ""}${REDACTED}`);

const redactUnknown = (value: unknown, keyHint = ""): unknown => {
  if (value === null || value === undefined) {
    return value;
  }

  if (SENSITIVE_KEY_PATTERN.test(keyHint) && !URL_KEY_PATTERN.test(keyHint)) {
    return REDACTED;
  }

  if (typeof value === "string") {
    return redactStringValue(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactUnknown(entry, keyHint));
  }

  const objectValue = asObject(value);
  if (objectValue) {
    return Object.fromEntries(
      Object.entries(objectValue).map(([key, entry]) => [
        key,
        redactUnknown(entry, key),
      ]),
    );
  }

  return value;
};

export const redactRuntimeLogLine = (line: string): string => redactStringValue(line);

export const redactDiagnosticContext = (
  context?: Record<string, unknown>,
): Record<string, unknown> | undefined => {
  if (!context) {
    return undefined;
  }
  return redactUnknown(context) as Record<string, unknown>;
};

export const normalizeErrorDiagnosticCopyRequest = (
  payload: unknown,
): ErrorDiagnosticCopyRequest => {
  const request = asObject(payload) ?? {};
  const rawFailure = asObject(request.failure);
  const failure: RuntimeFailureDiagnostic | null = rawFailure
    ? {
        code: normalizeOptionalString(rawFailure.code),
        classification: normalizeOptionalString(rawFailure.classification),
        rawMessage: normalizeOptionalString(rawFailure.rawMessage) ?? "",
        userUrl: normalizeOptionalString(rawFailure.userUrl),
        context: asObject(rawFailure.context) ?? undefined,
      }
    : null;

  return {
    surface: normalizeSurface(request.surface),
    traceId: normalizeOptionalString(request.traceId),
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
    runtimeLogLines = [`<runtime log unavailable: ${message}>`];
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
      traceId: options.request.traceId,
      userMessage: options.request.userMessage,
      category: options.request.category,
      url: failure?.userUrl,
      code: normalizeOptionalString(failure?.code),
      classification: normalizeOptionalString(failure?.classification),
      rawMessage: failure?.rawMessage,
      context: redactDiagnosticContext(failure?.context),
    },
    runtimeLog: {
      excerptLineCount: runtimeLogLines.length,
      lines: runtimeLogLines.map(redactRuntimeLogLine),
    },
    redaction: {
      applied: true,
      preservedOriginalUrl: true,
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
