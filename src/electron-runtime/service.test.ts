import { existsSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type DownloadEngine,
  type EngineExecutionContext,
  type RawDownloadInput,
  type SiteProvider,
} from "../core";
import type { DownloadTelemetryEvent } from "../download-capabilities/telemetry";
import { genericProvider } from "../sites/generic";
import { pinterestProvider } from "../sites/pinterest";
import { xiaohongshuProvider } from "../sites/xiaohongshu";
import { youtubeProvider } from "../sites/youtube";

const { probeGalleryDlMetadataTitleMock } = vi.hoisted(() => ({
  probeGalleryDlMetadataTitleMock: vi.fn<() => Promise<string | undefined>>(async () => undefined),
}));

const {
  resolveGalleryDlMetadataTitleFromSidecarsMock,
  cleanupGalleryDlMetadataSidecarsMock,
} = vi.hoisted(() => ({
  resolveGalleryDlMetadataTitleFromSidecarsMock: vi.fn<() => Promise<string | undefined>>(async () => undefined),
  cleanupGalleryDlMetadataSidecarsMock: vi.fn(async (
    outputDir: string,
    outputStem: string,
    filePath?: string,
  ) => {
    const candidates = [
      `${outputStem}.info.json`,
      `${outputStem}.json`,
      filePath ? `${path.parse(filePath).name}.info.json` : null,
      filePath ? `${path.parse(filePath).name}.json` : null,
      "info.json",
    ].filter((entry): entry is string => Boolean(entry));

    for (const entry of candidates) {
      try {
        unlinkSync(path.join(outputDir, entry));
      } catch {
        // Ignore missing sidecars in tests.
      }
    }
  }),
}));

const {
  prepareVideoTranscodeTaskFromDownloadMock,
  runPreparedVideoTranscodeTaskMock,
} = vi.hoisted(() => ({
  prepareVideoTranscodeTaskFromDownloadMock: vi.fn(),
  runPreparedVideoTranscodeTaskMock: vi.fn(),
}));

vi.mock("./galleryDlMetadata.js", () => ({
  probeGalleryDlMetadataTitle: probeGalleryDlMetadataTitleMock,
  resolveGalleryDlMetadataTitleFromSidecars: resolveGalleryDlMetadataTitleFromSidecarsMock,
  cleanupGalleryDlMetadataSidecars: cleanupGalleryDlMetadataSidecarsMock,
}));

vi.mock("./transcode.js", () => ({
  prepareVideoTranscodeTaskFromDownload: prepareVideoTranscodeTaskFromDownloadMock,
  runPreparedVideoTranscodeTask: runPreparedVideoTranscodeTaskMock,
}));

import {
  FAILED_TRANSCODE_RETENTION_LIMIT,
  createElectronDownloadRuntime,
} from "./service";
import type {
  RuntimeAuthFailureRecoveryContext,
  RuntimeEmitterEvent,
} from "./contracts";
import { resetRenameSequenceState } from "./renameRules";
import { bilibiliProvider } from "../sites/bilibili";
import { galleryDlSupportedProvider } from "../sites/gallery-dl-supported";
import { weiboProvider } from "../sites/weibo";

