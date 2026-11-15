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

/**
 * Presentation-only diagnostic-category resolution.
 *
 * Rules (approved compatibility contract):
 * - A typed `diagnosticCategory` from the Product/Application terminal path
 *   is the sole authority and always wins.
 * - A typed Transcode surface maps to `transcode_merge` without inspecting
 *   any ffmpeg/raw text.
 * - Otherwise only typed code/classification facts are consulted. Truly
 *   legacy/untyped Download failures (raw message/context only) become
 *   `unclassified` — raw evidence text is never parsed to infer category.
 * - Product terminal classification and outcomes are never changed here.
 */
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

  if (input.surface === "transcode") {
    return "transcode_merge";
  }

  const code = input.failure?.code;
  const classification = input.failure?.classification;

  if (classification === "auth_required" || code === "E_AUTH_REQUIRED") {
    return "auth_login_state";
  }

  if (
    classification === "input_invalid"
    || code === "E_NO_PROVIDER_MATCH"
    || code === "E_INVALID_DOWNLOAD_INPUT"
    || code === "E_INVALID_INTENT"
    || code === "E_INPUT_INVALID"
  ) {
    return "content_unavailable";
  }

  if (code === "E_OUTPUT_NOT_FOUND") {
    return "output_write";
  }

  if (
    code === "E_ENGINE_NOT_FOUND"
    || code === "E_ENGINE_UNAVAILABLE"
    || code === "E_ENGINE_REJECTED_INTENT"
    || code === "E_DIRECT_SOURCE_REQUIRED"
  ) {
    return "runtime_downloader_unavailable";
  }

  return "unclassified";
};

export const errorDiagnosticCategoryTranslationKey = (
  category: ErrorDiagnosticCategory,
): string => `app.errorDiagnostic.category.${category}`;

/**
 * Typed network sub-detail. The generic `network_proxy` copy ("check your
 * proxy") is misleading whenever the failure was provably DNS, TLS, a timeout,
 * or a proxy authentication/connection/resolution problem. Only typed
 * classification facts select these values; raw text is never parsed.
 */
export type ErrorDiagnosticNetworkDetail =
  | "dns_failed"
  | "tls_failed"
  | "timeout"
  | "proxy_auth_failed"
  | "proxy_connection_failed"
  | "proxy_resolution_failed"
  | "proxy_unsupported";

/**
 * Classification -> detail. Keys are uppercased before lookup because the same
 * facts travel as either typed `DownloadFailureClassification` values or the
 * canonical `NETWORK_*` strings from the network route model.
 */
const NETWORK_DETAIL_BY_CLASSIFICATION: Record<string, ErrorDiagnosticNetworkDetail> = {
  NETWORK_DNS_FAILED: "dns_failed",
  NETWORK_TLS_FAILED: "tls_failed",
  NETWORK_TIMEOUT: "timeout",
  NETWORK_PROXY_AUTH_FAILED: "proxy_auth_failed",
  NETWORK_PROXY_CONNECTION_FAILED: "proxy_connection_failed",
  NETWORK_PROXY_RESOLUTION_FAILED: "proxy_resolution_failed",
  NETWORK_PROXY_UNSUPPORTED: "proxy_unsupported",
};

/**
 * Resolves the typed network sub-detail. `NETWORK_UNKNOWN` and untyped
 * failures deliberately resolve to `null` so the generic category copy stays
 * in charge instead of inventing a cause.
 */
export const resolveErrorDiagnosticNetworkDetail = (
  failure?: RuntimeFailureDiagnostic | null,
): ErrorDiagnosticNetworkDetail | null => {
  const classification = typeof failure?.classification === "string"
    ? failure.classification.trim().toUpperCase()
    : "";
  if (!classification) {
    return null;
  }
  return NETWORK_DETAIL_BY_CLASSIFICATION[classification] ?? null;
};

export const errorDiagnosticNetworkDetailTranslationKey = (
  detail: ErrorDiagnosticNetworkDetail,
): string => `app.errorDiagnostic.networkDetail.${detail}`;

/**
 * Resolves the translation key for the headline shown to the user. A typed
 * network detail wins over the generic category copy; every other category
 * keeps its existing key unchanged.
 */
export const errorDiagnosticMessageTranslationKey = ({
  category,
  failure,
}: {
  category: ErrorDiagnosticCategory;
  failure?: RuntimeFailureDiagnostic | null;
}): string => {
  if (category === "network_proxy") {
    const detail = resolveErrorDiagnosticNetworkDetail(failure);
    if (detail) {
      return errorDiagnosticNetworkDetailTranslationKey(detail);
    }
  }
  return errorDiagnosticCategoryTranslationKey(category);
};

/**
 * Resolves the target host (origin) the failure refers to, for display next
 * to the headline. Only the origin/host is ever returned: path, query and
 * fragment are dropped so a signed URL cannot leak into the overlay.
 */
export const resolveErrorDiagnosticTargetHost = (
  failure?: RuntimeFailureDiagnostic | null,
): string | null => {
  const safeOrigin = typeof failure?.safeUrl?.origin === "string"
    ? failure.safeUrl.origin.trim()
    : "";
  const candidate = safeOrigin || (typeof failure?.userUrl === "string" ? failure.userUrl.trim() : "");
  if (!candidate) {
    return null;
  }
  try {
    const parsed = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
    return parsed.host || null;
  } catch {
    return null;
  }
};
