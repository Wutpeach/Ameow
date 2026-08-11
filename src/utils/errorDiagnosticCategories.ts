import type {
  ErrorDiagnosticCategory,
  ErrorDiagnosticSurface,
  RuntimeFailureDiagnostic,
} from "../types/errorDiagnostics";

type FailureCategoryInput = {
  surface: ErrorDiagnosticSurface;
  failure?: RuntimeFailureDiagnostic | null;
  fallbackMessage?: string | null;
};

const AUTH_PATTERNS = [
  /\bcookies?\b/i,
  /\blog(?:in|ged in)\b/i,
  /\bsign(?:ed)? in\b/i,
  /\bauth(?:entication|orization)?\b/i,
  /\b403\b/,
  /\bforbidden\b/i,
  /\bfresh cookies\b/i,
];

const NETWORK_PATTERNS = [
  /\btimeout\b/i,
  /\btimed out\b/i,
  /\bnetwork\b/i,
  /\bproxy\b/i,
  /\b429\b/,
  /\brate limit/i,
  /\btoo many requests\b/i,
  /\beconnreset\b/i,
  /\benotfound\b/i,
  /\beai_again\b/i,
  /\bconnection (?:reset|aborted|refused|closed|timed out)\b/i,
  /\bfetch failed\b/i,
  /\bdns\b/i,
];

const CONTENT_UNAVAILABLE_PATTERNS = [
  /\bprivate\b/i,
  /\bunavailable\b/i,
  /\bnot available\b/i,
  /\bnot found\b/i,
  /\b404\b/,
  /\b410\b/,
  /\bdeleted\b/i,
  /\bremoved\b/i,
  /\bprecondition failed\b/i,
  /\bHTTP Error 412\b/i,
];

const OUTPUT_WRITE_PATTERNS = [
  /\boutput\b/i,
  /\bsave\b/i,
  /\bwrite\b/i,
  /\bpermission\b/i,
  /\baccess denied\b/i,
  /\beacces\b/i,
  /\benoent\b/i,
  /\benospc\b/i,
  /\bno space\b/i,
  /\bproduced no final output\b/i,
  /\bwithout producing an output file\b/i,
];

const QUALITY_FORMAT_PATTERNS = [
  /\bRequested format is not available\b/i,
  /\bNo video formats found\b/i,
  /\bformat\b/i,
  /\bquality\b/i,
];

const RUNTIME_DOWNLOADER_PATTERNS = [
  /\bengine\b/i,
  /\bdownloader\b/i,
  /\bruntime\b/i,
  /\byt-dlp\b/i,
  /\bgallery-dl\b/i,
  /\bffmpeg path\b/i,
  /\bnot found\b/i,
  /\bunavailable\b/i,
];

const TRANSCODE_PATTERNS = [
  /\btranscode\b/i,
  /\bffmpeg\b/i,
  /\bconversion failed\b/i,
  /\bmerge\b/i,
  /\bremux\b/i,
];

const serializeContext = (context?: Record<string, unknown>): string => {
  if (!context) {
    return "";
  }
  try {
    return JSON.stringify(context);
  } catch {
    return "";
  }
};

const buildSearchText = (input: FailureCategoryInput): string => [
  input.failure?.code,
  input.failure?.classification,
  input.failure?.rawMessage,
  serializeContext(input.failure?.context),
  input.fallbackMessage,
].filter((part): part is string => typeof part === "string" && part.length > 0)
  .join("\n");

const matchesAny = (text: string, patterns: readonly RegExp[]): boolean => (
  patterns.some((pattern) => pattern.test(text))
);

export const resolveErrorDiagnosticCategory = (
  input: FailureCategoryInput,
): ErrorDiagnosticCategory => {
  switch (input.failure?.diagnosticCategory) {
    case "authentication_required":
      return "auth_login_state";
    case "network":
      return "network_proxy";
    case "site_input":
    case "content_unavailable":
      return "content_unavailable";
    case "output":
      return "output_write";
    case "format_unavailable":
      return "quality_format_unavailable";
    case "engine_unavailable":
    case "engine_execution":
      return "runtime_downloader_unavailable";
    case "cancelled":
      return "unclassified";
  }

  const code = input.failure?.code;
  const classification = input.failure?.classification;
  const text = buildSearchText(input);

  if (classification === "auth_required" || code === "E_AUTH_REQUIRED" || matchesAny(text, AUTH_PATTERNS)) {
    return "auth_login_state";
  }

  if (matchesAny(text, NETWORK_PATTERNS)) {
    return "network_proxy";
  }

  if (code === "E_OUTPUT_NOT_FOUND" || matchesAny(text, OUTPUT_WRITE_PATTERNS)) {
    return "output_write";
  }

  if (matchesAny(text, QUALITY_FORMAT_PATTERNS)) {
    return "quality_format_unavailable";
  }

  if (
    classification === "input_invalid"
    || code === "E_NO_PROVIDER_MATCH"
    || code === "E_INVALID_DOWNLOAD_INPUT"
    || code === "E_INVALID_INTENT"
    || code === "E_INPUT_INVALID"
    || matchesAny(text, CONTENT_UNAVAILABLE_PATTERNS)
  ) {
    return "content_unavailable";
  }

  if (
    code === "E_ENGINE_NOT_FOUND"
    || code === "E_ENGINE_UNAVAILABLE"
    || code === "E_ENGINE_REJECTED_INTENT"
    || code === "E_DIRECT_SOURCE_REQUIRED"
    || matchesAny(text, RUNTIME_DOWNLOADER_PATTERNS)
  ) {
    return "runtime_downloader_unavailable";
  }

  if (input.surface === "transcode" || matchesAny(text, TRANSCODE_PATTERNS)) {
    return "transcode_merge";
  }

  return "unclassified";
};

export const errorDiagnosticCategoryTranslationKey = (
  category: ErrorDiagnosticCategory,
): string => `app.errorDiagnostic.category.${category}`;
