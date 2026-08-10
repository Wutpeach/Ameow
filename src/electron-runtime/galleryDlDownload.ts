import { promises as fs } from "node:fs";
import path from "node:path";
import { DownloadRuntimeError, type DownloadResult } from "../core/index.js";
import { InvalidCommandPlanError } from "./commandPlanErrors.js";
import { classifyEngineFailure } from "./engineErrorClassifier.js";
import type { EngineInvocationContext, GalleryDlRuntimeDependencies } from "./engineExecutionContext.js";
import {
  applyNetworkRouteForContext,
  logNetworkApplication,
  withNetworkFailureClassification,
} from "./engineNetworkAdapters.js";
import {
  classifyNetworkFailure,
  NETWORK_FAILURE_CLASSIFICATIONS,
  redactNetworkCredentials,
  type NetworkRoute,
} from "../config/networkRoute.js";
import { getCliEngineManifest } from "./engineManifest.js";
import { createGalleryDlCommandPlan, isGalleryDlSidecar } from "./galleryDlCommandPlan.js";
import { runStreamingCommand } from "./processRunner.js";
import { summarizeError } from "./runtimeUtils.js";
import { cleanupCookiesFile, writeCookiesFile } from "./sidecarCookies.js";

const manifest = getCliEngineManifest("gallery-dl");

const pushTailLine = (target: string[], line: string): void => {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }
  target.push(trimmed);
  if (target.length > manifest.progress.lineTailLimit) {
    target.shift();
  }
};

const summarizeGalleryDlFailure = (
  exitCode: number,
  stderrLines: string[],
  stdoutLines: string[],
): string => {
  const detail = stderrLines[stderrLines.length - 1] ?? stdoutLines[stdoutLines.length - 1] ?? "";
  if (!detail) {
    return `gallery-dl exited with code ${exitCode}`;
  }
  return `gallery-dl exited with code ${exitCode}: ${detail}`;
};

const normalizeGalleryDlActivity = (line: string): string | null => {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const withoutPrefix = trimmed
    .replace(/^\[gallery-dl\]\[(?:info|warning|debug)\]\s*/i, "")
    .replace(/^\[[^\]]+\]\s*/, "");
  const normalized = withoutPrefix.toLowerCase();

  if (!normalized) {
    return null;
  }

  if (/\b(error|forbidden|failed|traceback|exception)\b/i.test(normalized)) {
    return null;
  }
  if (/\bcollect(?:ing)?\b.*\b(metadata|pin)\b/i.test(normalized)) {
    return "activity:galleryDl.collectingMetadata";
  }
  if (/\b(metadata|extract(?:ing|or)?)\b/i.test(normalized)) {
    return "activity:galleryDl.extractingMedia";
  }
  if (/\b(download|retriev|request|fetch)\b/i.test(normalized)) {
    return "activity:galleryDl.downloadingMedia";
  }
  if (/\b(already exists|already downloaded|exists on disk|skip(ping)?)\b/i.test(normalized)) {
    return "activity:galleryDl.checkingExistingFile";
  }
  if (/\b(write|saving|moving|finaliz|finish)\b/i.test(normalized)) {
    return "activity:galleryDl.savingFile";
  }

  return manifest.progress.resolvingActivity;
};

const collectTaskArtifacts = async (
  outputDir: string,
  outputStem: string,
): Promise<string[]> => (
  await fs.readdir(outputDir).catch(() => [])
).filter((entry) => entry.startsWith(`${outputStem}.`));

const cleanupTaskArtifacts = async (
  outputDir: string,
  beforeFiles: Set<string>,
  outputStem: string,
): Promise<void> => {
  const afterFiles = await collectTaskArtifacts(outputDir, outputStem);
  await Promise.all(afterFiles
    .filter((entry) => !beforeFiles.has(entry))
    .map((entry) => fs.unlink(path.join(outputDir, entry)).catch(() => undefined)));
};

