import type { DownloadFailureClassification } from "../core/constants/error-classifications.js";
import type { DownloadErrorCode } from "../core/constants/error-codes.js";

export type ErrorDiagnosticSurface = "download" | "transcode";

export type ErrorDiagnosticCategory =
  | "auth_login_state"
  | "network_proxy"
  | "content_unavailable"
  | "output_write"
  | "quality_format_unavailable"
  | "runtime_downloader_unavailable"
  | "transcode_merge"
  | "unclassified";

export type RuntimeFailureDiagnostic = {
  code?: DownloadErrorCode | string;
  classification?: DownloadFailureClassification | string;
  rawMessage: string;
  userUrl?: string;
  context?: Record<string, unknown>;
};

export type ErrorDiagnosticCopyRequest = {
  surface: ErrorDiagnosticSurface;
  traceId?: string;
  userMessage: string;
  category: ErrorDiagnosticCategory;
  language?: string;
  failure?: RuntimeFailureDiagnostic | null;
};

export type ErrorDiagnosticCopyPayload = {
  schemaVersion: 1;
  generatedAt: string;
  app: {
    version: string;
    platform?: string;
    arch?: string;
    language?: string;
  };
  failure: {
    surface: ErrorDiagnosticSurface;
    traceId?: string;
    userMessage: string;
    category: ErrorDiagnosticCategory;
    url?: string;
    code?: string;
    classification?: string;
    rawMessage?: string;
    context?: Record<string, unknown>;
  };
  runtimeLog: {
    excerptLineCount: number;
    lines: string[];
  };
  redaction: {
    applied: true;
    preservedOriginalUrl: true;
  };
};
