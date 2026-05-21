export type CapabilitySeedSchemaVersion = 1;

export const CAPABILITY_ENGINE_IDS = ["yt-dlp", "gallery-dl", "douyin-dl", "direct"] as const;

export type CapabilityEngineId = typeof CAPABILITY_ENGINE_IDS[number];

export const CAPABILITY_PROBE_ENGINE_IDS = ["yt-dlp", "gallery-dl", "direct"] as const satisfies readonly CapabilityEngineId[];

export type CapabilityProbeEngineId = typeof CAPABILITY_PROBE_ENGINE_IDS[number];

export type CapabilitySourceType = "official_supported_sites" | "manual";

export type CapabilityClaimStatus =
  | "claimed_supported"
  | "manual_supported"
  | "manual_blocked";

export type CapabilityProbeStatus =
  | "unknown"
  | "works"
  | "works_with_auth"
  | "unstable"
  | "broken"
  | "forbidden";

export type CapabilityAuthRequirement = "unknown" | "none" | "optional" | "required";

export type CapabilityUpstreamState = "reported_supported" | "reported_broken";

export type InteractionMode =
  | "paste"
  | "drag"
  | "context_menu"
  | "injected_button"
  | "page_bridge";

export type InteractionStatus =
  | "unknown"
  | "native_ok"
  | "needs_special_adapter"
  | "not_supported";

export type DownloadStrategyKind =
  | "single_engine"
  | "ordered_fallback"
  | "conditional_direct";

export type CapabilitySourceEntry = {
  id: string;
  type: CapabilitySourceType;
  engine: CapabilityEngineId | null;
  label: string;
  url?: string;
  fetchedAt: string;
  entryCount: number;
  notes?: string[];
};

export type CapabilityMatchHints = {
  hosts?: string[];
  extractorId?: string;
  upstreamId?: string;
};

export type DownloadCapabilityEntry = {
  siteId: string;
  displayName: string;
  engine: CapabilityEngineId;
  sourceId: string;
  claimStatus: CapabilityClaimStatus;
  probeStatus: CapabilityProbeStatus;
  authRequirement: CapabilityAuthRequirement;
  upstreamState: CapabilityUpstreamState;
  referenceUrl?: string;
  matchHints?: CapabilityMatchHints;
  capabilityHints?: string[];
  notes?: string[];
};

export type InteractionCapabilityEntry = {
  siteId: string;
  sourceId: string;
  interactionStatus: InteractionStatus;
  supportedModes: InteractionMode[];
  notes?: string[];
};

export type DownloadSiteStrategyEntry = {
  siteId: string;
  displayName: string;
  sourceId: string;
  strategyKind: DownloadStrategyKind;
  engineOrder: CapabilityEngineId[];
  forbiddenEngines?: CapabilityEngineId[];
  matchHints?: CapabilityMatchHints;
  notes?: string[];
};

export type CapabilitySeed = {
  schemaVersion: CapabilitySeedSchemaVersion;
  generatedAt: string;
  sources: CapabilitySourceEntry[];
  downloadCapabilities: DownloadCapabilityEntry[];
  interactionCapabilities: InteractionCapabilityEntry[];
  siteStrategies: DownloadSiteStrategyEntry[];
};
