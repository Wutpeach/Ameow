import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  getClipboardFilePaths,
  parseClipboardFileNameBuffer,
  processFiles,
} from "./fileIntake.mjs";

const createDependencies = (overrides = {}) => ({
  readConfigObject: vi.fn(async () => ({ renameEnabled: false })),
  resolveCurrentOutputFolderPath: vi.fn(async () => "/tmp/Ameow"),
  resolveRenameEnabled: vi.fn((config) => config.renameEnabled === true),
  buildRenamedTargetPath: vi.fn(async (targetDir, extension) => ({
    stem: "AMEOW-001",
    filePath: join(targetDir, `AMEOW-001.${extension}`),
  })),
  releaseRenameStem: vi.fn(),
  ...overrides,
});

describe("clipboard file paths", () => {
  it("parses UTF-16 FileNameW clipboard buffers", () => {
    expect(parseClipboardFileNameBuffer(
      Buffer.from("C:\\A.png\u0000D:\\B.png\u0000", "utf16le"),
    )).toEqual(["C:\\A.png", "D:\\B.png"]);
  });

  it("prefers FileNameW over legacy FileName format", async () => {
    const clipboard = {
      availableFormats: vi.fn(() => ["FileName", "FileNameW"]),
      readBuffer: vi.fn((format: string) => (
        format === "FileNameW"
          ? Buffer.from("/wide/a.png\u0000", "utf16le")
          : Buffer.from("/legacy/a.png\u0000", "utf8")
      )),
    };

    await expect(getClipboardFilePaths(clipboard)).resolves.toEqual(["/wide/a.png"]);
    expect(clipboard.readBuffer).toHaveBeenCalledWith("FileNameW");
  });

  it("reads legacy FileName buffers when wide paths are unavailable", async () => {
    const clipboard = {
      availableFormats: vi.fn(() => ["FileName"]),
      readBuffer: vi.fn(() => Buffer.from("/legacy/a.png\u0000/legacy/b.png\u0000", "utf8")),
    };

    await expect(getClipboardFilePaths(clipboard)).resolves.toEqual([
      "/legacy/a.png",
      "/legacy/b.png",
    ]);
  });
});

describe("processFiles", () => {
  it("copies files with collision-safe names when rename is disabled", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "ameow-file-intake-"));
    try {
      const sourcePath = join(tempDir, "source.txt");
      const targetDir = join(tempDir, "target");
      await mkdir(targetDir);
      await writeFile(sourcePath, "copied");
      await writeFile(join(targetDir, "source.txt"), "existing");

      const result = await processFiles([sourcePath], targetDir, createDependencies());

      expect(result).toBe(`Copied 1 files to ${targetDir}`);
      await expect(readFile(join(targetDir, "source_2.txt"), "utf8")).resolves.toBe("copied");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("copies files through rename allocation and releases the reserved stem", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "ameow-file-intake-rename-"));
    try {
      const sourcePath = join(tempDir, "source.mov");
      const targetDir = join(tempDir, "target");
      await writeFile(sourcePath, "renamed");
      const dependencies = createDependencies({
        readConfigObject: vi.fn(async () => ({ renameEnabled: true })),
      });

      await expect(processFiles([sourcePath], targetDir, dependencies)).resolves.toBe(
        `Copied 1 files to ${targetDir}`,
      );

      await expect(readFile(join(targetDir, "AMEOW-001.mov"), "utf8")).resolves.toBe("renamed");
      expect(dependencies.releaseRenameStem).toHaveBeenCalledWith(targetDir, "AMEOW-001");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("copies directories by removing the synthetic extension from the target path", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "ameow-file-intake-dir-"));
    try {
      const sourceDir = join(tempDir, "folder");
      const targetDir = join(tempDir, "target");
      await mkdir(sourceDir);
      await writeFile(join(sourceDir, "nested.txt"), "nested");

      await expect(processFiles([sourceDir], targetDir, createDependencies())).resolves.toBe(
        `Copied 1 files to ${targetDir}`,
      );

      await expect(readFile(join(targetDir, "folder", "nested.txt"), "utf8")).resolves.toBe("nested");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("skips invalid and missing source paths", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "ameow-file-intake-skip-"));
    try {
      await expect(processFiles([
        "",
        null,
        join(tempDir, "missing.txt"),
      ], tempDir, createDependencies())).resolves.toBe(`Copied 0 files to ${tempDir}`);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
