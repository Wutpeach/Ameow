import { describe, expect, it, vi } from "vitest";
import type {
  DownloadEngine,
  DownloadResult,
  EngineExecutionContext,
  EnginePlan,
  RawDownloadInput,
  ResolvedDownloadPlan,
  RuntimeBinaryPaths,
} from "../core/index.js";
import { buildDirectRouteResolution } from "../config/networkRoute.js";
import { createEngineRegistry } from "../engines/engine-registry.js";
import { DownloadOrchestrator } from "../orchestration/download-orchestrator.js";
import { createSiteRegistry } from "../sites/site-registry.js";
import { youtubeProvider } from "../sites/youtube.js";
import { pinterestProvider } from "../sites/pinterest.js";
import type { EngineExecutionContextWithRuntime } from "./engineExecutionContext.js";
import { YtDlpEngineAdapter } from "./ytDlpEngineAdapter.js";
import { GalleryDlEngineAdapter } from "./galleryDlEngineAdapter.js";

const { runYtDlpDownloadMock, runGalleryDlDownloadMock } = vi.hoisted(() => ({
  runYtDlpDownloadMock: vi.fn(),
  runGalleryDlDownloadMock: vi.fn(),
}));

vi.mock("./ytDlpDownload.js", () => ({
  runYtDlpDownload: runYtDlpDownloadMock,
}));
vi.mock("./galleryDlDownload.js", () => ({
  runGalleryDlDownload: runGalleryDlDownloadMock,
}));

const BINARIES: RuntimeBinaryPaths = {
  ytDlp: "D:/bin/yt-dlp.exe",
  galleryDl: "D:/bin/gallery-dl.exe",
  ffmpeg: "D:/bin/ffmpeg.exe",
  ffprobe: "D:/bin/ffprobe.exe",
  deno: "D:/bin/deno.exe",
};

// The real call path: concrete adapters stored in an EngineRegistry and
// executed through the DownloadOrchestrator, exactly like the runtime does.
const registry = createEngineRegistry<EngineExecutionContextWithRuntime>([
  new YtDlpEngineAdapter({ binaries: BINARIES }),
  new GalleryDlEngineAdapter({ binaries: BINARIES }),
]);
const orchestrator = new DownloadOrchestrator<EngineExecutionContextWithRuntime>(
  createSiteRegistry([youtubeProvider, pinterestProvider]),
  registry,
);

const YOUTUBE_INPUT: RawDownloadInput = {
  url: "https://www.youtube.com/watch?v=abc123",
  pageUrl: "https://www.youtube.com/watch?v=abc123",
};

const buildFullContext = (
  plan: ResolvedDownloadPlan,
  enginePlan: EnginePlan,
  consumer: "yt-dlp" | "gallery-dl" = "yt-dlp",
): EngineExecutionContextWithRuntime => ({
  traceId: "contract-trace",
  plan,
  enginePlan,
  intent: plan.intent,
  outputDir: "D:/downloads",
  outputStem: "sample",
  config: {},
  cookies: "# Netscape HTTP Cookie File\n.example.com\tTRUE\t/\tTRUE\t0\ta\tb",
  advancedQualitySelector: "bv*[height=1080]+ba",
  advancedQualityLabel: "1080p",
  network: buildDirectRouteResolution(
    plan.intent.originalUrl,
    consumer,
    { source: "direct", reason: "no_proxy_source" },
  ),
  abortSignal: new AbortController().signal,
  onProgress: async () => undefined,
});

