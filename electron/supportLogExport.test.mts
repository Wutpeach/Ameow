import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildSupportLogText, exportSupportLogFile } from "./supportLogExport.mjs";

const createOptions = (overrides = {}) => ({
  environment: {
    appVersion: "0.3.0",
    platform: "win32" as NodeJS.Platform,
    arch: "x64" as NodeJS.Architecture,
    configPath: "C:/Ameow/settings.json",
    logDir: "C:/Ameow/logs",
    runtimeLogPath: "C:/Ameow/logs/runtime-latest.log",
  },
  readConfigObject: async () => ({ outputPath: "C:/Downloads" }),
  getRuntimeDependencyStatus: async () => ({
    ytDlp: { state: "ready", path: "C:/yt-dlp.exe" },
  }),
  readRecentRuntimeLogLines: async () => ["[log] runtime ready"],
  ...overrides,
});

describe("buildSupportLogText", () => {
  it("builds the required sectioned support log contract", async () => {
    const text = await buildSupportLogText(createOptions());

    expect(text).toContain("[environment]\n");
    expect(text).toContain("appVersion=0.3.0\n");
    expect(text).toContain("runtimeLogPath=C:/Ameow/logs/runtime-latest.log\n");
    expect(text).toContain("[settings]\n");
    expect(text).toContain('"outputPath": "C:/Downloads"');
    expect(text).toContain("[runtime]\n");
    expect(text).toContain('"ytDlp"');
    expect(text).toContain("[recent-runtime-log]\n[log] runtime ready\n");
  });

  it("uses a clear placeholder when no runtime log lines are available", async () => {
    const text = await buildSupportLogText(createOptions({
      readRecentRuntimeLogLines: async () => [],
    }));

    expect(text).toContain("<no runtime log lines captured>");
  });
});

describe("exportSupportLogFile", () => {
  it("writes the generated support log under the log directory and returns the path", async () => {
    const logDir = await mkdtemp(join(tmpdir(), "ameow-support-log-"));
    try {
      const outputPath = await exportSupportLogFile(createOptions({
        environment: {
          ...createOptions().environment,
          logDir,
          runtimeLogPath: join(logDir, "runtime-latest.log"),
        },
        now: () => new Date("2026-05-16T12:34:56.789Z"),
      }));

      expect(outputPath).toBe(join(logDir, "support-2026-05-16T12-34-56-789Z.txt"));
      await expect(readFile(outputPath, "utf8")).resolves.toContain("[recent-runtime-log]");
    } finally {
      await rm(logDir, { recursive: true, force: true });
    }
  });
});
