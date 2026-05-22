import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mkdirMock,
  readFileMock,
  readdirMock,
  renameMock,
  rmMock,
  rmdirMock,
  statMock,
  unlinkMock,
  writeFileMock,
  runStreamingCommandMock,
} = vi.hoisted(() => ({
  mkdirMock: vi.fn(async () => undefined),
  readFileMock: vi.fn(),
  readdirMock: vi.fn(),
  renameMock: vi.fn(async () => undefined),
  rmMock: vi.fn(async () => undefined),
  rmdirMock: vi.fn(async () => undefined),
  statMock: vi.fn(),
  unlinkMock: vi.fn(async () => undefined),
  writeFileMock: vi.fn(async () => undefined),
  runStreamingCommandMock: vi.fn(),
}));

vi.mock("node:fs", () => ({
  promises: {
    mkdir: mkdirMock,
    readFile: readFileMock,
    readdir: readdirMock,
    rename: renameMock,
    rm: rmMock,
    rmdir: rmdirMock,
    stat: statMock,
    unlink: unlinkMock,
    writeFile: writeFileMock,
  },
}));

vi.mock("node:fs/promises", () => ({
  mkdir: mkdirMock,
  readFile: readFileMock,
  readdir: readdirMock,
  rename: renameMock,
  rmdir: rmdirMock,
  unlink: unlinkMock,
  writeFile: writeFileMock,
  stat: statMock,
  rm: rmMock,
}));

vi.mock("./processRunner.js", () => ({
  runStreamingCommand: runStreamingCommandMock,
}));

import { DownloadRuntimeError } from "../core/index.js";
import { runDouyinDlDownload } from "./douyinDlDownload.js";

const fileEntry = (name: string) => ({
  name,
  isDirectory: () => false,
});

const directoryEntry = (name: string) => ({
  name,
  isDirectory: () => true,
});

