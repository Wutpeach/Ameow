import { isSupportedSiteSessionId } from "../src/site-sessions.js";
import type { SupportedSiteSessionId } from "../src/types/siteSession.js";
import type { AmeowRendererCommand } from "../src/types/electronBridge.js";
import type { SiteSessionManager } from "./siteSessionManager.mjs";

type CommandPayload = Record<string, unknown> | undefined;

type SiteSessionCommandManager = Pick<
  SiteSessionManager,
  "getState" | "startCapture" | "confirmCapture" | "cancelCapture" | "clearSession"
>;

type SiteSessionManagerMethod = keyof SiteSessionCommandManager;

export type SiteSessionCommandController = {
  supports(command: AmeowRendererCommand): boolean;
  invoke<TResult>(
    command: AmeowRendererCommand,
    payload?: Record<string, unknown>,
  ): Promise<TResult>;
};

export type SiteSessionCommandControllerOptions = {
  requireSiteSessionManager(siteId: SupportedSiteSessionId): SiteSessionCommandManager;
  resolveSiteSessionIdFromPayload?(
    payload: unknown,
    fallback?: SupportedSiteSessionId,
  ): SupportedSiteSessionId;
};

export const resolveSiteSessionIdFromPayload = (
  payload: unknown,
  fallback: SupportedSiteSessionId = "douyin",
): SupportedSiteSessionId => {
  const siteId = typeof (payload as { siteId?: unknown } | null | undefined)?.siteId === "string"
    ? (payload as { siteId: string }).siteId
    : fallback;
  if (!isSupportedSiteSessionId(siteId)) {
    throw new Error(`Unsupported site session: ${siteId}`);
  }
  return siteId;
};

const genericSiteSessionCommands: Partial<Record<AmeowRendererCommand, SiteSessionManagerMethod>> = {
  get_site_session_state: "getState",
  start_site_session_capture: "startCapture",
  complete_site_session_capture: "confirmCapture",
  cancel_site_session_capture: "cancelCapture",
  clear_site_session: "clearSession",
};

const douyinAliasCommands: Partial<Record<AmeowRendererCommand, SiteSessionManagerMethod>> = {
  get_douyin_session_state: "getState",
  start_douyin_session_capture: "startCapture",
  complete_douyin_session_capture: "confirmCapture",
  cancel_douyin_session_capture: "cancelCapture",
  clear_douyin_session: "clearSession",
};

const supportedCommands = new Set<AmeowRendererCommand>([
  ...Object.keys(genericSiteSessionCommands),
  ...Object.keys(douyinAliasCommands),
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
