import {
  normalizeRequiredVideoRouteUrl,
  normalizeVideoCandidates,
  normalizeVideoHintUrl,
  normalizeVideoPageUrl,
  resolveVideoSelectionSiteHint,
} from "./videoHintNormalization.mjs";

export type PastedVideoSelectionRequest = {
  url: string;
  pageUrl?: string | null;
  siteHint?: string | null;
};

export type PastedVideoSelectionResolution = {
  success: boolean;
  url?: string;
  pageUrl?: string;
  videoUrl?: string;
  videoCandidates: Array<{
    url: string;
    type?: string;
    source?: string;
    confidence?: string;
    mediaType?: "video" | "image";
  }>;
  siteHint?: string;
  title?: string;
  selectionScope?: "current_item" | "playlist";
  clipStartSec?: number;
  clipEndSec?: number;
  ytdlpQualityPreference?: "best" | "balanced" | "data_saver";
  extensionData?: Record<string, unknown>;
  code?: string;
  error?: string;
};

export type ExtensionRequestBridge = {
  requestPastedVideoSelectionResolution(
    payload: PastedVideoSelectionRequest,
  ): Promise<PastedVideoSelectionResolution>;
  handlePastedVideoSelectionResult(data: unknown): {
    success: boolean;
    message: string;
    code?: string;
  };
  rejectAllPendingRequests(error: Error): void;
};

type PendingResolution = {
  resolveResolution: (resolution: PastedVideoSelectionResolution) => void;
  rejectResolution: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

export type ExtensionRequestBridgeOptions = {
  getConnectedClientCount(): number;
  broadcast(message: unknown): void;
  nextRequestId(prefix: string): string;
  timeoutMs?: number;
  log?(message: string, details?: unknown): void;
};

const DEFAULT_PASTED_VIDEO_SELECTION_TIMEOUT_MS = 20_000;

const normalizeOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
};

const normalizeOptionalNumber = (value: unknown): number | undefined => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

const normalizeYtdlpQualityPreference = (
  value: unknown,
): "best" | "balanced" | "data_saver" | undefined => {
  switch (value) {
    case "best":
      return "best";
    case "balanced":
    case "high":
      return "balanced";
    case "data_saver":
    case "standard":
      return "data_saver";
    default:
      return undefined;
  }
};

const asObject = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const normalizeSelectionScope = (
  value: unknown,
): "current_item" | "playlist" | undefined => (
  value === "current_item" || value === "playlist" ? value : undefined
);

export const createExtensionRequestBridge = (
  options: ExtensionRequestBridgeOptions,
): ExtensionRequestBridge => {
  const pendingPastedVideoSelectionRequests = new Map<string, PendingResolution>();
  const timeoutMs = options.timeoutMs ?? DEFAULT_PASTED_VIDEO_SELECTION_TIMEOUT_MS;

  const takePendingPastedVideoSelectionRequest = (requestId: string): PendingResolution | null => {
    const pending = pendingPastedVideoSelectionRequests.get(requestId);
    if (!pending) {
      return null;
    }
    pendingPastedVideoSelectionRequests.delete(requestId);
    clearTimeout(pending.timeoutId);
    return pending;
  };

  return {
    async requestPastedVideoSelectionResolution(payload) {
      if (options.getConnectedClientCount() === 0) {
        throw new Error("Browser extension is not connected");
      }

      const requestId = options.nextRequestId("pasted-video-selection");
      options.log?.("Requesting extension-assisted video selection", {
        requestId,
        url: payload.url,
        siteHint: payload.siteHint ?? null,
        pageUrl: payload.pageUrl ?? null,
        wsClientCount: options.getConnectedClientCount(),
      });

      return await new Promise<PastedVideoSelectionResolution>((resolveResolution, rejectResolution) => {
        const timeoutId = setTimeout(() => {
          pendingPastedVideoSelectionRequests.delete(requestId);
          rejectResolution(new Error("Pasted video selection resolution timed out"));
        }, timeoutMs);

        pendingPastedVideoSelectionRequests.set(requestId, {
          resolveResolution,
          rejectResolution,
          timeoutId,
        });

        options.broadcast({
          action: "resolve_pasted_video_selection",
          data: {
            requestId,
            url: payload.url,
            pageUrl: payload.pageUrl ?? null,
            siteHint: payload.siteHint ?? null,
          },
        });
      });
    },

    handlePastedVideoSelectionResult(data) {
      const payload = asObject(data);
      const correlationRequestId = normalizeOptionalString(
        payload?.correlationRequestId ?? payload?.correlation_request_id,
      );
      if (!correlationRequestId) {
        return {
          success: false,
          message: "Missing correlationRequestId",
          code: "missing_correlation_request_id",
        };
      }

      const pending = takePendingPastedVideoSelectionRequest(correlationRequestId);
      if (!pending) {
        return {
          success: false,
          message: "Unknown pasted video correlation request",
          code: "unknown_correlation_request",
        };
      }

      const siteHint = resolveVideoSelectionSiteHint(
        payload?.siteHint,
        payload?.pageUrl,
        payload?.url,
        payload?.videoUrl,
      );
      const rawExtensionData = asObject(payload?.extensionData) ?? asObject(payload?.extension_data) ?? undefined;

      pending.resolveResolution({
        success: payload?.success === true,
        url: normalizeRequiredVideoRouteUrl(payload?.url),
        pageUrl: normalizeVideoPageUrl(payload?.pageUrl),
        videoUrl: normalizeVideoHintUrl(payload?.videoUrl, siteHint),
        videoCandidates: Array.isArray(payload?.videoCandidates ?? payload?.video_candidates)
          ? normalizeVideoCandidates(payload?.videoCandidates ?? payload?.video_candidates, siteHint)
          : [],
        siteHint,
        title: normalizeOptionalString(payload?.title),
        selectionScope: normalizeSelectionScope(payload?.selectionScope),
        clipStartSec: normalizeOptionalNumber(payload?.clipStartSec ?? payload?.clip_start_sec),
        clipEndSec: normalizeOptionalNumber(payload?.clipEndSec ?? payload?.clip_end_sec),
        ytdlpQualityPreference:
          normalizeYtdlpQualityPreference(payload?.ytdlpQualityPreference)
          ?? normalizeYtdlpQualityPreference(payload?.ytdlpQuality),
        extensionData: rawExtensionData,
        code: normalizeOptionalString(payload?.code),
        error: normalizeOptionalString(payload?.error),
      });

      return {
        success: true,
        message: "pasted_video_selection_received",
      };
    },

    rejectAllPendingRequests(error) {
      for (const pending of pendingPastedVideoSelectionRequests.values()) {
        clearTimeout(pending.timeoutId);
        pending.rejectResolution(error);
      }
      pendingPastedVideoSelectionRequests.clear();
    },
  };
};
