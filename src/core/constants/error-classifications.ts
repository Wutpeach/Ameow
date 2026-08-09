import type { DownloadErrorCode } from "./error-codes.js";

export type DownloadFailureClassification =
  | "retry_same_engine"
  | "fallback_to_other_engine"
  | "terminal_for_site"
  | "input_invalid"
  | "auth_required"
  | "cancelled";

type DownloadFailureDescriptor = {
  code: DownloadErrorCode;
  message: string;
  context?: Record<string, unknown>;
};

/**
 * Stable code-only classification. Raw CLI/stderr text is never parsed here:
 * Infrastructure adapters classify raw evidence (auth/timeout/extractor/network)
 * and pass the explicit `classification` when constructing the error. Domain
 * keeps only this stable mapping so Application fallback policy stays
 * structured.
 */
export const classifyDownloadFailure = (
  descriptor: DownloadFailureDescriptor,
): DownloadFailureClassification => {
  switch (descriptor.code) {
    case "E_ABORTED":
      return "cancelled";
    case "E_AUTH_REQUIRED":
      return "auth_required";
    case "E_DIRECT_SOURCE_REQUIRED":
    case "E_ENGINE_NOT_FOUND":
    case "E_ENGINE_REJECTED_INTENT":
    case "E_ENGINE_UNAVAILABLE":
    case "E_OUTPUT_NOT_FOUND":
    case "E_EXECUTION_FAILED":
      return "fallback_to_other_engine";
    case "E_INVALID_DOWNLOAD_INPUT":
    case "E_INVALID_INTENT":
    case "E_NO_PROVIDER_MATCH":
      return "input_invalid";
    case "E_INVALID_ENGINE_PLAN":
    case "E_NO_ENGINE_SUCCEEDED":
      return "terminal_for_site";
    default:
      return "terminal_for_site";
  }
};

export const isFallbackEligibleFailure = (
  classification: DownloadFailureClassification,
): boolean => classification === "fallback_to_other_engine";
