import type { SiteSessionState, SupportedSiteSessionId } from "../src/types/siteSession.js";
import type { SiteSessionRegistryEntry } from "../src/types/siteSession.js";
import type { AmeowRendererCommand } from "../src/types/electronBridge.js";
import type { SiteSessionManager } from "./siteSessionManager.mjs";

type CommandPayload = Record<string, unknown> | undefined;

type SiteSessionCommandManager = Pick<
  SiteSessionManager,
  | "getDiagnostics"
  | "getState"
  | "importSnapshot"
  | "clearSession"
>;

type SiteSessionManagerMethod = Exclude<keyof SiteSessionCommandManager, "importSnapshot">;

export type SiteSessionCommandController = {
  supports(command: AmeowRendererCommand): boolean;
  invoke<TResult>(
    command: AmeowRendererCommand,
    payload?: Record<string, unknown>,
  ): Promise<TResult>;
};

export type SiteSessionCommandControllerOptions = {
  listSiteSessionRegistryEntries(): SiteSessionRegistryEntry[];
  requireSiteSessionManager(siteId: string): SiteSessionCommandManager;
  resolveSiteSessionIdFromPayload?(
    payload: unknown,
    fallback?: string,
  ): string;
  syncSiteSessionFromExtension?(
    siteId: string,
    manager: SiteSessionCommandManager,
  ): Promise<SiteSessionState>;
};

export const resolveSiteSessionIdFromPayload = (
  payload: unknown,
  fallback = "douyin",
): string => {
  const siteId = typeof (payload as { siteId?: unknown } | null | undefined)?.siteId === "string"
    ? (payload as { siteId: string }).siteId
    : fallback;
  if (!siteId.trim()) {
    throw new Error(`Unsupported site session: ${siteId}`);
  }
  return siteId.trim();
};

const genericSiteSessionCommands: Partial<Record<AmeowRendererCommand, SiteSessionManagerMethod>> = {
  get_site_session_diagnostics: "getDiagnostics",
  get_site_session_state: "getState",
  clear_site_session: "clearSession",
};

const douyinAliasCommands: Partial<Record<AmeowRendererCommand, SiteSessionManagerMethod>> = {
  get_douyin_session_state: "getState",
  clear_douyin_session: "clearSession",
};

const supportedCommands = new Set<AmeowRendererCommand>([
  ...Object.keys(genericSiteSessionCommands),
  ...Object.keys(douyinAliasCommands),
  "get_site_session_registry",
  "sync_site_session_from_extension",
] as AmeowRendererCommand[]);

const getCommandMethod = (
  command: AmeowRendererCommand,
): SiteSessionManagerMethod | undefined => (
  genericSiteSessionCommands[command] ?? douyinAliasCommands[command]
);

const isDouyinAliasCommand = (
  command: AmeowRendererCommand,
): boolean => Object.prototype.hasOwnProperty.call(douyinAliasCommands, command);

export const createSiteSessionCommandController = (
  options: SiteSessionCommandControllerOptions,
): SiteSessionCommandController => {
  const resolvePayloadSiteId = options.resolveSiteSessionIdFromPayload ?? resolveSiteSessionIdFromPayload;

  return {
    supports(command) {
      return supportedCommands.has(command);
    },

    async invoke<TResult>(
      command: AmeowRendererCommand,
      payload?: CommandPayload,
    ): Promise<TResult> {
      const method = getCommandMethod(command);
      if (!method) {
        if (command === "get_site_session_registry") {
          return options.listSiteSessionRegistryEntries() as TResult;
        }

        if (command === "sync_site_session_from_extension") {
          const siteId = resolvePayloadSiteId(payload);
          if (!options.syncSiteSessionFromExtension) {
            throw new Error("Extension site session sync is not configured");
          }

          const manager = options.requireSiteSessionManager(siteId);
          return await options.syncSiteSessionFromExtension(siteId, manager) as TResult;
        }

        throw new Error(`Unsupported Electron command: ${command}`);
      }

      const siteId = isDouyinAliasCommand(command)
        ? "douyin"
        : resolvePayloadSiteId(payload);
      const manager = options.requireSiteSessionManager(siteId);
      return await manager[method]() as TResult;
    },
  };
};
