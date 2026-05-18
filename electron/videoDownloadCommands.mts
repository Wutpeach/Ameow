import {
  createElectronRuntimeCommandRouter,
  type ElectronDownloadRuntime,
} from "../src/electron-runtime/index.js";
import type { AmeowRendererCommand } from "../src/types/electronBridge.js";
import type { QueuedVideoDownloadAck } from "../src/types/videoRuntime.js";
import {
  normalizeRequiredVideoRouteUrl,
  normalizeVideoPageUrl,
  resolveVideoSelectionSiteHint,
} from "./videoHintNormalization.mjs";
import type { ExtensionRequestBridge } from "./extensionRequestBridge.mjs";

type CommandPayload = Record<string, unknown> | undefined;

export type VideoDownloadCommandBridge = {
  supports(command: AmeowRendererCommand): boolean;
  invoke<TResult>(
    command: AmeowRendererCommand,
    payload?: Record<string, unknown>,
  ): Promise<TResult>;
};

export type VideoDownloadCommandBridgeOptions = {
  runtime: ElectronDownloadRuntime;
  extensionBridge: ExtensionRequestBridge;
  readConfigObject(): Promise<Record<string, unknown>>;
  getRuntimeDependencyStatus(): unknown;
  getRuntimeDependencyGateState(): unknown;
  refreshRuntimeDependencyGateState(): unknown;
  startRuntimeDependencyBootstrap(reason?: string): Promise<unknown>;
  checkYtdlpVersion(): Promise<unknown>;
  getGalleryDlInfo(): Promise<unknown>;
  logInjectedDebug(
    config: Record<string, unknown>,
    message: string,
    payload: unknown,
  ): void;
};

const EXTENSION_ASSISTED_PASTED_VIDEO_SITE_HINTS = new Set([
  "bilibili",
  "youtube",
  "twitter-x",
  "pinterest",
  "xiaohongshu",
]);

const supportedCommands = new Set<AmeowRendererCommand>([
  "cancel_download",
  "cancel_transcode",
  "check_ytdlp_version",
  "get_gallery_dl_info",
  "get_runtime_dependency_gate_state",
  "get_runtime_dependency_status",
  "queue_pasted_video_download",
  "queue_video_download",
  "refresh_runtime_dependency_gate_state",
  "remove_transcode",
  "retry_transcode",
  "start_runtime_dependency_bootstrap",
]);

const asObject = (payload: CommandPayload): Record<string, unknown> => (
  payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload
    : {}
);

const normalizeOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
};

const normalizeTraceId = (payload: CommandPayload): string => (
  normalizeOptionalString(asObject(payload).traceId ?? asObject(payload).trace_id) ?? ""
);

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

const resolveVideoDownloadPreferencesFromConfig = (config: Record<string, unknown>) => ({
  ytdlpQuality:
    normalizeYtdlpQualityPreference(
      normalizeOptionalString(config.defaultVideoDownloadQuality)
        ?? normalizeOptionalString(config.ytdlpQualityPreference),
    )
    ?? "best",
});

const summarizeQueuePayload = (payload: Record<string, unknown>) => ({
  url: payload.url ?? null,
  pageUrl: payload.pageUrl ?? payload.page_url ?? null,
  videoUrl: payload.videoUrl ?? payload.video_url ?? null,
  siteHint: payload.siteHint ?? payload.site_hint ?? null,
  titlePresent: Boolean(normalizeOptionalString(payload.title)),
  cookiesPresent: Boolean(normalizeOptionalString(payload.cookies)),
  videoCandidateCount: Array.isArray(payload.videoCandidates)
    ? payload.videoCandidates.length
    : Array.isArray(payload.video_candidates)
      ? payload.video_candidates.length
      : 0,
  ytdlpQualityPreference:
    payload.ytdlpQualityPreference
    ?? payload.ytdlpQuality
    ?? payload.defaultVideoDownloadQuality
    ?? null,
});

