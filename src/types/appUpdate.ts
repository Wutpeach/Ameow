export type AppUpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "error";

export type AppUpdateInfo = {
  current: string;
  latest: string;
  notes: string | null;
  publishedAt: string | null;
  installMode?: "installer" | "portable" | "manual";
  manualUrl?: string | null;
};

export type AppUpdateCheckSource =
  | "startup"
  | "interval"
  | "manual"
  | "preference_changed";

export type AppUpdateStatePayload = {
  info: AppUpdateInfo | null;
  phase: "idle" | "checking" | "available" | "error";
  checkedAtMs: number | null;
  error: string | null;
  source: AppUpdateCheckSource | null;
};