export const runGalleryDlDownload = async (
  context: EngineInvocationContext<GalleryDlRuntimeDependencies>,
): Promise<DownloadResult> => {
  let commandPlan: ReturnType<typeof createGalleryDlCommandPlan>;
  try {
    commandPlan = createGalleryDlCommandPlan(context);
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

  if (!context.binaries.galleryDl) {
    throw new DownloadRuntimeError(
      "E_ENGINE_UNAVAILABLE",
      "gallery-dl binary is missing",
      {
        context: { sourceUrl: commandPlan.sourceUrl },
      },
    );
  }

  const beforeFiles = new Set(await collectTaskArtifacts(context.outputDir, context.outputStem));
  const args = [...commandPlan.args];

  await context.onProgress({
    traceId: context.traceId,
    percent: 0,
    stage: "preparing",
    speed: "Starting...",
    eta: "",
  });

  // One stable route per Job, applied exactly once via the gallery-dl
  // adapter. Every invocation includes `-o extractor.*.proxy-env=false` so
  // Requests cannot discover a second routing authority from the environment
  // or the Windows Registry; direct is an explicit `--proxy ""`. The actual
  // applied/rejected outcome is reported for per-download diagnostics.
  const networkApplication = applyNetworkRouteForContext(
    "gallery-dl",
    context.network,
    {
      mode: "direct",
      source: "direct",
      reason: "no_proxy_source",
      resolvedFor: commandPlan.sourceUrl,
    } satisfies NetworkRoute,
    context.onNetworkApplication,
  );
  logNetworkApplication(networkApplication.diagnostic);
  args.push(...networkApplication.args);

  let cookiesPath: string | null = null;
  try {
    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];
    let lastActivityLabel: string | null = null;
    const emitGalleryDlActivity = async (line?: string): Promise<void> => {
      const activity = line ? normalizeGalleryDlActivity(line) : manifest.progress.resolvingActivity;
      if (!activity || activity === lastActivityLabel) {
        return;
      }
      lastActivityLabel = activity;
      await context.onProgress({
        traceId: context.traceId,
        percent: -1,
        stage: "downloading",
        speed: activity,
        eta: "",
      });
    };
    cookiesPath = await writeCookiesFile(context.traceId, context.cookies);
    if (cookiesPath) {
      args.unshift(cookiesPath);
      args.unshift("--cookies");
    }
    await emitGalleryDlActivity();
    const exitCode = await runStreamingCommand(context.binaries.galleryDl, args, {
      env: networkApplication.env,
      signal: context.abortSignal,
      onStdoutLine: async (line: string) => {
        pushTailLine(stdoutLines, line);
        if (!line.trim()) {
          return;
        }
        await emitGalleryDlActivity(line);
      },
      onStderrLine: async (line: string) => {
        pushTailLine(stderrLines, line);
        await emitGalleryDlActivity(line);
      },
    });

    if (exitCode !== 0) {
      const failureSummary = summarizeGalleryDlFailure(exitCode, stderrLines, stdoutLines);
      const classification = classifyNetworkFailure(new Error(failureSummary), stderrLines);
      const redactedSummary = redactNetworkCredentials(failureSummary);
      const redactedStderrTail = stderrLines.map((line) => redactNetworkCredentials(line));
      const redactedStdoutTail = stdoutLines.map((line) => redactNetworkCredentials(line));
      throw new DownloadRuntimeError(
        "E_EXECUTION_FAILED",
        redactedSummary,
        {
          // Raw evidence is classified here (Infrastructure); Application
          // fallback consumes only the stable classification below.
          classification: classifyEngineFailure({
            message: redactedSummary,
            context: { stderrTail: redactedStderrTail, stdoutTail: redactedStdoutTail },
          }),
          context: {
            sourceUrl: commandPlan.sourceUrl,
            stderrTail: redactedStderrTail,
            stdoutTail: redactedStdoutTail,
            ...(classification !== NETWORK_FAILURE_CLASSIFICATIONS.UNKNOWN
              ? { networkFailureClassification: classification }
              : {}),
          },
        },
      );
    }

    const afterFiles = await fs.readdir(context.outputDir).catch(() => []);
    const created = afterFiles
      .filter((entry) => entry.startsWith(commandPlan.outputFilePrefix))
      .filter((entry) => !beforeFiles.has(entry))
      .filter((entry) => !isGalleryDlSidecar(entry, context.outputStem));

    const finalPath = created[0] ? path.join(context.outputDir, created[0]) : null;

    if (!finalPath) {
      throw new DownloadRuntimeError(
        "E_OUTPUT_NOT_FOUND",
        "gallery-dl finished without producing an output file",
        {
          context: { sourceUrl: commandPlan.sourceUrl, outputDir: context.outputDir },
        },
      );
    }

    return {
      traceId: context.traceId,
      success: true,
      filePath: finalPath,
    };
  } catch (error) {
    await context.reportNetworkProxyFailure?.(error);
    await cleanupTaskArtifacts(context.outputDir, beforeFiles, context.outputStem);
    if (error instanceof DownloadRuntimeError) {
      const existing = error.context?.networkFailureClassification;
      const classification = typeof existing === "string"
        ? null
        : context.abortSignal.aborted
          ? null
          : classifyNetworkFailure(error);
      throw withNetworkFailureClassification(
        error,
        classification === NETWORK_FAILURE_CLASSIFICATIONS.UNKNOWN ? null : classification,
      );
    }
    const classification = context.abortSignal.aborted
      ? null
      : classifyNetworkFailure(error);
    const redactedMessage = redactNetworkCredentials(summarizeError(error));
    throw new DownloadRuntimeError(
      "E_EXECUTION_FAILED",
      redactedMessage,
      {
        cause: error,
        classification: classifyEngineFailure({ message: redactedMessage }),
        context: classification === NETWORK_FAILURE_CLASSIFICATIONS.UNKNOWN
          ? undefined
          : classification
            ? { networkFailureClassification: classification }
            : undefined,
      },
    );
  } finally {
    await cleanupCookiesFile(cookiesPath);
  }
};
