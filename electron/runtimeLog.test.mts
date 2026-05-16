import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createRuntimeLogController } from "./runtimeLog.mjs";

const tempDirs: string[] = [];

const createTempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), "ameow-runtime-log-"));
  tempDirs.push(dir);
  return dir;
};

const createFakeConsole = () => ({
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("createRuntimeLogController", () => {
  it("initializes the session log and captures console output", async () => {
    const logDir = await createTempDir();
    const logPath = join(logDir, "runtime-latest.log");
    const fakeConsole = createFakeConsole();
    const controller = createRuntimeLogController({
      getRuntimeLogPath: () => logPath,
      getAppVersion: () => "0.3.0",
      platform: "darwin",
      arch: "arm64",
      isPackaged: true,
      consoleRef: fakeConsole,
      now: () => new Date("2026-05-16T10:00:00.000Z"),
    });

    await controller.initializeRuntimeLogCapture();
    fakeConsole.log("download queued", { traceId: "trace-1" });

    const lines = await controller.readRecentRuntimeLogLines();
    expect(lines[0]).toContain("[session] Ameow runtime log started version=0.3.0 platform=darwin arch=arm64 packaged=true");
    expect(lines[1]).toContain("[log] download queued {\"traceId\":\"trace-1\"}");
    await expect(readFile(logPath, "utf8")).resolves.toContain("[log] download queued");
  });

  it("keeps only the requested recent file lines", async () => {
    const logDir = await createTempDir();
    const controller = createRuntimeLogController({
      getRuntimeLogPath: () => join(logDir, "runtime-latest.log"),
      getAppVersion: () => "0.3.0",
      platform: "win32",
      arch: "x64",
      isPackaged: false,
      consoleRef: createFakeConsole(),
      now: () => new Date("2026-05-16T10:00:00.000Z"),
    });

    await controller.initializeRuntimeLogCapture();
    await controller.appendRuntimeLogLine("renderer", "line 1");
    await controller.appendRuntimeLogLine("renderer", "line 2");
    await controller.appendRuntimeLogLine("renderer", "line 3");

    const lines = await controller.readRecentRuntimeLogLines(2);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("line 2");
    expect(lines[1]).toContain("line 3");
  });

  it("falls back to the memory buffer when the log file cannot be read", async () => {
    const logDir = await createTempDir();
    const fakeConsole = createFakeConsole();
    const controller = createRuntimeLogController({
      getRuntimeLogPath: () => join(logDir, "runtime-latest.log"),
      getAppVersion: () => "0.3.0",
      platform: "linux",
      arch: "x64",
      isPackaged: false,
      bufferLimit: 2,
      consoleRef: fakeConsole,
      fs: {
        appendFile: vi.fn(async () => undefined),
        existsSync: vi.fn(() => false),
        readFile: vi.fn(async () => {
          throw new Error("should not read");
        }),
        writeFile: vi.fn(async () => undefined),
      },
      now: () => new Date("2026-05-16T10:00:00.000Z"),
    });

    await controller.initializeRuntimeLogCapture();
    await controller.appendRuntimeLogLine("log", "kept 1");
    await controller.appendRuntimeLogLine("log", "kept 2");

    const lines = await controller.readRecentRuntimeLogLines();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("kept 1");
    expect(lines[1]).toContain("kept 2");
  });
});