const waitFor = async (
  predicate: () => boolean,
  attempts = 20,
): Promise<void> => {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

const createEngineStub = (
  id: "yt-dlp" | "gallery-dl",
  execute: DownloadEngine["execute"],
): DownloadEngine => ({
  id,
  validateIntent() {
    return null;
  },
  execute,
});

const createRuntime = (options: {
  providers?: SiteProvider[];
  engines?: DownloadEngine[];
  maxConcurrent?: number;
  configString?: string;
  ensureEngineRuntimeReady?: (engineId: "yt-dlp" | "gallery-dl" | "douyin-dl", reason: string) => Promise<void>;
  buildExecutionContext?: (
    context: EngineExecutionContext,
    input: RawDownloadInput,
  ) => EngineExecutionContext;
  environment?: {
    repoRoot?: string;
    configDir?: string;
    platform?: "win32" | "darwin" | "linux";
    arch?: "x64" | "arm64";
    desktopDir?: string;
    fetch?: typeof fetch;
  };
  onEmit?(event: RuntimeEmitterEvent, payload: unknown): void;
  onTelemetry?(event: DownloadTelemetryEvent): void;
  handleAuthRequiredFailure?(
    context: RuntimeAuthFailureRecoveryContext,
  ): Promise<{ shouldRetry: boolean } | void>;
  resolveNetworkProxy?: (context: {
    targetUrl: string;
    providerId: string | null;
    engineId: "yt-dlp" | "gallery-dl" | "douyin-dl";
  }) => Promise<string | null | undefined>;
}) => createElectronDownloadRuntime({
  environment: {
    repoRoot: options.environment?.repoRoot ?? process.cwd(),
    configDir: options.environment?.configDir ?? path.join(process.cwd(), ".tmp-config"),
    platform: options.environment?.platform ?? "win32",
    arch: options.environment?.arch ?? "x64",
    desktopDir: options.environment?.desktopDir,
    fetch: options.environment?.fetch,
  },
  configStore: {
    async readConfigString() {
      return options.configString ?? "{}";
    },
  },
  eventSink: {
    emit(event, payload) {
      options.onEmit?.(event, payload);
    },
  },
  telemetrySink: {
    async record(event) {
      options.onTelemetry?.(event);
    },
  },
  ensureEngineRuntimeReady: options.ensureEngineRuntimeReady,
  buildExecutionContext: options.buildExecutionContext,
  handleAuthRequiredFailure: options.handleAuthRequiredFailure,
  resolveNetworkProxy: options.resolveNetworkProxy,
  maxConcurrent: options.maxConcurrent,
  providers: options.providers,
  engines: options.engines,
});

describe("AmeowElectronDownloadRuntime", () => {
  afterEach(() => {
    resetRenameSequenceState();
    probeGalleryDlMetadataTitleMock.mockReset();
    probeGalleryDlMetadataTitleMock.mockResolvedValue(undefined);
    resolveGalleryDlMetadataTitleFromSidecarsMock.mockReset();
    resolveGalleryDlMetadataTitleFromSidecarsMock.mockResolvedValue(undefined);
    cleanupGalleryDlMetadataSidecarsMock.mockClear();
    prepareVideoTranscodeTaskFromDownloadMock.mockReset();
    prepareVideoTranscodeTaskFromDownloadMock.mockResolvedValue(null);
    runPreparedVideoTranscodeTaskMock.mockReset();
    runPreparedVideoTranscodeTaskMock.mockImplementation(async (task: { finalPath: string }) => ({
      filePath: task.finalPath,
    }));
  });

  it("emits queue state changes and enforces max concurrency", async () => {
    const activeTraceIds: string[] = [];
    let inFlight = 0;
    let peakInFlight = 0;
    const completions: Array<() => void> = [];
    const events: Array<{ event: RuntimeEmitterEvent; payload: unknown }> = [];

    const runtime = createRuntime({
      maxConcurrent: 2,
      providers: [genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          activeTraceIds.push(context.traceId);
          inFlight += 1;
          peakInFlight = Math.max(peakInFlight, inFlight);
          await new Promise<void>((resolve) => {
            completions.push(() => {
              inFlight -= 1;
              resolve();
            });
          });
          return {
            traceId: context.traceId,
            success: true,
            file_path: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
      onEmit(event, payload) {
        events.push({ event, payload });
      },
    });

    const first = await runtime.queueVideoDownload({ url: "https://example.com/1" });
    const second = await runtime.queueVideoDownload({ url: "https://example.com/2" });
    const third = await runtime.queueVideoDownload({ url: "https://example.com/3" });

    await waitFor(() => peakInFlight === 2);
    expect(runtime.getQueueState().totalCount).toBe(3);
    expect(peakInFlight).toBe(2);
    expect(activeTraceIds).toContain(first.traceId);
    expect(activeTraceIds).toContain(second.traceId);
    expect(activeTraceIds).not.toContain(third.traceId);

    completions.shift()?.();
    await waitFor(() => activeTraceIds.includes(third.traceId));
    expect(activeTraceIds).toContain(third.traceId);

    completions.shift()?.();
    completions.shift()?.();
    await waitFor(() => runtime.getQueueState().totalCount === 0);

    expect(runtime.getQueueState().totalCount).toBe(0);
    expect(events.some((entry) => entry.event === "video-download-complete")).toBe(true);
  });

  it("cancels pending work immediately", async () => {
    const completed: Array<{ traceId: string; success: boolean; error?: string }> = [];
    const runtime = createRuntime({
      maxConcurrent: 1,
      providers: [genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          await new Promise<void>(() => undefined);
          return {
            traceId: context.traceId,
            success: true,
            file_path: "ignored",
          };
        }),
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completed.push(payload as { traceId: string; success: boolean; error?: string });
        }
      },
    });

    await runtime.queueVideoDownload({ url: "https://example.com/active" });
    const pending = await runtime.queueVideoDownload({ url: "https://example.com/pending" });

    const cancelled = await runtime.cancelDownload(pending.traceId);

    expect(cancelled).toBe(true);
    expect(completed.some((entry) => entry.traceId === pending.traceId)).toBe(true);
  });

  it("settles an active task after cancellation", async () => {
    const completed: Array<{ traceId: string; success: boolean; error?: string }> = [];
    const runtime = createRuntime({
      maxConcurrent: 1,
      providers: [genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context): Promise<never> => (
          await new Promise<never>((_resolve, reject) => {
            if (context.abortSignal.aborted) {
              reject(new Error("active task aborted"));
              return;
            }
            context.abortSignal.addEventListener(
              "abort",
              () => reject(new Error("active task aborted")),
              { once: true },
            );
          })
        )),
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completed.push(payload as { traceId: string; success: boolean; error?: string });
        }
      },
    });

    const active = await runtime.queueVideoDownload({ url: "https://example.com/active" });
    await waitFor(() => runtime.getQueueState().activeCount === 1);

    const cancelled = await runtime.cancelDownload(active.traceId);

    expect(cancelled).toBe(true);
    await waitFor(() => completed.some((entry) => entry.traceId === active.traceId));
    expect(completed.some((entry) => entry.traceId === active.traceId)).toBe(true);
    expect(completed.find((entry) => entry.traceId === active.traceId)).toMatchObject({
      success: false,
    });
    await waitFor(() => runtime.getQueueState().totalCount === 0);
  });

  it("records success telemetry with site, interaction mode, engine chain, and chosen engine", async () => {
    const telemetry: DownloadTelemetryEvent[] = [];
    prepareVideoTranscodeTaskFromDownloadMock.mockImplementation(async (...args: unknown[]) => {
      const input = args[0] as {
        onCompatibilityAnalysis?: (analysis: unknown) => void;
      };
      input.onCompatibilityAnalysis?.({
        sourceExtension: "mp4",
        containerNames: ["mov", "mp4"],
        videoCodec: "h264",
        audioCodec: "aac",
        decision: "skip_compatible",
        probeFailed: false,
        probeErrorSummary: null,
      });
      return null;
    });
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          file_path: `${context.outputDir}/${context.outputStem}.mp4`,
        })),
      ],
      onTelemetry(event) {
        telemetry.push(event);
      },
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
    });

    await waitFor(() => telemetry.length === 1);
    expect(prepareVideoTranscodeTaskFromDownloadMock).toHaveBeenCalledTimes(1);
    expect(telemetry[0]).toMatchObject({
      eventType: "download_outcome",
      outcome: "success",
      siteId: "youtube",
      providerId: "youtube",
      interactionMode: "paste",
      engineChain: ["yt-dlp"],
      chosenEngine: "yt-dlp",
      errorCode: null,
      errorClassification: null,
      downloadProfile: {
        qualityPreference: "best",
        ytdlpProfileKey: "youtube",
        ytdlpMergeOutputFormat: "mp4/mkv",
        ytdlpFormatSort: "res,codec:h264,acodec:aac,ext",
      },
      compatibility: {
        sourceExtension: "mp4",
        containerNames: ["mov", "mp4"],
        videoCodec: "h264",
        audioCodec: "aac",
        decision: "skip_compatible",
        probeFailed: false,
        probeErrorSummary: null,
      },
    });
  });

  it("ensures the selected engine runtime before executing the download", async () => {
    const ensured: Array<{ engineId: string; reason: string }> = [];
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      ensureEngineRuntimeReady: vi.fn(async (engineId, reason) => {
        ensured.push({ engineId, reason });
      }),
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          file_path: `${context.outputDir}/${context.outputStem}.mp4`,
        })),
      ],
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
    });

    await waitFor(() => ensured.length === 1);
    expect(ensured[0]?.engineId).toBe("yt-dlp");
    expect(ensured[0]?.reason).toMatch(/^runtime_execute_.*_yt-dlp$/);
  });

  it("passes resolved network proxy URLs into yt-dlp execution contexts", async () => {
    let receivedProxyUrl: string | null | undefined = undefined;
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      resolveNetworkProxy: vi.fn(async (context) => {
        expect(context).toMatchObject({
          targetUrl: "https://www.youtube.com/watch?v=abc123",
          providerId: "youtube",
          engineId: "yt-dlp",
        });
        return "http://127.0.0.1:7897";
      }),
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          receivedProxyUrl = context.proxyUrl;
          return {
            traceId: context.traceId,
            success: true,
            file_path: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
    });

    await waitFor(() => receivedProxyUrl !== undefined);
    expect(receivedProxyUrl).toBe("http://127.0.0.1:7897");
  });

  it("continues yt-dlp downloads when automatic proxy resolution fails", async () => {
    let executed = false;
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      resolveNetworkProxy: vi.fn(async () => {
        throw new Error("resolveProxy failed");
      }),
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          executed = true;
          expect(context.proxyUrl).toBeNull();
          return {
            traceId: context.traceId,
            success: true,
            file_path: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
    });

    await waitFor(() => executed);
  });

  it("waits for the selected engine runtime before executing the download", async () => {
    const runtimeEnsure = {
      release: null as (() => void) | null,
    };
    let engineExecuted = false;
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      ensureEngineRuntimeReady: vi.fn(async () => {
        await new Promise<void>((resolve) => {
          runtimeEnsure.release = resolve;
        });
      }),
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          engineExecuted = true;
          return {
            traceId: context.traceId,
            success: true,
            file_path: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
    });

    await waitFor(() => runtimeEnsure.release !== null);
    expect(engineExecuted).toBe(false);
    const resolveRuntimeEnsure = runtimeEnsure.release;
    if (!resolveRuntimeEnsure) {
      throw new Error("Runtime ensure resolver was not captured");
    }
    resolveRuntimeEnsure();
    await waitFor(() => engineExecuted);
  });

  it("records failure telemetry with classified errors", async () => {
    const telemetry: DownloadTelemetryEvent[] = [];
    const runtime = createRuntime({
      providers: [genericProvider],
      engines: [
        createEngineStub("yt-dlp", async () => {
          throw new Error("cookies required for this resource");
        }),
      ],
      onTelemetry(event) {
        telemetry.push(event);
      },
    });

    await runtime.queueVideoDownload({
      url: "https://example.com/protected",
      diagnostics: {
        source: "context_menu",
      },
    });

    await waitFor(() => telemetry.length === 1);
    expect(telemetry[0]).toMatchObject({
      outcome: "failure",
      siteId: "generic",
      providerId: "generic",
      interactionMode: "context_menu",
      engineChain: ["yt-dlp"],
      chosenEngine: "yt-dlp",
      errorCode: "E_EXECUTION_FAILED",
      errorClassification: "auth_required",
    });
  });

  it("does not retry auth-required failures through app-owned credential refresh", async () => {
    const completed: Array<{ success: boolean; error?: string }> = [];
    let attempts = 0;
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async () => {
          attempts += 1;
          throw new Error("cookies required for this resource");
        }),
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completed.push(payload as { success: boolean; error?: string });
        }
      },
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
    });

    await waitFor(() => completed.length === 1);
    expect(attempts).toBe(1);
    expect(completed[0]).toMatchObject({
      success: false,
      error: "cookies required for this resource",
    });
  });

  it("retries an auth-required failure once when extension site-session recovery succeeds", async () => {
    const completed: Array<{ success: boolean; error?: string }> = [];
    const recoveryContexts: RuntimeAuthFailureRecoveryContext[] = [];
    let attempts = 0;
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          attempts += 1;
          if (attempts === 1) {
            throw new Error("cookies required for this resource");
          }
          return {
            traceId: context.traceId,
            success: true,
            file_path: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
      async handleAuthRequiredFailure(context) {
        recoveryContexts.push(context);
        return { shouldRetry: true };
      },
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completed.push(payload as { success: boolean; error?: string });
        }
      },
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
    });

    await waitFor(() => completed.length === 1);
    expect(attempts).toBe(2);
    expect(recoveryContexts).toHaveLength(1);
    expect(recoveryContexts[0]).toMatchObject({
      plan: {
        providerId: "youtube",
        intent: {
          siteId: "youtube",
        },
      },
      chosenEngine: "yt-dlp",
      error: {
        classification: "auth_required",
      },
    });
    expect(completed[0]).toMatchObject({
      success: true,
    });
  });

  it("does not retry an auth-required failure when extension recovery declines", async () => {
    const completed: Array<{ success: boolean; error?: string }> = [];
    let attempts = 0;
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async () => {
          attempts += 1;
          throw new Error("cookies required for this resource");
        }),
      ],
      async handleAuthRequiredFailure() {
        return { shouldRetry: false };
      },
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completed.push(payload as { success: boolean; error?: string });
        }
      },
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
    });

    await waitFor(() => completed.length === 1);
    expect(attempts).toBe(1);
    expect(completed[0]).toMatchObject({
      success: false,
      error: "cookies required for this resource",
    });
  });

  it("prefers gallery-dl for a Pinterest page without a verified direct asset", async () => {
    const routes: string[] = [];
    const runtime = createRuntime({
      providers: [pinterestProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          routes.push(`yt:${context.traceId}`);
          return {
            traceId: context.traceId,
            success: true,
            file_path: "yt.mp4",
          };
        }),
        createEngineStub("gallery-dl", async (context) => {
          routes.push(`gallery:${context.traceId}`);
          return {
            traceId: context.traceId,
            success: true,
            file_path: "gallery.mp4",
          };
        }),
      ],
    });

    await runtime.queueVideoDownload({
      url: "https://www.pinterest.com/pin/1234567890/",
      pageUrl: "https://www.pinterest.com/pin/1234567890/",
    });

    await waitFor(() => routes.length > 0);
    expect(routes).toHaveLength(1);
    expect(routes[0]?.startsWith("gallery:")).toBe(true);
  });

  it("does not block gallery-dl downloads on a pre-download metadata probe", async () => {
    const outputStems: string[] = [];

    const runtime = createRuntime({
      providers: [galleryDlSupportedProvider, genericProvider],
      engines: [
        createEngineStub("gallery-dl", async (context) => {
          outputStems.push(context.outputStem);
          return {
            traceId: context.traceId,
            success: true,
            file_path: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
    });

    await runtime.queueVideoDownload({
      url: "https://www.instagram.com/p/C7example/",
      pageUrl: "https://www.instagram.com/p/C7example/",
      title: "Instagram",
    });

    await waitFor(() => outputStems.length === 1);
    expect(probeGalleryDlMetadataTitleMock).not.toHaveBeenCalled();
    expect(outputStems).toEqual(["Instagram"]);
  });

  it("renames gallery-dl downloads from info-json metadata after completion", async () => {
    const tempDir = path.join(
      os.tmpdir(),
      `ameow-gallerydl-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const completions: Array<{ file_path?: string; success: boolean }> = [];
    resolveGalleryDlMetadataTitleFromSidecarsMock.mockResolvedValue("alice - Sunset over the lake");

    const runtime = createRuntime({
      configString: JSON.stringify({ outputPath: tempDir }),
      providers: [galleryDlSupportedProvider, genericProvider],
      engines: [
        createEngineStub("gallery-dl", async (context) => {
          const filePath = path.join(context.outputDir, `${context.outputStem}.mp4`);
          writeFileSync(filePath, "video");
          writeFileSync(
            path.join(context.outputDir, `${context.outputStem}.info.json`),
            JSON.stringify({
              title: "Instagram",
              user: { username: "alice" },
              content: "Sunset over the lake",
            }),
          );
          return {
            traceId: context.traceId,
            success: true,
            file_path: filePath,
          };
        }),
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completions.push(payload as { file_path?: string; success: boolean });
        }
      },
    });

    try {
      await runtime.queueVideoDownload({
        url: "https://www.instagram.com/p/C7example/",
        pageUrl: "https://www.instagram.com/p/C7example/",
        title: "Instagram",
      });

      await waitFor(() => completions.length === 1);
      expect(completions[0]).toMatchObject({
        success: true,
        file_path: expect.stringMatching(/alice - Sunset over the lake\.mp4$/),
      });
      expect(existsSync(path.join(tempDir, "Instagram.info.json"))).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("removes generic gallery-dl info.json sidecars after completion", async () => {
    const tempDir = path.join(
      os.tmpdir(),
      `ameow-gallerydl-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const completions: Array<{ file_path?: string; success: boolean }> = [];
    resolveGalleryDlMetadataTitleFromSidecarsMock.mockResolvedValue("karl_shakur - DW1rwBtlnR9");

    const runtime = createRuntime({
      configString: JSON.stringify({ outputPath: tempDir }),
      providers: [galleryDlSupportedProvider, genericProvider],
      engines: [
        createEngineStub("gallery-dl", async (context) => {
          const filePath = path.join(context.outputDir, `${context.outputStem}.mp4`);
          writeFileSync(filePath, "video");
          writeFileSync(
            path.join(context.outputDir, "info.json"),
            JSON.stringify({
              post_shortcode: "DW1rwBtlnR9",
              username: "karl_shakur",
              description: "Long caption that should not become the final filename.",
            }),
          );
          return {
            traceId: context.traceId,
            success: true,
            file_path: filePath,
          };
        }),
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completions.push(payload as { file_path?: string; success: boolean });
        }
      },
    });

    try {
      await runtime.queueVideoDownload({
        url: "https://www.instagram.com/reel/DW1rwBtlnR9/",
        pageUrl: "https://www.instagram.com/reel/DW1rwBtlnR9/",
        title: "Instagram",
      });

      await waitFor(() => completions.length === 1);
      expect(completions[0]).toMatchObject({
        success: true,
        file_path: expect.stringMatching(/karl_shakur - DW1rwBtlnR9\.mp4$/),
      });
      expect(existsSync(path.join(tempDir, "info.json"))).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("uses gallery-dl for Pinterest even when a verified direct asset is present", async () => {
    const routes: string[] = [];
    const runtime = createRuntime({
      providers: [pinterestProvider, genericProvider],
      engines: [
        createEngineStub("gallery-dl", async (context) => {
          routes.push(`gallery:${context.traceId}`);
          expect(context.enginePlan.sourceUrl).toBe("https://www.pinterest.com/pin/1234567890/");
          expect(context.intent.candidates).toEqual([]);
          return {
            traceId: context.traceId,
            success: true,
            file_path: "gallery.mp4",
          };
        }),
      ],
    });

    const request: RawDownloadInput = {
      url: "https://www.pinterest.com/pin/1234567890/",
      pageUrl: "https://www.pinterest.com/pin/1234567890/",
      videoUrl: "https://v1.pinimg.com/videos/iht/expmp4/example.mp4",
    };

    await runtime.queueVideoDownload(request);

    await waitFor(() => routes.length > 0);
    expect(routes).toHaveLength(1);
    expect(routes[0]?.startsWith("gallery:")).toBe(true);
  });

  it("hydrates Xiaohongshu page requests but still routes through yt-dlp", async () => {
    const routes: string[] = [];
    const runtime = createRuntime({
      providers: [xiaohongshuProvider, genericProvider],
      environment: {
        fetch: async () => new Response(
          `
            <html>
              <script>
                window.__INITIAL_STATE__ = {
                  note: {
                    video: {
                      url: "https:\\/\\/sns-video-bd.xhscdn.com\\/stream\\/example-1080p.mp4"
                    }
                  }
                };
              </script>
            </html>
          `,
          {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8",
            },
          },
        ),
      },
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          routes.push(`yt:${context.traceId}`);
          expect(context.enginePlan.sourceUrl).toBe(
            "https://www.xiaohongshu.com/explore/69d4720e000000001d01a7d7",
          );
          expect(context.intent.candidates).toEqual([
            {
              url: "https://sns-video-bd.xhscdn.com/stream/example-1080p.mp4",
              type: "direct_cdn",
              source: "page_html",
              confidence: "high",
              mediaType: "video",
            },
          ]);
          return {
            traceId: context.traceId,
            success: true,
            file_path: "yt.mp4",
          };
        }),
      ],
    });

    await runtime.queueVideoDownload({
      url: "https://www.xiaohongshu.com/explore/69d4720e000000001d01a7d7",
      pageUrl: "https://www.xiaohongshu.com/explore/69d4720e000000001d01a7d7",
      siteHint: "xiaohongshu",
    });

    await waitFor(() => routes.length > 0);
    expect(routes).toHaveLength(1);
    expect(routes[0]?.startsWith("yt:")).toBe(true);
  });

  it("lets downloader engines receive short links without runtime expansion", async () => {
    const routes: string[] = [];
    const fetchImpl = vi.fn(async () => {
      const response = new Response(null, { status: 200 });
      Object.defineProperty(response, "url", {
        configurable: true,
        value: "https://weibo.com/tv/show/1034:5284278758473738",
      });
      return response;
    });
    const runtime = createRuntime({
      providers: [weiboProvider, genericProvider],
      environment: {
        fetch: fetchImpl as unknown as typeof fetch,
      },
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          routes.push(`yt:${context.traceId}`);
          expect(context.plan.providerId).toBe("generic");
          expect(context.enginePlan.sourceUrl).toBe("https://t.cn/AXIDyEZb");
          expect(context.intent.siteId).toBe("generic");
          return {
            traceId: context.traceId,
            success: true,
            file_path: "yt.mp4",
          };
        }),
      ],
    });

    await runtime.queueVideoDownload({
      url: "https://t.cn/AXIDyEZb",
    });

    await waitFor(() => routes.length > 0);
    expect(routes).toHaveLength(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("lets downloader engines receive Weibo visitor wrappers without runtime unwrapping", async () => {
    const routes: string[] = [];
    const wrapperUrl = "https://passport.weibo.com/visitor/visitor?entry=krvideo&a=enter&url=https%3A%2F%2Fweibo.com%2Ftv%2Fshow%2F1034%3A5283985857904677%3Ffrom%3Dold_pc_videoshow&domain=.weibo.com";
    const runtime = createRuntime({
      providers: [weiboProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          routes.push(`yt:${context.traceId}`);
          expect(context.plan.providerId).toBe("weibo");
          expect(context.enginePlan.sourceUrl).toBe(wrapperUrl);
          expect(context.intent.siteId).toBe("weibo");
          return {
            traceId: context.traceId,
            success: true,
            file_path: "yt.mp4",
          };
        }),
      ],
    });

    await runtime.queueVideoDownload({
      url: wrapperUrl,
      siteHint: "weibo",
    });

    await waitFor(() => routes.length > 0);
    expect(routes).toHaveLength(1);
  });

  it("uses yt-dlp for Xiaohongshu even when a verified direct asset is present", async () => {
    const routes: string[] = [];
    const completions: Array<{ traceId: string; success: boolean; error?: string }> = [];
    const runtime = createRuntime({
      providers: [xiaohongshuProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          routes.push(`yt:${context.traceId}`);
          expect(context.enginePlan.sourceUrl).toBe(
            "https://www.xiaohongshu.com/explore/69d0a92600000000230110ab",
          );
          return {
            traceId: context.traceId,
            success: true,
            file_path: "yt.mp4",
          };
        }),
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completions.push(payload as { traceId: string; success: boolean; error?: string });
        }
      },
    });

    await runtime.queueVideoDownload({
      url: "https://www.xiaohongshu.com/explore/69d0a92600000000230110ab",
      pageUrl: "https://www.xiaohongshu.com/explore/69d0a92600000000230110ab",
      siteHint: "xiaohongshu",
      videoUrl: "https://sns-video-v4.xhscdn.com/stream/example.mp4?sign=test",
      videoCandidates: [
        {
          url: "https://sns-video-v4.xhscdn.com/stream/example.mp4?sign=test",
          type: "direct_mp4",
          source: "extension_resolution",
          confidence: "high",
          mediaType: "video",
        },
      ],
    });

    await waitFor(() => completions.length > 0);
    expect(routes).toEqual([expect.stringMatching(/^yt:/)]);
    expect(completions[0]).toMatchObject({
      success: true,
    });
  });

  it("queues downstream transcode for Xiaohongshu yt-dlp downloads", async () => {
    const events: RuntimeEmitterEvent[] = [];
    prepareVideoTranscodeTaskFromDownloadMock.mockResolvedValue({
      traceId: "transcode-trace",
      label: "Xiaohongshu",
      sourcePath: "source.mp4",
      sourceFormat: "mp4",
      targetFormat: "mp4",
      plan: "remux_only",
      durationSeconds: null,
      finalPath: "/tmp/source.mp4",
    });
    const runtime = createRuntime({
      providers: [xiaohongshuProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          file_path: `${context.outputDir}/${context.outputStem}.mp4`,
        })),
      ],
      onEmit(event) {
        events.push(event);
      },
    });

    await runtime.queueVideoDownload({
      url: "https://www.xiaohongshu.com/explore/69d0a92600000000230110ab",
      pageUrl: "https://www.xiaohongshu.com/explore/69d0a92600000000230110ab",
      siteHint: "xiaohongshu",
      videoUrl: "https://sns-video-v4.xhscdn.com/stream/example.mp4?sign=test",
      videoCandidates: [
        {
          url: "https://sns-video-v4.xhscdn.com/stream/example.mp4?sign=test",
          type: "direct_mp4",
          source: "extension_resolution",
          confidence: "high",
          mediaType: "video",
        },
      ],
    });

    await waitFor(() => events.includes("video-download-complete"));
    expect(prepareVideoTranscodeTaskFromDownloadMock).toHaveBeenCalled();
    expect(events).toContain("video-transcode-queued");
  });

  it("records probe-failure compatibility telemetry while preserving full-transcode fallback", async () => {
    const events: RuntimeEmitterEvent[] = [];
    const telemetry: DownloadTelemetryEvent[] = [];
    prepareVideoTranscodeTaskFromDownloadMock.mockImplementation(async (...args: unknown[]) => {
      const input = args[0] as {
        traceId: string;
        label: string;
        sourcePath: string;
        onCompatibilityAnalysis?: (analysis: unknown) => void;
      };
      input.onCompatibilityAnalysis?.({
        sourceExtension: "mp4",
        containerNames: [],
        videoCodec: null,
        audioCodec: null,
        decision: "probe_failure_full_transcode",
        probeFailed: true,
        probeErrorSummary: "ffprobe failed before fallback",
      });
      return {
        traceId: input.traceId,
        label: input.label,
        sourcePath: input.sourcePath,
        sourceFormat: "mp4",
        targetFormat: "mp4",
        plan: "full_transcode",
        durationSeconds: null,
        finalPath: "D:/downloads/Probe Failure.mp4",
      };
    });
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          file_path: "D:/downloads/Probe Failure Source.mp4",
        })),
      ],
      onEmit(event) {
        events.push(event);
      },
      onTelemetry(event) {
        telemetry.push(event);
      },
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=probe-failure",
      pageUrl: "https://www.youtube.com/watch?v=probe-failure",
      siteHint: "youtube",
      title: "Probe Failure",
    });

    await waitFor(() => runtime.getTranscodeQueueState().totalCount === 1);
    await waitFor(() => events.includes("video-transcode-queued"));
    await waitFor(() => telemetry.length === 1);
    expect(telemetry[0]?.compatibility).toMatchObject({
      sourceExtension: "mp4",
      decision: "probe_failure_full_transcode",
      probeFailed: true,
      probeErrorSummary: "ffprobe failed before fallback",
    });
  });

  it("surfaces a Pinterest gallery-dl failure without falling back to yt-dlp", async () => {
    const routes: string[] = [];
    const completions: Array<{ traceId: string; success: boolean; error?: string }> = [];
    const runtime = createRuntime({
      providers: [pinterestProvider, genericProvider],
      engines: [
        createEngineStub("gallery-dl", async (context) => {
          routes.push(`gallery:${context.traceId}`);
          return {
            traceId: context.traceId,
            success: false,
            error: "gallery failed",
          };
        }),
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completions.push(payload as { traceId: string; success: boolean; error?: string });
        }
      },
    });

    await runtime.queueVideoDownload({
      url: "https://www.pinterest.com/pin/1234567890/",
      pageUrl: "https://www.pinterest.com/pin/1234567890/",
      siteHint: "pinterest",
    });

    await waitFor(() => completions.length > 0);
    expect(routes).toEqual([expect.stringMatching(/^gallery:/)]);
    expect(completions[0]).toMatchObject({
      success: false,
      error: "gallery failed",
    });
  });

  it("does not invoke a registered yt-dlp engine for Pinterest fallback plans", async () => {
    const routes: string[] = [];
    const runtime = createRuntime({
      providers: [pinterestProvider, genericProvider],
      engines: [
        createEngineStub("gallery-dl", async (context) => {
          routes.push(`gallery:${context.traceId}`);
          return {
            traceId: context.traceId,
            success: true,
            file_path: "gallery.mp4",
          };
        }),
        createEngineStub("yt-dlp", async (context) => {
          routes.push(`yt:${context.traceId}`);
          return {
            traceId: context.traceId,
            success: true,
            file_path: "yt.mp4",
          };
        }),
      ],
    });

    await runtime.queueVideoDownload({
      url: "https://www.pinterest.com/pin/1234567890/",
      pageUrl: "https://www.pinterest.com/pin/1234567890/",
      siteHint: "pinterest",
    });

    await waitFor(() => routes.length > 0);
    expect(routes).toEqual([expect.stringMatching(/^gallery:/)]);
  });

  it("reserves distinct output stems for concurrent same-title tasks", async () => {
    const outputDir = path.join(os.tmpdir(), `ameow-service-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const outputStems: string[] = [];
    const completions: Array<() => void> = [];

    const runtime = createRuntime({
      maxConcurrent: 2,
      configString: JSON.stringify({ outputPath: outputDir }),
      providers: [genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          outputStems.push(context.outputStem);
          await new Promise<void>((resolve) => {
            completions.push(resolve);
          });
          return {
            traceId: context.traceId,
            success: true,
            file_path: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
    });

    try {
      await runtime.queueVideoDownload({
        url: "https://example.com/1",
        title: "Pin 图卡片",
      });
      await runtime.queueVideoDownload({
        url: "https://example.com/2",
        title: "Pin 图卡片",
      });

      await waitFor(() => outputStems.length === 2);
      expect(outputStems).toContain("Pin 图卡片");
      expect(outputStems).toContain("Pin 图卡片 (2)");
    } finally {
      completions.splice(0).forEach((complete) => complete());
      await waitFor(() => runtime.getQueueState().totalCount === 0);
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("prefers title-first stems for pinterest tasks when a title is available", async () => {
    const outputStems: string[] = [];
    const completions: Array<() => void> = [];

    const runtime = createRuntime({
      maxConcurrent: 2,
      providers: [pinterestProvider, genericProvider],
      engines: [
        createEngineStub("gallery-dl", async (context) => {
          outputStems.push(context.outputStem);
          await new Promise<void>((resolve) => {
            completions.push(resolve);
          });
          return {
            traceId: context.traceId,
            success: true,
            file_path: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
    });

    try {
      await runtime.queueVideoDownload({
        url: "https://www.pinterest.com/pin/111111111111111111/",
        pageUrl: "https://www.pinterest.com/pin/111111111111111111/",
        title: "Pin 图卡片",
        siteHint: "pinterest",
      });
      await runtime.queueVideoDownload({
        url: "https://www.pinterest.com/pin/222222222222222222/",
        pageUrl: "https://www.pinterest.com/pin/222222222222222222/",
        title: "Pin 图卡片",
        siteHint: "pinterest",
      });

      await waitFor(() => outputStems.length === 2);
      expect(outputStems[0]).toBe("Pin 图卡片");
      expect(outputStems[1]).toBe("Pin 图卡片 (2)");
    } finally {
      completions.splice(0).forEach((complete) => complete());
      await waitFor(() => runtime.getQueueState().totalCount === 0);
    }
  });

  it("falls back to pinterest short-id stems when no title is available", async () => {
    const outputStems: string[] = [];
    const completions: Array<() => void> = [];

    const runtime = createRuntime({
      maxConcurrent: 2,
      providers: [pinterestProvider, genericProvider],
      engines: [
        createEngineStub("gallery-dl", async (context) => {
          outputStems.push(context.outputStem);
          await new Promise<void>((resolve) => {
            completions.push(resolve);
          });
          return {
            traceId: context.traceId,
            success: true,
            file_path: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
    });

    try {
      await runtime.queueVideoDownload({
        url: "https://www.pinterest.com/pin/111111111111111111/",
        pageUrl: "https://www.pinterest.com/pin/111111111111111111/",
        siteHint: "pinterest",
      });
      await runtime.queueVideoDownload({
        url: "https://www.pinterest.com/pin/222222222222222222/",
        pageUrl: "https://www.pinterest.com/pin/222222222222222222/",
        siteHint: "pinterest",
      });

      await waitFor(() => outputStems.length === 2);
      expect(outputStems[0]).toMatch(/^pinterest_[0-9a-f]{6}$/);
      expect(outputStems[1]).toMatch(/^pinterest_[0-9a-f]{6}$/);
      expect(new Set(outputStems).size).toBe(2);
    } finally {
      completions.splice(0).forEach((complete) => complete());
      await waitFor(() => runtime.getQueueState().totalCount === 0);
    }
  });

  it("uses shared rename-rule stems when rename mode is enabled", async () => {
    const outputDir = path.join(os.tmpdir(), `ameow-service-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const outputStems: string[] = [];
    const completions: Array<() => void> = [];

    const runtime = createRuntime({
      maxConcurrent: 2,
      configString: JSON.stringify({
        outputPath: outputDir,
        renameMediaOnDownload: true,
      }),
      providers: [genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          outputStems.push(context.outputStem);
          await new Promise<void>((resolve) => {
            completions.push(resolve);
          });
          return {
            traceId: context.traceId,
            success: true,
            file_path: `${context.outputDir}/${context.outputStem}.mp4`,
          };
        }),
      ],
    });

    try {
      await runtime.queueVideoDownload({
        url: "https://example.com/1",
        title: "Sample Video",
      });
      await runtime.queueVideoDownload({
        url: "https://example.com/2",
        title: "Another Video",
      });

      await waitFor(() => outputStems.length === 2);
      expect(outputStems).toEqual(["99", "98"]);
    } finally {
      completions.splice(0).forEach((complete) => complete());
      await waitFor(() => runtime.getQueueState().totalCount === 0);
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("uses a youtube id stem immediately and renames to the resolved title after yt-dlp completes", async () => {
    const tempDir = path.join(
      os.tmpdir(),
      `ameow-ytdlp-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const outputStems: string[] = [];
    const completions: Array<{ file_path?: string; success: boolean; title?: string }> = [];

    const runtime = createRuntime({
      configString: JSON.stringify({ outputPath: tempDir }),
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => {
          outputStems.push(context.outputStem);
          const filePath = path.join(context.outputDir, `${context.outputStem}.mp4`);
          writeFileSync(filePath, "video");
          return {
            traceId: context.traceId,
            success: true,
            file_path: filePath,
            title: "Recovered YouTube Title",
          };
        }),
      ],
      onEmit(event, payload) {
        if (event === "video-download-complete") {
          completions.push(payload as { file_path?: string; success: boolean; title?: string });
        }
      },
    });

    try {
      await runtime.queueVideoDownload({
        url: "https://www.youtube.com/watch?v=abc123",
      });

      await waitFor(() => completions.length === 1);
      expect(outputStems).toEqual(["youtube_abc123"]);
      expect(completions[0]).toMatchObject({
        success: true,
        title: "Recovered YouTube Title",
        file_path: expect.stringMatching(/Recovered YouTube Title\.mp4$/),
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("emits an early downloading activity before the engine reports yt-dlp progress", async () => {
    const progressEvents: Array<{ stage?: string; speed?: string }> = [];

    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          file_path: "D:/downloads/youtube_abc123.mp4",
        })),
      ],
      onEmit(event, payload) {
        if (event === "video-download-progress") {
          progressEvents.push(payload as { stage?: string; speed?: string });
        }
      },
    });

    await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=abc123",
    });

    await waitFor(() => progressEvents.length >= 1);
    expect(progressEvents[0]).toMatchObject({
      stage: "preparing",
      speed: "Resolving media...",
    });
  });

  it("queues downstream transcode after a highest-quality YouTube download completes with MKV output", async () => {
    const events: RuntimeEmitterEvent[] = [];
    const telemetry: DownloadTelemetryEvent[] = [];
    const transcodeCompletions: Array<() => void> = [];

    prepareVideoTranscodeTaskFromDownloadMock.mockImplementation(async (...args: unknown[]) => {
      const input = args[0] as {
        traceId: string;
        label: string;
        sourcePath: string;
        onCompatibilityAnalysis?: (analysis: unknown) => void;
      };
      input.onCompatibilityAnalysis?.({
        sourceExtension: "mkv",
        containerNames: ["matroska", "webm"],
        videoCodec: "vp9",
        audioCodec: "opus",
        decision: "full_transcode",
        probeFailed: false,
        probeErrorSummary: null,
      });
      return {
        traceId: input.traceId,
        label: input.label,
        sourcePath: input.sourcePath,
        sourceFormat: "mkv",
        targetFormat: "mp4",
        plan: "full_transcode",
        durationSeconds: 120,
        finalPath: "D:/downloads/Recovered YouTube Title.mp4",
      };
    });
    runPreparedVideoTranscodeTaskMock.mockImplementation(async (task: { finalPath: string }) => {
      await new Promise<void>((resolve) => {
        transcodeCompletions.push(resolve);
      });
      return { filePath: task.finalPath };
    });

    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          file_path: "D:/downloads/Recovered YouTube Title.mkv",
        })),
      ],
      onEmit(event) {
        events.push(event);
      },
      onTelemetry(event) {
        telemetry.push(event);
      },
    });

    try {
      await runtime.queueVideoDownload({
        url: "https://www.youtube.com/watch?v=abc123",
        pageUrl: "https://www.youtube.com/watch?v=abc123",
        title: "Recovered YouTube Title",
        ytdlpQuality: "best",
        siteHint: "youtube",
      });

      await waitFor(() => events.includes("video-transcode-queued"));
      expect(events).toContain("video-download-complete");
      expect(events).toContain("video-transcode-progress");
      expect(events.indexOf("video-download-complete")).toBeLessThan(events.indexOf("video-transcode-queued"));
      expect(prepareVideoTranscodeTaskFromDownloadMock).toHaveBeenCalledWith(expect.objectContaining({
        sourcePath: "D:/downloads/Recovered YouTube Title.mkv",
      }));
      await waitFor(() => telemetry.length === 1);
      expect(telemetry[0]?.compatibility).toMatchObject({
        sourceExtension: "mkv",
        decision: "full_transcode",
        probeFailed: false,
      });
      expect(telemetry[0]?.downloadProfile).toMatchObject({
        qualityPreference: "best",
        ytdlpProfileKey: "youtube",
        ytdlpMergeOutputFormat: "mp4/mkv",
      });
    } finally {
      transcodeCompletions.splice(0).forEach((complete) => complete());
      await waitFor(() => runtime.getTranscodeQueueState().totalCount === 0);
    }
  });

  it("applies the same transcode follow-up path to Bilibili yt-dlp downloads", async () => {
    const events: RuntimeEmitterEvent[] = [];
    const transcodeCompletions: Array<() => void> = [];

    prepareVideoTranscodeTaskFromDownloadMock.mockImplementation(async (...args: unknown[]) => {
      const input = args[0] as { traceId: string; label: string; sourcePath: string };
      return {
        traceId: input.traceId,
        label: input.label,
        sourcePath: input.sourcePath,
        sourceFormat: "mkv",
        targetFormat: "mp4",
        plan: "full_transcode",
        durationSeconds: 180,
        finalPath: "D:/downloads/Bilibili Archive.mp4",
      };
    });
    runPreparedVideoTranscodeTaskMock.mockImplementation(async (task: { finalPath: string }) => {
      await new Promise<void>((resolve) => {
        transcodeCompletions.push(resolve);
      });
      return { filePath: task.finalPath };
    });

    const runtime = createRuntime({
      providers: [bilibiliProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          file_path: "D:/downloads/Bilibili Archive.mkv",
        })),
      ],
      onEmit(event) {
        events.push(event);
      },
    });

    try {
      await runtime.queueVideoDownload({
        url: "https://www.bilibili.com/video/BV1xx411c7mD",
        pageUrl: "https://www.bilibili.com/video/BV1xx411c7mD?p=1",
        title: "Bilibili Archive",
        ytdlpQuality: "best",
        siteHint: "bilibili",
      });

      await waitFor(() => events.includes("video-transcode-queued"));
      expect(events).toContain("video-download-complete");
      expect(events.indexOf("video-download-complete")).toBeLessThan(events.indexOf("video-transcode-queued"));
      expect(prepareVideoTranscodeTaskFromDownloadMock).toHaveBeenCalledWith(expect.objectContaining({
        sourcePath: "D:/downloads/Bilibili Archive.mkv",
      }));
    } finally {
      transcodeCompletions.splice(0).forEach((complete) => complete());
      await waitFor(() => runtime.getTranscodeQueueState().totalCount === 0);
    }
  });

  it("skips downstream transcode when a highest-quality Bilibili download already lands as MP4", async () => {
    const events: RuntimeEmitterEvent[] = [];
    const telemetry: DownloadTelemetryEvent[] = [];
    prepareVideoTranscodeTaskFromDownloadMock.mockImplementation(async (...args: unknown[]) => {
      const input = args[0] as {
        onCompatibilityAnalysis?: (analysis: unknown) => void;
      };
      input.onCompatibilityAnalysis?.({
        sourceExtension: "mp4",
        containerNames: ["mov", "mp4"],
        videoCodec: "h264",
        audioCodec: "aac",
        decision: "skip_compatible",
        probeFailed: false,
        probeErrorSummary: null,
      });
      return null;
    });

    const runtime = createRuntime({
      providers: [bilibiliProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          file_path: "D:/downloads/Bilibili Preview[1920x1080][highest].mp4",
        })),
      ],
      onEmit(event) {
        events.push(event);
      },
      onTelemetry(event) {
        telemetry.push(event);
      },
    });

    await runtime.queueVideoDownload({
      url: "https://www.bilibili.com/video/BV1preview1080",
      pageUrl: "https://www.bilibili.com/video/BV1preview1080?p=1",
      title: "Bilibili Preview",
      ytdlpQuality: "best",
      siteHint: "bilibili",
    });

    await waitFor(() => events.includes("video-download-complete"));
    await waitFor(() => prepareVideoTranscodeTaskFromDownloadMock.mock.calls.length === 1);

    expect(prepareVideoTranscodeTaskFromDownloadMock).toHaveBeenCalledWith(expect.objectContaining({
      sourcePath: "D:/downloads/Bilibili Preview[1920x1080][highest].mp4",
    }));
    expect(events).not.toContain("video-transcode-queued");
    expect(runtime.getTranscodeQueueState().totalCount).toBe(0);
    await waitFor(() => telemetry.length === 1);
    expect(telemetry[0]?.compatibility).toMatchObject({
      sourceExtension: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      decision: "skip_compatible",
      probeFailed: false,
    });
    expect(telemetry[0]?.downloadProfile).toMatchObject({
      qualityPreference: "best",
      ytdlpProfileKey: "default",
      ytdlpMergeOutputFormat: "mp4/mkv",
    });
  });

  it("supports retrying and removing failed transcode rows", async () => {
    const events: RuntimeEmitterEvent[] = [];
    const runAttempts: string[] = [];

    prepareVideoTranscodeTaskFromDownloadMock.mockImplementation(async (...args: unknown[]) => {
      const input = args[0] as { traceId: string; label: string; sourcePath: string };
      return {
        traceId: input.traceId,
        label: input.label,
        sourcePath: input.sourcePath,
        sourceFormat: "mkv",
        targetFormat: "mp4",
        plan: "full_transcode",
        durationSeconds: 60,
        finalPath: "D:/downloads/Failure Case.mp4",
      };
    });
    runPreparedVideoTranscodeTaskMock.mockImplementation(async (task: { traceId?: string; finalPath: string }) => {
      runAttempts.push(task.traceId ?? "missing-trace");
      throw new Error("ffmpeg failed");
    });

    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          file_path: "D:/downloads/Failure Case.mkv",
        })),
      ],
      onEmit(event) {
        events.push(event);
      },
    });

    const ack = await runtime.queueVideoDownload({
      url: "https://www.youtube.com/watch?v=fail123",
      pageUrl: "https://www.youtube.com/watch?v=fail123",
      title: "Failure Case",
      siteHint: "youtube",
    });

    await waitFor(() => events.includes("video-transcode-failed"));
    expect(runtime.getTranscodeQueueState().failedCount).toBe(1);

    const retried = await runtime.retryTranscode(ack.traceId);
    expect(retried).toBe(true);
    await waitFor(() => events.includes("video-transcode-retried"));
    await waitFor(() => runAttempts.length >= 2);

    const removed = await runtime.removeTranscode(ack.traceId);
    expect(removed).toBe(true);
    await waitFor(() => runtime.getTranscodeQueueState().totalCount === 0);
    expect(events).toContain("video-transcode-removed");
  });

  it("caps failed transcode retention to the newest operational rows", async () => {
    const runtime = createRuntime({
      providers: [youtubeProvider, genericProvider],
      engines: [
        createEngineStub("yt-dlp", async (context) => ({
          traceId: context.traceId,
          success: true,
          file_path: `D:/downloads/${context.traceId}.mkv`,
        })),
      ],
    });

    prepareVideoTranscodeTaskFromDownloadMock.mockImplementation(async (...args: unknown[]) => {
      const input = args[0] as { traceId: string; label: string; sourcePath: string };
      return {
        traceId: input.traceId,
        label: input.label,
        sourcePath: input.sourcePath,
        sourceFormat: "mkv",
        targetFormat: "mp4",
        plan: "full_transcode",
        durationSeconds: 30,
        finalPath: `D:/downloads/${input.traceId}.mp4`,
      };
    });
    runPreparedVideoTranscodeTaskMock.mockImplementation(async () => {
      throw new Error("ffmpeg failed");
    });

    const queuedAcks: Array<{ traceId: string }> = [];
    for (let index = 0; index < FAILED_TRANSCODE_RETENTION_LIMIT + 5; index += 1) {
      const ack = await runtime.queueVideoDownload({
        url: `https://www.youtube.com/watch?v=failure${index}`,
        pageUrl: `https://www.youtube.com/watch?v=failure${index}`,
        title: `Failure ${index}`,
        siteHint: "youtube",
        ytdlpQuality: "best",
      });
      queuedAcks.push(ack);
    }

    await waitFor(() => runtime.getQueueState().totalCount === 0);
    await waitFor(() => runtime.getTranscodeQueueState().failedCount === FAILED_TRANSCODE_RETENTION_LIMIT);

    const transcodeState = runtime.getTranscodeQueueState();
    const transcodeDetail = runtime.getTranscodeQueueDetail();

    expect(transcodeState.failedCount).toBe(FAILED_TRANSCODE_RETENTION_LIMIT);
    expect(transcodeState.totalCount).toBe(FAILED_TRANSCODE_RETENTION_LIMIT);
    expect(transcodeDetail.tasks).toHaveLength(FAILED_TRANSCODE_RETENTION_LIMIT);
    expect(transcodeDetail.tasks.every((task) => task.status === "failed")).toBe(true);

    expect(transcodeDetail.tasks.some((task) => task.traceId === queuedAcks[0]?.traceId)).toBe(false);
    expect(transcodeDetail.tasks.some((task) => task.traceId === queuedAcks[4]?.traceId)).toBe(false);
    expect(
      transcodeDetail.tasks.some(
        (task) => task.traceId === queuedAcks[queuedAcks.length - 1]?.traceId,
      ),
    ).toBe(true);
    expect(transcodeDetail.tasks[0]?.traceId).toBe(queuedAcks[5]?.traceId);
    expect(transcodeDetail.tasks[transcodeDetail.tasks.length - 1]?.traceId)
      .toBe(queuedAcks[queuedAcks.length - 1]?.traceId);
  });
});
