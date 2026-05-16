import { promises as fs } from "node:fs";
import path from "node:path";
import type { EngineExecutionContext, YtdlpQualityPreference } from "../core/index.js";
import { getCliEngineManifest, resolveYtdlpFormatProfile } from "./engineManifest.js";
import { runStreamingCommand } from "./processRunner.js";
import { parseYtDlpProgressLine } from "./ytDlpProgress.js";
import { summarizeError } from "./runtimeUtils.js";
import type { DownloadResultPayload } from "../types/videoRuntime.js";
import { cleanupCookiesFile, writeCookiesFile } from "./sidecarCookies.js";
import { resolveRenameEnabled } from "./renameRules.js";

const isYouTubeUrl = (value: string): boolean =>
  value.includes("youtube.com/") || value.includes("youtu.be/");

type YouTubeMode = "light" | "extended";

const RETRY_WITH_EXTENDED_YOUTUBE_PATTERNS = [
  /\bcookies?\b/i,
  /\blog(?:in|ged in)\b/i,
  /\bsign(?:ed)? in\b/i,
  /\bnot a bot\b/i,
  /\bconfirm you're not a bot\b/i,
  /\bauth(?:entication|orization)?\b/i,
  /\brequires?\s+(?:login|cookies|authentication|authorization)\b/i,
  /\bnsig\b/i,
  /\bsignature\b/i,
  /\bplayer response\b/i,
  /\bplayer api\b/i,
  /\bextractor\b/i,
];

const asObject = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const resolveInitialYouTubeMode = (context: EngineExecutionContext): YouTubeMode => {
  const youtubeExtensionData = asObject(asObject(context.intent.extensionData).youtube);
  if (youtubeExtensionData.forceExtended === true) {
    return "extended";
  }

  if (context.intent.cookies?.trim()) {
    return "extended";
  }

  return "light";
};

const shouldRetryWithExtendedYouTubeMode = (error: unknown): boolean => {
  const message = summarizeError(error);
  return RETRY_WITH_EXTENDED_YOUTUBE_PATTERNS.some((pattern) => pattern.test(message));
};

const YTDLP_ACTIVITY_FALLBACK = "Resolving media...";

const isInjectionDebugEnabled = (config: Record<string, unknown>): boolean =>
  config.extensionInjectionDebugEnabled === true;

const formatElapsedMs = (startedAtMs: number): string => `${Date.now() - startedAtMs}ms`;

const toSafeLogDetails = (payload: unknown): string => {
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
};

const logYtDlpTiming = (message: string, payload: Record<string, unknown>): void => {
  console.log(`>>> [yt-dlp timing] ${message}: ${toSafeLogDetails(payload)}`);
};

const logInjectedDownloadDebug = (message: string, payload: unknown): void => {
  console.log(`>>> [InjectedDownloadDebug] ${message}: ${toSafeLogDetails(payload)}`);
};

const isYtDlpPostProcessingLine = (line: string): boolean => {
  const normalized = line.toLowerCase();
  return normalized.includes("post-process")
    || normalized.includes("embedding metadata")
    || normalized.includes("deleting original file");
};

const normalizeYtDlpActivity = (line: string): string | null => {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.toLowerCase();
  if (
    normalized.includes("[download]")
    || normalized.includes("merging")
    || isYtDlpPostProcessingLine(normalized)
  ) {
    return null;
  }

  if (
    /\b(extracting|downloading webpage|downloading player|downloading m3u8|downloading android player api json|downloading tv player api json|downloading web creator player api json|downloading ios player api json|downloading player api json|downloading video info webpage|requesting|retrieving)\b/i
      .test(normalized)
  ) {
    return YTDLP_ACTIVITY_FALLBACK;
  }

  return null;
};

const readReportedValue = async (reportPath: string): Promise<string | null> => {
  try {
    const raw = await fs.readFile(reportPath, "utf8");
    const resolved = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    return resolved ?? null;
  } catch {
    return null;
  }
};

