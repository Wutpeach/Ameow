import path from "node:path";
import type { EngineExecutionContext, YtdlpQualityPreference } from "../core/index.js";
import { getCliEngineManifest, resolveYtdlpFormatProfile, type YtdlpFormatProfile } from "./engineManifest.js";
import { resolveRenameEnabled } from "./renameRules.js";

export type YouTubeMode = "light" | "extended";

type YtdlpClipRange = {
  startSec: number;
  endSec: number;
};

export type YtdlpCommandPlan = {
  sourceUrl: string;
  isYouTube: boolean;
  clipRange: YtdlpClipRange | null;
  reportPath: string;
  titleReportPath: string;
  outputTemplate: string;
  artifactPrefixes: string[];
  ffmpegDir: string;
  formatProfile: YtdlpFormatProfile;
};

type BuildYtdlpCommandArgsOptions = {
  mode: YouTubeMode;
  cookiesPath: string | null;
  hasFfmpeg: boolean;
  hasDeno: boolean;
  selectionScope?: string;
  pageUrl?: string;
  platform: NodeJS.Platform;
};

export const isYouTubeUrl = (value: string): boolean =>
  value.includes("youtube.com/") || value.includes("youtu.be/");

const resolveYtdlpQualityLabel = (
  quality: YtdlpQualityPreference | undefined,
): "highest" | "balanced" | "data-saver" => {
  switch (quality) {
    case "balanced":
      return "balanced";
    case "data_saver":
      return "data-saver";
    case "best":
    default:
      return "highest";
  }
};

const YTDLP_SECTION_DOWNLOAD_SITE_IDS = new Set(["youtube", "bilibili"]);

const isClipSectionDownloadSupported = (siteId: string | undefined): boolean => (
  typeof siteId === "string" && YTDLP_SECTION_DOWNLOAD_SITE_IDS.has(siteId)
);

