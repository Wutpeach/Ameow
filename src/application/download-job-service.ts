import {
  DownloadRuntimeError,
  type DownloadResult,
  type EngineExecutionContext,
  type EngineId,
  type EnginePlan,
  type RawDownloadInput,
  type ResolvedDownloadPlan,
} from "../core/index.js";
import {
  DownloadOrchestrator,
  type PreparedDownloadRequest,
} from "../orchestration/download-orchestrator.js";

/**
 * Application-owned ordinary download Job lifecycle. Electron-neutral: it
 * coordinates prepare-once, one opaque Job context, attempt execution, typed
 * auth recovery and the single terminal outcome. The Job context is generic to
 * Application; the outer adapter places the resolved NetworkRoute, output
 * values and diagnostic callbacks in it. Infrastructure dependencies (route
 * resolution, site sessions, binaries, filesystem, protocol) are supplied
 * exclusively through the injected functions.
 */

/** Decision the injected recovery reports; Application decides the retry. */
export type DownloadJobAuthRecoveryResult = {
  shouldRetry: boolean;
};

/** Typed auth-required failure context handed to the injected recovery. */
export type DownloadJobAuthRecoveryContext<TJobContext> = {
  /** The exact plan object the failing attempt executed (never re-resolved). */
  plan: ResolvedDownloadPlan;
  /** The engine of the attempt that produced the typed auth failure. */
  chosenEngine: EngineId | null;
  /** The exact opaque Job context shared by every attempt. */
  jobContext: TJobContext;
  error: DownloadRuntimeError;
};

/**
 * One terminal outcome per ordinary Job: success, failure, cancellation and
 * auth recovery/retry all converge here. No renderer/protocol DTOs.
 */
export type DownloadJobOutcome<TJobContext> = {
  result: DownloadResult;
  /** The exact plan object reused by every attempt of this Job. */
  plan: ResolvedDownloadPlan;
  /** The engine of the attempt that produced the terminal result. */
  chosenEngine: EngineId | null;
  /** The exact opaque Job context reused by every attempt of this Job. */
  jobContext: TJobContext;
};

export type DownloadJobServiceOptions<
  TJobContext,
  TExecutionContext extends EngineExecutionContext,
> = {
  orchestrator: DownloadOrchestrator<TExecutionContext>;
  /**
   * Builds the one opaque Job context per Job (called exactly once). The
   * outer adapter places the already-resolved NetworkRoute, output/config
   * values and diagnostic callbacks in it.
   */
  createJobContext(
    prepared: PreparedDownloadRequest,
  ): TJobContext | Promise<TJobContext>;
  /**
   * Builds the per-attempt execution context. Called for every actual engine
   * attempt with the same Job context and the same plan object; it may read
   * refreshed attempt auth material without replacing plan/Job context.
   */
  buildAttemptContext(
    jobContext: TJobContext,
    plan: ResolvedDownloadPlan,
    enginePlan: EnginePlan,
  ): TExecutionContext | Promise<TExecutionContext>;
  /**
   * Called once immediately after `prepare()` resolves. The outer adapter uses
   * it to capture the exact plan for telemetry/execution metadata.
   */
  onPrepared?(prepared: PreparedDownloadRequest): void | Promise<void>;
  /**
   * Best-effort pre-download session refresh; a refresh failure never aborts
   * the Job.
   */
  refreshSiteSessionBeforeDownload?(
    prepared: PreparedDownloadRequest,
  ): Promise<void>;
  /**
   * Typed auth-required recovery, invoked at most once per Job. The retry
   * decision stays here: retry reuses the same prepared plan and Job context
   * without Site or NetworkRoute resolution.
   */
  handleAuthRequiredFailure?(
    context: DownloadJobAuthRecoveryContext<TJobContext>,
  ): Promise<DownloadJobAuthRecoveryResult | void>;
  /**
   * Infrastructure-owned error normalization (raw evidence classification,
   * abort mapping). Application consumes the stable typed classification only
   * and never parses raw messages.
   */
  classifyFailure?(error: unknown): DownloadRuntimeError;
};

const defaultClassifyFailure = (error: unknown): DownloadRuntimeError => {
  if (error instanceof DownloadRuntimeError) {
    return error;
  }
  return new DownloadRuntimeError(
    "E_EXECUTION_FAILED",
    error instanceof Error ? error.message : String(error ?? "Unknown error"),
    { cause: error },
  );
};

export class DownloadJobService<
  TJobContext,
  TExecutionContext extends EngineExecutionContext = EngineExecutionContext,
> {
  constructor(
    private readonly options: DownloadJobServiceOptions<
      TJobContext,
      TExecutionContext
    >,
  ) {}

  /**
   * Executes one ordinary Job and returns its single terminal outcome, or
   * throws the typed failure that terminates it. `prepare()` runs exactly
   * once; `createJobContext()` runs exactly once; auth recovery runs at most
   * once and only for a typed `auth_required` failure while the Job is not
   * cancelled.
   */
  async executeJob(
    request: RawDownloadInput,
    signal: AbortSignal,
  ): Promise<DownloadJobOutcome<TJobContext>> {
    const prepared = this.options.orchestrator.prepare(request);
    await this.options.onPrepared?.(prepared);

    if (this.options.refreshSiteSessionBeforeDownload) {
      try {
        await this.options.refreshSiteSessionBeforeDownload(prepared);
      } catch {
        // Best-effort pre-download refresh: the Job must still execute; a
        // refresh failure is not a terminal outcome.
      }
    }

    const jobContext = await this.options.createJobContext(prepared);

    let chosenEngine: EngineId | null = null;
    const buildAttemptContext = async (
      plan: ResolvedDownloadPlan,
      enginePlan: EnginePlan,
    ): Promise<TExecutionContext> => {
      chosenEngine = enginePlan.engine;
      return this.options.buildAttemptContext(jobContext, plan, enginePlan);
    };
    const executeAttempts = (): Promise<DownloadResult> =>
      this.options.orchestrator.executePrepared(prepared, buildAttemptContext);
    const classify = this.options.classifyFailure ?? defaultClassifyFailure;
    const toOutcome = (result: DownloadResult): DownloadJobOutcome<TJobContext> => ({
      result,
      plan: prepared.plan,
      chosenEngine,
      jobContext,
    });

    try {
      return toOutcome(await executeAttempts());
    } catch (error) {
      const firstFailure = classify(error);
      if (
        firstFailure.classification !== "auth_required"
        || signal.aborted
        || !this.options.handleAuthRequiredFailure
      ) {
        throw firstFailure;
      }

      const recovery = await this.options.handleAuthRequiredFailure({
        plan: prepared.plan,
        chosenEngine,
        jobContext,
        error: firstFailure,
      });
      if (recovery?.shouldRetry !== true || signal.aborted) {
        throw firstFailure;
      }

      // Retry reuses the exact same prepared plan and Job context; only the
      // per-attempt context may observe refreshed attempt auth. A second
      // typed failure is terminal: recovery runs at most once.
      try {
        return toOutcome(await executeAttempts());
      } catch (retryError) {
        throw classify(retryError);
      }
    }
  }
}
