import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  readdirMock,
  readFileMock,
  unlinkMock,
  runStreamingCommandMock,
  writeCookiesFileMock,
  cleanupCookiesFileMock,
} = vi.hoisted(() => ({
  readdirMock: vi.fn(),
  readFileMock: vi.fn(),
  unlinkMock: vi.fn(async () => undefined),
  runStreamingCommandMock: vi.fn(),
  writeCookiesFileMock: vi.fn<(traceId: string, cookies: string | undefined) => Promise<string | null>>(
    async () => null,
  ),
  cleanupCookiesFileMock: vi.fn<(cookiesPath: string | null) => Promise<void>>(async () => undefined),
}));

vi.mock("node:fs", () => ({
  promises: {
    readdir: readdirMock,
    readFile: readFileMock,
    unlink: unlinkMock,
  },
}));

vi.mock("./processRunner.js", () => ({
  runStreamingCommand: runStreamingCommandMock,
}));

vi.mock("./sidecarCookies.js", () => ({
  writeCookiesFile: writeCookiesFileMock,
  cleanupCookiesFile: cleanupCookiesFileMock,
}));

import { runYtDlpDownload } from "./ytDlpDownload.js";
import { DownloadRuntimeError } from "../core/index.js";

describe("runYtDlpDownload", () => {
  beforeEach(() => {
    readdirMock.mockReset();
    readFileMock.mockReset();
    unlinkMock.mockClear();
    runStreamingCommandMock.mockReset();
    writeCookiesFileMock.mockReset();
    cleanupCookiesFileMock.mockReset();
    writeCookiesFileMock.mockResolvedValue(null);
    cleanupCookiesFileMock.mockResolvedValue(undefined);
  });

  it("uses title plus resolution and quality in the output template when rename is disabled", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Sample Video"
        : path.join("D:/downloads", "Sample Video[1920x1080][highest].mp4")
    ));
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      const outputIndex = args.indexOf("-o");
      const mergeOutputIndex = args.indexOf("--merge-output-format");
      const titleReportIndex = args.indexOf("after_move:title");
      expect(outputIndex).toBeGreaterThanOrEqual(0);
      expect(mergeOutputIndex).toBeGreaterThanOrEqual(0);
      expect(titleReportIndex).toBeGreaterThanOrEqual(0);
      expect(args[outputIndex + 1]).toBe(path.join(
        "D:/downloads",
        "Sample Video[%(width|unknown)sx%(height|unknown)s][highest].%(ext)s",
      ),
      );
      expect(args[mergeOutputIndex + 1]).toBe("mp4/mkv");
      return 0;
    });

    const context = {
      traceId: "trace-template",
      outputDir: "D:/downloads",
      outputStem: "Sample Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=1",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=1",
        videoQuality: "best",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      file_path: path.join("D:/downloads", "Sample Video[1920x1080][highest].mp4"),
    });
  });

  it("cleans up newly created task artifacts when yt-dlp fails", async () => {
    readdirMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(["video.mp4.part", "video.mp4.ytdl", "video.f137.mp4"]);
    readFileMock.mockRejectedValue(new Error("missing report"));
    runStreamingCommandMock.mockResolvedValue(1);

    const context = {
      traceId: "trace-yt",
      outputDir: "D:/downloads",
      outputStem: "video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://example.com/watch?v=1",
      },
      intent: {
        originalUrl: "https://example.com/watch?v=1",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).rejects.toThrow();
    expect(unlinkMock).toHaveBeenCalledWith(path.join("D:/downloads", "video.mp4.part"));
    expect(unlinkMock).toHaveBeenCalledWith(path.join("D:/downloads", "video.mp4.ytdl"));
    expect(unlinkMock).toHaveBeenCalledWith(path.join("D:/downloads", "video.f137.mp4"));
    expect(unlinkMock).toHaveBeenCalledWith(path.join("D:/downloads", "trace-yt-after-move.txt"));
    expect(unlinkMock).toHaveBeenCalledWith(path.join("D:/downloads", "trace-yt-title.txt"));
  });

  it("emits an early downloading activity while yt-dlp is still resolving media", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Sample Video"
        : path.join("D:/downloads", "Sample Video.mp4")
    ));
    const onProgress = vi.fn(async () => undefined);
    runStreamingCommandMock.mockImplementation(async (_command, _args, options) => {
      await options?.onStderrLine?.("[youtube] abc123: Downloading webpage");
      return 0;
    });

    const context = {
      traceId: "trace-activity",
      outputDir: "D:/downloads",
      outputStem: "Sample Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=abc123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=abc123",
        videoQuality: "best",
      },
      abortSignal: new AbortController().signal,
      onProgress,
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      file_path: path.join("D:/downloads", "Sample Video.mp4"),
    });

    expect(onProgress).toHaveBeenCalledOnce();
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      traceId: "trace-activity",
      percent: -1,
      stage: "preparing",
      speed: "Resolving media...",
    }));
  });

  it("uses extended youtube args for plain youtube downloads", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Plain URL Video"
        : path.join("D:/downloads", "Plain URL Video.mp4")
    ));
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      expect(args).toContain("--extractor-args");
      expect(args).toContain("youtube:player_js_variant=tv");
      expect(args).toContain("--remote-components");
      expect(args).toContain("ejs:github");
      expect(args).toContain("--js-runtimes");
      expect(args.at(-1)).toBe("https://www.youtube.com/watch?v=plain123");
      return 0;
    });

    const context = {
      traceId: "trace-plain-youtube",
      outputDir: "D:/downloads",
      outputStem: "youtube_plain123",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=plain123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=plain123",
        videoQuality: "best",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      file_path: path.join("D:/downloads", "Plain URL Video.mp4"),
    });
  });

  it("does not retry public youtube downloads through an extended mode branch", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Retry Video"
        : path.join("D:/downloads", "Retry Video.mp4")
    ));
    const onProgress = vi.fn(async () => undefined);
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      expect(args).toContain("--extractor-args");
      expect(args).toContain("youtube:player_js_variant=tv");
      expect(args).toContain("--remote-components");
      expect(args).toContain("ejs:github");
      return 0;
    });

    const context = {
      traceId: "trace-youtube-light",
      outputDir: "D:/downloads",
      outputStem: "Retry Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=light123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=light123",
        pageUrl: "https://www.youtube.com/watch?v=light123",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "best",
      },
      abortSignal: new AbortController().signal,
      onProgress,
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      file_path: path.join("D:/downloads", "Retry Video.mp4"),
    });
  });

  it("uses extended youtube mode for injected downloads", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Balanced Video"
        : path.join("D:/downloads", "Balanced Video.mp4")
    ));
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      expect(args).toContain("youtube:player_js_variant=tv");
      expect(args).toContain("--remote-components");
      return 0;
    });

    const context = {
      traceId: "trace-youtube-balanced",
      outputDir: "D:/downloads",
      outputStem: "Balanced Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=balanced123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=balanced123",
        pageUrl: "https://www.youtube.com/watch?v=balanced123",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "balanced",
        extensionData: {
          youtube: {
            source: "injected",
            allowCookies: false,
          },
        },
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      file_path: path.join("D:/downloads", "Balanced Video.mp4"),
    });
  });

  it("uses extended youtube mode for data-saver downloads", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Data Saver Video"
        : path.join("D:/downloads", "Data Saver Video.mp4")
    ));
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      expect(args).toContain("youtube:player_js_variant=tv");
      expect(args).toContain("--remote-components");
      return 0;
    });

    const context = {
      traceId: "trace-youtube-data-saver",
      outputDir: "D:/downloads",
      outputStem: "Data Saver Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=datasaver123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=datasaver123",
        pageUrl: "https://www.youtube.com/watch?v=datasaver123",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "data_saver",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      file_path: path.join("D:/downloads", "Data Saver Video.mp4"),
    });
  });

  it("keeps injected public high quality downloads on extended mode", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Injected Public Video"
        : path.join("D:/downloads", "Injected Public Video.mp4")
    ));
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      expect(args).toContain("--no-playlist");
      expect(args).toContain("--extractor-args");
      expect(args).toContain("youtube:player_js_variant=tv");
      expect(args).not.toContain("--cookies");
      expect(args).toContain("--remote-components");
      expect(args).toContain("ejs:github");
      expect(args).toContain("--js-runtimes");
      return 0;
    });

    const context = {
      traceId: "trace-public-injected",
      outputDir: "D:/downloads",
      outputStem: "Injected Public Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=public123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=public123",
        pageUrl: "https://www.youtube.com/watch?v=public123",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "best",
        extensionData: {
          youtube: {
            source: "injected",
            allowCookies: false,
          },
        },
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      file_path: path.join("D:/downloads", "Injected Public Video.mp4"),
    });
  });

  it("does not retry youtube failures after the download has been aborted", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Cancelled Video"
        : path.join("D:/downloads", "Cancelled Video.mp4")
    ));
    const onProgress = vi.fn(async () => undefined);
    const abortController = new AbortController();
    runStreamingCommandMock.mockImplementationOnce(async (_command, args, options) => {
      expect(args).toContain("youtube:player_js_variant=tv");
      abortController.abort();
      await options?.onStderrLine?.("ERROR: Sign in to confirm you're not a bot");
      return 1;
    });

    const context = {
      traceId: "trace-cancelled-youtube",
      outputDir: "D:/downloads",
      outputStem: "Cancelled Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=cancel123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=cancel123",
        pageUrl: "https://www.youtube.com/watch?v=cancel123",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "data_saver",
        extensionData: {
          youtube: {
            source: "injected",
            allowCookies: false,
          },
        },
      },
      abortSignal: abortController.signal,
      onProgress,
    } as never;

    await expect(runYtDlpDownload(context)).rejects.toThrow("Sign in to confirm you're not a bot");
    expect(runStreamingCommandMock).toHaveBeenCalledTimes(1);
    expect(onProgress).not.toHaveBeenCalledWith(expect.objectContaining({
      speed: "activity:youtube.retryingCompatibleExtractor",
    }));
  });

  it("uses the trimmed youtube balanced selector for injected downloads", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Balanced Video"
        : path.join("D:/downloads", "Balanced Video.mp4")
    ));
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      const formatIndex = args.indexOf("-f");
      expect(formatIndex).toBeGreaterThanOrEqual(0);
      expect(args[formatIndex + 1]).toBe(
        "bv*[height=1080][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/"
        + "bv*[height=1080][ext=mp4]+ba[ext=m4a]/"
        + "b[height=1080][vcodec^=avc1][ext=mp4]/"
        + "b[height=1080][ext=mp4]/"
        + "best[height=1080][ext=mp4]/"
        + "bv*[height<=1080][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/"
        + "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/"
        + "b[height<=1080][vcodec^=avc1][ext=mp4]/"
        + "b[height<=1080][ext=mp4]/"
        + "best[height<=1080][ext=mp4]/"
        + "best[ext=mp4]/"
        + "best",
      );
      expect(args).toContain("youtube:player_js_variant=tv");
      expect(args).toContain("--remote-components");
      return 0;
    });

    const context = {
      traceId: "trace-youtube-balanced",
      outputDir: "D:/downloads",
      outputStem: "Balanced Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=balanced123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=balanced123",
        pageUrl: "https://www.youtube.com/watch?v=balanced123",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "balanced",
        extensionData: {
          youtube: {
            source: "injected",
            allowCookies: false,
          },
        },
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      file_path: path.join("D:/downloads", "Balanced Video.mp4"),
    });
  });

  it("uses extended youtube mode for data-saver downloads", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Data Saver Video"
        : path.join("D:/downloads", "Data Saver Video.mp4")
    ));
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      expect(args).toContain("youtube:player_js_variant=tv");
      expect(args).toContain("--remote-components");
      return 0;
    });

    const context = {
      traceId: "trace-youtube-data-saver",
      outputDir: "D:/downloads",
      outputStem: "Data Saver Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=datasaver123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=datasaver123",
        pageUrl: "https://www.youtube.com/watch?v=datasaver123",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "data_saver",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      file_path: path.join("D:/downloads", "Data Saver Video.mp4"),
    });
  });

  it("adds referer, no-playlist, cookies, and youtube extractor args for injected current-item downloads", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Injected Video"
        : path.join("D:/downloads", "Injected Video.mp4")
    ));
    writeCookiesFileMock.mockResolvedValue("D:/temp/trace-injected-cookies.txt");
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      expect(args).toContain("--no-playlist");
      expect(args).toContain("--cookies");
      expect(args).toContain("D:/temp/trace-injected-cookies.txt");
      expect(args).toContain("--extractor-args");
      expect(args).toContain("youtube:player_js_variant=tv");
      expect(args).toContain("--remote-components");
      expect(args).toContain("ejs:github");

      const refererIndex = args.indexOf("--add-header");
      expect(refererIndex).toBeGreaterThanOrEqual(0);
      expect(args[refererIndex + 1]).toBe("Referer:https://www.youtube.com/watch?v=abc123");
      expect(args.at(-1)).toBe("https://www.youtube.com/watch?v=abc123");
      return 0;
    });

    const context = {
      traceId: "trace-injected",
      outputDir: "D:/downloads",
      outputStem: "Injected Video",
      config: {
        extensionInjectionDebugEnabled: true,
      },
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=abc123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=abc123",
        pageUrl: "https://www.youtube.com/watch?v=abc123",
        selectionScope: "current_item",
        cookies: "# Netscape HTTP Cookie File",
        siteId: "youtube",
        videoQuality: "best",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      file_path: path.join("D:/downloads", "Injected Video.mp4"),
    });
    expect(cleanupCookiesFileMock).toHaveBeenCalledWith("D:/temp/trace-injected-cookies.txt");
  });

  it("adds yt-dlp download sections for YouTube clip downloads", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Clip Video"
        : path.join("D:/downloads", "5250-8750_Clip Video.mp4")
    ));
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      const outputIndex = args.indexOf("-o");
      const sectionIndex = args.indexOf("--download-sections");
      expect(outputIndex).toBeGreaterThanOrEqual(0);
      expect(sectionIndex).toBeGreaterThanOrEqual(0);
      expect(args[outputIndex + 1]).toBe(path.join(
        "D:/downloads",
        "5250-8750_Clip Video.%(ext)s",
      ));
      expect(args[sectionIndex + 1]).toBe("*00:00:05.250-00:00:08.750");
      return 0;
    });

    const context = {
      traceId: "trace-youtube-clip",
      outputDir: "D:/downloads",
      outputStem: "Clip Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=clip123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=clip123",
        pageUrl: "https://www.youtube.com/watch?v=clip123",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "best",
        clipStartSec: 5.25,
        clipEndSec: 8.75,
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      file_path: path.join("D:/downloads", "5250-8750_Clip Video.mp4"),
    });
  });

  it("emits clip download progress from yt-dlp stderr section and ffmpeg time lines", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Clip Video"
        : path.join("D:/downloads", "5000-25000_Clip Video.mp4")
    ));
    const onProgress = vi.fn(async () => undefined);
    runStreamingCommandMock.mockImplementation(async (_command, _args, options) => {
      await options?.onStderrLine?.("[download] Downloading section 1 of 1");
      await options?.onStderrLine?.("size=   2048kB time=00:00:05.00 bitrate=3355.4kbits/s speed=2.5x");
      return 0;
    });

    const context = {
      traceId: "trace-youtube-clip-progress",
      outputDir: "D:/downloads",
      outputStem: "Clip Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=clip123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=clip123",
        pageUrl: "https://www.youtube.com/watch?v=clip123",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "best",
        clipStartSec: 5,
        clipEndSec: 25,
      },
      abortSignal: new AbortController().signal,
      onProgress,
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      file_path: path.join("D:/downloads", "5000-25000_Clip Video.mp4"),
    });

    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      traceId: "trace-youtube-clip-progress",
      percent: -1,
      stage: "downloading",
      speed: "Downloading media...",
    }));
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      traceId: "trace-youtube-clip-progress",
      percent: 25,
      stage: "downloading",
      speed: "2.5x",
    }));
  });

  it("adds yt-dlp download sections for Bilibili clip downloads", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Bilibili Clip"
        : path.join("D:/downloads", "12000-24000_Bilibili Clip.mp4")
    ));
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      const sectionIndex = args.indexOf("--download-sections");
      expect(sectionIndex).toBeGreaterThanOrEqual(0);
      expect(args[sectionIndex + 1]).toBe("*00:00:12-00:00:24");
      expect(args).not.toContain("--extractor-args");
      return 0;
    });

    const context = {
      traceId: "trace-bilibili-clip",
      outputDir: "D:/downloads",
      outputStem: "Bilibili Clip",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.bilibili.com/video/BV1xx411c7mD?p=2",
      },
      intent: {
        originalUrl: "https://www.bilibili.com/video/BV1xx411c7mD?p=2",
        pageUrl: "https://www.bilibili.com/video/BV1xx411c7mD?p=2",
        selectionScope: "current_item",
        siteId: "bilibili",
        videoQuality: "best",
        clipStartSec: 12,
        clipEndSec: 24,
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      file_path: path.join("D:/downloads", "12000-24000_Bilibili Clip.mp4"),
    });
  });

  it("rejects clip downloads for sites outside YouTube and Bilibili", async () => {
    readdirMock.mockResolvedValue([]);

    const context = {
      traceId: "trace-twitter-clip",
      outputDir: "D:/downloads",
      outputStem: "Twitter Clip",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://x.com/ameow/status/1234567890",
      },
      intent: {
        originalUrl: "https://x.com/ameow/status/1234567890",
        pageUrl: "https://x.com/ameow/status/1234567890",
        selectionScope: "current_item",
        siteId: "twitter-x",
        videoQuality: "best",
        clipStartSec: 3,
        clipEndSec: 9,
      },
      plan: {
        providerId: "twitter-x",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).rejects.toMatchObject({
      name: "DownloadRuntimeError",
      code: "E_INVALID_ENGINE_PLAN",
      message: "Clip downloads are only supported for YouTube and Bilibili",
    } satisfies Partial<DownloadRuntimeError>);
    expect(runStreamingCommandMock).not.toHaveBeenCalled();
  });

  it("maps a missing source URL to an invalid engine plan error", async () => {
    const context = {
      traceId: "trace-missing-source",
      outputDir: "D:/downloads",
      outputStem: "Missing Source",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {},
      intent: {},
      plan: {
        providerId: "generic",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).rejects.toMatchObject({
      name: "DownloadRuntimeError",
      code: "E_INVALID_ENGINE_PLAN",
      message: "yt-dlp source URL is missing",
    } satisfies Partial<DownloadRuntimeError>);
    expect(runStreamingCommandMock).not.toHaveBeenCalled();
  });

  it("preserves runtime error codes that escape the yt-dlp execution path", async () => {
    readdirMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(["video.mp4.part"]);
    readFileMock.mockRejectedValue(new Error("missing report"));
    runStreamingCommandMock.mockResolvedValue(0);

    const context = {
      traceId: "trace-runtime-error",
      outputDir: "D:/downloads",
      outputStem: "video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://example.com/watch?v=runtime-error",
      },
      intent: {
        originalUrl: "https://example.com/watch?v=runtime-error",
      },
      plan: {
        providerId: "generic",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).rejects.toMatchObject({
      name: "DownloadRuntimeError",
      code: "E_OUTPUT_NOT_FOUND",
      message: "yt-dlp exited successfully but produced no final output path",
    } satisfies Partial<DownloadRuntimeError>);
    expect(unlinkMock).toHaveBeenCalledWith(path.join("D:/downloads", "video.mp4.part"));
  });

  it("keeps injected public high quality downloads on extended mode", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Injected Public Video"
        : path.join("D:/downloads", "Injected Public Video.mp4")
    ));
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      expect(args).toContain("--no-playlist");
      expect(args).toContain("--extractor-args");
      expect(args).toContain("youtube:player_js_variant=tv");
      expect(args).toContain("--remote-components");
      expect(args).not.toContain("--cookies");
      expect(args).toContain("ejs:github");
      expect(args).toContain("--js-runtimes");
      return 0;
    });

    const context = {
      traceId: "trace-public-injected",
      outputDir: "D:/downloads",
      outputStem: "Injected Public Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=public123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=public123",
        pageUrl: "https://www.youtube.com/watch?v=public123",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "best",
        extensionData: {
          youtube: {
            source: "injected",
            allowCookies: false,
          },
        },
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runYtDlpDownload(context)).resolves.toMatchObject({
      success: true,
      file_path: path.join("D:/downloads", "Injected Public Video.mp4"),
    });
  });

  it("does not retry youtube failures after the download has been aborted", async () => {
    readdirMock.mockResolvedValue([]);
    readFileMock.mockImplementation(async (filePath: string) => (
      filePath.endsWith("-title.txt")
        ? "Cancelled Video"
        : path.join("D:/downloads", "Cancelled Video.mp4")
    ));
    const onProgress = vi.fn(async () => undefined);
    const abortController = new AbortController();
    runStreamingCommandMock.mockImplementationOnce(async (_command, args, options) => {
      expect(args).toContain("youtube:player_js_variant=tv");
      expect(args).toContain("--remote-components");
      abortController.abort();
      await options?.onStderrLine?.("ERROR: Sign in to confirm you're not a bot");
      return 1;
    });

    const context = {
      traceId: "trace-cancelled-youtube",
      outputDir: "D:/downloads",
      outputStem: "Cancelled Video",
      config: {},
      binaries: {
        ytDlp: "D:/yt-dlp.exe",
        ffmpeg: "D:/ffmpeg/ffmpeg.exe",
        deno: "D:/deno/deno.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.youtube.com/watch?v=cancel123",
      },
      intent: {
        originalUrl: "https://www.youtube.com/watch?v=cancel123",
        pageUrl: "https://www.youtube.com/watch?v=cancel123",
        selectionScope: "current_item",
        siteId: "youtube",
        videoQuality: "data_saver",
        extensionData: {
          youtube: {
            source: "injected",
            allowCookies: false,
          },
        },
      },
      abortSignal: abortController.signal,
      onProgress,
    } as never;

    await expect(runYtDlpDownload(context)).rejects.toThrow("Sign in to confirm you're not a bot");
    expect(runStreamingCommandMock).toHaveBeenCalledTimes(1);
    expect(onProgress).not.toHaveBeenCalledWith(expect.objectContaining({
      speed: "activity:youtube.retryingCompatibleExtractor",
    }));
  });
});
