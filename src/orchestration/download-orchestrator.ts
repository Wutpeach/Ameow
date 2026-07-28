import {
  DownloadRuntimeError,
  downloadIntentSchema,
  enginePlanSchema,
  type EnginePlan,
  rawDownloadInputSchema,
  type DownloadErrorCode,
  type EngineExecutionContext,
  type RawDownloadInput,
  type ResolvedDownloadPlan,
} from "../core/index.js";
import type { EngineRegistry } from "../engines/engine-registry.js";
import type { SiteRegistry } from "../sites/site-registry.js";
import type { DownloadResultPayload } from "../types/videoRuntime.js";

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

const isExplicitWeiboSelectedVariantRequest = (
  input: RawDownloadInput,
  plan: ResolvedDownloadPlan,
): boolean => (
  plan.providerId === "weibo"
  && input.siteHint === "weibo"
  && Boolean(input.selectedVideoVariant?.url)
);

const wrapSelectedVariantError = (
  error: DownloadRuntimeError,
  input: RawDownloadInput,
  plan: ResolvedDownloadPlan,
): DownloadRuntimeError => {
  if (!isExplicitWeiboSelectedVariantRequest(input, plan)) {
    return error;
  }
  const label = input.selectedVideoVariant?.label?.trim()
    || input.selectedVideoVariant?.url
    || "selected variant";
  return new DownloadRuntimeError(
    error.code,
    `Selected Weibo quality failed (${label}): ${error.message}`,
    {
      cause: error,
      classification: error.classification,
      context: {
        ...error.context,
        selectedVideoVariant: input.selectedVideoVariant,
        providerId: plan.providerId,
      },
    },
  );
};

export class DownloadOrchestrator {
  constructor(
    private readonly siteRegistry: SiteRegistry,
    private readonly engineRegistry: EngineRegistry,
  ) {}

  async execute(
    input: RawDownloadInput,
    buildContext: (
      plan: ResolvedDownloadPlan,
      enginePlan: EnginePlan,
    ) => EngineExecutionContext | Promise<EngineExecutionContext>,
  ): Promise<DownloadResultPayload> {
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
    const orderedPlans = resolvedPlan.engines
      .slice()
      .sort((left, right) => right.priority - left.priority);

    let lastError: DownloadRuntimeError | null = null;
    for (const enginePlan of orderedPlans) {
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

      const validationError = engine.validateIntent(resolvedPlan.intent, enginePlan);
      if (validationError) {
        lastError = validationError;
        if (shouldContinueEngineChain(validationError, enginePlan)) {
          continue;
        }
        throw wrapSelectedVariantError(validationError, normalizedInput, resolvedPlan);
      }

      try {
        const context = await buildContext(resolvedPlan, enginePlan);
        const result = await engine.execute(context);
        if (result.success) {
          return result;
        }

        lastError = new DownloadRuntimeError(
          "E_EXECUTION_FAILED",
          result.error || `Engine ${enginePlan.engine} reported an unsuccessful result`,
        );
        if (shouldContinueEngineChain(lastError, enginePlan)) {
          continue;
        }
        throw wrapSelectedVariantError(lastError, normalizedInput, resolvedPlan);
      } catch (error) {
        lastError = toRuntimeError(error, "E_EXECUTION_FAILED");
        if (shouldContinueEngineChain(lastError, enginePlan)) {
          continue;
        }
        throw wrapSelectedVariantError(lastError, normalizedInput, resolvedPlan);
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
