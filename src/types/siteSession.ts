export type SiteSessionAvailability = "missing" | "partial" | "ready";

export type SiteSessionPolicyReason =
  | "ready"
  | "missing_required_cookie"
  | "missing_login_cookie"
  | "no_snapshot";

export type SiteSessionSyncSource = {
  browser: string | null;
  profileLabel: string | null;
  extensionId: string | null;
};

export type SupportedSiteSessionId = string;

export type SiteSessionSyncAuthorization =
  | "seeded"
  | "user_enabled"
  | "auto_discovered";

export type SiteSessionDiscoverySource =
  | "seed"
  | "gallery-dl-supported-sites"
  | "auth_required"
  | "extension_current_tab"
  | "user_sync";

export type SiteSessionEngineHint =
  | "yt-dlp"
  | "gallery-dl";

export type SiteSessionRegistryVisibility =
  | "visible"
  | "hidden_catalog";

export type SiteSessionIconMetadata = {
  kind: "known" | "favicon" | "placeholder";
  key?: string;
  url?: string;
  localPath?: string;
};

export type SiteSessionRegistryEntry = {
  siteId: string;
  displayName: string;
  labelKey?: string;
  primaryUrl: string;
  primaryHost: string;
  cookieDomains: string[];
  requiredCookieKeys: string[];
  loginCookieKeys: string[];
  syncAuthorization: SiteSessionSyncAuthorization;
  autoSyncAllowed: boolean;
  discoverySources: SiteSessionDiscoverySource[];
  engineHints: SiteSessionEngineHint[];
  visibility: SiteSessionRegistryVisibility;
  icon: SiteSessionIconMetadata;
  createdAtMs: number;
  updatedAtMs: number;
};

export type SiteSessionState = {
  siteId: string;
  availability: SiteSessionAvailability;
  updatedAtMs: number | null;
  cookieCount: number;
  requiredKeys: string[];
  missingRequiredKeys: string[];
  lastError: string | null;
  sessionFilePath: string | null;
  lastSyncSource: SiteSessionSyncSource | null;
};

export type SiteSessionPolicyEvaluation = {
  availability: SiteSessionAvailability;
  reason: SiteSessionPolicyReason;
  missingRequiredKeys: string[];
};

export type SiteSessionDiagnostics = {
  siteId: string;
  snapshotAvailability: SiteSessionAvailability;
  snapshotUpdatedAtMs: number | null;
  snapshotCookieCount: number;
  missingRequiredKeys: string[];
  lastError: string | null;
  policy: SiteSessionPolicyEvaluation;
};

export type SiteSessionStateChangedPayload = {
  siteId: string;
  state: SiteSessionState;
  registryEntries: SiteSessionRegistryEntry[];
};
