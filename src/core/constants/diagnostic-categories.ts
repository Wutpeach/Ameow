/** Stable, safe failure meaning for diagnostics and Presentation. */
export const DOWNLOAD_DIAGNOSTIC_CATEGORIES = [
  "site_input",
  "authentication_required",
  "network",
  "content_unavailable",
  "format_unavailable",
  "engine_unavailable",
  "engine_execution",
  "output",
  "cancelled",
] as const;

export type DownloadDiagnosticCategory =
  (typeof DOWNLOAD_DIAGNOSTIC_CATEGORIES)[number];
