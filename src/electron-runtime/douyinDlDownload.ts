import { promises as fs } from "node:fs";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";
import { DownloadRuntimeError, type EngineExecutionContext } from "../core/index.js";
import { InvalidCommandPlanError } from "./commandPlanErrors.js";
import {
  buildDouyinCookieYamlLines,
  parseDouyinCookies,
} from "./douyinSession.js";
import { runStreamingCommand } from "./processRunner.js";
import { summarizeError } from "./runtimeUtils.js";
import type { DownloadResultPayload } from "../types/videoRuntime.js";

const SIDE_CAR_EXTENSIONS = new Set([
  ".json",
  ".jsonl",
  ".txt",
  ".yaml",
  ".yml",
  ".db",
  ".sqlite",
  ".part",
  ".tmp",
]);

const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mov",
  ".m4v",
  ".flv",
  ".mkv",
  ".webm",
]);

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
]);

const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".m4a",
  ".aac",
]);

const DOUYIN_DL_MANIFEST_NAME = "download_manifest.jsonl";

const buildDouyinDlEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  PYTHONIOENCODING: "utf-8",
  PYTHONUTF8: "1",
});

const sanitizeOutputLine = (line: string): string => stripVTControlCharacters(line).trim();

const captureOutputLine = (lines: string[], tail: string[], line: string): void => {
  const normalized = sanitizeOutputLine(line);
  if (!normalized) {
    return;
  }
  lines.push(normalized);
  tail.push(normalized);
  if (tail.length > 10) {
    tail.shift();
  }
};

const toYamlScalar = (value: string): string => JSON.stringify(value);

type DouyinDlSummary = {
  total: number | null;
  success: number;
  failed: number;
  skipped: number;
};

type DouyinDlManifestRecord = {
  aweme_id?: unknown;
  file_paths?: unknown;
  file_names?: unknown;
};

const parseDouyinDlSummary = (lines: string[]): DouyinDlSummary | null => {
  let total: number | null = null;
  let success: number | null = null;
  let failed: number | null = null;
  let skipped: number | null = null;

  for (const line of lines) {
    const englishSummaryMatch = line.match(
      /Total:\s*(\d+)\s*,\s*Success:\s*(\d+)\s*,\s*Failed:\s*(\d+)\s*,\s*Skipped:\s*(\d+)/i,
    );
    if (englishSummaryMatch) {
      return {
        total: Number(englishSummaryMatch[1]),
        success: Number(englishSummaryMatch[2]),
        failed: Number(englishSummaryMatch[3]),
        skipped: Number(englishSummaryMatch[4]),
      };
    }

    const chineseSummaryMatch = line.match(/成功\s*(\d+)\s*\/\s*失败\s*(\d+)\s*\/\s*跳过\s*(\d+)/);
    if (chineseSummaryMatch) {
      success = Number(chineseSummaryMatch[1]);
      failed = Number(chineseSummaryMatch[2]);
      skipped = Number(chineseSummaryMatch[3]);
      continue;
    }

    const totalRowMatch = line.match(/(?:^|[|│])\s*Total\s*(?:[|│])\s*(\d+)\s*(?:[|│]|$)/i);
    if (totalRowMatch) {
      total = Number(totalRowMatch[1]);
      continue;
    }

    const successRowMatch = line.match(/(?:^|[|│])\s*Success\s*(?:[|│])\s*(\d+)\s*(?:[|│]|$)/i);
    if (successRowMatch) {
      success = Number(successRowMatch[1]);
      continue;
    }

    const failedRowMatch = line.match(/(?:^|[|│])\s*Failed\s*(?:[|│])\s*(\d+)\s*(?:[|│]|$)/i);
    if (failedRowMatch) {
      failed = Number(failedRowMatch[1]);
      continue;
    }

    const skippedRowMatch = line.match(/(?:^|[|│])\s*Skipped\s*(?:[|│])\s*(\d+)\s*(?:[|│]|$)/i);
    if (skippedRowMatch) {
      skipped = Number(skippedRowMatch[1]);
    }
  }

  if (success === null && failed === null && skipped === null && total === null) {
    return null;
  }

  return {
    total,
    success: success ?? 0,
    failed: failed ?? 0,
    skipped: skipped ?? 0,
  };
};

const isSummaryNoiseLine = (line: string): boolean => {
  if (!line) {
    return true;
  }
  if (/^(?:[╔╗╚╝║═┌┐└┘├┤┬┴┼─│\s])+$/u.test(line)) {
    return true;
  }
  if (/^=== Overall Summary ===$/i.test(line)) {
    return true;
  }
  if (/^Download Summary$/i.test(line)) {
    return true;
  }
  if (/^(?:Metric|Count)\b/i.test(line)) {
    return true;
  }
  if (/^(?:Total|Success|Failed|Skipped|Success Rate)\b/i.test(line)) {
    return true;
  }
  return false;
};

