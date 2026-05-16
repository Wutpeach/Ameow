import {
  getManagedYtDlpVersion,
  managedYtDlpMinimumPythonVersion,
} from "./managedYtDlpRuntime.mjs";

type DownloaderStatusEntry = {
  state: "ready" | "missing";
  source: "bundled" | "managed" | null;
  expectedSource?: "bundled" | "managed" | null;
  path: string | null;
  error: string | null;
};

type RuntimeDependencyStatusSnapshot = {
  ytDlp: DownloaderStatusEntry;
  galleryDl: DownloaderStatusEntry;
};

type DownloaderVersionInfo = {
  current: string;
  latest: string;
  updateAvailable: boolean | null;
  latestError: string | null;
  source: "managed" | "missing" | "bundled";
  path: string | null;
  pythonVersion: string | null;
  pythonPath: string | null;
  pythonSupportsLatestStable: boolean | null;
  updateChannel: "managed_release" | "managed_python_package" | "bundled_release" | "unavailable";
};

type DownloaderVersionInfoOptions = {
  platform: NodeJS.Platform;
  getRuntimeDependencyStatus(): Promise<RuntimeDependencyStatusSnapshot>;
  getUserDataDir(): string;
  currentManagedRuntimeTarget(): string;
  getManagedYtDlpVersion(configDir: string, target: string): Promise<{
    version: string | null;
    pythonVersion: string | null;
    pythonPath: string | null;
    pythonSupportsLatestStable: boolean | null;
    path: string | null;
  } | null>;
  getLocalDownloaderVersion(toolId: "yt-dlp" | "gallery-dl", binaryPath: string): Promise<string>;
  resolvePinnedDownloaderRelease(toolId: "yt-dlp" | "gallery-dl"): { version: string };
  compareLooseVersions(left: string, right: string): number;
};

export const checkYtdlpVersion = async (
  options: DownloaderVersionInfoOptions,
): Promise<DownloaderVersionInfo> => {
  const status = await options.getRuntimeDependencyStatus();
  const latest = options.resolvePinnedDownloaderRelease("yt-dlp").version;

  if (options.platform !== "darwin") {
    const entryPath = status.ytDlp.path;
    let current = "missing";
    let localError = status.ytDlp.error ?? null;
    if (entryPath) {
      try {
        current = await options.getLocalDownloaderVersion("yt-dlp", entryPath);
        localError = null;
      } catch (error) {
        current = "unknown";
        localError = String(error);
      }
    }
    return {
      current,
      latest,
      updateAvailable:
        current !== "missing" && current !== "unknown" && latest
          ? options.compareLooseVersions(current, latest) < 0
          : null,
      latestError: localError,
      source: entryPath ? "managed" : "missing",
      path: entryPath ?? null,
      pythonVersion: null,
      pythonPath: null,
      pythonSupportsLatestStable: null,
      updateChannel: entryPath ? "managed_release" : "unavailable",
    };
  }

  const managed = await options.getManagedYtDlpVersion(options.getUserDataDir(), options.currentManagedRuntimeTarget());
  let current = managed?.version ?? "missing";
  let localError = status.ytDlp.error ?? null;
  if (managed?.path) {
    current = managed.version ?? "missing";
    localError = null;
  } else {
    localError = localError ?? "Managed yt-dlp runtime is missing";
  }
  const pythonBlocksPinnedVersion = Boolean(
    managed
    && latest
    && !managed.pythonSupportsLatestStable
    && options.compareLooseVersions(managed.version ?? "missing", latest) < 0,
  );
  const effectiveLatestError = pythonBlocksPinnedVersion
    ? `Latest stable yt-dlp requires Python ${managedYtDlpMinimumPythonVersion()}+, current managed runtime uses ${managed?.pythonVersion ?? "an older Python"}.`
    : localError;
  return {
    current,
    latest,
    updateAvailable:
      current !== "missing" && current !== "unknown" && latest && !pythonBlocksPinnedVersion
        ? options.compareLooseVersions(current, latest) < 0
        : null,
    latestError: effectiveLatestError,
    source: managed?.path ? "managed" : "missing",
    path: managed?.path ?? null,
    pythonVersion: managed?.pythonVersion ?? null,
    pythonPath: managed?.pythonPath ?? null,
    pythonSupportsLatestStable: managed?.pythonSupportsLatestStable ?? null,
    updateChannel: managed?.path ? "managed_python_package" : "unavailable",
  };
};

export const getGalleryDlInfo = async (
  options: Omit<DownloaderVersionInfoOptions, "getUserDataDir">,
): Promise<DownloaderVersionInfo> => {
  const status = await options.getRuntimeDependencyStatus();
  if (status.galleryDl.state !== "ready" || !status.galleryDl.path) {
    return {
      current: "missing",
      latest: options.resolvePinnedDownloaderRelease("gallery-dl").version,
      updateAvailable: null,
      latestError: status.galleryDl.error,
      source: "missing",
      path: null,
      pythonVersion: null,
      pythonPath: null,
      pythonSupportsLatestStable: null,
      updateChannel: "unavailable",
    };
  }
  let current = "unknown";
  let latestError = null;
  try {
    current = await options.getLocalDownloaderVersion("gallery-dl", status.galleryDl.path);
  } catch (error) {
    latestError = String(error);
  }
  const latest = options.resolvePinnedDownloaderRelease("gallery-dl").version;

  return {
    current,
    latest,
    updateAvailable:
      current !== "missing" && current !== "unknown" && latest
        ? options.compareLooseVersions(current, latest) < 0
        : null,
    latestError,
    source: "managed",
    path: status.galleryDl.path,
    pythonVersion: null,
    pythonPath: null,
    pythonSupportsLatestStable: null,
    updateChannel: "managed_release",
  };
};
