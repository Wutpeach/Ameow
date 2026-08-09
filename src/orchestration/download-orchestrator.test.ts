import { describe, expect, it, vi } from "vitest";
import {
  DownloadRuntimeError,
  type DownloadCapabilities,
  type DownloadEngine,
  type EngineExecutionContext,
  type EnginePlan,
  type EngineSupportResult,
  type ResolvedDownloadPlan,
  type SiteProvider,
} from "../core/index.js";
import { createEngineRegistry } from "../engines/engine-registry.js";
import { DownloadOrchestrator } from "./download-orchestrator.js";
import { createSiteRegistry } from "../sites/site-registry.js";

const createVideoPlan = (engines: EnginePlan[]): ResolvedDownloadPlan => ({
  providerId: "test-provider",
  label: "Test plan",
  intent: {
    type: "video",
    siteId: "generic",
    originalUrl: "https://example.com/watch/42",
    pageUrl: "https://example.com/watch/42",
    priority: 100,
    candidates: [],
    preferredFormat: "best",
  },
  engines,
});

const createProvider = (plan: ResolvedDownloadPlan): SiteProvider => ({
  id: plan.providerId,
  matches: () => true,
  resolvePlan: () => plan,
});

const createEngine = (
  id: DownloadEngine["id"],
  options: {
    capabilities?: DownloadCapabilities;
    supports?: (plan: ResolvedDownloadPlan) => EngineSupportResult;
    execute?: (context: EngineExecutionContext) => Promise<{
      traceId: string;
      success: boolean;
      filePath?: string;
      error?: string;
    }>;
  } = {},
): DownloadEngine => ({
  id,
  capabilities: options.capabilities ?? { advancedQuality: false },
  supports: options.supports ?? (() => ({ supported: true })),
  execute: options.execute ?? (async (context) => ({
    traceId: context.traceId,
    success: true,
    filePath: `/tmp/${id}.mp4`,
  })),
});

const createContext = (
  plan: ResolvedDownloadPlan,
  enginePlan: EnginePlan,
): EngineExecutionContext => ({
  traceId: "trace-1",
  plan,
  enginePlan,
  intent: plan.intent,
  outputDir: "/tmp",
  outputStem: "test",
  config: {},
  abortSignal: new AbortController().signal,
  onProgress: vi.fn(),
});