const pickDiagnosticLine = (...lineGroups: string[][]): string | null => {
  const errorMatchers = [
    /\bERROR\b/i,
    /\bRequest failed\b/i,
    /\bFailed to\b/i,
    /\banti-bot\b/i,
    /\bHTTP\b/i,
    /失败/u,
  ];

  for (const matcher of errorMatchers) {
    for (const group of lineGroups) {
      for (let index = group.length - 1; index >= 0; index -= 1) {
        const line = group[index] ?? "";
        if (isSummaryNoiseLine(line)) {
          continue;
        }
        if (matcher.test(line)) {
          return line;
        }
      }
    }
  }

  for (const group of lineGroups) {
    for (let index = group.length - 1; index >= 0; index -= 1) {
      const line = group[index] ?? "";
      if (!isSummaryNoiseLine(line)) {
        return line;
      }
    }
  }

  return null;
};

const buildConfigYaml = (
  outputDir: string,
  cookies: Record<string, string>,
): string => {
  return [
    "link: []",
    `path: ${toYamlScalar(outputDir)}`,
    "music: false",
    "cover: false",
    "avatar: false",
    "json: false",
    "folderstyle: false",
    "mode:",
    "  - post",
    "number:",
    "  post: 1",
    "  like: 0",
    "  mix: 0",
    "  music: 0",
    "  collect: 0",
    "  collectmix: 0",
    "thread: 1",
    "retry_times: 2",
    "proxy: \"\"",
    "database: false",
    "progress:",
    "  quiet_logs: true",
    "browser_fallback:",
    "  enabled: false",
    "  headless: true",
    "  max_scrolls: 0",
    "  idle_rounds: 0",
    "  wait_timeout_seconds: 30",
    ...buildDouyinCookieYamlLines(cookies),
    "",
  ].join("\n");
};

const resolveEffectiveDouyinCookies = (
  context: EngineExecutionContext,
): Record<string, string> => parseDouyinCookies(context.intent.cookies);

const collectTaskArtifacts = async (
  rootDir: string,
  baseDir: string = rootDir,
): Promise<string[]> => {
  const entries = await fs.readdir(rootDir, { withFileTypes: true }).catch(() => []);
  const results: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await collectTaskArtifacts(entryPath, baseDir));
      continue;
    }
    results.push(path.relative(baseDir, entryPath));
  }

  return results;
};

const pickResultArtifact = (artifacts: string[]): string | null => {
  const preferredGroups = [VIDEO_EXTENSIONS, IMAGE_EXTENSIONS, AUDIO_EXTENSIONS];
  for (const extensions of preferredGroups) {
    const match = artifacts.find((artifact) => extensions.has(path.extname(artifact).toLowerCase()));
    if (match) {
      return match;
    }
  }

  const fallback = artifacts.find((artifact) => !SIDE_CAR_EXTENSIONS.has(path.extname(artifact).toLowerCase()));
  return fallback ?? null;
};

