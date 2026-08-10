import { decodeQueueDownloadCommand } from "../src/protocol/download/ipcMappers.js";
import type {
  DownloadQueueAck,
  QueueDownloadCommand,
} from "../src/application/download-api.js";

/**
 * Browser Extension WebSocket download adapter. Owns the download-related
 * action allowlist, root/action/data validation, Application invocation and
 * the existing `{ success, message, data }` acknowledgement envelope with
 * `requestId` / `request_id` correlation. Non-download actions stay in Main.
 *
 * The Extension remains queue-ack-only: no progress/result/cancel capability
 * is added for symmetry.
 */

export type DownloadWsAdapter = {
  handle(
    action: unknown,
    data: unknown,
    requestId: string | null,
  ): Promise<{
    success: boolean;
    message: string | null;
    data: Record<string, unknown> | null;
  }>;
};

export type DownloadWsAdapterOptions = {
  queueDownload(command: QueueDownloadCommand): Promise<DownloadQueueAck>;
  syncPreferences(data: Record<string, unknown>): Promise<{
    quality?: "best" | "balanced" | "data_saver" | null;
    aeFriendlyConversionEnabled?: boolean | null;
  } | null>;
  handlePastedVideoSelectionResult(data: unknown): {
    success: boolean;
    message: string;
    code?: string;
  };
  handleSiteSessionCookieSyncResult(data: unknown): {
    success: boolean;
    message: string;
    code?: string;
  };
  /** Optional injection-debug logging for `video_selected_v2` payloads. */
  logInjectedVideoSelectionDebug?(data: Record<string, unknown>): void | Promise<void>;
};

const DOWNLOAD_WS_ACTIONS = new Set([
  "pasted_video_selection_result",
  "site_session_cookie_sync_result",
  "sync_download_preferences",
  "video_selected_v2",
]);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === "object" && !Array.isArray(value))
);

const normalizeOptionalString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
};

export const createDownloadWsAdapter = (
  options: DownloadWsAdapterOptions,
): DownloadWsAdapter => {
  const buildRequestData = (
    requestId: string | null,
    code: string | null,
    extraData: Record<string, unknown> = {},
  ): Record<string, unknown> | null => {
    if (!requestId) {
      return Object.keys(extraData).length > 0 ? extraData : null;
    }
    return {
      requestId,
      ...(code ? { code } : {}),
      ...extraData,
    };
  };

  const failure = (
    requestId: string | null,
    message: string,
    code: string,
  ): { success: false; message: string; data: Record<string, unknown> | null } => ({
    success: false,
    message,
    data: buildRequestData(requestId, code),
  });

  const handleVideoSelectedV2 = async (
    data: unknown,
    requestId: string | null,
  ): Promise<{
    success: boolean;
    message: string | null;
    data: Record<string, unknown> | null;
  }> => {
    if (!isRecord(data)) {
      return failure(requestId, "Missing data", "missing_data");
    }

    const url = normalizeOptionalString(data.url);
    if (!url) {
      return failure(requestId, "Missing url in data", "missing_url");
    }

    try {
      await options.logInjectedVideoSelectionDebug?.(data);
      const syncedPreferences = await options.syncPreferences(data);
      const command = decodeQueueDownloadCommand(data, {
        videoQuality: syncedPreferences?.quality,
      });
      const ack = await options.queueDownload(command);
      return {
        success: true,
        message: "Download queued",
        data: buildRequestData(requestId, null, {
          traceId: ack.traceId,
        }),
      };
    } catch (error) {
      return failure(requestId, String(error), "queue_video_download_failed");
    }
  };

  const handleSyncDownloadPreferences = async (
    data: unknown,
    requestId: string | null,
  ): Promise<{
    success: boolean;
    message: string | null;
    data: Record<string, unknown> | null;
  }> => {
    if (!isRecord(data)) {
      return failure(requestId, "Missing data", "missing_data");
    }
    const syncedPreferences = await options.syncPreferences(data);
    if (!syncedPreferences) {
      return failure(requestId, "Missing download preference fields", "missing_download_preference_fields");
    }
    return {
      success: true,
      message: "Download preferences synced",
      data: buildRequestData(requestId, null, {
        quality: syncedPreferences.quality,
        aeFriendlyConversionEnabled: syncedPreferences.aeFriendlyConversionEnabled,
      }),
    };
  };

  return {
    async handle(action, data, requestId) {
      if (typeof action !== "string" || !DOWNLOAD_WS_ACTIONS.has(action)) {
        return failure(requestId, `Unknown action: ${String(action)}`, "unknown_action");
      }

      switch (action) {
        case "video_selected_v2":
          return handleVideoSelectedV2(data, requestId);
        case "sync_download_preferences":
          return handleSyncDownloadPreferences(data, requestId);
        case "pasted_video_selection_result": {
          const result = options.handlePastedVideoSelectionResult(data);
          return {
            success: result.success,
            message: result.message,
            data: buildRequestData(requestId, result.success ? null : (result.code ?? null)),
          };
        }
        case "site_session_cookie_sync_result": {
          const result = options.handleSiteSessionCookieSyncResult(data);
          return {
            success: result.success,
            message: result.message,
            data: buildRequestData(requestId, result.success ? null : (result.code ?? null)),
          };
        }
        default:
          return failure(requestId, `Unknown action: ${String(action)}`, "unknown_action");
      }
    },
  };
};

export type { QueueDownloadCommand };
