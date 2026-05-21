export type YtdlpVersionInfo = {
  current: string;
  latest: string | null;
  updateAvailable: boolean | null;
  latestError: string | null;
  source?: "managed" | "bundled" | "missing";
  path?: string | null;
  pythonVersion?: string | null;
  pythonPath?: string | null;
  pythonSupportsLatestStable?: boolean | null;
  updateChannel?: "managed_python_package" | "unavailable";
};