const extractDouyinContentId = (rawUrl: string): string | null => {
  const match = rawUrl.match(/\/(?:video|note|gallery)\/(\d{15,20})(?:[/?#]|$)/i);
  return match?.[1] ?? null;
};

const pickExistingArtifactByContentId = (
  artifacts: string[],
  contentId: string | null,
): string | null => {
  if (!contentId) {
    return null;
  }
  const matchingArtifacts = artifacts.filter((artifact) => artifact.includes(contentId));
  return pickResultArtifact(matchingArtifacts);
};

const readDouyinDlManifestRecords = async (
  manifestPath: string,
): Promise<DouyinDlManifestRecord[]> => {
  const content = await fs.readFile(manifestPath, "utf8").catch(() => null);
  if (!content) {
    return [];
  }

  const records: DouyinDlManifestRecord[] = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as DouyinDlManifestRecord;
      records.push(parsed);
    } catch {
      // Ignore malformed sidecar records and keep best-effort result detection.
    }
  }
  return records;
};

const pickManifestArtifact = (
  records: DouyinDlManifestRecord[],
  contentId: string | null,
): string | null => {
  const reversedRecords = [...records].reverse();
  const targetedRecords = contentId
    ? reversedRecords.filter((record) => String(record.aweme_id ?? "") === contentId)
    : reversedRecords;

  const candidateGroups = targetedRecords.length > 0
    ? [targetedRecords, reversedRecords]
    : [reversedRecords];

  for (const group of candidateGroups) {
    for (const record of group) {
      const filePaths = Array.isArray(record.file_paths)
        ? record.file_paths.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [];
      const artifactFromPaths = pickResultArtifact(filePaths);
      if (artifactFromPaths) {
        return artifactFromPaths;
      }

      const fileNames = Array.isArray(record.file_names)
        ? record.file_names.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [];
      const artifactFromNames = pickResultArtifact(fileNames);
      if (artifactFromNames) {
        return artifactFromNames;
      }
    }
  }

  return null;
};

const resolveArtifactPath = (outputDir: string, artifact: string): string => (
  path.isAbsolute(artifact) ? artifact : path.join(outputDir, artifact)
);

const pathsReferToSameLocation = (left: string, right: string): boolean => (
  path.resolve(left) === path.resolve(right)
);

const pathExists = async (candidatePath: string): Promise<boolean> => {
  try {
    await fs.stat(candidatePath);
    return true;
  } catch {
    return false;
  }
};

const resolveNonConflictingPath = async (targetPath: string, sourcePath: string): Promise<string> => {
  if (pathsReferToSameLocation(targetPath, sourcePath) || !await pathExists(targetPath)) {
    return targetPath;
  }

  const parsed = path.parse(targetPath);
  for (let index = 1; index < 10_000; index += 1) {
    const candidatePath = path.join(parsed.dir, `${parsed.name} (${index})${parsed.ext}`);
    if (pathsReferToSameLocation(candidatePath, sourcePath) || !await pathExists(candidatePath)) {
      return candidatePath;
    }
  }

  throw new Error(`Unable to find a non-conflicting Douyin output path for ${targetPath}`);
};

const delay = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const removeEmptyDirectory = async (dirPath: string): Promise<boolean> => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const entries = await fs.readdir(dirPath);
      if (entries.length > 0) {
        return false;
      }
      await fs.rmdir(dirPath);
      return true;
    } catch {
      if (attempt === 2) {
        return false;
      }
      await delay(50);
    }
  }
  return false;
};

const removeEmptyParentsUntil = async (startDir: string, stopDir: string): Promise<void> => {
  let currentDir = path.resolve(startDir);
  const resolvedStopDir = path.resolve(stopDir);

  while (currentDir !== resolvedStopDir && currentDir.startsWith(resolvedStopDir + path.sep)) {
    if (!await removeEmptyDirectory(currentDir)) {
      break;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }
};

const normalizeDouyinOutputArtifact = async (
  outputDir: string,
  artifactPath: string,
): Promise<string> => {
  const targetPath = await resolveNonConflictingPath(
    path.join(outputDir, path.basename(artifactPath)),
    artifactPath,
  );

  if (pathsReferToSameLocation(targetPath, artifactPath)) {
    return artifactPath;
  }

  await fs.rename(artifactPath, targetPath);
  await removeEmptyParentsUntil(path.dirname(artifactPath), outputDir);
  return targetPath;
};

const extractCliArgs = (context: EngineExecutionContext): string[] => {
  const intent = context.intent as Record<string, unknown>;
  const rawUrl = context.enginePlan.sourceUrl ?? intent.pageUrl ?? intent.originalUrl;
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    throw new InvalidCommandPlanError("douyin-dl source URL is missing");
  }

  const outputDir = context.outputDir;
  const configPath = path.join(outputDir, `${context.traceId}-douyin-dl-config.yml`);
  return [
    "-c",
    configPath,
    "-u",
    rawUrl,
    "-p",
    outputDir,
    "--show-warnings",
  ];
};