export const createVideoDownloadCommandBridge = (
  options: VideoDownloadCommandBridgeOptions,
): VideoDownloadCommandBridge => {
  const router = createElectronRuntimeCommandRouter({ runtime: options.runtime });

  const queueVideoDownload = async (
    payload: CommandPayload,
  ): Promise<QueuedVideoDownloadAck> => {
    const config = await options.readConfigObject();
    const mergedPreferences = resolveVideoDownloadPreferencesFromConfig(config);
    const request = {
      ...asObject(payload),
      defaultVideoDownloadQuality: mergedPreferences.ytdlpQuality,
    };
    options.logInjectedDebug(config, "Normalized injected download request", summarizeQueuePayload(request));
    const ack = await router.invoke<QueuedVideoDownloadAck>("queue_video_download", request);
    options.logInjectedDebug(config, "Queued injected download request", {
      traceId: ack.traceId,
      accepted: ack.accepted,
      ...summarizeQueuePayload(request),
    });
    return ack;
  };

  const queuePastedVideoDownload = async (
    payload: CommandPayload,
  ): Promise<QueuedVideoDownloadAck> => {
    const request = asObject(payload);
    const rawUrl = normalizeRequiredVideoRouteUrl(request.url);
    if (!rawUrl) {
      throw new Error("Missing or invalid url");
    }

    const siteHint = resolveVideoSelectionSiteHint(
      request.siteHint,
      request.pageUrl,
      request.url,
      request.videoUrl,
    );

    if (!siteHint || !EXTENSION_ASSISTED_PASTED_VIDEO_SITE_HINTS.has(siteHint)) {
      return await queueVideoDownload(request);
    }

    try {
      const resolvedViaExtension = await options.extensionBridge.requestPastedVideoSelectionResolution({
        url: rawUrl,
        pageUrl: normalizeVideoPageUrl(request.pageUrl) ?? rawUrl,
        siteHint,
      });

      if (resolvedViaExtension.success && resolvedViaExtension.url) {
        console.log(
          ">>> [PastedVideo] Using extension-assisted selection payload:",
          JSON.stringify({
            url: resolvedViaExtension.url,
            pageUrl: resolvedViaExtension.pageUrl ?? null,
            videoUrl: resolvedViaExtension.videoUrl ?? null,
            siteHint: resolvedViaExtension.siteHint ?? siteHint,
            videoCandidatesCount: resolvedViaExtension.videoCandidates?.length ?? 0,
            cookiesPresent: Boolean(resolvedViaExtension.cookies),
            selectionScope: resolvedViaExtension.selectionScope ?? null,
            ytdlpQualityPreference: resolvedViaExtension.ytdlpQualityPreference ?? null,
          }),
        );
        return await queueVideoDownload({
          ...request,
          ...resolvedViaExtension,
        });
      }

      console.warn(
        ">>> [PastedVideo] Extension-assisted selection was unavailable, falling back to direct queue:",
        {
          siteHint,
          code: resolvedViaExtension.code ?? null,
          error: resolvedViaExtension.error ?? null,
        },
      );
    } catch (error) {
      console.warn(">>> [PastedVideo] Extension-assisted selection failed, falling back to direct queue:", error);
    }

    return await queueVideoDownload(request);
  };

  return {
    supports(command) {
      return supportedCommands.has(command);
    },

    async invoke<TResult>(
      command: AmeowRendererCommand,
      payload?: Record<string, unknown>,
    ): Promise<TResult> {
      switch (command) {
        case "queue_video_download":
          return await queueVideoDownload(payload) as TResult;
        case "queue_pasted_video_download":
          return await queuePastedVideoDownload(payload) as TResult;
        case "cancel_download":
          return await options.runtime.cancelDownload(normalizeTraceId(payload)) as TResult;
        case "cancel_transcode":
          return await options.runtime.cancelTranscode(normalizeTraceId(payload)) as TResult;
        case "retry_transcode":
          return await options.runtime.retryTranscode(normalizeTraceId(payload)) as TResult;
        case "remove_transcode":
          return await options.runtime.removeTranscode(normalizeTraceId(payload)) as TResult;
        case "check_ytdlp_version":
          return await options.checkYtdlpVersion() as TResult;
        case "get_gallery_dl_info":
          return await options.getGalleryDlInfo() as TResult;
        case "get_runtime_dependency_status":
          return options.getRuntimeDependencyStatus() as TResult;
        case "get_runtime_dependency_gate_state":
          return options.getRuntimeDependencyGateState() as TResult;
        case "refresh_runtime_dependency_gate_state":
          return options.refreshRuntimeDependencyGateState() as TResult;
        case "start_runtime_dependency_bootstrap":
          return await options.startRuntimeDependencyBootstrap(
            normalizeOptionalString(asObject(payload).reason),
          ) as TResult;
        default:
          throw new Error(`Unsupported video download command: ${command}`);
      }
    },
  };
};
