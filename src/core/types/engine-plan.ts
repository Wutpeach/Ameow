import type { DownloadErrorCode } from "../constants/error-codes.js";
import type { DownloadFailureClassification } from "../constants/error-classifications.js";
import type { DownloadCapabilityRequirements } from "./download-capabilities.js";

/**
 * Open, non-blank engine identifier at Domain/Application boundaries.
 * Existence is decided by EngineRegistry; non-blank validation lives in
 * `engineIdSchema`. Infrastructure keeps its own closed CLI unions where a
 * concrete engine is genuinely required.
 */
export type EngineId = string;

export type EnginePlan = {
  engine: EngineId;
  priority: number;
  when: "primary" | "fallback";
  reason: string;
  sourceUrl?: string;
  fallbackOn?: DownloadErrorCode[] | "any";
  fallbackOnClassifications?: DownloadFailureClassification[];
  options?: Record<string, unknown>;
};

export type ResolvedDownloadPlan = {
  providerId: string;
  label: string;
  intent: import("./download-intent.js").DownloadIntent;
  engines: EnginePlan[];
  /**
   * Capability requirements the chosen engines must satisfy. Candidate
   * filtering never erases explicit provider engine requirements; plans that
   * do not declare requirements accept every registered engine capability.
   */
  requirements?: DownloadCapabilityRequirements;
};
