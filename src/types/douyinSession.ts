export type DouyinSessionAvailability = "missing" | "partial" | "ready";

export type DouyinSessionCapturePhase =
  | "idle"
  | "preparing"
  | "awaiting_confirmation";

export type DouyinSessionState = {
  availability: DouyinSessionAvailability;
  updatedAtMs: number | null;
  cookieCount: number;
  requiredKeys: string[];
  missingRequiredKeys: string[];
  lastError: string | null;
  sessionFilePath: string | null;
  capturePhase: DouyinSessionCapturePhase;
  captureStartedAtMs: number | null;
  capturePid: number | null;
};

export type DouyinSessionSummaryState = "missing" | "ready";

export type DouyinSessionSummary = {
  state: DouyinSessionSummaryState;
  lastUpdatedAtMs: number | null;
  cookieCount: number;
  missingKeys: string[];
  hasLoginCookie: boolean;
};
