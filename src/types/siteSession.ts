export type SiteSessionAvailability = "missing" | "partial" | "ready";

// `unknown` means the app attempted or skipped profile inspection without a
// trustworthy answer; check `lastError` to distinguish an inspection failure.
export type SiteSessionProfileState = "unknown" | "missing" | "present";

export type SiteSessionPolicyReason =
  | "ready"
  | "missing_required_cookie"
  | "missing_login_cookie"
  | "no_snapshot";

export type SiteSessionCapturePhase =
  | "idle"
  | "preparing"
  | "awaiting_confirmation";

export type SupportedSiteSessionId =
  | "douyin"
  | "bilibili"
  | "xiaohongshu"
  | "instagram"
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

export type SiteSessionPolicyEvaluation = {
  availability: SiteSessionAvailability;
  reason: SiteSessionPolicyReason;
  missingRequiredKeys: string[];
};

export type SiteSessionDiagnostics = {
  siteId: SupportedSiteSessionId | string;
  profileState: SiteSessionProfileState;
  snapshotAvailability: SiteSessionAvailability;
  snapshotUpdatedAtMs: number | null;
  snapshotCookieCount: number;
  missingRequiredKeys: string[];
  lastError: string | null;
  policy: SiteSessionPolicyEvaluation;
};
