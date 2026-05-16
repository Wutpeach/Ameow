import type { EngineId, YtdlpQualityPreference } from "../core/index.js";

type CliEngineId = Extract<EngineId, "yt-dlp" | "gallery-dl">;

type YtdlpMergeOutputFormat = "mp4" | "mp4/mkv" | null;

export type YtdlpFormatProfile = {
  selector: string;
  sort: string | null;
  mergeOutputFormat: YtdlpMergeOutputFormat;
};

type YtdlpManifest = {
  id: "yt-dlp";
  binaryKey: "ytDlp";
  configIsolationArgs: readonly string[];
  baseArgs: readonly string[];
  encodingArgs: readonly string[];
  progressArgs: readonly string[];
  progressReport: {
    finalPathPrint: string;
    titlePrint: string;
  };
  youtube: {
    lightExtractorArgs: readonly string[];
    extendedExtractorArgs: readonly string[];
    remoteComponentsArgs: readonly string[];
    retryingCompatibleExtractorActivity: string;
  };
  formatProfiles: {
    best: YtdlpFormatProfile;
    balanced: YtdlpFormatProfile;
    data_saver: YtdlpFormatProfile;
  };
  youtubeFormatProfiles: {
    balanced: YtdlpFormatProfile;
    data_saver: YtdlpFormatProfile;
  };
};

type GalleryDlManifest = {
  id: "gallery-dl";
  binaryKey: "galleryDl";
  configIsolationArgs: readonly string[];
  baseArgs: readonly string[];
  outputArgs: {
    directoryFlag: string;
    filenameFlag: string;
    extensionTemplate: string;
  };
  sidecarExtensions: readonly string[];
  progress: {
    lineTailLimit: number;
    resolvingActivity: string;
  };
};

type CliEngineManifest = YtdlpManifest | GalleryDlManifest;

const YTDLP_FORMAT_SELECTOR_BEST = "bestvideo+bestaudio/best";
const YTDLP_FORMAT_SELECTOR_BALANCED = [
  "bv*[height=1080][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/",
  "bv*[height=1080][ext=mp4]+ba[ext=m4a]/",
  "b[height=1080][vcodec^=avc1][ext=mp4]/",
  "b[height=1080][ext=mp4]/",
  "best[height=1080][ext=mp4]/",
  "bv*[height<=1080][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/",
  "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/",
  "b[height<=1080][vcodec^=avc1][ext=mp4]/",
  "b[height<=1080][ext=mp4]/",
  "best[height<=1080][ext=mp4]/",
  "bv*[vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/",
  "bv*[ext=mp4]+ba[ext=m4a]/",
  "b[vcodec^=avc1][ext=mp4]/",
  "b[ext=mp4]/",
  "best[ext=mp4]/",
  "best",
].join("");
const YTDLP_FORMAT_SELECTOR_DATA_SAVER = [
  "bv*[height=360][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/",
  "bv*[height=360][ext=mp4]+ba[ext=m4a]/",
  "b[height=360][vcodec^=avc1][ext=mp4]/",
  "b[height=360][ext=mp4]/",
  "best[height=360][ext=mp4]/",
  "bv*[height<360][ext=mp4]+ba[ext=m4a]/",
  "b[height<360][ext=mp4]/",
  "best[height<360][ext=mp4]/",
  "worstvideo[ext=mp4]+ba[ext=m4a]/",
  "worst[ext=mp4]/",
  "worst",
].join("");
const YTDLP_YOUTUBE_FORMAT_SELECTOR_BALANCED = [
  "bv*[height<=1080][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/",
  "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/",
  "b[height<=1080][ext=mp4]/",
  "best[height<=1080][ext=mp4]/",
  "best[ext=mp4]/",
  "best",
].join("");
const YTDLP_YOUTUBE_FORMAT_SELECTOR_DATA_SAVER = [
  "best[height<=360][ext=mp4]/",
  "b[height<=360][ext=mp4]/",
  "worst[ext=mp4]/",
  "worst",
].join("");

