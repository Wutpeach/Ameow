import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { readdirMock, unlinkMock, runStreamingCommandMock } = vi.hoisted(() => ({
  readdirMock: vi.fn(),
  unlinkMock: vi.fn(async () => undefined),
  runStreamingCommandMock: vi.fn(),
}));

vi.mock("node:fs", () => ({
  promises: {
    readdir: readdirMock,
    unlink: unlinkMock,
  },
}));

vi.mock("./processRunner.js", () => ({
  runStreamingCommand: runStreamingCommandMock,
}));

vi.mock("./sidecarCookies.js", () => ({
  writeCookiesFile: vi.fn(async (traceId: string, cookies: string | undefined) => (
    cookies?.trim() ? `C:/temp/${traceId}-cookies.txt` : null
  )),
  cleanupCookiesFile: vi.fn(async () => undefined),
}));

import { DownloadRuntimeError } from "../core/index.js";
import { runGalleryDlDownload } from "./galleryDlDownload.js";

describe("runGalleryDlDownload", () => {
  beforeEach(() => {
    readdirMock.mockReset();
    unlinkMock.mockClear();
    runStreamingCommandMock.mockReset();
  });

  it("switches gallery-dl tasks into downloading state before detailed output is available", async () => {
    readdirMock.mockResolvedValue([]);
    runStreamingCommandMock.mockResolvedValue(0);
    const onProgress = vi.fn(async () => undefined);

    const context = {
      traceId: "trace-progress",
      outputDir: "D:/downloads",
      outputStem: "pin",
      binaries: {
        galleryDl: "D:/gallery-dl.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.pinterest.com/pin/123/",
      },
      intent: {
        originalUrl: "https://www.pinterest.com/pin/123/",
      },
      plan: {
        providerId: "pinterest",
      },
      abortSignal: new AbortController().signal,
      onProgress,
    } as never;

    await expect(runGalleryDlDownload(context)).rejects.toMatchObject({
      message: "gallery-dl finished without producing an output file",
    } satisfies Partial<DownloadRuntimeError>);

    expect(onProgress).toHaveBeenNthCalledWith(1, expect.objectContaining({
      traceId: "trace-progress",
      percent: 0,
      stage: "preparing",
    }));
    expect(onProgress).toHaveBeenNthCalledWith(2, expect.objectContaining({
      traceId: "trace-progress",
      percent: -1,
      stage: "downloading",
      speed: "activity:galleryDl.resolvingMedia",
    }));
  });

  it("passes extension cookies to gallery-dl through a Netscape cookie file", async () => {
    readdirMock.mockResolvedValue([]);
    runStreamingCommandMock.mockImplementation(async (_command, args) => {
      expect(args).toContain("--cookies");
      const cookieFlagIndex = args.indexOf("--cookies");
      expect(cookieFlagIndex).toBeGreaterThanOrEqual(0);
      expect(String(args[cookieFlagIndex + 1] ?? "")).toMatch(/trace-cookie-cookies\.txt$/);
      return 0;
    });

    const context = {
      traceId: "trace-cookie",
      outputDir: "D:/downloads",
      outputStem: "pin",
      binaries: {
        galleryDl: "D:/gallery-dl.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.pinterest.com/pin/123/",
      },
      intent: {
        originalUrl: "https://www.pinterest.com/pin/123/",
        cookies: "# Netscape HTTP Cookie File\n.example.com\tTRUE\t/\tFALSE\t0\tsid\tabc",
      },
      plan: {
        providerId: "pinterest",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runGalleryDlDownload(context)).rejects.toMatchObject({
      message: "gallery-dl finished without producing an output file",
    } satisfies Partial<DownloadRuntimeError>);
  });

  it("passes manual proxy to gallery-dl through child-process environment", async () => {
    readdirMock.mockResolvedValue([]);
    runStreamingCommandMock.mockImplementation(async (_command, args, options) => {
      expect(args).toContain("--proxy");
      expect(args[args.indexOf("--proxy") + 1]).toBe("http://127.0.0.1:7890");
      expect(args).toContain("extractor.*.proxy-env=false");
      expect(options.env).not.toHaveProperty("HTTP_PROXY");
      expect(options.env).not.toHaveProperty("HTTPS_PROXY");
      expect(options.env).not.toHaveProperty("ALL_PROXY");
      expect(options.env).not.toHaveProperty("no_proxy");
      return 0;
    });

    const context = {
      traceId: "trace-proxy",
      outputDir: "D:/downloads",
      outputStem: "pin",
      network: {
        route: {
          mode: "proxy",
          source: "manual",
          protocol: "http",
          proxyUrl: "http://127.0.0.1:7890",
          resolvedFor: "https://www.pinterest.com/pin/123/",
        },
      },
      binaries: {
        galleryDl: "D:/gallery-dl.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.pinterest.com/pin/123/",
      },
      intent: {
        originalUrl: "https://www.pinterest.com/pin/123/",
      },
      plan: {
        providerId: "pinterest",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runGalleryDlDownload(context)).rejects.toMatchObject({
      message: "gallery-dl finished without producing an output file",
    } satisfies Partial<DownloadRuntimeError>);
  });

  it("applies explicit direct to gallery-dl as --proxy \"\" plus proxy-env=false with scrubbed env", async () => {
    readdirMock.mockResolvedValue([]);
    runStreamingCommandMock.mockImplementation(async (_command, args, options) => {
      expect(args).toContain("--proxy");
      expect(args[args.indexOf("--proxy") + 1]).toBe("");
      expect(args).toContain("extractor.*.proxy-env=false");
      expect(options.env).not.toHaveProperty("HTTP_PROXY");
      expect(options.env).not.toHaveProperty("ALL_PROXY");
      expect(options.env).not.toHaveProperty("NO_PROXY");
      return 0;
    });

    const context = {
      traceId: "trace-direct",
      outputDir: "D:/downloads",
      outputStem: "pin",
      network: {
        route: {
          mode: "direct",
          source: "system",
          reason: "resolved_direct",
          resolvedFor: "https://www.pinterest.com/pin/123/",
        },
      },
      binaries: {
        galleryDl: "D:/gallery-dl.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.pinterest.com/pin/123/",
      },
      intent: {
        originalUrl: "https://www.pinterest.com/pin/123/",
      },
      plan: {
        providerId: "pinterest",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runGalleryDlDownload(context)).rejects.toMatchObject({
      message: "gallery-dl finished without producing an output file",
    } satisfies Partial<DownloadRuntimeError>);
  });

  it("rejects complex routes before spawning gallery-dl", async () => {
    readdirMock.mockResolvedValue([]);
    const context = {
      traceId: "trace-complex",
      outputDir: "D:/downloads",
      outputStem: "pin",
      network: {
        route: {
          mode: "complex",
          source: "system",
          reason: "multiple_candidates",
          candidates: [],
          resolvedFor: "https://www.pinterest.com/pin/123/",
        },
      },
      binaries: {
        galleryDl: "D:/gallery-dl.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.pinterest.com/pin/123/",
      },
      intent: {
        originalUrl: "https://www.pinterest.com/pin/123/",
      },
      plan: {
        providerId: "pinterest",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runGalleryDlDownload(context)).rejects.toMatchObject({
      code: "E_EXECUTION_FAILED",
      context: {
        networkFailureClassification: "NETWORK_PROXY_UNSUPPORTED",
      },
    });
    expect(runStreamingCommandMock).not.toHaveBeenCalled();
  });

  it("reports the rejected complex outcome through onNetworkApplication", async () => {
    readdirMock.mockResolvedValue([]);
    const onNetworkApplication = vi.fn();
    const context = {
      traceId: "trace-complex-outcome",
      outputDir: "D:/downloads",
      outputStem: "pin",
      onNetworkApplication,
      network: {
        route: {
          mode: "complex",
          source: "system",
          reason: "multiple_candidates",
          candidates: [],
          resolvedFor: "https://www.pinterest.com/pin/123/",
        },
      },
      binaries: {
        galleryDl: "D:/gallery-dl.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.pinterest.com/pin/123/",
      },
      intent: {
        originalUrl: "https://www.pinterest.com/pin/123/",
      },
      plan: {
        providerId: "pinterest",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runGalleryDlDownload(context)).rejects.toMatchObject({
      code: "E_EXECUTION_FAILED",
    });
    expect(onNetworkApplication).toHaveBeenCalledWith(expect.objectContaining({
      engine: "gallery-dl",
      appliedToEngine: false,
      failureClassification: "NETWORK_PROXY_UNSUPPORTED",
    }));
  });

  it("classifies proxy auth failures from stderr evidence", async () => {
    readdirMock.mockResolvedValue([]);
    runStreamingCommandMock.mockImplementation(async (_command, _args, options) => {
      await options.onStderrLine?.("ERROR: 407 Proxy Authentication Required");
      return 1;
    });
    const context = {
      traceId: "trace-proxy-auth",
      outputDir: "D:/downloads",
      outputStem: "pin",
      network: {
        route: {
          mode: "direct",
          source: "system",
          reason: "resolved_direct",
          resolvedFor: "https://www.pinterest.com/pin/123/",
        },
      },
      binaries: {
        galleryDl: "D:/gallery-dl.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.pinterest.com/pin/123/",
      },
      intent: {
        originalUrl: "https://www.pinterest.com/pin/123/",
      },
      plan: {
        providerId: "pinterest",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await runGalleryDlDownload(context).catch((error) => {
      expect(error.code).toBe("E_EXECUTION_FAILED");
      expect(error.context?.networkFailureClassification).toBe("NETWORK_PROXY_AUTH_FAILED");
    });
  });

  it("redacts credentials in stderr-derived error messages without losing the classification", async () => {
    readdirMock.mockResolvedValue([]);
    runStreamingCommandMock.mockImplementation(async (_command, _args, options) => {
      await options.onStderrLine?.(
        "ERROR: Cannot connect to proxy http://user:hunter2@127.0.0.1:7897",
      );
      return 1;
    });
    const context = {
      traceId: "trace-proxy-leak",
      outputDir: "D:/downloads",
      outputStem: "pin",
      network: {
        route: {
          mode: "direct",
          source: "system",
          reason: "resolved_direct",
          resolvedFor: "https://www.pinterest.com/pin/123/",
        },
      },
      binaries: {
        galleryDl: "D:/gallery-dl.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.pinterest.com/pin/123/",
      },
      intent: {
        originalUrl: "https://www.pinterest.com/pin/123/",
      },
      plan: {
        providerId: "pinterest",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await runGalleryDlDownload(context).catch((error) => {
      expect(JSON.stringify(error)).not.toContain("hunter2");
      expect(error.context?.networkFailureClassification)
        .toBe("NETWORK_PROXY_CONNECTION_FAILED");
    });
  });

  it("never classifies content-level failures (403) as proxy failures", async () => {
    readdirMock.mockResolvedValue([]);
    runStreamingCommandMock.mockImplementation(async (_command, _args, options) => {
      await options.onStderrLine?.("ERROR: HTTP Error 403: Forbidden");
      return 1;
    });
    const context = {
      traceId: "trace-content-failure",
      outputDir: "D:/downloads",
      outputStem: "pin",
      network: {
        route: {
          mode: "direct",
          source: "system",
          reason: "resolved_direct",
          resolvedFor: "https://www.pinterest.com/pin/123/",
        },
      },
      binaries: {
        galleryDl: "D:/gallery-dl.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.pinterest.com/pin/123/",
      },
      intent: {
        originalUrl: "https://www.pinterest.com/pin/123/",
      },
      plan: {
        providerId: "pinterest",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await runGalleryDlDownload(context).catch((error) => {
      expect(error.code).toBe("E_EXECUTION_FAILED");
      expect(error.context?.networkFailureClassification).toBeUndefined();
    });
  });

  it("maps gallery-dl output lines to human-friendly activity labels", async () => {
    readdirMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(["pin.mp4"]);
    const onProgress = vi.fn(async () => undefined);
    runStreamingCommandMock.mockImplementation(async (_command, _args, options) => {
      await options.onStdoutLine?.("[gallery-dl][info] collecting pin metadata");
      return 0;
    });

    const context = {
      traceId: "trace-humanized",
      outputDir: "D:/downloads",
      outputStem: "pin",
      binaries: {
        galleryDl: "D:/gallery-dl.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.pinterest.com/pin/123/",
      },
      intent: {
        originalUrl: "https://www.pinterest.com/pin/123/",
      },
      plan: {
        providerId: "pinterest",
      },
      abortSignal: new AbortController().signal,
      onProgress,
    } as never;

    await expect(runGalleryDlDownload(context)).resolves.toMatchObject({
      success: true,
      file_path: path.join("D:/downloads", "pin.mp4"),
    });

    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      traceId: "trace-humanized",
      stage: "downloading",
      speed: "activity:galleryDl.collectingMetadata",
    }));
  });

  it("surfaces the tail of gallery-dl stderr when the command fails", async () => {
    readdirMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(["pin.mp4.part", "pin.mp4.txt"]);
    runStreamingCommandMock.mockImplementation(async (_command, _args, options) => {
      await options.onStdoutLine?.("[gallery-dl][info] collecting pin metadata");
      await options.onStderrLine?.("HTTP Error 403: Forbidden");
      return 4;
    });

    const context = {
      traceId: "trace-1",
      outputDir: "D:/downloads",
      outputStem: "pin",
      binaries: {
        galleryDl: "D:/gallery-dl.exe",
      },
      enginePlan: {
        sourceUrl: "https://www.pinterest.com/pin/123/",
      },
      intent: {
        originalUrl: "https://www.pinterest.com/pin/123/",
      },
      plan: {
        providerId: "pinterest",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runGalleryDlDownload(context)).rejects.toMatchObject({
      name: "DownloadRuntimeError",
      message: "gallery-dl exited with code 4: HTTP Error 403: Forbidden",
    } satisfies Partial<DownloadRuntimeError>);
    expect(unlinkMock).toHaveBeenCalledWith(path.join("D:/downloads", "pin.mp4.part"));
    expect(unlinkMock).toHaveBeenCalledWith(path.join("D:/downloads", "pin.mp4.txt"));
  });

  it("maps a missing source URL to an invalid engine plan error", async () => {
    const context = {
      traceId: "trace-missing-source",
      outputDir: "D:/downloads",
      outputStem: "pin",
      binaries: {
        galleryDl: "D:/gallery-dl.exe",
      },
      enginePlan: {},
      intent: {},
      plan: {
        providerId: "pinterest",
      },
      abortSignal: new AbortController().signal,
      onProgress: vi.fn(async () => undefined),
    } as never;

    await expect(runGalleryDlDownload(context)).rejects.toMatchObject({
      name: "DownloadRuntimeError",
      code: "E_INVALID_ENGINE_PLAN",
      message: "gallery-dl source URL is missing",
    } satisfies Partial<DownloadRuntimeError>);
    expect(runStreamingCommandMock).not.toHaveBeenCalled();
  });
});
