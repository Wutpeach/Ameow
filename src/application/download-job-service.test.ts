import { describe, expect, it, vi } from "vitest";
import {
  DownloadRuntimeError,
  type DownloadEngine,
  type DownloadResult,
  type EngineExecutionContext,
  type EnginePlan,
  type RawDownloadInput,
  type ResolvedDownloadPlan,
  type SiteProvider,
} from "../core/index.js";
import { createEngineRegistry } from "../engines/engine-registry.js";
import {
  DownloadOrchestrator,
  type PreparedDownloadRequest,
} from "../orchestration/download-orchestrator.js";
import { createSiteRegistry } from "../sites/site-registry.js";
import {
  DownloadJobService,
  type DownloadJobAuthRecoveryContext,
} from "./download-job-service.js";

/**
 * Electron-neutral application tests for the ordinary Job lifecycle: one
 * prepare, one opaque Job context, at-most-one auth recovery, one terminal
 * outcome per Job, and strict plan/Job context identity across fallback and
 * auth retry. No Electron APIs are involved.
 */

type TestJobContext = {
  id: string;
  traceId: string;
  outputDir: string;
  outputStem: string;
  abortSignal: AbortSignal;
  progressCalls: number;
};

const createTestProvider = (engines: EnginePlan[]): SiteProvider => ({
  id: "test-provider",
  matches(): boolean {
    return true;
  },
  resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan {
    return {
      providerId: "test-provider",
      label: "Test plan",
      intent: {
        type: "video",
        siteId: "generic",
        originalUrl: input.url,
        pageUrl: input.pageUrl,
        title: input.title,
        priority: 100,
        candidates: input.videoCandidates ?? [],
        preferredFormat: "best",
      },
      engines,
    };
  },
});

const createEngineStub = (
  id: "yt-dlp" | "gallery-dl",
  execute: (context: EngineExecutionContext) => Promise<DownloadResult>,
): DownloadEngine<EngineExecutionContext> => ({
  id,
  capabilities: { advancedQuality: false },
  supports: () => ({ supported: true }),
  // Typed directly against the application execution contract; no cast.
  execute,
});

const TEST_REQUEST: RawDownloadInput = {
  url: "https://example.com/video",
  pageUrl: "https://example.com/video",
};

const SINGLE_YTDLP_PLAN: EnginePlan[] = [
  { engine: "yt-dlp", priority: 100, when: "primary", reason: "primary" },
];

const DUAL_ENGINE_PLAN: EnginePlan[] = [
  { engine: "yt-dlp", priority: 100, when: "primary", reason: "primary" },
  { engine: "gallery-dl", priority: 50, when: "fallback", reason: "fallback" },
];

const createService = (options: {
  engines: EnginePlan[];
  stubs: DownloadEngine<EngineExecutionContext>[];
  createJobContext?: (prepared: PreparedDownloadRequest) => TestJobContext | Promise<TestJobContext>;
  buildAttemptContext?: (
    jobContext: TestJobContext,
    plan: ResolvedDownloadPlan,
    enginePlan: EnginePlan,
  ) => EngineExecutionContext;
  onPrepared?: (prepared: PreparedDownloadRequest) => void;
  refreshSiteSessionBeforeDownload?: (prepared: PreparedDownloadRequest) => Promise<void>;
  handleAuthRequiredFailure?: (
    context: DownloadJobAuthRecoveryContext<TestJobContext>,
  ) => Promise<{ shouldRetry: boolean } | void>;
  classifyFailure?: (error: unknown) => DownloadRuntimeError;
}): DownloadJobService<TestJobContext, EngineExecutionContext> => {
  const orchestrator = new DownloadOrchestrator<EngineExecutionContext>(
    createSiteRegistry([createTestProvider(options.engines)]),
    createEngineRegistry(options.stubs),
  );
  return new DownloadJobService<TestJobContext, EngineExecutionContext>({
    orchestrator,
    createJobContext: options.createJobContext
      ?? (() => ({
        id: "job-1",
        traceId: "trace-1",
        outputDir: "/tmp/out",
        outputStem: "stem",
        abortSignal: new AbortController().signal,
        progressCalls: 0,
      })),
    buildAttemptContext: options.buildAttemptContext
      ?? ((jobContext, plan, enginePlan) => ({
        traceId: jobContext.traceId,
        plan,
        enginePlan,
        intent: plan.intent,
        outputDir: jobContext.outputDir,
        outputStem: jobContext.outputStem,
        config: {},
        abortSignal: jobContext.abortSignal,
        onProgress: () => {
          jobContext.progressCalls += 1;
        },
      })),
    onPrepared: options.onPrepared,
    refreshSiteSessionBeforeDownload: options.refreshSiteSessionBeforeDownload,
    handleAuthRequiredFailure: options.handleAuthRequiredFailure,
    classifyFailure: options.classifyFailure,
  });
};

