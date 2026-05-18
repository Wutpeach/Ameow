export type SiteSessionAvailability = "missing" | "partial" | "ready";

export type SiteSessionCapturePhase =
  | "idle"
  | "preparing"
  | "awaiting_confirmation";

export type SupportedSiteSessionId =
  | "douyin"
  | "bilibili"
  | "xiaohongshu"
  | "youtube";

export type SiteSessionState = {
  siteId: SupportedSiteSessionId | string;
  availability: SiteSessionAvailability;
  updatedAtMs: number | null;
  cookieCount: number;
  requiredKeys: string[];
  missingRequiredKeys: string[];
  lastError: string | null;
  sessionFilePath: string | null;
  capturePhase: SiteSessionCapturePhase;
  captureStartedAtMs: number | null;
  capturePid: number | null;
};