describe("runDouyinDlDownload", () => {
  beforeEach(() => {
    mkdirMock.mockClear();
    readFileMock.mockReset();
    readdirMock.mockReset();
    renameMock.mockClear();
    rmMock.mockClear();
    rmdirMock.mockClear();
    statMock.mockReset();
    statMock.mockRejectedValue(new Error("missing"));
    unlinkMock.mockClear();
    writeFileMock.mockClear();
    runStreamingCommandMock.mockReset();
  });

  it("writes a minimal config, passes cli args, and prefers video outputs", async () => {
    readFileMock.mockResolvedValue("");
    readdirMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        fileEntry("trace-douyin-dl-config.yml"),
        fileEntry("result.json"),
        fileEntry("result.mp4"),
      ]);
    runStreamingCommandMock.mockImplementation(async (command, args, options) => {
      expect(command).toBe("D:/douyin-dl.exe");
      expect(args).toEqual([
        "-c",
        path.join("D:/downloads", "trace-douyin-dl-config.yml"),
        "-u",
        "https://www.douyin.com/video/123",
        "-p",
        "D:/downloads",
        "--show-warnings",
      ]);
      expect(options?.env).toMatchObject({
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1",
      });
      return 0;
    });

    const context = {
      traceId: "trace",
      outputDir: "D:/downloads",
      binaries: {
        douyinDl: "D:/douyin-dl.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.douyin.com/video/123",
      },
      intent: {
        originalUrl: "https://www.douyin.com/video/123",
        cookies: "msToken=token-1; ttwid=token-2",
      },
      abortSignal: new AbortController().signal,
    } as never;

    await expect(runDouyinDlDownload(context)).resolves.toMatchObject({
      success: true,
      file_path: path.join("D:/downloads", "result.mp4"),
    });

    expect(mkdirMock).toHaveBeenCalledWith("D:/downloads", { recursive: true });
    expect(writeFileMock).toHaveBeenCalledWith(
      path.join("D:/downloads", "trace-douyin-dl-config.yml"),
      expect.stringContaining("msToken: \"token-1\""),
      "utf8",
    );
    expect(writeFileMock).toHaveBeenCalledWith(
      path.join("D:/downloads", "trace-douyin-dl-config.yml"),
      expect.stringContaining("ttwid: \"token-2\""),
      "utf8",
    );
    expect(unlinkMock).toHaveBeenCalledWith(path.join("D:/downloads", "trace-douyin-dl-config.yml"));
  });

  it("flattens nested Douyin media output, removes the manifest, and cleans empty author folders", async () => {
    readFileMock
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce([
        "{\"aweme_id\":\"7604129988555574538\",\"file_paths\":[\"author/result.mp4\"]}",
      ].join("\n"));
    readdirMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        fileEntry("download_manifest.jsonl"),
        directoryEntry("author"),
      ])
      .mockResolvedValueOnce([fileEntry("result.mp4")])
      .mockResolvedValueOnce([]);
    runStreamingCommandMock.mockImplementation(async (_command, _args, options) => {
      await options?.onStdoutLine?.("│ Success      │     1 │");
      await options?.onStdoutLine?.("│ Failed       │     0 │");
      await options?.onStdoutLine?.("│ Skipped      │     0 │");
      return 0;
    });

    const context = {
      traceId: "trace-flatten",
      outputDir: "D:/downloads",
      binaries: {
        douyinDl: "D:/douyin-dl.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.douyin.com/video/7604129988555574538",
      },
      intent: {
        originalUrl: "https://www.douyin.com/video/7604129988555574538",
      },
      abortSignal: new AbortController().signal,
    } as never;

    await expect(runDouyinDlDownload(context)).resolves.toMatchObject({
      success: true,
      file_path: path.join("D:/downloads", "result.mp4"),
    });

    expect(renameMock).toHaveBeenCalledWith(
      path.join("D:/downloads", "author/result.mp4"),
      path.join("D:/downloads", "result.mp4"),
    );
    expect(unlinkMock).toHaveBeenCalledWith(path.join("D:/downloads", "download_manifest.jsonl"));
    expect(rmdirMock).toHaveBeenCalledWith(path.join("D:/downloads", "author"));
  });

  it("chooses a deterministic non-conflicting flattened filename", async () => {
    readFileMock
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce([
        "{\"aweme_id\":\"7604129988555574538\",\"file_paths\":[\"author/result.mp4\"]}",
      ].join("\n"));
    readdirMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        fileEntry("download_manifest.jsonl"),
        fileEntry("result.mp4"),
        directoryEntry("author"),
      ])
      .mockResolvedValueOnce([fileEntry("result.mp4")])
      .mockResolvedValueOnce([]);
    statMock.mockImplementation(async (candidatePath: string) => {
      if (String(candidatePath).endsWith("result.mp4")) {
        return { mtimeMs: Date.now() };
      }
      throw new Error("missing");
    });
    runStreamingCommandMock.mockImplementation(async (_command, _args, options) => {
      await options?.onStdoutLine?.("│ Success      │     1 │");
      await options?.onStdoutLine?.("│ Failed       │     0 │");
      await options?.onStdoutLine?.("│ Skipped      │     0 │");
      return 0;
    });

    const context = {
      traceId: "trace-collision",
      outputDir: "D:/downloads",
      binaries: {
        douyinDl: "D:/douyin-dl.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.douyin.com/video/7604129988555574538",
      },
      intent: {
        originalUrl: "https://www.douyin.com/video/7604129988555574538",
      },
      abortSignal: new AbortController().signal,
    } as never;

    await expect(runDouyinDlDownload(context)).resolves.toMatchObject({
      success: true,
      file_path: path.join("D:/downloads", "result (1).mp4"),
    });

    expect(renameMock).toHaveBeenCalledWith(
      path.join("D:/downloads", "author/result.mp4"),
      path.join("D:/downloads", "result (1).mp4"),
    );
  });

  it("parses Netscape cookies into the generated yaml config", async () => {
    readFileMock.mockResolvedValue("");
    readdirMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([fileEntry("cover.jpg")]);
    runStreamingCommandMock.mockResolvedValue(0);

    const context = {
      traceId: "trace-cookie",
      outputDir: "D:/downloads",
      binaries: {
        douyinDl: "D:/douyin-dl.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.douyin.com/video/456",
      },
      intent: {
        originalUrl: "https://www.douyin.com/video/456",
        cookies: [
          "# Netscape HTTP Cookie File",
          ".douyin.com\tTRUE\t/\tFALSE\t0\tmsToken\tnetscape-ms",
          ".douyin.com\tTRUE\t/\tFALSE\t0\tsid_guard\tnetscape-sid",
        ].join("\n"),
      },
      abortSignal: new AbortController().signal,
    } as never;

    await expect(runDouyinDlDownload(context)).resolves.toMatchObject({
      success: true,
      file_path: path.join("D:/downloads", "cover.jpg"),
    });

    const firstWriteCall = writeFileMock.mock.calls[0] as unknown[] | undefined;
    const writtenConfig = String(firstWriteCall?.[1] ?? "");
    expect(writtenConfig).toContain("msToken: \"netscape-ms\"");
    expect(writtenConfig).toContain("sid_guard: \"netscape-sid\"");
  });

  it("uses only the download context cookies and ignores the retired legacy Douyin session path", async () => {
    readFileMock.mockImplementation(async (filePath: string) => {
      const normalizedPath = String(filePath).replace(/\\/g, "/");
      if (normalizedPath.endsWith("/sessions/douyin/cookies.json")) {
        return JSON.stringify({
          ttwid: "session-ttwid",
          odin_tt: "session-odin",
          passport_csrf_token: "session-passport",
          sessionid: "session-id",
        });
      }
      return "";
    });
    readdirMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([fileEntry("result.mp4")]);
    runStreamingCommandMock.mockResolvedValue(0);

    const context = {
      traceId: "trace-app-session",
      outputDir: "D:/downloads",
      userDataDir: "C:/Users/Administrator/AppData/Roaming/ameow",
      binaries: {
        douyinDl: "D:/douyin-dl.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.douyin.com/video/456",
      },
      intent: {
        originalUrl: "https://www.douyin.com/video/456",
        cookies: "ttwid=request-ttwid; msToken=request-ms",
      },
      abortSignal: new AbortController().signal,
    } as never;

    await expect(runDouyinDlDownload(context)).resolves.toMatchObject({
      success: true,
      file_path: path.join("D:/downloads", "result.mp4"),
    });

    const firstWriteCall = writeFileMock.mock.calls[0] as unknown[] | undefined;
    const writtenConfig = String(firstWriteCall?.[1] ?? "");
    expect(writtenConfig).toContain("ttwid: \"request-ttwid\"");
    expect(writtenConfig).toContain("msToken: \"request-ms\"");
    expect(writtenConfig).not.toContain("session-ttwid");
    expect(writtenConfig).not.toContain("sessionid: \"session-id\"");
    expect(readFileMock).not.toHaveBeenCalledWith(expect.stringContaining("sessions/douyin/cookies.json"), "utf8");
  });

  it("reuses an existing aweme artifact when douyin-dl exits cleanly without creating a new file", async () => {
    readFileMock.mockResolvedValue("");
    readdirMock
      .mockResolvedValueOnce([
        fileEntry("2024-08-01_video_7604129988555574538.mp4"),
        fileEntry("download_manifest.jsonl"),
      ])
      .mockResolvedValueOnce([
        fileEntry("2024-08-01_video_7604129988555574538.mp4"),
        fileEntry("download_manifest.jsonl"),
      ]);
    runStreamingCommandMock.mockResolvedValue(0);

    const context = {
      traceId: "trace-existing",
      outputDir: "D:/downloads",
      binaries: {
        douyinDl: "D:/douyin-dl.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.douyin.com/video/7604129988555574538",
      },
      intent: {
        originalUrl: "https://www.douyin.com/video/7604129988555574538",
      },
      abortSignal: new AbortController().signal,
    } as never;

    await expect(runDouyinDlDownload(context)).resolves.toMatchObject({
      success: true,
      file_path: path.join("D:/downloads", "2024-08-01_video_7604129988555574538.mp4"),
    });
  });

  it("uses manifest summary and error output when douyin-dl exits 0 but the single item failed", async () => {
    readFileMock.mockResolvedValue("");
    readdirMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    runStreamingCommandMock.mockImplementation(async (_command, _args, options) => {
      await options?.onStderrLine?.("\u001b[31m2026-05-18 15:57:27 - APIClient - ERROR - Request failed after 3 attempts: path=/aweme/v1/web/aweme/detail/, error=Empty 200 response for /aweme/v1/web/aweme/detail/ (anti-bot)\u001b[0m");
      await options?.onStdoutLine?.("│ Success      │     0 │");
      await options?.onStdoutLine?.("│ Failed       │     1 │");
      await options?.onStdoutLine?.("│ Skipped      │     0 │");
      return 0;
    });

    const context = {
      traceId: "trace-failed-summary",
      outputDir: "D:/downloads",
      binaries: {
        douyinDl: "D:/douyin-dl.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.douyin.com/video/7604129988555574538",
      },
      intent: {
        originalUrl: "https://www.douyin.com/video/7604129988555574538",
      },
      abortSignal: new AbortController().signal,
    } as never;

    await expect(runDouyinDlDownload(context)).rejects.toMatchObject({
      name: "DownloadRuntimeError",
      code: "E_EXECUTION_FAILED",
      message: "2026-05-18 15:57:27 - APIClient - ERROR - Request failed after 3 attempts: path=/aweme/v1/web/aweme/detail/, error=Empty 200 response for /aweme/v1/web/aweme/detail/ (anti-bot)",
    } satisfies Partial<DownloadRuntimeError>);
  });

  it("prefers manifest file_paths when douyin-dl reports success", async () => {
    readFileMock
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce([
        "{\"aweme_id\":\"7604129988555574538\",\"file_paths\":[\"nested/result.mp4\"]}",
      ].join("\n"));
    readdirMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([fileEntry("download_manifest.jsonl")]);
    runStreamingCommandMock.mockImplementation(async (_command, _args, options) => {
      await options?.onStdoutLine?.("│ Success      │     1 │");
      await options?.onStdoutLine?.("│ Failed       │     0 │");
      await options?.onStdoutLine?.("│ Skipped      │     0 │");
      return 0;
    });

    const context = {
      traceId: "trace-manifest-success",
      outputDir: "D:/downloads",
      binaries: {
        douyinDl: "D:/douyin-dl.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.douyin.com/video/7604129988555574538",
      },
      intent: {
        originalUrl: "https://www.douyin.com/video/7604129988555574538",
      },
      abortSignal: new AbortController().signal,
    } as never;

    await expect(runDouyinDlDownload(context)).resolves.toMatchObject({
      success: true,
      file_path: path.join("D:/downloads", "result.mp4"),
    });
    expect(renameMock).toHaveBeenCalledWith(
      path.join("D:/downloads", "nested/result.mp4"),
      path.join("D:/downloads", "result.mp4"),
    );
  });

  it("maps a missing source URL to an invalid engine plan error", async () => {
    const context = {
      traceId: "trace-missing-source",
      outputDir: "D:/downloads",
      binaries: {
        douyinDl: "D:/douyin-dl.exe",
      },
      enginePlan: {},
      intent: {},
      abortSignal: new AbortController().signal,
    } as never;

    await expect(runDouyinDlDownload(context)).rejects.toMatchObject({
      name: "DownloadRuntimeError",
      code: "E_INVALID_ENGINE_PLAN",
      message: "douyin-dl source URL is missing",
    } satisfies Partial<DownloadRuntimeError>);
    expect(runStreamingCommandMock).not.toHaveBeenCalled();
  });
});
