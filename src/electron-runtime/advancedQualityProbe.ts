import path from "node:path";
import { DownloadRuntimeError, type EngineExecutionContext } from "../core/index.js";
import type { AdvancedQualityOptionPayload } from "../types/videoRuntime.js";
import { getCliEngineManifest } from "./engineManifest.js";
import { runCapturedCommand } from "./processRunner.js";
import { cleanupCookiesFile, writeCookiesFile } from "./sidecarCookies.js";
import { summarizeYtDlpFailure } from "./ytDlpErrorSummary.js";
import { appendExtendedYouTubeYtdlpArgs, isYouTubeUrl } from "./ytDlpCommandPlan.js";

type AdvancedQualityInternalOption = AdvancedQualityOptionPayload & {
  selector: string;
};

export type AdvancedQualityProbeResult = {
  options: AdvancedQualityInternalOption[];
};

const RESOLUTION_ALIAS_BY_HEIGHT: Record<number, string> = {
  2160: "4K",
  4320: "8K",
};

const buildQualityLabel = (height: number): string => {
  const alias = RESOLUTION_ALIAS_BY_HEIGHT[height];
  return alias ? `${height}p · ${alias}` : `${height}p`;
};

const buildSelectorForHeight = (height: number): string => (
  `bv*[height=${height}]+ba/b[height=${height}]/best[height=${height}]`
);

const extractFormats = (payload: unknown): Array<Record<string, unknown>> => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }

  const formats = (payload as Record<string, unknown>).formats;
  if (!Array.isArray(formats)) {
    return [];
  }

  return formats.filter((entry): entry is Record<string, unknown> => (
    Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
  ));
};

export const extractAdvancedQualityOptionsFromYtDlpJson = (
  payload: unknown,
): AdvancedQualityProbeResult => {
  const heights = new Set<number>();

  for (const format of extractFormats(payload)) {
    const vcodec = typeof format.vcodec === "string" ? format.vcodec.trim().toLowerCase() : "";
    if (!vcodec || vcodec === "none") {
      continue;
    }

    const height = Number(format.height);
    if (!Number.isFinite(height) || height <= 0) {
      continue;
    }

    heights.add(Math.floor(height));
  }

  const options = Array.from(heights)
    .sort((left, right) => right - left)
    .map((height) => ({
      id: `height_${height}`,
      label: buildQualityLabel(height),
      selector: buildSelectorForHeight(height),
    }));

  return { options };
};

const resolveProbeSourceUrl = (context: EngineExecutionContext): string => {
  const sourceUrl = context.enginePlan.sourceUrl ?? context.intent.pageUrl ?? context.intent.originalUrl;
  if (!sourceUrl) {
    throw new DownloadRuntimeError(
      "E_INVALID_ENGINE_PLAN",
      "Missing source URL for advanced quality probe",
      {
        context: {
          traceId: context.traceId,
          siteId: context.intent.siteId,
        },
      },
    );
  }
  return sourceUrl;
};

export const runAdvancedQualityProbe = async (
  context: EngineExecutionContext,
): Promise<AdvancedQualityProbeResult> => {
  const sourceUrl = resolveProbeSourceUrl(context);
  const manifest = getCliEngineManifest("yt-dlp");
  const youtubeUrl = isYouTubeUrl(sourceUrl);
  const cookiesPath = await writeCookiesFile(context.traceId, context.intent.cookies);
  const args = [
    ...manifest.baseArgs,
    ...manifest.configIsolationArgs,
    ...manifest.encodingArgs,
    "--dump-single-json",
  ];

  if (context.intent.selectionScope === "current_item") {
    args.push("--no-playlist");
  }
  if (context.intent.pageUrl) {
    args.push("--add-header", `Referer:${context.intent.pageUrl}`);
  }
  if (context.proxyUrl) {
    args.push("--proxy", context.proxyUrl);
  }
  if (cookiesPath) {
    args.push("--cookies", cookiesPath);
  }
  if (youtubeUrl) {
    appendExtendedYouTubeYtdlpArgs(args, {
      hasDeno: Boolean(context.binaries.deno),
      platform: process.platform,
    });
  }
  args.push(sourceUrl);

  try {
    const result = await runCapturedCommand(context.binaries.ytDlp, args, {
      env: {
        ...process.env,
        PATH: context.binaries.ffmpeg
          ? `${path.dirname(context.binaries.ffmpeg)}${path.delimiter}${process.env.PATH ?? ""}`
          : process.env.PATH,
      },
      signal: context.abortSignal,
    });

    if (result.exitCode !== 0) {
      throw new DownloadRuntimeError(
        "E_EXECUTION_FAILED",
        summarizeYtDlpFailure(
          result.stderr.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
          `yt-dlp exited with code ${result.exitCode}`,
          { isYouTube: youtubeUrl },
        ),
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(result.stdout);
    } catch (error) {
      throw new DownloadRuntimeError(
        "E_EXECUTION_FAILED",
        "Failed to parse advanced quality probe output",
        {
          cause: error,
        },
      );
    }

    const extracted = extractAdvancedQualityOptionsFromYtDlpJson(parsed);
    if (extracted.options.length === 0) {
      throw new DownloadRuntimeError(
        "E_EXECUTION_FAILED",
        "No usable advanced quality options were found",
      );
    }

    return extracted;
  } finally {
    await cleanupCookiesFile(cookiesPath);
  }
};
