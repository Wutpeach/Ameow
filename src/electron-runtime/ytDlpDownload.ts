import { promises as fs } from "node:fs";
import path from "node:path";
import { DownloadRuntimeError, type EngineExecutionContext } from "../core/index.js";
import { InvalidCommandPlanError } from "./commandPlanErrors.js";
import { buildYtdlpCommandArgs, createYtdlpCommandPlan } from "./ytDlpCommandPlan.js";
import { runStreamingCommand } from "./processRunner.js";
import { parseYtDlpProgressLine } from "./ytDlpProgress.js";
import { summarizeError } from "./runtimeUtils.js";
import type { DownloadResultPayload } from "../types/videoRuntime.js";
import { cleanupCookiesFile, writeCookiesFile } from "./sidecarCookies.js";

const YTDLP_ACTIVITY_FALLBACK = "Resolving media...";

const isInjectionDebugEnabled = (config: Record<string, unknown>): boolean =>
  config.extensionInjectionDebugEnabled === true;

const formatElapsedMs = (startedAtMs: number): string => `${Date.now() - startedAtMs}ms`;

const resolveClipDurationSec = (clipRange: { startSec: number; endSec: number } | null): number | null => {
  if (!clipRange) {
    return null;
  }
  const duration = clipRange.endSec - clipRange.startSec;
  return Number.isFinite(duration) && duration > 0 ? duration : null;
};

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
  const taskStartedAtMs = Date.now();
  let commandPlan: ReturnType<typeof createYtdlpCommandPlan>;
  try {
    commandPlan = createYtdlpCommandPlan(context);
  } catch (error) {
    if (!(error instanceof InvalidCommandPlanError)) {
      throw error;
    }
    throw new DownloadRuntimeError(
      "E_INVALID_ENGINE_PLAN",
      error.message,
      {
        context: {
          providerId: context.plan.providerId,
          traceId: context.traceId,
        },
      },
    );
  }

  const beforeFiles = new Set(await collectTaskArtifacts(context.outputDir, commandPlan.artifactPrefixes));
  logYtDlpTiming("task start", {
    traceId: context.traceId,
    siteId: context.intent.siteId,
    quality: context.intent.videoQuality ?? "best",
    sourceUrl: commandPlan.sourceUrl,
    isYouTube: commandPlan.isYouTube,
    formatSelectorLength: commandPlan.formatProfile.selector.length,
  });
  const clipDurationSec = resolveClipDurationSec(commandPlan.clipRange);
  const stderrLines: string[] = [];

  const runAttempt = async (): Promise<DownloadResultPayload> => {
    if (context.abortSignal.aborted) {
      throw new Error("Download cancelled");
    }
    const attemptStartedAtMs = Date.now();

    const cookiesPath = await writeCookiesFile(context.traceId, context.intent.cookies);
    const args = buildYtdlpCommandArgs(commandPlan, {
      cookiesPath,
      hasFfmpeg: Boolean(context.binaries.ffmpeg),
      hasDeno: Boolean(context.binaries.deno),
      selectionScope: context.intent.selectionScope,
      pageUrl: context.intent.pageUrl,
      platform: process.platform,
    });

    if (isInjectionDebugEnabled(context.config)) {
      logInjectedDownloadDebug("yt-dlp invocation", {
        traceId: context.traceId,
        ytDlpBinaryPath: context.binaries.ytDlp,
        ffmpegBinaryPath: context.binaries.ffmpeg,
        denoBinaryPath: context.binaries.deno,
        sourceUrl: commandPlan.sourceUrl,
        originalUrl: context.intent.originalUrl,
        pageUrl: context.intent.pageUrl ?? null,
        selectionScope: context.intent.selectionScope ?? null,
        siteId: context.intent.siteId,
        titlePresent: Boolean(context.intent.title),
        cookiesPresent: Boolean(context.intent.cookies?.trim()),
        cookiesPath,
        videoQuality: context.intent.videoQuality ?? null,
        formatSelector: commandPlan.formatProfile.selector,
        formatSort: commandPlan.formatProfile.sort,
        mergeOutputFormat: commandPlan.formatProfile.mergeOutputFormat,
        youtubeMode: "extended",
        args,
      });
    }

    logYtDlpTiming("attempt start", {
      traceId: context.traceId,
      mode: "extended",
      elapsedMs: formatElapsedMs(taskStartedAtMs),
      selectorLength: commandPlan.formatProfile.selector.length,
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
          PATH: commandPlan.ffmpegDir
            ? `${commandPlan.ffmpegDir}${path.delimiter}${process.env.PATH ?? ""}`
            : process.env.PATH,
        },
        signal: context.abortSignal,
        onStdoutLine: async (line: string) => {
          const progress = parseYtDlpProgressLine(context.traceId, line, { clipDurationSec });
          if (progress) {
            emittedActivity = true;
            if (!loggedFirstProgress) {
              loggedFirstProgress = true;
              logYtDlpTiming("first download progress", {
                traceId: context.traceId,
                mode: "extended",
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
                mode: "extended",
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
          const progress = parseYtDlpProgressLine(context.traceId, line, { clipDurationSec });
          if (progress) {
            emittedActivity = true;
            if (!loggedFirstProgress) {
              loggedFirstProgress = true;
              logYtDlpTiming("first download progress", {
                traceId: context.traceId,
                mode: "extended",
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
          if (line.trim()) {
            stderrLines.push(line.trim());
          }
          const activity = normalizeYtDlpActivity(line);
          if (activity && !emittedActivity) {
            if (!loggedFirstActivity) {
              loggedFirstActivity = true;
              logYtDlpTiming("first extractor activity", {
                traceId: context.traceId,
                mode: "extended",
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

      const reportedPath = await readReportedValue(commandPlan.reportPath);
      const reportedTitle = await readReportedValue(commandPlan.titleReportPath);
      logYtDlpTiming("attempt finished", {
        traceId: context.traceId,
        mode: "extended",
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
        throw new DownloadRuntimeError(
          "E_OUTPUT_NOT_FOUND",
          "yt-dlp exited successfully but produced no final output path",
          {
            context: {
              sourceUrl: commandPlan.sourceUrl,
              traceId: context.traceId,
            },
          },
        );
      }
      logYtDlpTiming("task success", {
        traceId: context.traceId,
        elapsedMs: formatElapsedMs(taskStartedAtMs),
        mode: "extended",
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
      await fs.unlink(commandPlan.reportPath).catch(() => undefined);
      await fs.unlink(commandPlan.titleReportPath).catch(() => undefined);
    }
  };

  try {
    return await runAttempt();
  } catch (error) {
    if (isInjectionDebugEnabled(context.config)) {
      logInjectedDownloadDebug("yt-dlp failed", {
        traceId: context.traceId,
        sourceUrl: commandPlan.sourceUrl,
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
    await cleanupTaskArtifacts(context.outputDir, beforeFiles, commandPlan.artifactPrefixes);
    if (error instanceof DownloadRuntimeError) {
      throw error;
    }
    throw new Error(summarizeError(error));
  }
};