const successfulResult = async (context: EngineExecutionContext): Promise<DownloadResult> => ({
  traceId: context.traceId,
  success: true,
  filePath: `${context.outputDir}/${context.outputStem}.mp4`,
});

describe("DownloadJobService", () => {
  it("prepares once and produces exactly one terminal outcome for a successful Job", async () => {
    let createdJobContext: TestJobContext;
    const createJobContext = vi.fn(async () => {
      createdJobContext = {
        id: "job-1",
        traceId: "trace-1",
        outputDir: "/tmp/out",
        outputStem: "stem",
        abortSignal: new AbortController().signal,
        progressCalls: 0,
      };
      return createdJobContext;
    });
    const onPrepared = vi.fn();
    const buildAttemptContext = vi.fn(
      (jobContext: TestJobContext, plan: ResolvedDownloadPlan, enginePlan: EnginePlan) => ({
        traceId: jobContext.traceId,
        plan,
        enginePlan,
        intent: plan.intent,
        outputDir: jobContext.outputDir,
        outputStem: jobContext.outputStem,
        config: {},
        abortSignal: jobContext.abortSignal,
        onProgress: () => {
          jobContext.progressCalls += 1;
        },
      }),
    );
    const service = createService({
      engines: SINGLE_YTDLP_PLAN,
      stubs: [
        createEngineStub("yt-dlp", async (context) => {
          context.onProgress({
            traceId: context.traceId,
            percent: 50,
            stage: "downloading",
            speed: "1x",
            eta: "",
          });
          return successfulResult(context);
        }),
      ],
      createJobContext,
      buildAttemptContext,
      onPrepared,
    });

    let resolutions = 0;
    let rejections = 0;
    const outcome = await service.executeJob(TEST_REQUEST, new AbortController().signal).then(
      (value) => {
        resolutions += 1;
        return value;
      },
      (error: unknown) => {
        rejections += 1;
        throw error;
      },
    );

    expect(resolutions).toBe(1);
    expect(rejections).toBe(0);
    expect(outcome.result).toMatchObject({
      success: true,
      filePath: "/tmp/out/stem.mp4",
    });
    expect(createJobContext).toHaveBeenCalledTimes(1);
    expect(onPrepared).toHaveBeenCalledTimes(1);
    expect(buildAttemptContext).toHaveBeenCalledTimes(1);
    expect(outcome.plan).toBe(onPrepared.mock.calls[0][0].plan);
    expect(outcome.jobContext).toBe(createdJobContext!);
    expect(outcome.jobContext.progressCalls).toBe(1);
    expect(outcome.chosenEngine).toBe("yt-dlp");
  });

  it("falls back to the next engine while preserving plan and Job context identity", async () => {
    const seenContexts: TestJobContext[] = [];
    const seenPlans: ResolvedDownloadPlan[] = [];
    const buildAttemptContext = vi.fn(
      (jobContext: TestJobContext, plan: ResolvedDownloadPlan, enginePlan: EnginePlan) => {
        seenContexts.push(jobContext);
        seenPlans.push(plan);
        return {
          traceId: jobContext.traceId,
          plan,
          enginePlan,
          intent: plan.intent,
          outputDir: jobContext.outputDir,
          outputStem: jobContext.outputStem,
          config: {},
          abortSignal: jobContext.abortSignal,
          onProgress: () => undefined,
        };
      },
    );
    const service = createService({
      engines: DUAL_ENGINE_PLAN,
      stubs: [
        createEngineStub("yt-dlp", async () => {
          throw new Error("yt-dlp attempt failed");
        }),
        createEngineStub("gallery-dl", successfulResult),
      ],
      buildAttemptContext,
    });

    const outcome = await service.executeJob(TEST_REQUEST, new AbortController().signal);

    expect(outcome.result.success).toBe(true);
    expect(outcome.chosenEngine).toBe("gallery-dl");
    // Both attempts received the exact same Job context and plan objects.
    expect(seenContexts).toHaveLength(2);
    expect(seenContexts[1]).toBe(seenContexts[0]);
    expect(seenPlans[1]).toBe(seenPlans[0]);
    expect(outcome.jobContext).toBe(seenContexts[0]);
    expect(outcome.plan).toBe(seenPlans[0]);
  });

  it("rejects with the typed failure when no engine succeeds, exactly once", async () => {
    const typedFailure = new DownloadRuntimeError(
      "E_EXECUTION_FAILED",
      "cookies required for this resource",
      { classification: "auth_required" },
    );
    const service = createService({
      engines: SINGLE_YTDLP_PLAN,
      stubs: [
        createEngineStub("yt-dlp", async () => {
          throw typedFailure;
        }),
      ],
    });

    let resolutions = 0;
    let rejections = 0;
    const promise = service.executeJob(TEST_REQUEST, new AbortController().signal).then(
      (value) => {
        resolutions += 1;
        return value;
      },
      (error: unknown) => {
        rejections += 1;
        throw error;
      },
    );

    await expect(promise).rejects.toBe(typedFailure);
    expect(rejections).toBe(1);
    expect(resolutions).toBe(0);
  });

  it("recovers attempt auth at most once and retries with the same plan and Job context", async () => {
    const authFailure = new DownloadRuntimeError(
      "E_EXECUTION_FAILED",
      "cookies required for this resource",
      { classification: "auth_required" },
    );
    const recoveryContexts: DownloadJobAuthRecoveryContext<TestJobContext>[] = [];
    let attempts = 0;
    const service = createService({
      engines: SINGLE_YTDLP_PLAN,
      stubs: [
        createEngineStub("yt-dlp", async (context) => {
          attempts += 1;
          if (attempts === 1) {
            throw authFailure;
          }
          return successfulResult(context);
        }),
      ],
      async handleAuthRequiredFailure(context) {
        recoveryContexts.push(context);
        return { shouldRetry: true };
      },
    });

    const outcome = await service.executeJob(TEST_REQUEST, new AbortController().signal);

    expect(attempts).toBe(2);
    expect(recoveryContexts).toHaveLength(1);
    expect(recoveryContexts[0].error).toBe(authFailure);
    expect(recoveryContexts[0].chosenEngine).toBe("yt-dlp");
    expect(recoveryContexts[0].plan).toBe(outcome.plan);
    expect(recoveryContexts[0].jobContext).toBe(outcome.jobContext);
    expect(outcome.result.success).toBe(true);
  });

  it("does not produce a terminal outcome from the first auth failure when recovery succeeds", async () => {
    const authFailure = new DownloadRuntimeError(
      "E_EXECUTION_FAILED",
      "cookies required for this resource",
      { classification: "auth_required" },
    );
    let attempts = 0;
    const service = createService({
      engines: SINGLE_YTDLP_PLAN,
      stubs: [
        createEngineStub("yt-dlp", async (context) => {
          attempts += 1;
          if (attempts === 1) {
            throw authFailure;
          }
          return successfulResult(context);
        }),
      ],
      handleAuthRequiredFailure: async () => ({ shouldRetry: true }),
    });

    let rejections = 0;
    const outcome = await service.executeJob(TEST_REQUEST, new AbortController().signal).then(
      (value) => value,
      (error: unknown) => {
        rejections += 1;
        throw error;
      },
    );

    // The first auth failure was absorbed by recovery: the Job settled once,
    // as a success, and never surfaced a failure outcome.
    expect(rejections).toBe(0);
    expect(outcome.result.success).toBe(true);
    expect(attempts).toBe(2);
  });

  it("terminally fails with the first error when recovery declines", async () => {
    const authFailure = new DownloadRuntimeError(
      "E_EXECUTION_FAILED",
      "cookies required for this resource",
      { classification: "auth_required" },
    );
    const recovery = vi.fn(async () => ({ shouldRetry: false }));
    let attempts = 0;
    const service = createService({
      engines: SINGLE_YTDLP_PLAN,
      stubs: [
        createEngineStub("yt-dlp", async () => {
          attempts += 1;
          throw authFailure;
        }),
      ],
      handleAuthRequiredFailure: recovery,
    });

    await expect(
      service.executeJob(TEST_REQUEST, new AbortController().signal),
    ).rejects.toBe(authFailure);
    expect(attempts).toBe(1);
    expect(recovery).toHaveBeenCalledTimes(1);
  });

  it("terminally fails on a second auth failure without a second recovery", async () => {
    const firstFailure = new DownloadRuntimeError(
      "E_EXECUTION_FAILED",
      "cookies required for this resource",
      { classification: "auth_required" },
    );
    const secondFailure = new DownloadRuntimeError(
      "E_EXECUTION_FAILED",
      "still not logged in",
      { classification: "auth_required" },
    );
    const recovery = vi.fn(async () => ({ shouldRetry: true }));
    let attempts = 0;
    const service = createService({
      engines: SINGLE_YTDLP_PLAN,
      stubs: [
        createEngineStub("yt-dlp", async () => {
          attempts += 1;
          throw attempts === 1 ? firstFailure : secondFailure;
        }),
      ],
      handleAuthRequiredFailure: recovery,
    });

    await expect(
      service.executeJob(TEST_REQUEST, new AbortController().signal),
    ).rejects.toBe(secondFailure);
    expect(attempts).toBe(2);
    expect(recovery).toHaveBeenCalledTimes(1);
  });

  it("does not trigger recovery or retry when the Job is cancelled", async () => {
    const authFailure = new DownloadRuntimeError(
      "E_EXECUTION_FAILED",
      "cookies required for this resource",
      { classification: "auth_required" },
    );
    const recovery = vi.fn(async () => ({ shouldRetry: true }));
    const aborted = new AbortController();
    aborted.abort();
    const service = createService({
      engines: SINGLE_YTDLP_PLAN,
      stubs: [
        createEngineStub("yt-dlp", async () => {
          throw authFailure;
        }),
      ],
      handleAuthRequiredFailure: recovery,
    });

    await expect(
      service.executeJob(TEST_REQUEST, aborted.signal),
    ).rejects.toBe(authFailure);
    expect(recovery).not.toHaveBeenCalled();
  });

  it("does not retry when the Job is cancelled while recovery is in flight", async () => {
    const authFailure = new DownloadRuntimeError(
      "E_EXECUTION_FAILED",
      "cookies required for this resource",
      { classification: "auth_required" },
    );
    let attempts = 0;
    const signalController = new AbortController();
    const service = createService({
      engines: SINGLE_YTDLP_PLAN,
      stubs: [
        createEngineStub("yt-dlp", async () => {
          attempts += 1;
          throw authFailure;
        }),
      ],
      async handleAuthRequiredFailure() {
        signalController.abort();
        return { shouldRetry: true };
      },
    });

    await expect(
      service.executeJob(TEST_REQUEST, signalController.signal),
    ).rejects.toBe(authFailure);
    expect(attempts).toBe(1);
  });

  it("refreshes attempt cookies through the attempt context without replacing plan or Job context", async () => {
    let savedCookies = "stale-cookies";
    const attemptCookies: Array<string | undefined> = [];
    const seenContexts: TestJobContext[] = [];
    let attempts = 0;
    const service = createService({
      engines: SINGLE_YTDLP_PLAN,
      stubs: [
        createEngineStub("yt-dlp", async (context) => {
          attempts += 1;
          attemptCookies.push(context.cookies);
          if (attempts === 1) {
            throw new DownloadRuntimeError(
              "E_EXECUTION_FAILED",
              "cookies required for this resource",
              { classification: "auth_required" },
            );
          }
          return successfulResult(context);
        }),
      ],
      buildAttemptContext: (jobContext, plan, enginePlan) => {
        seenContexts.push(jobContext);
        return {
          traceId: jobContext.traceId,
          plan,
          enginePlan,
          intent: plan.intent,
          outputDir: jobContext.outputDir,
          outputStem: jobContext.outputStem,
          config: {},
          cookies: savedCookies,
          abortSignal: jobContext.abortSignal,
          onProgress: () => undefined,
        };
      },
      async handleAuthRequiredFailure() {
        savedCookies = "refreshed-cookies";
        return { shouldRetry: true };
      },
    });

    const outcome = await service.executeJob(TEST_REQUEST, new AbortController().signal);

    expect(attempts).toBe(2);
    expect(attemptCookies).toEqual(["stale-cookies", "refreshed-cookies"]);
    expect(seenContexts[1]).toBe(seenContexts[0]);
    expect(outcome.jobContext).toBe(seenContexts[0]);
  });

  it("applies the injected infrastructure failure classification before the auth decision", async () => {
    const recovery = vi.fn(async (context: DownloadJobAuthRecoveryContext<TestJobContext>) => ({
      shouldRetry: true,
      plan: context.plan,
    }));
    let attempts = 0;
    const service = createService({
      engines: SINGLE_YTDLP_PLAN,
      stubs: [
        createEngineStub("yt-dlp", async (context) => {
          attempts += 1;
          if (attempts === 1) {
            // Raw evidence: no typed classification is stamped yet.
            throw new Error("cookies required for this resource");
          }
          return successfulResult(context);
        }),
      ],
      // Mirrors the Infrastructure boundary: raw stderr evidence is classified
      // outside Application and handed back as a stable typed error.
      classifyFailure: (error) => new DownloadRuntimeError(
        "E_EXECUTION_FAILED",
        error instanceof Error ? error.message : String(error),
        { cause: error, classification: "auth_required" },
      ),
      handleAuthRequiredFailure: recovery,
    });

    const outcome = await service.executeJob(TEST_REQUEST, new AbortController().signal);

    expect(attempts).toBe(2);
    expect(recovery).toHaveBeenCalledTimes(1);
    expect(recovery.mock.calls[0][0].error.classification).toBe("auth_required");
    expect(outcome.result.success).toBe(true);
  });

  it("does not recover when raw evidence stays unclassified", async () => {
    const recovery = vi.fn(async () => ({ shouldRetry: true }));
    const service = createService({
      engines: SINGLE_YTDLP_PLAN,
      stubs: [
        createEngineStub("yt-dlp", async () => {
          throw new Error("cookies required for this resource");
        }),
      ],
      handleAuthRequiredFailure: recovery,
    });

    await expect(
      service.executeJob(TEST_REQUEST, new AbortController().signal),
    ).rejects.toMatchObject({
      message: "cookies required for this resource",
      classification: "fallback_to_other_engine",
    });
    expect(recovery).not.toHaveBeenCalled();
  });

  it("runs the best-effort pre-download refresh once before the Job context, even when it fails", async () => {
    const order: string[] = [];
    const service = createService({
      engines: SINGLE_YTDLP_PLAN,
      stubs: [createEngineStub("yt-dlp", successfulResult)],
      createJobContext: async () => {
        order.push("create-job-context");
        return {
          id: "job-1",
          traceId: "trace-1",
          outputDir: "/tmp/out",
          outputStem: "stem",
          abortSignal: new AbortController().signal,
          progressCalls: 0,
        };
      },
      onPrepared: (prepared) => {
        order.push(`on-prepared:${prepared.plan.providerId}`);
      },
      refreshSiteSessionBeforeDownload: async (prepared) => {
        order.push(`refresh:${prepared.plan.providerId}`);
        throw new Error("extension unavailable");
      },
    });

    const outcome = await service.executeJob(TEST_REQUEST, new AbortController().signal);

    expect(outcome.result.success).toBe(true);
    expect(order).toEqual([
      "on-prepared:test-provider",
      "refresh:test-provider",
      "create-job-context",
    ]);
  });

  it("creates a fresh plan and Job context for the next Job", async () => {
    const createJobContext = vi.fn(async (prepared: PreparedDownloadRequest) => ({
      id: prepared.plan.providerId,
      traceId: "trace-1",
      outputDir: "/tmp/out",
      outputStem: "stem",
      abortSignal: new AbortController().signal,
      progressCalls: 0,
    }));
    const service = createService({
      engines: SINGLE_YTDLP_PLAN,
      stubs: [createEngineStub("yt-dlp", successfulResult)],
      createJobContext,
    });

    const first = await service.executeJob(TEST_REQUEST, new AbortController().signal);
    const second = await service.executeJob(
      { ...TEST_REQUEST, url: "https://example.com/other" },
      new AbortController().signal,
    );

    expect(createJobContext).toHaveBeenCalledTimes(2);
    expect(second.plan).not.toBe(first.plan);
    expect(second.jobContext).not.toBe(first.jobContext);
  });
});
