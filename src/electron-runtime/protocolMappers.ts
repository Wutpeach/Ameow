import type { DownloadProgress, DownloadResult } from "../core/index.js";
import type {
  DownloadProgressPayload,
  DownloadResultPayload,
} from "../types/videoRuntime.js";

/**
 * Explicit runtime/protocol boundary mappers. Core/Application never consume
 * renderer payload types; the runtime maps core values to the existing
 * protocol shapes (stable `file_path`, event names and JSON keys preserved).
 */

export const toDownloadResultPayload = (
  result: DownloadResult,
): DownloadResultPayload => ({
  traceId: result.traceId,
  success: result.success,
  file_path: result.filePath,
  title: result.title,
  error: result.error,
});

/**
 * Core progress and protocol progress share the same shape today; kept as an
 * explicit boundary so protocol key drift cannot leak into Domain.
 */
export const toDownloadProgressPayload = (
  progress: DownloadProgress,
): DownloadProgressPayload => ({
  traceId: progress.traceId,
  percent: progress.percent,
  stage: progress.stage,
  speed: progress.speed,
  eta: progress.eta,
});
