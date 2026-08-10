import {
  DownloadRuntimeError,
  engineIdSchema,
  type EngineId,
} from "../core/index.js";
import type { NetworkConsumer } from "../config/networkRoute.js";

/**
 * Minimal explicit production Engine binding: one registered engine id maps to
 * its network consumer label, its proxy-failure reporting layer, and its
 * readiness callback. Composition (electron/main.mts) provides the concrete
 * entries; this registry makes the set verifiable and fails closed for
 * duplicate, missing, or unknown engine ids. No plugin/discovery/DI.
 */
export type EngineRuntimeBinding = {
  engineId: EngineId;
  /** Route resolution consumer label for this engine. */
  networkConsumer: NetworkConsumer;
  /** Proxy-failure reporting layer consumed by the proxy policy controller. */
  proxyFailureLayer: string;
  /** Ensures the managed runtime components this engine requires. */
  ensureReady?(reason: string): Promise<void>;
};

export class EngineRuntimeBindingRegistry {
  private readonly bindings = new Map<string, EngineRuntimeBinding>();

  constructor(bindings: readonly EngineRuntimeBinding[] = []) {
    for (const binding of bindings) {
      this.register(binding);
    }
  }

  /** Registers a binding; blank/duplicate ids and blank/padded consumer
   * labels are rejected, never overwritten. */
  register(binding: EngineRuntimeBinding): void {
    const parsed = engineIdSchema.safeParse(binding.engineId);
    const id = parsed.success ? parsed.data : "";
    if (!parsed.success || id !== binding.engineId) {
      throw new Error("Engine runtime binding requires a canonical non-blank engine id");
    }
    const parsedConsumer = engineIdSchema.safeParse(binding.networkConsumer);
    const consumer = parsedConsumer.success ? parsedConsumer.data : "";
    if (!parsedConsumer.success || consumer !== binding.networkConsumer) {
      throw new Error("Engine runtime binding requires a canonical non-blank network consumer");
    }
    if (this.bindings.has(id)) {
      throw new Error(`Duplicate engine runtime binding: ${id}`);
    }
    this.bindings.set(id, binding);
  }

  /** Looks up a binding; unknown engines fail closed instead of defaulting. */
  require(engineId: string | undefined): EngineRuntimeBinding {
    if (!engineId) {
      throw new DownloadRuntimeError(
        "E_ENGINE_NOT_FOUND",
        "No engine runtime binding for unknown engine id",
        { classification: "terminal_for_site" },
      );
    }
    const binding = this.bindings.get(engineId);
    if (!binding) {
      throw new DownloadRuntimeError(
        "E_ENGINE_NOT_FOUND",
        `No engine runtime binding for ${engineId}`,
        { classification: "terminal_for_site" },
      );
    }
    return binding;
  }

  get(engineId: string): EngineRuntimeBinding | undefined {
    return this.bindings.get(engineId);
  }

  list(): EngineRuntimeBinding[] {
    return [...this.bindings.values()];
  }

  /**
   * Completeness guard: the explicit registered Engine id set must match the
   * bindings exactly. Missing bindings and bindings without a registered
   * engine are rejected; duplicates are already rejected by register().
   */
  assertCoversEngineIds(engineIds: readonly string[]): void {
    const bindingIds = this.bindings.keys();
    for (const engineId of engineIds) {
      if (!this.bindings.has(engineId)) {
        throw new Error(`Missing engine runtime binding for ${engineId}`);
      }
    }
    for (const bindingId of bindingIds) {
      if (!engineIds.includes(bindingId)) {
        throw new Error(`Engine runtime binding without a registered engine: ${bindingId}`);
      }
    }
  }
}

export const createEngineRuntimeBindingRegistry = (
  bindings: readonly EngineRuntimeBinding[] = [],
): EngineRuntimeBindingRegistry => new EngineRuntimeBindingRegistry(bindings);
