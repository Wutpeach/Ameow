export type {
  SiteSessionAvailability as DouyinSessionAvailability,
  SiteSessionCapturePhase as DouyinSessionCapturePhase,
  SiteSessionState as DouyinSessionState,
} from "./siteSession.js";

export type DouyinSessionSummaryState = "missing" | "ready";

export type DouyinSessionSummary = {
  state: DouyinSessionSummaryState;
  lastUpdatedAtMs: number | null;
  cookieCount: number;
  missingKeys: string[];
  hasLoginCookie: boolean;
};