export const runDouyinDlDownload = async (
  context: EngineExecutionContext,
): Promise<DownloadResultPayload> => {
  let args: string[];
  try {
    args = extractCliArgs(context);
  } catch (error) {
    if (!(error instanceof InvalidCommandPlanError)) {
      throw error;
    }
    throw new DownloadRuntimeError(
      "E_INVALID_ENGINE_PLAN",
      error.message,
      {
        context: {
          providerId: context.plan?.providerId,
          traceId: context.traceId,
        },
      },
    );
  }

  if (!context.binaries.douyinDl) {
    throw new DownloadRuntimeError(
      "E_ENGINE_UNAVAILABLE",
      "douyin-dl binary is missing",
      {
        context: {
          traceId: context.traceId,
        },
      },
    );
  }

  await fs.mkdir(context.outputDir, { recursive: true });
  const configPath = path.join(context.outputDir, `${context.traceId}-douyin-dl-config.yml`);
  const effectiveCookies = resolveEffectiveDouyinCookies(context);
  await fs.writeFile(
    configPath,
    buildConfigYaml(context.outputDir, effectiveCookies),
    "utf8",
  );
  const beforeFiles = new Set(await collectTaskArtifacts(context.outputDir));
  const manifestPath = path.join(context.outputDir, DOUYIN_DL_MANIFEST_NAME);
  const manifestRecordCountBefore = (await readDouyinDlManifestRecords(manifestPath)).length;
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  const stdoutTail: string[] = [];
  const stderrTail: string[] = [];

  try {
    const exitCode = await runStreamingCommand(context.binaries.douyinDl, args, {
      env: buildDouyinDlEnv(),
      signal: context.abortSignal,
      onStdoutLine: async (line) => {
        captureOutputLine(stdoutLines, stdoutTail, line);
      },
      onStderrLine: async (line) => {
        captureOutputLine(stderrLines, stderrTail, line);
      },
    });
    const summary = parseDouyinDlSummary([...stdoutLines, ...stderrLines]);
    const diagnosticLine = pickDiagnosticLine(stderrLines, stdoutLines);
    if (exitCode !== 0) {
      throw new DownloadRuntimeError(
        "E_EXECUTION_FAILED",
        diagnosticLine
          ?? `douyin-dl exited with code ${exitCode}`,
        {
          context: {
            sourceUrl: context.enginePlan.sourceUrl ?? context.intent.pageUrl ?? context.intent.originalUrl,
            traceId: context.traceId,
            stderrTail,
            stdoutTail,
            summary,
          },
        },
      );
    }

    const afterFiles = await collectTaskArtifacts(context.outputDir);
    const sourceUrl = context.enginePlan.sourceUrl ?? context.intent.pageUrl ?? context.intent.originalUrl;
    const contentId = extractDouyinContentId(String(sourceUrl ?? ""));
    const createdArtifacts = afterFiles
      .filter((entry) => !beforeFiles.has(entry))
      .filter((entry) => !entry.endsWith(path.basename(configPath)));
    const manifestRecords = await readDouyinDlManifestRecords(manifestPath);
    const newManifestRecords = manifestRecords.slice(manifestRecordCountBefore);
    const resultArtifact = pickManifestArtifact(newManifestRecords, contentId)
      ?? pickResultArtifact(createdArtifacts)
      ?? pickManifestArtifact(manifestRecords, contentId)
      ?? pickExistingArtifactByContentId(afterFiles, contentId);
    const resolvedArtifactPath = resultArtifact
      ? resolveArtifactPath(context.outputDir, resultArtifact)
      : null;

    if ((summary?.success ?? 0) > 0 && resolvedArtifactPath) {
      const normalizedArtifactPath = await normalizeDouyinOutputArtifact(context.outputDir, resolvedArtifactPath);
      await fs.unlink(manifestPath).catch(() => undefined);
      return {
        traceId: context.traceId,
        success: true,
        file_path: normalizedArtifactPath,
      };
    }

    if ((summary?.failed ?? 0) > 0) {
      throw new DownloadRuntimeError(
        "E_EXECUTION_FAILED",
        diagnosticLine
          ?? "douyin-dl reported failed items",
        {
          context: {
            outputDir: context.outputDir,
            createdArtifacts,
            stdoutTail,
            stderrTail,
            traceId: context.traceId,
            summary,
          },
        },
      );
    }

    if ((summary?.skipped ?? 0) > 0 && resolvedArtifactPath) {
      const normalizedArtifactPath = await normalizeDouyinOutputArtifact(context.outputDir, resolvedArtifactPath);
      await fs.unlink(manifestPath).catch(() => undefined);
      return {
        traceId: context.traceId,
        success: true,
        file_path: normalizedArtifactPath,
      };
    }

    if (!resultArtifact) {
      throw new DownloadRuntimeError(
        "E_OUTPUT_NOT_FOUND",
        diagnosticLine
          ? `douyin-dl did not produce an output file: ${diagnosticLine}`
          : "douyin-dl finished without producing an output file",
        {
          context: {
            outputDir: context.outputDir,
            createdArtifacts,
            stdoutTail,
            stderrTail,
            traceId: context.traceId,
            summary,
          },
        },
      );
    }

    const normalizedArtifactPath = await normalizeDouyinOutputArtifact(
      context.outputDir,
      resolvedArtifactPath ?? resolveArtifactPath(context.outputDir, resultArtifact),
    );
    await fs.unlink(manifestPath).catch(() => undefined);
    return {
      traceId: context.traceId,
      success: true,
      file_path: normalizedArtifactPath,
    };
  } catch (error) {
    if (error instanceof DownloadRuntimeError) {
      throw error;
    }
    throw new DownloadRuntimeError(
      "E_EXECUTION_FAILED",
      summarizeError(error),
      {
        cause: error,
      },
    );
  } finally {
    await fs.unlink(configPath).catch(() => undefined);
  }
};
