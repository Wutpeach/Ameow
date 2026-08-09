import {
  capabilitiesSatisfy,
  type DownloadCapabilityRequirements,
  type DownloadEngine,
  type EngineExecutionContext,
  type EngineId,
} from "../core/index.js";

/**
 * Application-owned registry of `DownloadEngine` ports. Concrete adapters are
 * registered by the outer Electron composition (or by tests); core/application
 * never construct a concrete engine.
 *
 * The execution-context type propagates end to end: a registry built from
 * adapters that declare `EngineExecutionContextWithRuntime` stores and returns
 * `DownloadEngine<EngineExecutionContextWithRuntime>` — the adapter requirement
 * is never erased at this boundary.
 */
export class EngineRegistry<
  TExecutionContext extends EngineExecutionContext = EngineExecutionContext,
> {
  private readonly engines = new Map<EngineId, DownloadEngine<TExecutionContext>>();

  constructor(engines: DownloadEngine<TExecutionContext>[] = []) {
    for (const engine of engines) {
      this.register(engine);
    }
  }

  /** Registers an engine; duplicate ids are rejected, never silently overwritten. */
  register(engine: DownloadEngine<TExecutionContext>): void {
    if (this.engines.has(engine.id)) {
      throw new Error(`Duplicate engine registration: ${engine.id}`);
    }
    this.engines.set(engine.id, engine);
  }

  get(id: EngineId): DownloadEngine<TExecutionContext> | undefined {
    return this.engines.get(id);
  }

  list(): DownloadEngine<TExecutionContext>[] {
    return [...this.engines.values()];
  }

  /** Static capability eligibility of a registered engine for plan requirements. */
  isEligible(
    id: EngineId,
    requirements?: DownloadCapabilityRequirements,
  ): boolean {
    const engine = this.engines.get(id);
    if (!engine) {
      return false;
    }
    return capabilitiesSatisfy(engine.capabilities, requirements);
  }

  /** Registered engines that satisfy the plan's capability requirements. */
  listEligible(requirements?: DownloadCapabilityRequirements): DownloadEngine<TExecutionContext>[] {
    return this.list().filter((engine) => (
      capabilitiesSatisfy(engine.capabilities, requirements)
    ));
  }
}

export const createEngineRegistry = <
  TExecutionContext extends EngineExecutionContext = EngineExecutionContext,
>(
  engines: DownloadEngine<TExecutionContext>[] = [],
): EngineRegistry<TExecutionContext> => new EngineRegistry(engines);