describe("download engine execution contract through registry and orchestrator", () => {
  it("executes concrete adapters with constructor-injected dependencies", async () => {
    const ytResult: DownloadResult = {
      traceId: "contract-trace",
      success: true,
      filePath: "D:/downloads/sample.mp4",
    };
    runYtDlpDownloadMock.mockResolvedValue(ytResult);
    runGalleryDlDownloadMock.mockResolvedValue({ ...ytResult, filePath: "D:/downloads/sample.png" });

    const ytPrepared = orchestrator.prepare(YOUTUBE_INPUT);
    const ytOutcome = await orchestrator.executePrepared(
      ytPrepared,
      (plan, enginePlan) => buildFullContext(plan, enginePlan),
    );

    expect(ytOutcome).toBe(ytResult);
    expect(runYtDlpDownloadMock).toHaveBeenCalledWith(expect.objectContaining({
      traceId: "contract-trace",
      plan: ytPrepared.plan,
      cookies: expect.stringContaining("Netscape"),
      advancedQualitySelector: "bv*[height=1080]+ba",
      // Binary paths are composed by the adapter from its constructor-injected
      // dependency, never expected from the caller's context.
      binaries: BINARIES,
    }));

    const pinPrepared = orchestrator.prepare({
      url: "https://www.pinterest.com/pin/123/",
      pageUrl: "https://www.pinterest.com/pin/123/",
    });
    await orchestrator.executePrepared(
      pinPrepared,
      (plan, enginePlan) => buildFullContext(plan, enginePlan, "gallery-dl"),
    );
    expect(runGalleryDlDownloadMock).toHaveBeenCalledWith(expect.objectContaining({
      traceId: "contract-trace",
      binaries: BINARIES,
    }));
  });

  it("rejects contexts missing per-job fields at the real orchestrator caller boundary", () => {
    const prepared = orchestrator.prepare(YOUTUBE_INPUT);

    // Only the default EngineExecutionContext is not enough: the adapters'
    // declared per-job contract survives the registry, so the caller must
    // supply it.
    const defaultOnlyContext = (plan: ResolvedDownloadPlan, enginePlan: EnginePlan): EngineExecutionContext => ({
      traceId: "contract-trace",
      plan,
      enginePlan,
      intent: plan.intent,
      outputDir: "D:/downloads",
      outputStem: "sample",
      config: {},
      abortSignal: new AbortController().signal,
      onProgress: async () => undefined,
    });
    // @ts-expect-error only the default EngineExecutionContext is not enough for the registered adapters
    void orchestrator.executePrepared(prepared, defaultOnlyContext);

    // Missing the required per-job network resolution at the actual caller.
    void orchestrator.executePrepared(prepared, (plan, enginePlan): EngineExecutionContextWithRuntime => ({
      ...buildFullContext(plan, enginePlan),
      // @ts-expect-error network is required by the adapter's declared contract
      network: undefined,
    }));

    // Static dependencies are constructor-injected; smuggling them onto the
    // caller's context is rejected.
    void orchestrator.executePrepared(prepared, (plan, enginePlan): EngineExecutionContextWithRuntime => ({
      ...buildFullContext(plan, enginePlan),
      // @ts-expect-error binaries are injected by the adapter constructor
      binaries: BINARIES,
    }));

    // The registry does not erase the adapter requirement either.
    const engine = registry.get("yt-dlp")!;
    const defaultContext: EngineExecutionContext = {
      traceId: "contract-trace",
      plan: prepared.plan,
      enginePlan: prepared.plan.engines[0]!,
      intent: prepared.plan.intent,
      outputDir: "D:/downloads",
      outputStem: "sample",
      config: {},
      abortSignal: new AbortController().signal,
      onProgress: async () => undefined,
    };
    // @ts-expect-error the registry preserves the adapter's declared contract
    void engine.execute(defaultContext);
  });

  it("blocks unsafe generic widening of the declared execution contract", () => {
    const runtimeEngine: DownloadEngine<EngineExecutionContextWithRuntime> =
      new YtDlpEngineAdapter({ binaries: BINARIES });

    // Contravariant execute parameters must reject widening to the explicit
    // base application contract...
    // @ts-expect-error DownloadEngine<WithRuntime> must not widen to DownloadEngine<EngineExecutionContext>
    const baseErased: DownloadEngine<EngineExecutionContext> = runtimeEngine;
    // ...and to the default application contract.
    // @ts-expect-error DownloadEngine<WithRuntime> must not widen to the default DownloadEngine
    const defaultErased: DownloadEngine = runtimeEngine;
    void baseErased;
    void defaultErased;
  });
});
