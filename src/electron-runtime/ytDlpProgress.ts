import type { DownloadProgress, DownloadStage } from "../core/index.js";

const percentPattern = /\[download\]\s+(\d+(?:\.\d+)?)%/i;
const speedPattern = /at\s+(.+?)\s+ETA/i;
const etaPattern = /ETA\s+([0-9:]+)/i;
const ffmpegTimePattern = /\btime=([0-9:.]+)/i;
const ffmpegSpeedPattern = /\bspeed=\s*([0-9.]+x)/i;

type YtDlpProgressParseOptions = {
  clipDurationSec?: number | null;
};

const trimOrEmpty = (value: string | undefined): string => value?.trim() ?? "";

const isPostProcessingLine = (line: string): boolean => {
  const normalized = line.toLowerCase();
  return normalized.includes("post-process")
    || normalized.includes("embedding metadata")
    || normalized.includes("deleting original file");
};

const stageFromLine = (line: string): DownloadStage => {
  const normalized = line.toLowerCase();
  if (normalized.includes("merging")) {
    return "merging";
  }
  if (isPostProcessingLine(normalized)) {
    return "post_processing";
  }
  if (normalized.includes("[download]")) {
    return "downloading";
  }
  return "preparing";
};

const parseTimestampSeconds = (value: string | undefined): number | null => {
  if (!value) {
    return null;
  }

  const parts = value.trim().split(":");
  if (parts.length !== 3) {
    return null;
  }

  const [rawHours, rawMinutes, rawSeconds] = parts;
  const hours = Number(rawHours);
  const minutes = Number(rawMinutes);
  const seconds = Number(rawSeconds);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }

  return (hours * 3600) + (minutes * 60) + seconds;
};

const parseFfmpegClipProgressLine = (
  traceId: string,
  line: string,
  clipDurationSec: number | null | undefined,
): DownloadProgress | null => {
  if (typeof clipDurationSec !== "number" || !Number.isFinite(clipDurationSec) || clipDurationSec <= 0) {
    return null;
  }

  const elapsedSec = parseTimestampSeconds(ffmpegTimePattern.exec(line)?.[1]);
  if (elapsedSec === null) {
    return null;
  }

  const percent = Math.max(0, Math.min(99, (elapsedSec / clipDurationSec) * 100));
  return {
    traceId,
    percent,
    stage: "downloading",
    speed: trimOrEmpty(ffmpegSpeedPattern.exec(line)?.[1]) || "downloading",
    eta: "",
  };
};

export const parseYtDlpProgressLine = (
  traceId: string,
  line: string,
  options: YtDlpProgressParseOptions = {},
): DownloadProgress | null => {
  const normalized = line.toLowerCase();
  const ffmpegProgress = parseFfmpegClipProgressLine(traceId, line, options.clipDurationSec);
  if (ffmpegProgress) {
    return ffmpegProgress;
  }

  if (
    normalized.includes("[download]")
    && (
      normalized.includes("downloading section")
      || normalized.includes("destination:")
    )
  ) {
    return {
      traceId,
      percent: -1,
      stage: "downloading",
      speed: "Downloading media...",
      eta: "",
    };
  }

  const percentMatch = percentPattern.exec(line);
  const percent = percentMatch ? Number(percentMatch[1]) : null;
  if (
    percent === null
    && !normalized.includes("merging")
    && !isPostProcessingLine(normalized)
  ) {
    return null;
  }

  return {
    traceId,
    percent: percent ?? 100,
    stage: stageFromLine(line),
    speed: trimOrEmpty(speedPattern.exec(line)?.[1]) || stageFromLine(line),
    eta: trimOrEmpty(etaPattern.exec(line)?.[1]),
  };
};

