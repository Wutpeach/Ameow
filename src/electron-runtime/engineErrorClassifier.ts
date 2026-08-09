import type { DownloadFailureClassification } from "../core/index.js";

/**
 * Raw CLI/stderr evidence classification. Lives in Infrastructure: raw
 * downloader output is turned into a stable `DownloadFailureClassification`
 * here, before a typed `DownloadRuntimeError` reaches Application. Domain/
 * Application never inspect message text or stderr tails to decide fallback.
 * P0 network classification (`classifyNetworkFailure`) stays separate and is
 * attached to the same error context by the engine network adapters.
 */

const AUTH_REQUIRED_PATTERNS = [
  /\bcookies?\b/i,
  /\blog(?:in|ged in)\b/i,
  /\bsign(?:ed)? in\b/i,
  /\bauth(?:entication|orization)?\b/i,
  /\brequires?\s+(?:login|cookies|authentication|authorization)\b/i,
  /\b403\b/,
  /\bforbidden\b/i,
];

const RETRY_SAME_ENGINE_PATTERNS = [
  /\btimeout\b/i,
  /\btimed out\b/i,
  /\bnetwork\b/i,
  /\btemporar(?:y|ily)\b/i,
  /\brate limit/i,
  /\btoo many requests\b/i,
  /\b429\b/,
  /\beconnreset\b/i,
  /\benotfound\b/i,
  /\beai_again\b/i,
  /\bconnection reset\b/i,
  /\bconnection aborted\b/i,
  /\bfetch failed\b/i,
];

type EngineFailureDescriptor = {
  message: string;
  context?: Record<string, unknown>;
};

const textMatchesAny = (text: string, patterns: readonly RegExp[]): boolean => (
  patterns.some((pattern) => pattern.test(text))
);

const serializeContext = (context: Record<string, unknown> | undefined): string => {
  if (!context) {
    return "";
  }
  try {
    return JSON.stringify(context);
  } catch {
    return "";
  }
};

/**
 * Maps raw engine evidence to the stable classification consumed by the
 * fallback policy. Evidence is expected to already be redacted; the caller
 * preserves the redacted tail in the error context.
 */
export const classifyEngineFailure = (
  descriptor: EngineFailureDescriptor,
): DownloadFailureClassification => {
  const evidence = [descriptor.message, serializeContext(descriptor.context)].join("\n");
  if (textMatchesAny(evidence, AUTH_REQUIRED_PATTERNS)) {
    return "auth_required";
  }
  if (textMatchesAny(evidence, RETRY_SAME_ENGINE_PATTERNS)) {
    return "retry_same_engine";
  }
  return "fallback_to_other_engine";
};