describe("DownloadOrchestrator", () => {
  it("returns the first successful engine result", async () => {
    const plan = createVideoPlan([
      {
        engine: "yt-dlp",
        priority: 100,
        when: "primary",
        reason: "try yt-dlp first",
        sourceUrl: "https://example.com/page/42",
      },
      {
        engine: "gallery-dl",
        priority: 90,
        when: "fallback",
        reason: "gallery fallback",
        sourceUrl: "https://example.com/page/42",
      },
    ]);
    const orchestrator = new DownloadOrchestrator(
      createSiteRegistry([createProvider(plan)]),
      createEngineRegistry([
        createEngine("yt-dlp"),
        createEngine("gallery-dl"),
      ]),
    );

    const result = await orchestrator.execute(
      { url: "https://example.com/page/42" },
      createContext,
    );

    expect(result).toMatchObject({
      success: true,
      filePath: "/tmp/yt-dlp.mp4",
    });
  });

  it("skips engines that lack required plan capabilities and falls back", async () => {
    const galleryExecute = vi.fn();
    const plan = {
      ...createVideoPlan([
        {
          engine: "gallery-dl",
          priority: 100,
          when: "primary",
          reason: "gallery first",
          sourceUrl: "https://example.com/page/42",
        },
        {
          engine: "yt-dlp",
          priority: 90,
          when: "fallback",
          reason: "yt-dlp fallback",
          sourceUrl: "https://example.com/page/42",
        },
      ]),
      requirements: { advancedQuality: true },
    };
    const orchestrator = new DownloadOrchestrator(
      createSiteRegistry([createProvider(plan)]),
      createEngineRegistry([
        createEngine("gallery-dl", {
          capabilities: { advancedQuality: false },
          execute: galleryExecute,
        }),
        createEngine("yt-dlp", {
          capabilities: { advancedQuality: true },
        }),
      ]),
    );

    const result = await orchestrator.execute(
      { url: "https://example.com/page/42" },
      createContext,
    );

    expect(result).toMatchObject({
      success: true,
      filePath: "/tmp/yt-dlp.mp4",
    });
    expect(galleryExecute).not.toHaveBeenCalled();
  });

  it("surfaces a terminal error when the only eligible engine is capability-filtered out", async () => {
    const plan = {
      ...createVideoPlan([
        {
          engine: "yt-dlp",
          priority: 100,
          when: "primary",
          reason: "yt-dlp first",
          sourceUrl: "https://example.com/page/42",
        },
      ]),
      requirements: { advancedQuality: true },
    };
    const orchestrator = new DownloadOrchestrator(
      createSiteRegistry([createProvider(plan)]),
      createEngineRegistry([
        createEngine("yt-dlp", {
          capabilities: { advancedQuality: false },
        }),
      ]),
    );

    await expect(
      orchestrator.execute({ url: "https://example.com/page/42" }, createContext),
    ).rejects.toMatchObject({
      code: "E_ENGINE_REJECTED_INTENT",
      classification: "fallback_to_other_engine",
    });
  });

  it("falls back only for fallback-to-other-engine failures", async () => {
    const plan = createVideoPlan([
      {
        engine: "gallery-dl",
        priority: 100,
        when: "primary",
        reason: "try gallery-dl first",
        sourceUrl: "https://example.com/page/42",
        fallbackOn: "any",
      },
      {
        engine: "yt-dlp",
        priority: 90,
        when: "fallback",
        reason: "fallback to yt-dlp",
        sourceUrl: "https://example.com/page/42",
      },
    ]);
    const orchestrator = new DownloadOrchestrator(
      createSiteRegistry([createProvider(plan)]),
      createEngineRegistry([
        createEngine("gallery-dl", {
          execute: async () => {
            throw new DownloadRuntimeError(
              "E_EXECUTION_FAILED",
              "gallery-dl extractor reported unsupported page",
            );
          },
        }),
        createEngine("yt-dlp"),
      ]),
    );

    const result = await orchestrator.execute(
      { url: "https://example.com/page/42" },
      createContext,
    );

    expect(result).toMatchObject({
      success: true,
      filePath: "/tmp/yt-dlp.mp4",
    });
  });

  it("continues the chain when an engine reports an unsupported plan", async () => {
    const plan = createVideoPlan([
      {
        engine: "gallery-dl",
        priority: 100,
        when: "primary",
        reason: "gallery first",
        sourceUrl: "https://example.com/page/42",
      },
      {
        engine: "yt-dlp",
        priority: 90,
        when: "fallback",
        reason: "yt-dlp fallback",
        sourceUrl: "https://example.com/page/42",
      },
    ]);
    const orchestrator = new DownloadOrchestrator(
      createSiteRegistry([createProvider(plan)]),
      createEngineRegistry([
        createEngine("gallery-dl", {
          supports: () => ({
            supported: false,
            reason: "gallery-dl cannot handle this plan",
            error: new DownloadRuntimeError(
              "E_ENGINE_REJECTED_INTENT",
              "gallery-dl cannot handle this plan",
            ),
          }),
        }),
        createEngine("yt-dlp"),
      ]),
    );

    const result = await orchestrator.execute(
      { url: "https://example.com/page/42" },
      createContext,
    );

    expect(result).toMatchObject({
      success: true,
      filePath: "/tmp/yt-dlp.mp4",
    });
  });

  it("stops the chain on a terminal engine-plan rejection", async () => {
    const fallbackExecute = vi.fn();
    const plan = createVideoPlan([
      {
        engine: "yt-dlp",
        priority: 100,
        when: "primary",
        reason: "yt-dlp first",
        fallbackOn: "any",
      },
      {
        engine: "gallery-dl",
        priority: 90,
        when: "fallback",
        reason: "gallery fallback",
        sourceUrl: "https://example.com/page/42",
      },
    ]);
    const orchestrator = new DownloadOrchestrator(
      createSiteRegistry([createProvider(plan)]),
      createEngineRegistry([
        createEngine("yt-dlp", {
          supports: () => ({
            supported: false,
            reason: "yt-dlp requires a page or source URL",
            error: new DownloadRuntimeError(
              "E_INVALID_ENGINE_PLAN",
              "yt-dlp requires a page or source URL",
            ),
          }),
        }),
        createEngine("gallery-dl", {
          execute: fallbackExecute,
        }),
      ]),
    );

    await expect(
      orchestrator.execute({ url: "https://example.com/page/42" }, createContext),
    ).rejects.toMatchObject({
      code: "E_INVALID_ENGINE_PLAN",
      classification: "terminal_for_site",
    });

    expect(fallbackExecute).not.toHaveBeenCalled();
  });

  it("labels explicit Weibo selected-variant failures without falling back", async () => {
    const plan = {
      ...createVideoPlan([
        {
          engine: "yt-dlp" as const,
          priority: 100,
          when: "primary" as const,
          reason: "selected Weibo variant",
          sourceUrl: "https://f.video.weibocdn.com/best-1080.mp4",
        },
      ]),
      providerId: "weibo",
      intent: {
        ...createVideoPlan([]).intent,
        siteId: "weibo",
        selectedVideoVariant: {
          url: "https://f.video.weibocdn.com/best-1080.mp4",
          label: "1080p",
          type: "direct_mp4",
          mediaType: "video" as const,
        },
      },
    };
    const orchestrator = new DownloadOrchestrator(
      createSiteRegistry([createProvider(plan)]),
      createEngineRegistry([
        createEngine("yt-dlp", {
          execute: async () => {
            // Mirrors the real yt-dlp adapter: raw "HTTP 403" evidence is
            // classified as auth_required in Infrastructure, which stops the
            // chain instead of falling back to gallery-dl.
            throw new DownloadRuntimeError(
              "E_EXECUTION_FAILED",
              "HTTP 403",
              { classification: "auth_required" },
            );
          },
        }),
        createEngine("gallery-dl"),
      ]),
    );

    await expect(orchestrator.execute(
      {
        url: "https://weibo.com/detail/N12345",
        pageUrl: "https://weibo.com/detail/N12345",
        siteHint: "weibo",
        selectedVideoVariant: {
          url: "https://f.video.weibocdn.com/best-1080.mp4",
          label: "1080p",
          type: "direct_mp4",
          mediaType: "video",
        },
      },
      createContext,
    )).rejects.toThrow("Selected Weibo quality failed (1080p): HTTP 403");
  });

  it("stops the engine chain for auth-required failures even when the plan says any", async () => {
    const fallbackExecute = vi.fn();
    const plan = createVideoPlan([
      {
        engine: "gallery-dl",
        priority: 100,
        when: "primary",
        reason: "gallery first",
        sourceUrl: "https://example.com/page/42",
        fallbackOn: "any",
      },
      {
        engine: "yt-dlp",
        priority: 90,
        when: "fallback",
        reason: "yt-dlp fallback",
        sourceUrl: "https://example.com/page/42",
      },
    ]);
    const orchestrator = new DownloadOrchestrator(
      createSiteRegistry([createProvider(plan)]),
      createEngineRegistry([
        createEngine("gallery-dl", {
          execute: async () => {
            throw new DownloadRuntimeError(
              "E_EXECUTION_FAILED",
              "gallery-dl exited with code 1: cookies required for this resource",
              { classification: "auth_required" },
            );
          },
        }),
        createEngine("yt-dlp", {
          execute: fallbackExecute,
        }),
      ]),
    );

    await expect(
      orchestrator.execute({ url: "https://example.com/page/42" }, createContext),
    ).rejects.toMatchObject({
      code: "E_EXECUTION_FAILED",
      classification: "auth_required",
    });

    expect(fallbackExecute).not.toHaveBeenCalled();
  });

  it("stops the engine chain for retry-same-engine failures", async () => {
    const fallbackExecute = vi.fn();
    const plan = createVideoPlan([
      {
        engine: "yt-dlp",
        priority: 100,
        when: "primary",
        reason: "yt-dlp first",
        sourceUrl: "https://example.com/page/42",
        fallbackOn: "any",
      },
      {
        engine: "gallery-dl",
        priority: 90,
        when: "fallback",
        reason: "gallery fallback",
        sourceUrl: "https://example.com/page/42",
      },
    ]);
    const orchestrator = new DownloadOrchestrator(
      createSiteRegistry([createProvider(plan)]),
      createEngineRegistry([
        createEngine("yt-dlp", {
          execute: async () => {
            throw new DownloadRuntimeError(
              "E_EXECUTION_FAILED",
              "yt-dlp exited with code 1: request timed out while downloading webpage",
              { classification: "retry_same_engine" },
            );
          },
        }),
        createEngine("gallery-dl", {
          execute: fallbackExecute,
        }),
      ]),
    );

    await expect(
      orchestrator.execute({ url: "https://example.com/page/42" }, createContext),
    ).rejects.toMatchObject({
      code: "E_EXECUTION_FAILED",
      classification: "retry_same_engine",
    });

    expect(fallbackExecute).not.toHaveBeenCalled();
  });

  it("lets plans opt into classification-based fallback rules", async () => {
    const plan = createVideoPlan([
      {
        engine: "gallery-dl",
        priority: 100,
        when: "primary",
        reason: "gallery first",
        sourceUrl: "https://example.com/page/42",
        fallbackOnClassifications: ["fallback_to_other_engine"],
      },
      {
        engine: "yt-dlp",
        priority: 90,
        when: "fallback",
        reason: "yt-dlp fallback",
        sourceUrl: "https://example.com/page/42",
      },
    ]);
    const orchestrator = new DownloadOrchestrator(
      createSiteRegistry([createProvider(plan)]),
      createEngineRegistry([
        createEngine("gallery-dl", {
          execute: async () => {
            throw new DownloadRuntimeError(
              "E_EXECUTION_FAILED",
              "gallery-dl exited with code 1: extractor reported unsupported page",
            );
          },
        }),
        createEngine("yt-dlp"),
      ]),
    );

    const result = await orchestrator.execute(
      { url: "https://example.com/page/42" },
      createContext,
    );

    expect(result).toMatchObject({
      success: true,
      filePath: "/tmp/yt-dlp.mp4",
    });
  });

  it("continues past missing engines and fails with E_ENGINE_NOT_FOUND when none remain", async () => {
    const plan = createVideoPlan([
      {
        engine: "gallery-dl",
        priority: 100,
        when: "primary",
        reason: "gallery first",
        sourceUrl: "https://example.com/page/42",
      },
    ]);
    const orchestrator = new DownloadOrchestrator(
      createSiteRegistry([createProvider(plan)]),
      createEngineRegistry([]),
    );

    await expect(
      orchestrator.execute({ url: "https://example.com/page/42" }, createContext),
    ).rejects.toMatchObject({
      code: "E_ENGINE_NOT_FOUND",
    });
  });

  it("forwards the resolved plan identity and engine plan into the attempt context", async () => {
    const plan = createVideoPlan([
      {
        engine: "yt-dlp",
        priority: 100,
        when: "primary",
        reason: "yt-dlp first",
        sourceUrl: "https://example.com/page/42",
      },
    ]);
    const receivedPlans: Array<{ providerId: string; engine: string }> = [];
    const orchestrator = new DownloadOrchestrator(
      createSiteRegistry([createProvider(plan)]),
      createEngineRegistry([createEngine("yt-dlp")]),
    );

    await orchestrator.execute(
      { url: "https://example.com/page/42" },
      async (resolvedPlan, enginePlan) => {
        receivedPlans.push({
          providerId: resolvedPlan.providerId,
          engine: enginePlan.engine,
        });
        return createContext(resolvedPlan, enginePlan);
      },
    );

    expect(receivedPlans).toEqual([
      { providerId: "test-provider", engine: "yt-dlp" },
    ]);
  });

  it("normalizes the legacy ytdlpQuality alias into the canonical videoQuality", async () => {
    const receivedInputs: Array<{ videoQuality?: string; ytdlpQuality?: string }> = [];
    const plan = createVideoPlan([
      {
        engine: "yt-dlp",
        priority: 100,
        when: "primary",
        reason: "yt-dlp first",
        sourceUrl: "https://example.com/page/42",
      },
    ]);
    const provider: SiteProvider = {
      id: plan.providerId,
      matches: () => true,
      resolvePlan(input) {
        receivedInputs.push(input);
        return plan;
      },
    };
    const orchestrator = new DownloadOrchestrator(
      createSiteRegistry([provider]),
      createEngineRegistry([createEngine("yt-dlp")]),
    );

    await orchestrator.execute(
      { url: "https://example.com/page/42", ytdlpQuality: "data_saver" },
      createContext,
    );

    expect(receivedInputs[0]?.videoQuality).toBe("data_saver");
    expect(receivedInputs[0]?.ytdlpQuality).toBe("data_saver");
  });
});