export const CLI_ENGINE_MANIFESTS = {
  "yt-dlp": {
    id: "yt-dlp",
    binaryKey: "ytDlp",
    configIsolationArgs: ["--ignore-config"],
    baseArgs: [
      "--newline",
      "--no-warnings",
    ],
    progressArgs: ["--progress"],
    encodingArgs: ["--encoding", "utf-8"],
    progressReport: {
      finalPathPrint: "after_move:filepath",
      titlePrint: "after_move:title",
    },
    youtube: {
      lightExtractorArgs: [
        "--extractor-args",
        "youtube:player_client=android,web",
      ],
      extendedExtractorArgs: [
        "--extractor-args",
        "youtube:player_js_variant=tv",
      ],
      remoteComponentsArgs: [
        "--remote-components",
        "ejs:github",
      ],
      retryingCompatibleExtractorActivity: "activity:youtube.retryingCompatibleExtractor",
    },
    formatProfiles: {
      best: {
        selector: YTDLP_FORMAT_SELECTOR_BEST,
        sort: "res,codec:h264,acodec:aac,ext",
        mergeOutputFormat: "mp4/mkv",
      },
      balanced: {
        selector: YTDLP_FORMAT_SELECTOR_BALANCED,
        sort: "ext:mp4:m4a",
        mergeOutputFormat: "mp4",
      },
      data_saver: {
        selector: YTDLP_FORMAT_SELECTOR_DATA_SAVER,
        sort: "ext:mp4:m4a",
        mergeOutputFormat: "mp4",
      },
    },
    youtubeFormatProfiles: {
      balanced: {
        selector: YTDLP_YOUTUBE_FORMAT_SELECTOR_BALANCED,
        sort: "ext:mp4:m4a",
        mergeOutputFormat: "mp4",
      },
      data_saver: {
        selector: YTDLP_YOUTUBE_FORMAT_SELECTOR_DATA_SAVER,
        sort: "ext:mp4:m4a",
        mergeOutputFormat: "mp4",
      },
    },
  },
  "gallery-dl": {
    id: "gallery-dl",
    binaryKey: "galleryDl",
    configIsolationArgs: ["--config-ignore"],
    baseArgs: ["--write-info-json"],
    outputArgs: {
      directoryFlag: "--directory",
      filenameFlag: "--filename",
      extensionTemplate: "{extension}",
    },
    sidecarExtensions: ["json", "txt", "part"],
    progress: {
      lineTailLimit: 20,
      resolvingActivity: "activity:galleryDl.resolvingMedia",
    },
  },
} as const satisfies Record<CliEngineId, CliEngineManifest>;

export const getCliEngineManifest = <TId extends CliEngineId>(
  engineId: TId,
): (typeof CLI_ENGINE_MANIFESTS)[TId] => CLI_ENGINE_MANIFESTS[engineId];

export const resolveYtdlpFormatProfile = (
  quality: YtdlpQualityPreference | undefined,
  hasFfmpeg: boolean,
  options?: { isYouTube?: boolean },
): YtdlpFormatProfile => {
  const manifest = getCliEngineManifest("yt-dlp");
  const normalized = quality ?? "best";
  const isYouTube = options?.isYouTube === true;
  if (!hasFfmpeg) {
    switch (normalized) {
      case "balanced":
        return {
          selector: "best[height<=1080][ext=mp4]/best[ext=mp4]/best",
          sort: "ext:mp4:m4a",
          mergeOutputFormat: null,
        };
      case "data_saver":
        return {
          selector: "best[height<=360][ext=mp4]/worst[ext=mp4]/worst",
          sort: "ext:mp4:m4a",
          mergeOutputFormat: null,
        };
      case "best":
      default:
        return {
          selector: "best[ext=mp4]/best",
          sort: "res,codec:h264,acodec:aac,ext",
          mergeOutputFormat: null,
        };
    }
  }

  switch (normalized) {
    case "balanced":
      return isYouTube
        ? manifest.youtubeFormatProfiles.balanced
        : manifest.formatProfiles.balanced;
    case "data_saver":
      return isYouTube
        ? manifest.youtubeFormatProfiles.data_saver
        : manifest.formatProfiles.data_saver;
    case "best":
    default:
      return manifest.formatProfiles.best;
  }
};
