import {
  DownloadRuntimeError,
  downloadIntentSchema,
  enginePlanSchema,
  type DownloadErrorCode,
  type DownloadDiagnosticCategory,
  type DownloadFailureClassification,
  type DownloadResult,
  type EngineExecutionContext,
  type EngineId,
  type EnginePlan,
  rawDownloadInputSchema,
  type RawDownloadInput,
  type ResolvedDownloadPlan,
} from "../core/index.js";
import type { EngineRegistry } from "../engines/engine-registry.js";
import type { SiteRegistry } from "../sites/site-registry.js";

const shouldFallbackForError = (
  error: DownloadRuntimeError,
  plan: EnginePlan,
): boolean => {
  if (plan.fallbackOnClassifications) {
    return plan.fallbackOnClassifications.includes(error.classification);
  }
  if (!error.fallbackable) {
    return false;
  }
  if (!plan.fallbackOn || plan.fallbackOn === "any") {
    return true;
  }
  return plan.fallbackOn.includes(error.code);
};

const shouldContinueEngineChain = (
  error: DownloadRuntimeError,
  plan: EnginePlan,
): boolean => shouldFallbackForError(error, plan);

const toRuntimeError = (error: unknown, code: DownloadErrorCode): DownloadRuntimeError => {
  if (error instanceof DownloadRuntimeError) {
    return error;
  }
  return new DownloadRuntimeError(
    code,
    error instanceof Error ? error.message : String(error ?? "Unknown error"),
    {
      cause: error,
    },
  );
};

const isExplicitSelectedVariantRequest = (
  plan: ResolvedDownloadPlan,
): boolean => Boolean(plan.intent.selectedVideoVariant?.url);

const wrapSelectedVariantError = (
  error: DownloadRuntimeError,
  plan: ResolvedDownloadPlan,
): DownloadRuntimeError => {
  if (!isExplicitSelectedVariantRequest(plan)) {
    return error;
  }
  const selected = plan.intent.selectedVideoVariant;
  const label = selected?.label?.trim()
    || "selected variant";
  return new DownloadRuntimeError(
    error.code,
    `Selected variant quality failed (${label}): ${error.message}`,
    {
      cause: error,
      classification: error.classification,
      diagnosticCategory: error.diagnosticCategory,
      context: {
        providerId: plan.providerId,
        selectedVideoVariantLabel: selected?.label?.trim() || undefined,
      },
    },
  );
};

export type PreparedDownloadRequest = {
  /** Validated/normalized input; the exact object handed to site providers. */
  input: RawDownloadInput;
  /** Resolved plan; the exact same object is reused across every attempt. */
  plan: ResolvedDownloadPlan;
};

export type DownloadBuildContext<
  TExecutionContext extends EngineExecutionContext = EngineExecutionContext,
> = (
  plan: ResolvedDownloadPlan,
  enginePlan: EnginePlan,
) => TExecutionContext | Promise<TExecutionContext>;

/**
 * Typed facts the orchestrator reports about real attempt executions and
 * actual candidate moves. The orchestrator does not create attempt identity
 * (index/id) — Application owns that — and emits nothing for candidates that
 * are skipped before execution (not found, not eligible, not supported).
 */
export type OrchestratorAttemptReport =
  | { kind: "attempt_started"; engineId: EngineId }
  | { kind: "attempt_succeeded"; engineId: EngineId }
  | {
      kind: "attempt_failed";
      engineId: EngineId;
      errorCode: DownloadErrorCode;
      classification: DownloadFailureClassification;
      diagnosticCategory?: DownloadDiagnosticCategory;
    }
  | { kind: "fallback"; fromEngineId: EngineId; toEngineId: EngineId };

/**
 * Executes resolved download plans through the registered engines. The
 * execution-context type propagates from the registry: callers must supply
 * exactly the context the registered engines declared, so an adapter's
 * per-job requirement cannot be hidden behind the application default.
 */
export class DownloadOrchestrator<
  TExecutionContext extends EngineExecutionContext = EngineExecutionContext,
