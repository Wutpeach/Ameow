import {
  copyFile,
  cp,
  mkdir,
  rename,
  rm,
  stat,
  unlink,
} from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  parse,
  resolve,
} from "node:path";

import type {
  ProcessFilesItemResult,
  ProcessFilesOperation,
  ProcessFilesResult,
} from "../src/types/fileIntake.js";

import {
  buildUniqueTargetPath,
  ensureExtension,
} from "./imageDownload.mjs";

type ClipboardLike = {
  availableFormats(): string[];
  readBuffer(format: string): Buffer;
};

type RenamedTarget = {
  stem: string;
  filePath: string;
};

export type ProcessFilesOptions = {
  readConfigObject(): Promise<Record<string, unknown>>;
  resolveCurrentOutputFolderPath(): Promise<string>;
  resolveRenameEnabled(config: Record<string, unknown>): boolean;
  buildRenamedTargetPath(
    targetDir: string,
    extension: string,
    config: Record<string, unknown>,
  ): Promise<RenamedTarget>;
  releaseRenameStem(targetDir: string, stem: string): void;
};

const moveFile = async (sourcePath: string, destinationPath: string): Promise<void> => {
  try {
    await rename(sourcePath, destinationPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") {
      throw error;
    }
    await copyFile(sourcePath, destinationPath);
    await unlink(sourcePath);
  }
};

const moveDirectory = async (sourcePath: string, destinationPath: string): Promise<void> => {
  try {
    await rename(sourcePath, destinationPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") {
      throw error;
    }
    await cp(sourcePath, destinationPath, { recursive: true });
    await rm(sourcePath, { recursive: true, force: true });
  }
};

const errorToMessage = (error: unknown): string => (
  error instanceof Error ? error.message : String(error)
);

const normalizeComparablePath = (path: string): string => {
  const resolved = resolve(path);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
};

const isDirectChildOfDirectory = (sourcePath: string, targetDir: string): boolean => (
  normalizeComparablePath(dirname(sourcePath)) === normalizeComparablePath(targetDir)
);

export const parseClipboardFileNameBuffer = (buffer: Buffer | null | undefined): string[] => {
  if (!buffer || buffer.length === 0) {
    return [];
  }

  const decoded = buffer.toString("utf16le");
  return decoded
    .split("\u0000")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

export const getClipboardFilePaths = async (
  clipboard: ClipboardLike,
): Promise<string[]> => {
  const availableFormats = clipboard.availableFormats();
  if (availableFormats.includes("FileNameW")) {
    return parseClipboardFileNameBuffer(clipboard.readBuffer("FileNameW"));
  }
  if (availableFormats.includes("FileName")) {
    return clipboard
      .readBuffer("FileName")
      .toString("utf8")
      .split("\u0000")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
};

export const processFiles = async (
  paths: unknown[],
  targetDir: string | null | undefined,
  options: ProcessFilesOptions,
  operation: ProcessFilesOperation = "copy",
): Promise<ProcessFilesResult> => {
  const finalTargetDir = targetDir || (await options.resolveCurrentOutputFolderPath());
  await mkdir(finalTargetDir, { recursive: true });
  const config = await options.readConfigObject();
  const renameEnabled = options.resolveRenameEnabled(config);

  let processedCount = 0;
  const items: ProcessFilesItemResult[] = [];
  for (const sourcePath of paths) {
    if (typeof sourcePath !== "string" || !sourcePath.trim()) {
      items.push({
        sourcePath: "",
        status: "skipped",
        reason: "invalid_path",
      });
      continue;
    }

    let sourceStats;
    try {
      sourceStats = await stat(sourcePath);
    } catch (error) {
      items.push({
        sourcePath,
        status: "skipped",
        reason: "stat_failed",
        error: errorToMessage(error),
      });
      continue;
    }

    if (operation === "move" && isDirectChildOfDirectory(sourcePath, finalTargetDir)) {
      items.push({
        sourcePath,
        status: "skipped",
        reason: "already_in_target",
        targetPath: sourcePath,
      });
      continue;
    }

    const sourceName = basename(sourcePath);
    const stem = parse(sourceName).name;
    const extension = ensureExtension(extname(sourceName), "bin");

    if (sourceStats.isDirectory()) {
      const destinationPath = await buildUniqueTargetPath(finalTargetDir, stem, extension);
      const finalDestinationPath = destinationPath.replace(/\.[^.]+$/, "");
      try {
        if (operation === "move") {
          await moveDirectory(sourcePath, finalDestinationPath);
        } else {
          await cp(sourcePath, finalDestinationPath, { recursive: true });
        }
        items.push({
          sourcePath,
          status: "processed",
          targetPath: finalDestinationPath,
        });
        processedCount += 1;
      } catch (error) {
        items.push({
          sourcePath,
          status: "failed",
          targetPath: finalDestinationPath,
          error: errorToMessage(error),
        });
      }
    } else {
      let renamedStem: string | null = null;
      let targetPath: string | null = null;
      try {
        if (renameEnabled) {
          const renamedTarget = await options.buildRenamedTargetPath(finalTargetDir, extension, config);
          renamedStem = renamedTarget.stem;
          targetPath = renamedTarget.filePath;
          if (operation === "move") {
            await moveFile(sourcePath, renamedTarget.filePath);
          } else {
            await copyFile(sourcePath, renamedTarget.filePath);
          }
        } else {
          const destinationPath = await buildUniqueTargetPath(finalTargetDir, stem, extension);
          targetPath = destinationPath;
          if (operation === "move") {
            await moveFile(sourcePath, destinationPath);
          } else {
            await copyFile(sourcePath, destinationPath);
          }
        }
        items.push({
          sourcePath,
          status: "processed",
          targetPath: targetPath ?? undefined,
        });
        processedCount += 1;
      } catch (error) {
        items.push({
          sourcePath,
          status: "failed",
          targetPath: targetPath ?? undefined,
          error: errorToMessage(error),
        });
      } finally {
        if (renamedStem) {
          options.releaseRenameStem(finalTargetDir, renamedStem);
        }
      }
    }
  }

  return {
    operation,
    processedCount,
    targetDir: finalTargetDir,
    items,
    message: `${operation === "move" ? "Moved" : "Copied"} ${processedCount} files to ${finalTargetDir}`,
  };
};
