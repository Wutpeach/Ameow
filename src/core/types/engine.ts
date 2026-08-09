import type { DownloadRuntimeError } from "../errors/download-runtime-error.js";
import type { DownloadCapabilities } from "./download-capabilities.js";
import type { DownloadIntent } from "./download-intent.js";
import type { DownloadProgress } from "./download-progress.js";
import type { DownloadResult } from "./download-result.js";
import type { EngineId, EnginePlan, ResolvedDownloadPlan } from "./engine-plan.js";

/**
 * Application-owned values known before an engine attempt is built. The
 * per-Job network route and binary paths are infrastructure concerns and are
 * supplied to concrete adapters through `EngineExecutionContextWithRuntime`
 * (Infrastructure) — never declared by the Domain port.
 */
export type EngineSupportContext = {
  intent: DownloadIntent;
};

/** Structured support decision; an unsupported capability is never a thrown raw string. */
export type EngineSupportResult =
  | { supported: true }
  | { supported: false; reason: string; error: DownloadRuntimeError };

/**
 * Application-owned per-attempt execution context. Carries the already-created
 * Job identity, resolved plan, output target, cancellation and progress. No
 * Electron API, CLI args, child-process values, binary paths or protocol DTOs.
 */
export type EngineExecutionContext = {
  traceId: string;
  plan: ResolvedDownloadPlan;
  enginePlan: EnginePlan;
  intent: DownloadIntent;
  outputDir: string;
  outputStem: string;
  config: Record<string, unknown>;
  /**
   * Optional attempt auth material. Session/auth transport values are not part
   * of the Domain intent; the Application supplies cookies per attempt and the
   * outer composition may enrich them from the app-owned site session.
   */
  cookies?: string;
  abortSignal: AbortSignal;
  onProgress(progress: DownloadProgress): void | Promise<void>;
};

/**
 * Stable application port. Infrastructure adapters implement it; the outer
 * Electron composition registers them. Core/Application never construct a
 * concrete adapter.
 *
 * The execution context type is declared by each adapter: an engine declares
 * the exact per-job context it needs (`TExecutionContext`) instead of casting
 * the narrow default. The default stays the application-owned minimum, so
 * Application callers depend only on `EngineExecutionContext`.
 *
 * `execute` is a readonly function property, not a method: under
 * strictFunctionTypes function-property parameters are checked
 * contravariantly, so `DownloadEngine<EngineExecutionContextWithRuntime>` can
 * never widen to `DownloadEngine<EngineExecutionContext>` (or the default).
 * Method syntax would make the parameter bivariant and silently allow a caller
 * to supply only the narrower application context to an engine that declared
 * richer per-job needs.
 */
export interface DownloadEngine<
  TExecutionContext extends EngineExecutionContext = EngineExecutionContext,
> {
  readonly id: EngineId;
  readonly capabilities: DownloadCapabilities;
  supports(plan: ResolvedDownloadPlan, context: EngineSupportContext): EngineSupportResult;
  readonly execute: (context: TExecutionContext) => Promise<DownloadResult>;
}