> {
  constructor(
    private readonly siteRegistry: SiteRegistry,
    private readonly engineRegistry: EngineRegistry<TExecutionContext>,
  ) {}

  /**
   * Validates the raw input and resolves the plan once. The caller keeps the
   * returned request and reuses it across attempts (auth recovery, retry),
   * guaranteeing the exact same normalized input and plan object identity.
   */
  prepare(input: RawDownloadInput): PreparedDownloadRequest {
    const normalizedInput = rawDownloadInputSchema.parse(input);
    const resolvedPlan = this.siteRegistry.resolve(normalizedInput);
    if (!resolvedPlan) {
      throw new DownloadRuntimeError(
        "E_NO_PROVIDER_MATCH",
        "No site provider matched the incoming download request",
        {
          context: { input: normalizedInput },
          classification: "input_invalid",
        },
      );
    }

    downloadIntentSchema.parse(resolvedPlan.intent);
    return { input: normalizedInput, plan: resolvedPlan };
  }

  /** Compatibility convenience: prepare once and execute immediately. */
  async execute(
    input: RawDownloadInput,
    buildContext: DownloadBuildContext<TExecutionContext>,
  ): Promise<DownloadResult> {
    return this.executePrepared(this.prepare(input), buildContext);
  }

  async executePrepared(
    prepared: PreparedDownloadRequest,
    buildContext: DownloadBuildContext<TExecutionContext>,
    onAttemptReport?: (report: OrchestratorAttemptReport) => void,
  ): Promise<DownloadResult> {
    const { input: normalizedInput, plan: resolvedPlan } = prepared;
    const orderedPlans = resolvedPlan.engines
      .slice()
      .sort((left, right) => right.priority - left.priority);

    // Observer isolation at the boundary: the reporter is diagnostics-only.
    // A synchronous throw from the observer must never change the download
    // outcome, so every report routes through this best-effort wrapper.
    const report = (attemptReport: OrchestratorAttemptReport): void => {
      try {
        onAttemptReport?.(attemptReport);
      } catch {
        // Best-effort observer; never alters engine execution.
      }
    };

    let lastError: DownloadRuntimeError | null = null;
    let failedAttemptEngineId: EngineId | null = null;
    for (let index = 0; index < orderedPlans.length; index += 1) {
      const enginePlan = orderedPlans[index];
      enginePlanSchema.parse(enginePlan);
      const engine = this.engineRegistry.get(enginePlan.engine);
      if (!engine) {
        lastError = new DownloadRuntimeError(
          "E_ENGINE_NOT_FOUND",
          `Engine not registered: ${enginePlan.engine}`,
          {
            context: { providerId: resolvedPlan.providerId },
          },
        );
        continue;
      }

      // Static capability eligibility: plan requirements filter registered
      // engines; explicit provider preferred/required engines are never
      // erased by capability data.
      if (!this.engineRegistry.isEligible(engine.id, resolvedPlan.requirements)) {
        lastError = new DownloadRuntimeError(
          "E_ENGINE_REJECTED_INTENT",
          `Engine ${engine.id} does not satisfy the plan capability requirements`,
          {
            context: {
              providerId: resolvedPlan.providerId,
              requirements: resolvedPlan.requirements,
            },
          },
        );
        if (shouldContinueEngineChain(lastError, enginePlan)) {
          continue;
        }
        throw wrapSelectedVariantError(lastError, resolvedPlan);
      }

      const support = engine.supports(resolvedPlan, { intent: resolvedPlan.intent });
      if (!support.supported) {
        lastError = support.error;
        if (shouldContinueEngineChain(lastError, enginePlan)) {
          continue;
        }
        throw wrapSelectedVariantError(lastError, resolvedPlan);
      }

      // A real execution is about to run: report the attempt, then its typed
      // outcome and any actual move to the next candidate. Exactly one
      // failure report per attempt (the inner throw path is re-processed by
      // the catch below, which is the single failure report point).
      const reportAttemptFailure = (error: DownloadRuntimeError): void => {
        report({
          kind: "attempt_failed",
          engineId: engine.id,
          errorCode: error.code,
          classification: error.classification,
          diagnosticCategory: error.diagnosticCategory,
        });
        failedAttemptEngineId = engine.id;
      };

      if (failedAttemptEngineId) {
        report({
          kind: "fallback",
          fromEngineId: failedAttemptEngineId,
          toEngineId: engine.id,
        });
        failedAttemptEngineId = null;
      }
      report({ kind: "attempt_started", engineId: engine.id });
      try {
        const context = await buildContext(resolvedPlan, enginePlan);
        const result = await engine.execute(context);
        if (result.success) {
          report({ kind: "attempt_succeeded", engineId: engine.id });
          return result;
        }

        lastError = new DownloadRuntimeError(
          "E_EXECUTION_FAILED",
          result.error || `Engine ${enginePlan.engine} reported an unsuccessful result`,
        );
        if (shouldContinueEngineChain(lastError, enginePlan)) {
          reportAttemptFailure(lastError);
          continue;
        }
        throw wrapSelectedVariantError(lastError, resolvedPlan);
      } catch (error) {
        lastError = toRuntimeError(error, "E_EXECUTION_FAILED");
        if (shouldContinueEngineChain(lastError, enginePlan)) {
          reportAttemptFailure(lastError);
          continue;
        }
        reportAttemptFailure(lastError);
        throw wrapSelectedVariantError(lastError, resolvedPlan);
      }
    }

    throw lastError ?? new DownloadRuntimeError(
      "E_NO_ENGINE_SUCCEEDED",
      "No engine succeeded for the resolved download plan",
      {
        context: { input: normalizedInput },
      },
    );
  }
}
