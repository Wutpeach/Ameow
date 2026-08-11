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
  type DownloadJobOutcome,
} from "./download-job-service.js";
import {
  getDownloadTerminalDiagnosticSummary,
  type DownloadDiagnosticEvent,
  type DownloadDiagnosticsOptions,
} from "./download-diagnostics.js";

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
  settleSuccessfulResult?: (
    outcome: DownloadJobOutcome<TestJobContext>,
  ) => DownloadResult | Promise<DownloadResult>;
  diagnostics?: DownloadDiagnosticsOptions;
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
    settleSuccessfulResult: options.settleSuccessfulResult,
    diagnostics: options.diagnostics,
  });
};

const createDiagnostics = (): {
  diagnostics: DownloadDiagnosticsOptions;
  events: DownloadDiagnosticEvent[];
} => {
  const events: DownloadDiagnosticEvent[] = [];
  return {
    events,
    diagnostics: {
      traceId: "trace-1",
      sink: { record: (event) => void events.push(event) },
    },
  };
};

const terminalEvents = (events: DownloadDiagnosticEvent[]): DownloadDiagnosticEvent[] =>
  events.filter(
    (event) =>
      event.type === "download.succeeded"
      || event.type === "download.failed"
      || event.type === "download.cancelled",
  );

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

  describe("diagnostics (P6B B1)", () => {
    it("traces one Job across a real fallback with exactly one terminal event", async () => {
      const { diagnostics, events } = createDiagnostics();
      const service = createService({
        engines: DUAL_ENGINE_PLAN,
        stubs: [
          createEngineStub("yt-dlp", async () => {
            throw new Error("yt-dlp attempt failed");
          }),
          createEngineStub("gallery-dl", successfulResult),
        ],
        diagnostics,
      });

      const outcome = await service.executeJob(TEST_REQUEST, new AbortController().signal);

      expect(outcome.result.success).toBe(true);
      expect(events.map((event) => event.type)).toEqual([
        "download.prepared",
        "attempt.started",
        "attempt.failed",
        "fallback.started",
        "attempt.started",
        "attempt.succeeded",
        "download.succeeded",
      ]);
      expect(terminalEvents(events)).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "download.prepared",
        traceId: "trace-1",
        providerId: "test-provider",
        candidateEngineIds: ["yt-dlp", "gallery-dl"],
      });
      expect(events[events.length - 1]).toMatchObject({
        type: "download.succeeded",
        traceId: "trace-1",
        attemptCount: 2,
      });
    });

    it("keeps one trace with distinct attempt ids across same-engine auth recovery", async () => {
      const { diagnostics, events } = createDiagnostics();
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
        async handleAuthRequiredFailure() {
          return { shouldRetry: true };
        },
        diagnostics,
      });

      const outcome = await service.executeJob(TEST_REQUEST, new AbortController().signal);

      expect(outcome.result.success).toBe(true);
      expect(attempts).toBe(2);
      const started = events.filter((event) => event.type === "attempt.started");
      expect(started).toEqual([
        expect.objectContaining({
          traceId: "trace-1",
          attemptIndex: 1,
          attemptId: "trace-1:1",
          engineId: "yt-dlp",
          cycle: "initial",
        }),
        expect.objectContaining({
          traceId: "trace-1",
          attemptIndex: 2,
          attemptId: "trace-1:2",
          engineId: "yt-dlp",
          cycle: "auth_recovery",
        }),
      ]);
      expect(events).toContainEqual({
        type: "auth_recovery.started",
        traceId: "trace-1",
      });
      expect(events).toContainEqual({
        type: "auth_recovery.finished",
        traceId: "trace-1",
        result: "retry",
      });
      // The first auth failure is not a terminal: exactly one terminal event.
      expect(terminalEvents(events)).toEqual([
        expect.objectContaining({ type: "download.succeeded" }),
      ]);
    });

    it("emits exactly one terminal download.failed when recovery declines", async () => {
      const { diagnostics, events } = createDiagnostics();
      const authFailure = new DownloadRuntimeError(
        "E_EXECUTION_FAILED",
        "cookies required for this resource",
        { classification: "auth_required" },
      );
      const service = createService({
        engines: SINGLE_YTDLP_PLAN,
        stubs: [
          createEngineStub("yt-dlp", async () => {
            throw authFailure;
          }),
        ],
        async handleAuthRequiredFailure() {
          return { shouldRetry: false };
        },
        diagnostics,
      });

      await expect(
        service.executeJob(TEST_REQUEST, new AbortController().signal),
      ).rejects.toBe(authFailure);

      expect(terminalEvents(events)).toEqual([
        expect.objectContaining({
          type: "download.failed",
          traceId: "trace-1",
          errorCode: "E_EXECUTION_FAILED",
        }),
      ]);
    });

    it("emits download.cancelled only for a typed cancelled terminal after abort", async () => {
      const { diagnostics, events } = createDiagnostics();
      const aborted = new AbortController();
      aborted.abort();
      const service = createService({
        engines: SINGLE_YTDLP_PLAN,
        stubs: [
          createEngineStub("yt-dlp", async () => {
            throw new DownloadRuntimeError("E_ABORTED", "Download cancelled", {
              classification: "cancelled",
            });
          }),
        ],
        diagnostics,
      });

      await expect(
        service.executeJob(TEST_REQUEST, aborted.signal),
      ).rejects.toMatchObject({ code: "E_ABORTED", classification: "cancelled" });

      expect(terminalEvents(events)).toEqual([
        expect.objectContaining({
          type: "download.cancelled",
          traceId: "trace-1",
          errorCode: "E_ABORTED",
        }),
      ]);
    });

    it("keeps a success after cancel intent a success", async () => {
      const { diagnostics, events } = createDiagnostics();
      const controller = new AbortController();
      const service = createService({
        engines: SINGLE_YTDLP_PLAN,
        stubs: [
          createEngineStub("yt-dlp", async (context) => {
            controller.abort();
            return successfulResult(context);
          }),
        ],
        diagnostics,
      });

      const outcome = await service.executeJob(TEST_REQUEST, controller.signal);

      expect(outcome.result.success).toBe(true);
      expect(terminalEvents(events)).toEqual([
        expect.objectContaining({ type: "download.succeeded" }),
      ]);
    });

    it("isolates a synchronously throwing sink without losing the terminal event", async () => {
      const events: DownloadDiagnosticEvent[] = [];
      const service = createService({
        engines: DUAL_ENGINE_PLAN,
        stubs: [
          createEngineStub("yt-dlp", async () => {
            throw new Error("yt-dlp failed");
          }),
          createEngineStub("gallery-dl", successfulResult),
        ],
        diagnostics: {
          traceId: "trace-1",
          sink: {
            record(event) {
              if (event.type === "attempt.failed") {
                throw new Error("sink exploded");
              }
              events.push(event);
            },
          },
        },
      });

      const outcome = await service.executeJob(TEST_REQUEST, new AbortController().signal);

      expect(outcome.result.success).toBe(true);
      expect(events).toContainEqual(expect.objectContaining({ type: "download.succeeded" }));
      expect(events).not.toContainEqual(expect.objectContaining({ type: "attempt.failed" }));
      expect(terminalEvents(events)).toHaveLength(1);
    });

    it("isolates an always-throwing sink", async () => {
      const service = createService({
        engines: SINGLE_YTDLP_PLAN,
        stubs: [createEngineStub("yt-dlp", successfulResult)],
        diagnostics: {
          traceId: "trace-1",
          sink: {
            record() {
              throw new Error("sink exploded");
            },
          },
        },
      });

      const outcome = await service.executeJob(TEST_REQUEST, new AbortController().signal);

      expect(outcome.result.success).toBe(true);
      expect(outcome.chosenEngine).toBe("yt-dlp");
    });

    it("isolates a rejecting sink", async () => {
      const events: DownloadDiagnosticEvent[] = [];
      const service = createService({
        engines: DUAL_ENGINE_PLAN,
        stubs: [
          createEngineStub("yt-dlp", async () => {
            throw new Error("yt-dlp failed");
          }),
          createEngineStub("gallery-dl", successfulResult),
        ],
        diagnostics: {
          traceId: "trace-1",
          sink: {
            record(event) {
              if (event.type === "attempt.failed") {
                return Promise.reject(new Error("sink rejected"));
              }
              events.push(event);
              return undefined;
            },
          },
        },
      });

      const outcome = await service.executeJob(TEST_REQUEST, new AbortController().signal);

      expect(outcome.result.success).toBe(true);
      expect(events).toContainEqual(expect.objectContaining({ type: "download.succeeded" }));
      expect(terminalEvents(events)).toHaveLength(1);
    });

    it("keeps the terminal attempt history bounded while counting every attempt", async () => {
      const { diagnostics, events } = createDiagnostics();
      const failingEngines = Array.from({ length: 9 }, (_, index) => `e${index + 1}`);
      const service = createService({
        engines: failingEngines.map((engine, index) => ({
          engine,
          priority: 100 - index,
          when: "primary" as const,
          reason: "fallback chain",
          fallbackOn: "any" as const,
        })),
        stubs: failingEngines.map((engine) =>
          createEngineStub(engine as "yt-dlp", async () => {
            throw new Error(`${engine} failed`);
          }),
        ),
        diagnostics,
      });

      await expect(
        service.executeJob(TEST_REQUEST, new AbortController().signal),
      ).rejects.toMatchObject({ code: "E_EXECUTION_FAILED" });

      const terminal = terminalEvents(events)[0];
      expect(terminal).toMatchObject({ type: "download.failed", attemptCount: 9 });
      const attempts = terminal.type === "download.failed" ? terminal.attempts : [];
      expect(attempts).toHaveLength(8);
      expect(attempts[0]).toMatchObject({ engineId: "e2" });
    });

    it("isolates a throwing network-metadata resolver on success", async () => {
      const { diagnostics, events } = createDiagnostics();
      diagnostics.resolveNetworkMetadata = () => {
        throw new Error("resolver exploded");
      };
      const service = createService({
        engines: SINGLE_YTDLP_PLAN,
        stubs: [createEngineStub("yt-dlp", successfulResult)],
        diagnostics,
      });

      const outcome = await service.executeJob(TEST_REQUEST, new AbortController().signal);

      expect(outcome.result.success).toBe(true);
      expect(terminalEvents(events)).toEqual([
        expect.objectContaining({ type: "download.succeeded", attemptCount: 1 }),
      ]);
    });

    it("isolates a throwing network-metadata resolver on failure", async () => {
      const { diagnostics, events } = createDiagnostics();
      diagnostics.resolveNetworkMetadata = () => {
        throw new Error("resolver exploded");
      };
      const service = createService({
        engines: SINGLE_YTDLP_PLAN,
        stubs: [
          createEngineStub("yt-dlp", async () => {
            throw new DownloadRuntimeError("E_EXECUTION_FAILED", "engine boom", {
              classification: "terminal_for_site",
            });
          }),
        ],
        diagnostics,
      });

      await expect(
        service.executeJob(TEST_REQUEST, new AbortController().signal),
      ).rejects.toMatchObject({ code: "E_EXECUTION_FAILED" });

      // The attempt is still recorded, without network metadata.
      expect(terminalEvents(events)).toEqual([
        expect.objectContaining({
          type: "download.failed",
          attemptCount: 1,
          attempts: [
            expect.objectContaining({
              engineId: "yt-dlp",
              outcome: "failed",
              network: undefined,
            }),
          ],
        }),
      ]);
    });

    it("propagates a raw onPrepared error verbatim with one terminal event", async () => {
      const { diagnostics, events } = createDiagnostics();
      const original = new Error("prepared exploded");
      const service = createService({
        engines: SINGLE_YTDLP_PLAN,
        stubs: [createEngineStub("yt-dlp", successfulResult)],
        onPrepared() {
          throw original;
        },
        diagnostics,
      });

      await expect(
        service.executeJob(TEST_REQUEST, new AbortController().signal),
      ).rejects.toBe(original);

      // Diagnostics observed the failure but never rewrapped the error.
      expect(terminalEvents(events)).toEqual([
        expect.objectContaining({ type: "download.failed", traceId: "trace-1" }),
      ]);
    });

    it("propagates a raw auth-recovery handler error verbatim with one terminal event", async () => {
      const { diagnostics, events } = createDiagnostics();
      const authFailure = new DownloadRuntimeError(
        "E_EXECUTION_FAILED",
        "cookies required",
        { classification: "auth_required" },
      );
      const original = new Error("recovery exploded");
      const service = createService({
        engines: SINGLE_YTDLP_PLAN,
        stubs: [
          createEngineStub("yt-dlp", async () => {
            throw authFailure;
          }),
        ],
        async handleAuthRequiredFailure() {
          throw original;
        },
        diagnostics,
      });

      await expect(
        service.executeJob(TEST_REQUEST, new AbortController().signal),
      ).rejects.toBe(original);

      expect(events).toContainEqual({
        type: "auth_recovery.finished",
        traceId: "trace-1",
        result: "failed",
      });
      expect(terminalEvents(events)).toEqual([
        expect.objectContaining({ type: "download.failed", traceId: "trace-1" }),
      ]);
    });
  });

  describe("successful-result settlement", () => {
    it("runs the settlement hook exactly once, before the single success terminal, and returns the settled result", async () => {
      const { diagnostics, events } = createDiagnostics();
      const order: string[] = [];
      const settle = vi.fn(
        async (outcome: DownloadJobOutcome<TestJobContext>) => {
          order.push("settle");
          expect(outcome.result).toMatchObject({
            success: true,
            filePath: "/tmp/out/stem.mp4",
          });
          expect(outcome.jobContext.outputStem).toBe("stem");
          return {
            ...outcome.result,
            filePath: "/tmp/out/Settled Title.mp4",
            title: "Settled Title",
          };
        },
      );
      const service = createService({
        engines: SINGLE_YTDLP_PLAN,
        stubs: [createEngineStub("yt-dlp", successfulResult)],
        settleSuccessfulResult: settle,
        diagnostics: {
          ...diagnostics,
          sink: {
            record(event) {
              order.push(event.type);
              return void events.push(event);
            },
          },
        },
      });

      const outcome = await service.executeJob(
        TEST_REQUEST,
        new AbortController().signal,
      );

      expect(outcome.result).toMatchObject({
        success: true,
        filePath: "/tmp/out/Settled Title.mp4",
        title: "Settled Title",
      });
      expect(settle).toHaveBeenCalledTimes(1);
      // Settlement runs after the attempt succeeded and strictly before the
      // diagnostic success terminal.
      expect(order).toEqual([
        "download.prepared",
        "attempt.started",
        "attempt.succeeded",
        "settle",
        "download.succeeded",
      ]);
      expect(terminalEvents(events)).toEqual([
        expect.objectContaining({ type: "download.succeeded", traceId: "trace-1" }),
      ]);
    });

    it("records exactly one failed terminal with matching typed semantics when settlement fails", async () => {
      const { diagnostics, events } = createDiagnostics();
      const settlementFailure = new DownloadRuntimeError(
        "E_OUTPUT_NOT_FOUND",
        "Failed to rename output file",
        {
          classification: "terminal_for_site",
          diagnosticCategory: "output",
        },
      );
      const settle = vi.fn(async () => {
        throw settlementFailure;
      });
      const service = createService({
        engines: SINGLE_YTDLP_PLAN,
        stubs: [createEngineStub("yt-dlp", successfulResult)],
        settleSuccessfulResult: settle,
        diagnostics,
      });

      await expect(
        service.executeJob(TEST_REQUEST, new AbortController().signal),
      ).rejects.toBe(settlementFailure);

      // Never a success terminal; exactly one typed failed terminal whose
      // code/classification/category match the thrown settlement error.
      expect(settle).toHaveBeenCalledTimes(1);
      expect(terminalEvents(events)).toEqual([
        expect.objectContaining({
          type: "download.failed",
          traceId: "trace-1",
          errorCode: "E_OUTPUT_NOT_FOUND",
          classification: "terminal_for_site",
          category: "output",
        }),
      ]);
      expect(getDownloadTerminalDiagnosticSummary(settlementFailure)?.status)
        .toBe("failed");
    });

    it("never triggers auth recovery from a settlement failure, even when it is classified auth_required", async () => {
      const { diagnostics, events } = createDiagnostics();
      const settlementFailure = new DownloadRuntimeError(
        "E_EXECUTION_FAILED",
        "settlement requires cookies",
        { classification: "auth_required" },
      );
      const recovery = vi.fn(async () => ({ shouldRetry: true }));
      const settle = vi.fn(async () => {
        throw settlementFailure;
      });
      let attempts = 0;
      const service = createService({
        engines: SINGLE_YTDLP_PLAN,
        stubs: [
          createEngineStub("yt-dlp", async (context) => {
            attempts += 1;
            return successfulResult(context);
          }),
        ],
        handleAuthRequiredFailure: recovery,
        settleSuccessfulResult: settle,
        diagnostics,
      });

      await expect(
        service.executeJob(TEST_REQUEST, new AbortController().signal),
      ).rejects.toBe(settlementFailure);

      // Settlement is not an engine attempt: no retry, no recovery, one
      // settlement call, and exactly one failed terminal whose typed
      // semantics match the thrown settlement error.
      expect(attempts).toBe(1);
      expect(settle).toHaveBeenCalledTimes(1);
      expect(recovery).not.toHaveBeenCalled();
      expect(terminalEvents(events)).toEqual([
        expect.objectContaining({
          type: "download.failed",
          traceId: "trace-1",
          errorCode: "E_EXECUTION_FAILED",
          classification: "auth_required",
          category: "authentication_required",
        }),
      ]);
    });

    it("runs the settlement hook exactly once after auth-recovery retry success", async () => {
      const { diagnostics, events } = createDiagnostics();
      const authFailure = new DownloadRuntimeError(
        "E_EXECUTION_FAILED",
        "cookies required for this resource",
        { classification: "auth_required" },
      );
      const settle = vi.fn(
        async (outcome: DownloadJobOutcome<TestJobContext>) => outcome.result,
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
        settleSuccessfulResult: settle,
        diagnostics,
      });

      const outcome = await service.executeJob(
        TEST_REQUEST,
        new AbortController().signal,
      );

      expect(attempts).toBe(2);
      expect(outcome.result.success).toBe(true);
      expect(settle).toHaveBeenCalledTimes(1);
      expect(terminalEvents(events)).toEqual([
        expect.objectContaining({ type: "download.succeeded", traceId: "trace-1" }),
      ]);
    });
  });
});
