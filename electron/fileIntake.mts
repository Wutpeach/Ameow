import {
  copyFile,
  cp,
  mkdir,
  stat,
} from "node:fs/promises";
import { basename, extname, parse } from "node:path";

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
): Promise<string> => {
  const finalTargetDir = targetDir || (await options.resolveCurrentOutputFolderPath());
  await mkdir(finalTargetDir, { recursive: true });
  const config = await options.readConfigObject();
  const renameEnabled = options.resolveRenameEnabled(config);

  let copiedCount = 0;
  for (const sourcePath of paths) {
    if (typeof sourcePath !== "string" || !sourcePath.trim()) {
      continue;
    }

    let sourceStats;
    try {
      sourceStats = await stat(sourcePath);
    } catch {
      continue;
    }

    const sourceName = basename(sourcePath);
    const stem = parse(sourceName).name;
    const extension = ensureExtension(extname(sourceName), "bin");

    if (sourceStats.isDirectory()) {
      const destinationPath = await buildUniqueTargetPath(finalTargetDir, stem, extension);
      await cp(sourcePath, destinationPath.replace(/\.[^.]+$/, ""), { recursive: true });
    } else {
      let renamedStem: string | null = null;
      try {
        if (renameEnabled) {
          const renamedTarget = await options.buildRenamedTargetPath(finalTargetDir, extension, config);
          renamedStem = renamedTarget.stem;
          await copyFile(sourcePath, renamedTarget.filePath);
        } else {
          const destinationPath = await buildUniqueTargetPath(finalTargetDir, stem, extension);
          await copyFile(sourcePath, destinationPath);
        }
      } finally {
        if (renamedStem) {
          options.releaseRenameStem(finalTargetDir, renamedStem);
        }
      }
    }
    copiedCount += 1;
  }

  return `Copied ${copiedCount} files to ${finalTargetDir}`;
};