const formatClipTimeForYtdlp = (seconds: number): string => {
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const wholeSeconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  const base = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}`;
  return milliseconds > 0
    ? `${base}.${String(milliseconds).padStart(3, "0")}`
    : base;
};

const resolveClipRangeSeconds = (
  context: EngineExecutionContext,
): YtdlpClipRange | null => {
  const rawIntent = context.intent as Record<string, unknown>;
  const rawStartSec = rawIntent.clipStartSec;
  const rawEndSec = rawIntent.clipEndSec;
  const hasStartSec = rawStartSec !== undefined && rawStartSec !== null;
  const hasEndSec = rawEndSec !== undefined && rawEndSec !== null;

  if (!hasStartSec && !hasEndSec) {
    return null;
  }

  if (!isClipSectionDownloadSupported(context.intent.siteId)) {
    throw new Error("Clip downloads are only supported for YouTube and Bilibili");
  }

  if (!hasStartSec || !hasEndSec) {
    throw new Error("Clip downloads require both clipStartSec and clipEndSec");
  }

  const startSec = Number(rawStartSec);
  const endSec = Number(rawEndSec);
  if (!Number.isFinite(startSec) || startSec < 0 || !Number.isFinite(endSec) || endSec < 0) {
    throw new Error("Clip download range must use finite non-negative seconds");
  }
  if (endSec <= startSec) {
    throw new Error("Clip download end time must be later than the start time");
  }

  return { startSec, endSec };
};

const buildYtdlpDownloadSectionArg = (
  clipRange: YtdlpClipRange,
): string => `*${formatClipTimeForYtdlp(clipRange.startSec)}-${formatClipTimeForYtdlp(clipRange.endSec)}`;

const resolveClipRangeStemPrefix = (
  context: EngineExecutionContext,
  clipRange: YtdlpClipRange | null,
): string | null => {
  if (!clipRange) {
    return null;
  }
  const clipStartMs = Math.max(0, Math.round(clipRange.startSec * 1000));
  const clipEndMs = Math.max(0, Math.round(clipRange.endSec * 1000));
  return `${clipStartMs}-${clipEndMs}_${context.outputStem}`;
};

const resolveYtdlpArtifactPrefixes = (
  context: EngineExecutionContext,
  clipRange: YtdlpClipRange | null,
): string[] => {
  const clipRangePrefix = resolveClipRangeStemPrefix(context, clipRange);
  return clipRangePrefix
    ? [context.outputStem, clipRangePrefix]
    : [context.outputStem];
};

const buildYtdlpOutputTemplate = (
  context: EngineExecutionContext,
  clipRange: YtdlpClipRange | null,
): string => {
  const runtimeConfig = context.config ?? {};
  if (resolveRenameEnabled(runtimeConfig)) {
    return path.join(context.outputDir, `${context.outputStem}.%(ext)s`);
  }

  const clipRangePrefix = resolveClipRangeStemPrefix(context, clipRange);
  if (clipRangePrefix) {
    return path.join(context.outputDir, `${clipRangePrefix}.%(ext)s`);
  }

  const qualityLabel = resolveYtdlpQualityLabel(context.intent.ytdlpQuality);
  return path.join(
    context.outputDir,
    `${context.outputStem}[%(width|unknown)sx%(height|unknown)s][${qualityLabel}].%(ext)s`,
  );
};

export const createYtdlpCommandPlan = (
  context: EngineExecutionContext,
): YtdlpCommandPlan => {
  const clipRange = resolveClipRangeSeconds(context);
  const sourceUrl = context.enginePlan.sourceUrl ?? context.intent.pageUrl ?? context.intent.originalUrl;
  if (!sourceUrl) {
    throw new Error("yt-dlp source URL is missing");
  }
  const youtubeUrl = isYouTubeUrl(sourceUrl);
  const formatProfile = resolveYtdlpFormatProfile(
    context.intent.ytdlpQuality,
    Boolean(context.binaries.ffmpeg),
    { isYouTube: youtubeUrl },
  );

  return {
    sourceUrl,
    isYouTube: youtubeUrl,
    clipRange,
    reportPath: path.join(context.outputDir, `${context.traceId}-after-move.txt`),
    titleReportPath: path.join(context.outputDir, `${context.traceId}-title.txt`),
    outputTemplate: buildYtdlpOutputTemplate(context, clipRange),
    artifactPrefixes: resolveYtdlpArtifactPrefixes(context, clipRange),
    ffmpegDir: path.dirname(context.binaries.ffmpeg),
    formatProfile,
  };
};

export const buildYtdlpCommandArgs = (
  plan: YtdlpCommandPlan,
  options: BuildYtdlpCommandArgsOptions,
): string[] => {
  const manifest = getCliEngineManifest("yt-dlp");
  const args = [
    ...manifest.baseArgs,
    ...manifest.configIsolationArgs,
    ...manifest.progressArgs,
    "-f",
    plan.formatProfile.selector,
    ...manifest.encodingArgs,
    "--print-to-file",
    manifest.progressReport.finalPathPrint,
    plan.reportPath,
    "--print-to-file",
    manifest.progressReport.titlePrint,
    plan.titleReportPath,
    "-o",
    plan.outputTemplate,
  ];

  if (plan.formatProfile.sort) {
    args.push("--format-sort", plan.formatProfile.sort);
  }
  if (plan.formatProfile.mergeOutputFormat) {
    args.push("--merge-output-format", plan.formatProfile.mergeOutputFormat);
  }
  if (options.hasFfmpeg) {
    args.push("--ffmpeg-location", plan.ffmpegDir);
  }
  if (options.selectionScope === "current_item") {
    args.push("--no-playlist");
  }
  if (options.pageUrl) {
    args.push("--add-header", `Referer:${options.pageUrl}`);
  }
  if (plan.clipRange) {
    args.push("--download-sections", buildYtdlpDownloadSectionArg(plan.clipRange));
  }
  if (options.cookiesPath) {
    args.push("--cookies", options.cookiesPath);
  }

  if (plan.isYouTube && options.mode === "extended") {
    args.push(
      ...manifest.youtube.extendedExtractorArgs,
      ...manifest.youtube.remoteComponentsArgs,
    );
    if (options.hasDeno) {
      if (options.platform === "win32") {
        args.push("--js-runtimes", "deno", "--js-runtimes", "node");
      } else {
        args.push("--js-runtimes", "node", "--js-runtimes", "deno");
      }
    }
  } else if (plan.isYouTube) {
    args.push(
      ...manifest.youtube.lightExtractorArgs,
    );
  }

  args.push(plan.sourceUrl);
  return args;
};
