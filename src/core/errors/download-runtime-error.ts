import {
  classifyDownloadFailure,
  isFallbackEligibleFailure,
  type DownloadFailureClassification,
} from "../constants/error-classifications.js";
import type { DownloadErrorCode } from "../constants/error-codes.js";
import type { DownloadDiagnosticCategory } from "../constants/diagnostic-categories.js";

export class DownloadRuntimeError extends Error {
  readonly code: DownloadErrorCode;
  readonly classification: DownloadFailureClassification;
  /** True when the caller supplied the classification explicitly (Infrastructure
   * adapters classify raw evidence); false when it was derived from the
   * code-only map and may still be refined from evidence at the boundary. */
  readonly classificationExplicit: boolean;
  readonly diagnosticCategory?: DownloadDiagnosticCategory;
  readonly context?: Record<string, unknown>;
  readonly fallbackable: boolean;
  declare readonly cause?: unknown;

  constructor(
    code: DownloadErrorCode,
    message: string,
    options: {
      cause?: unknown;
      classification?: DownloadFailureClassification;
      diagnosticCategory?: DownloadDiagnosticCategory;
      context?: Record<string, unknown>;
    } = {},
  ) {
    super(message);
    this.name = "DownloadRuntimeError";
    this.code = code;
    this.classificationExplicit = options.classification !== undefined;
    this.classification = options.classification ?? classifyDownloadFailure({
      code,
      message,
      context: options.context,
    });
    this.diagnosticCategory = options.diagnosticCategory;
    this.context = options.context;
    this.fallbackable = isFallbackEligibleFailure(this.classification);
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}
