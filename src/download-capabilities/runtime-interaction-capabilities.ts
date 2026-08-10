import { resolveSiteHint } from "../core/index.js";
import type {
  InteractionCapabilityEntry,
  InteractionMode,
  InteractionStatus,
} from "./types.js";

export type InteractionCapabilityDiagnostic = {
  siteId: string;
  interactionMode: InteractionMode;
  interactionStatus: InteractionStatus;
  supportedModes: InteractionMode[];
  isModeSupported: boolean;
};

const genericInteractionCapability: InteractionCapabilityEntry = {
  siteId: "generic",
  sourceId: "ameow-manual-sites",
  interactionStatus: "unknown",
  supportedModes: ["paste", "drag", "context_menu"],
};

export const runtimeManualInteractionCapabilities = [
  {
    siteId: "youtube",
    sourceId: "ameow-manual-sites",
    interactionStatus: "native_ok",
    supportedModes: ["paste", "context_menu", "injected_button"],
  },
  {
    siteId: "bilibili",
    sourceId: "ameow-manual-sites",
    interactionStatus: "native_ok",
    supportedModes: ["paste", "context_menu", "injected_button"],
  },
  {
    siteId: "twitter-x",
    sourceId: "ameow-manual-sites",
    interactionStatus: "native_ok",
    supportedModes: ["paste", "context_menu", "injected_button"],
  },
  {
    siteId: "douyin",
    sourceId: "ameow-manual-sites",
    interactionStatus: "needs_special_adapter",
    supportedModes: ["paste", "context_menu"],
  },
  {
    siteId: "xiaohongshu",
    sourceId: "ameow-manual-sites",
    interactionStatus: "needs_special_adapter",
    supportedModes: ["paste", "drag", "context_menu", "injected_button", "page_bridge"],
  },
  {
    siteId: "pinterest",
    sourceId: "ameow-manual-sites",
    interactionStatus: "needs_special_adapter",
    supportedModes: ["paste", "drag", "context_menu", "injected_button"],
  },
  {
    siteId: "weibo",
    sourceId: "ameow-manual-sites",
    interactionStatus: "needs_special_adapter",
    supportedModes: ["paste", "context_menu"],
  },
  genericInteractionCapability,
] satisfies readonly InteractionCapabilityEntry[];

export const getRuntimeManualInteractionCapability = (
  siteId: string,
): InteractionCapabilityEntry => {
  const entry = runtimeManualInteractionCapabilities.find((capability) => capability.siteId === siteId);
  // Unknown/new Sites fall back to the generic entry instead of throwing, so
  // protocol command decode never rejects a valid request for their name.
  return entry ?? genericInteractionCapability;
};

export const resolveRequestedInteractionMode = (input: {
  source?: string;
  hasDragPayload?: boolean;
}): InteractionMode => {
  if (input.hasDragPayload) {
    return "drag";
  }

  const normalizedSource = input.source?.trim().toLowerCase();
  switch (normalizedSource) {
    case "context_menu":
      return "context_menu";
    case "popup":
    case "injected_button":
    case "page_action":
      return "injected_button";
    case "page_bridge":
      return "page_bridge";
    case "drag":
      return "drag";
    case "paste":
    default:
      return "paste";
  }
};

export const resolveRuntimeInteractionCapability = (input: {
  siteHint?: string;
  pageUrl?: string;
  url: string;
}): InteractionCapabilityEntry => {
  const siteId = resolveSiteHint(input.siteHint, input.pageUrl, input.url) ?? "generic";
  return getRuntimeManualInteractionCapability(siteId);
};

export const createInteractionCapabilityDiagnostic = (input: {
  siteHint?: string;
  pageUrl?: string;
  url: string;
  source?: string;
  hasDragPayload?: boolean;
}): InteractionCapabilityDiagnostic => {
  const capability = resolveRuntimeInteractionCapability(input);
  const interactionMode = resolveRequestedInteractionMode({
    source: input.source,
    hasDragPayload: input.hasDragPayload,
  });

  return {
    siteId: capability.siteId,
    interactionMode,
    interactionStatus: capability.interactionStatus,
    supportedModes: [...capability.supportedModes],
    isModeSupported: capability.supportedModes.includes(interactionMode),
  };
};