const collectTaskArtifacts = async (
  outputDir: string,
  outputStemPrefixes: string[],
): Promise<string[]> => (
  await fs.readdir(outputDir).catch(() => [])
).filter((entry) => outputStemPrefixes.some((prefix) => (
  entry.startsWith(`${prefix}.`) || entry.startsWith(`${prefix}[`)
)));

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
): { startSec: number; endSec: number } | null => {
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
  clipRange: { startSec: number; endSec: number },
): string => `*${formatClipTimeForYtdlp(clipRange.startSec)}-${formatClipTimeForYtdlp(clipRange.endSec)}`;

const resolveClipRangeStemPrefix = (
  context: EngineExecutionContext,
  clipRange: { startSec: number; endSec: number } | null,
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
  clipRange: { startSec: number; endSec: number } | null,
): string[] => {
  const clipRangePrefix = resolveClipRangeStemPrefix(context, clipRange);
  return clipRangePrefix
    ? [context.outputStem, clipRangePrefix]
    : [context.outputStem];
};

const buildYtdlpOutputTemplate = (
  context: EngineExecutionContext,
  clipRange: { startSec: number; endSec: number } | null,
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

const cleanupTaskArtifacts = async (
  outputDir: string,
  beforeFiles: Set<string>,
  outputStemPrefixes: string[],
): Promise<void> => {
  const afterFiles = await collectTaskArtifacts(outputDir, outputStemPrefixes);
  await Promise.all(afterFiles
    .filter((entry) => !beforeFiles.has(entry))
    .map((entry) => fs.unlink(path.join(outputDir, entry)).catch(() => undefined)));
};

export const runYtDlpDownload = async (
  context: EngineExecutionContext,
): Promise<DownloadResultPayload> => {
  const manifest = getCliEngineManifest("yt-dlp");
  const taskStartedAtMs = Date.now();
  const clipRange = resolveClipRangeSeconds(context);
  const reportPath = path.join(context.outputDir, `${context.traceId}-after-move.txt`);
  const titleReportPath = path.join(context.outputDir, `${context.traceId}-title.txt`);
  const outputTemplate = buildYtdlpOutputTemplate(context, clipRange);
  const artifactPrefixes = resolveYtdlpArtifactPrefixes(context, clipRange);
  const beforeFiles = new Set(await collectTaskArtifacts(context.outputDir, artifactPrefixes));
  const ffmpegDir = path.dirname(context.binaries.ffmpeg);
  const sourceUrl = context.enginePlan.sourceUrl ?? context.intent.pageUrl ?? context.intent.originalUrl;
  if (!sourceUrl) {
    throw new Error("yt-dlp source URL is missing");
  }
  const formatProfile = resolveYtdlpFormatProfile(
    context.intent.ytdlpQuality,
    Boolean(context.binaries.ffmpeg),
    { isYouTube: isYouTubeUrl(sourceUrl) },
  );
  logYtDlpTiming("task start", {
    traceId: context.traceId,
    siteId: context.intent.siteId,
    quality: context.intent.ytdlpQuality ?? "best",
    sourceUrl,
    isYouTube: isYouTubeUrl(sourceUrl),
    formatSelectorLength: formatProfile.selector.length,
  });

  const stderrLines: string[] = [];
  const runAttempt = async (mode: YouTubeMode): Promise<DownloadResultPayload> => {
    if (context.abortSignal.aborted) {
      throw new Error("Download cancelled");
    }
    const attemptStartedAtMs = Date.now();

    const args = [
      ...manifest.baseArgs,
      ...manifest.configIsolationArgs,
      ...manifest.progressArgs,
      "-f",
      formatProfile.selector,
      ...manifest.encodingArgs,
      "--print-to-file",
      manifest.progressReport.finalPathPrint,
      reportPath,
      "--print-to-file",
      manifest.progressReport.titlePrint,
      titleReportPath,
      "-o",
      outputTemplate,
    ];

    if (formatProfile.sort) {
      args.push("--format-sort", formatProfile.sort);
    }
    if (formatProfile.mergeOutputFormat) {
      args.push("--merge-output-format", formatProfile.mergeOutputFormat);
    }
    if (context.binaries.ffmpeg) {
      args.push("--ffmpeg-location", ffmpegDir);
    }
    if (context.intent.selectionScope === "current_item") {
      args.push("--no-playlist");
    }
    if (context.intent.pageUrl) {
      args.push("--add-header", `Referer:${context.intent.pageUrl}`);
    }
    if (clipRange) {
      args.push("--download-sections", buildYtdlpDownloadSectionArg(clipRange));
    }

    const cookiesPath = await writeCookiesFile(context.traceId, context.intent.cookies);
    if (cookiesPath) {
      args.push("--cookies", cookiesPath);
    }

    if (isYouTubeUrl(sourceUrl) && mode === "extended") {
      args.push(
        ...manifest.youtube.extendedExtractorArgs,
        ...manifest.youtube.remoteComponentsArgs,
      );
      if (context.binaries.deno) {
        if (process.platform === "win32") {
          args.push("--js-runtimes", "deno", "--js-runtimes", "node");
        } else {
          args.push("--js-runtimes", "node", "--js-runtimes", "deno");
        }
      }
    } else if (isYouTubeUrl(sourceUrl)) {
      args.push(
        ...manifest.youtube.lightExtractorArgs,
      );
    }
    args.push(sourceUrl);

    if (isInjectionDebugEnabled(context.config)) {
      logInjectedDownloadDebug("yt-dlp invocation", {
        traceId: context.traceId,
        ytDlpBinaryPath: context.binaries.ytDlp,
        ffmpegBinaryPath: context.binaries.ffmpeg,
        denoBinaryPath: context.binaries.deno,
        sourceUrl,
        originalUrl: context.intent.originalUrl,
        pageUrl: context.intent.pageUrl ?? null,
        selectionScope: context.intent.selectionScope ?? null,
        siteId: context.intent.siteId,
        titlePresent: Boolean(context.intent.title),
        cookiesPresent: Boolean(context.intent.cookies?.trim()),
        cookiesPath,
        ytdlpQuality: context.intent.ytdlpQuality ?? null,
        formatSelector: formatProfile.selector,
        formatSort: formatProfile.sort,
        mergeOutputFormat: formatProfile.mergeOutputFormat,
        youtubeMode: mode,
        args,
      });
    }
    logYtDlpTiming("attempt start", {
      traceId: context.traceId,
      mode,
      elapsedMs: formatElapsedMs(taskStartedAtMs),
      selectorLength: formatProfile.selector.length,
      hasCookies: Boolean(cookiesPath),
      selectionScope: context.intent.selectionScope ?? null,
    });

    try {
      let emittedActivity = false;
      let loggedFirstActivity = false;
      let loggedFirstProgress = false;
      const exitCode = await runStreamingCommand(context.binaries.ytDlp, args, {
        env: {
          ...process.env,
          PATH: ffmpegDir
            ? `${ffmpegDir}${path.delimiter}${process.env.PATH ?? ""}`
            : process.env.PATH,
        },
        signal: context.abortSignal,
        onStdoutLine: async (line: string) => {
          const progress = parseYtDlpProgressLine(context.traceId, line);
          if (progress) {
            emittedActivity = true;
            if (!loggedFirstProgress) {
              loggedFirstProgress = true;
              logYtDlpTiming("first download progress", {
                traceId: context.traceId,
                mode,
                elapsedMs: formatElapsedMs(taskStartedAtMs),
                attemptElapsedMs: formatElapsedMs(attemptStartedAtMs),
                percent: progress.percent,
                stage: progress.stage,
                speed: progress.speed,
              });
            }
            await context.onProgress(progress);
            return;
          }
          const activity = normalizeYtDlpActivity(line);
          if (activity && !emittedActivity) {
            if (!loggedFirstActivity) {
              loggedFirstActivity = true;
              logYtDlpTiming("first extractor activity", {
                traceId: context.traceId,
                mode,
                elapsedMs: formatElapsedMs(taskStartedAtMs),
                attemptElapsedMs: formatElapsedMs(attemptStartedAtMs),
                activity,
                line: line.trim().slice(0, 160),
              });
            }
            await context.onProgress({
              traceId: context.traceId,
              percent: -1,
              stage: "preparing",
              speed: activity,
              eta: "",
            });
          }
        },
        onStderrLine: async (line: string) => {
          if (line.trim()) {
            stderrLines.push(line.trim());
          }
          const activity = normalizeYtDlpActivity(line);
          if (activity && !emittedActivity) {
            if (!loggedFirstActivity) {
              loggedFirstActivity = true;
              logYtDlpTiming("first extractor activity", {
                traceId: context.traceId,
                mode,
                elapsedMs: formatElapsedMs(taskStartedAtMs),
                attemptElapsedMs: formatElapsedMs(attemptStartedAtMs),
                activity,
                line: line.trim().slice(0, 160),
              });
            }
            await context.onProgress({
              traceId: context.traceId,
              percent: -1,
              stage: "preparing",
              speed: activity,
              eta: "",
            });
          }
        },
      });

      const reportedPath = await readReportedValue(reportPath);
      const reportedTitle = await readReportedValue(titleReportPath);
      logYtDlpTiming("attempt finished", {
        traceId: context.traceId,
        mode,
        elapsedMs: formatElapsedMs(taskStartedAtMs),
        attemptElapsedMs: formatElapsedMs(attemptStartedAtMs),
        exitCode,
        reportedPathPresent: Boolean(reportedPath),
        reportedTitlePresent: Boolean(reportedTitle),
      });
      if (exitCode !== 0) {
        throw new Error(stderrLines[stderrLines.length - 1] ?? `yt-dlp exited with code ${exitCode}`);
      }
      if (!reportedPath) {
        throw new Error("yt-dlp exited successfully but produced no final output path");
      }
      logYtDlpTiming("task success", {
        traceId: context.traceId,
        elapsedMs: formatElapsedMs(taskStartedAtMs),
        mode,
        filePath: reportedPath,
      });

      return {
        traceId: context.traceId,
        success: true,
        file_path: reportedPath,
        title: reportedTitle ?? undefined,
      };
    } finally {
      await cleanupCookiesFile(cookiesPath);
      await fs.unlink(reportPath).catch(() => undefined);
      await fs.unlink(titleReportPath).catch(() => undefined);
    }
  };

  try {
    const initialMode = isYouTubeUrl(sourceUrl)
      ? resolveInitialYouTubeMode(context)
      : "light";
    try {
      return await runAttempt(initialMode);
    } catch (error) {
      if (
        isYouTubeUrl(sourceUrl)
        && initialMode === "light"
        && !context.abortSignal.aborted
        && shouldRetryWithExtendedYouTubeMode(error)
      ) {
        if (isInjectionDebugEnabled(context.config)) {
          logInjectedDownloadDebug("yt-dlp retrying with extended youtube mode", {
            traceId: context.traceId,
            sourceUrl,
            fallbackReason: summarizeError(error),
          });
        }
        logYtDlpTiming("fallback to extended", {
          traceId: context.traceId,
          elapsedMs: formatElapsedMs(taskStartedAtMs),
          reason: summarizeError(error),
        });
        await cleanupTaskArtifacts(context.outputDir, beforeFiles, artifactPrefixes);
        stderrLines.length = 0;
        await context.onProgress({
          traceId: context.traceId,
          percent: -1,
          stage: "preparing",
          speed: manifest.youtube.retryingCompatibleExtractorActivity,
          eta: "",
        });
        return await runAttempt("extended");
      }
      throw error;
    }
  } catch (error) {
    if (isInjectionDebugEnabled(context.config)) {
      logInjectedDownloadDebug("yt-dlp failed", {
        traceId: context.traceId,
        sourceUrl,
        error: summarizeError(error),
        stderrTail: stderrLines.slice(-5),
      });
    }
    logYtDlpTiming("task failed", {
      traceId: context.traceId,
      elapsedMs: formatElapsedMs(taskStartedAtMs),
      error: summarizeError(error),
      stderrTail: stderrLines.slice(-3),
    });
    await cleanupTaskArtifacts(context.outputDir, beforeFiles, artifactPrefixes);
    throw new Error(summarizeError(error));
  }
};
