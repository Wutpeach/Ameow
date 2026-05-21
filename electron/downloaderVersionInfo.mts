type DownloaderStatusEntry = {
  state: "ready" | "missing";
  source: "bundled" | "managed" | null;
  expectedSource?: "bundled" | "managed" | null;
  path: string | null;
  error: string | null;
};

type RuntimeDependencyStatusSnapshot = {
  python: DownloaderStatusEntry;
  ytDlp: DownloaderStatusEntry;
  galleryDl: DownloaderStatusEntry;
  douyinDl: DownloaderStatusEntry;
};

type ManagedPythonRuntimeMetadata = {
  packageVersion?: unknown;
  packageSource?: unknown;
  pythonVersion?: unknown;
  pythonPath?: unknown;
  bundledPythonVersion?: unknown;
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
  updateChannel: "managed_python_package" | "unavailable";
};

type DownloaderVersionInfoOptions = {
  platform: NodeJS.Platform;
  getRuntimeDependencyStatus(): Promise<RuntimeDependencyStatusSnapshot>;
  getUserDataDir(): string;
  currentManagedRuntimeTarget(): string;
  getLocalDownloaderVersion(toolId: "yt-dlp" | "gallery-dl", binaryPath: string): Promise<string>;
  resolvePinnedManagedPythonPackage(
    toolId: "yt-dlp" | "gallery-dl",
  ): {
    packageVersion: string;
    minPython?: [number, number, number];
  };
  compareLooseVersions(left: string, right: string): number;
  readManagedPythonRuntimeMetadata?(
    toolId: "yt-dlp" | "gallery-dl",
    runtimeRoot: string,
  ): Promise<ManagedPythonRuntimeMetadata | null>;
};

const normalizeOptionalString = (value: unknown): string | null => (
  typeof value === "string" && value.trim() ? value.trim() : null
);

const parseVersionTuple = (value: string | null): [number, number, number] | null => {
  if (!value) {
    return null;
  }
  const match = value.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

const compareVersionTuples = (
  left: [number, number, number],
  right: [number, number, number],
): number => {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] > right[index]) {
      return 1;
    }
    if (left[index] < right[index]) {
      return -1;
    }
  }
  return 0;
};

const runtimeRootFromEntrypoint = (
  entryPath: string | null | undefined,
  platform: NodeJS.Platform,
): string | null => {
  if (!entryPath) {
    return null;
  }
  const suffix = platform === "win32"
    ? "\\venv\\Scripts\\"
    : "/venv/bin/";
  const normalizedEntryPath = platform === "win32"
    ? entryPath.replace(/\//g, "\\")
    : entryPath.replace(/\\/g, "/");
  const markerIndex = normalizedEntryPath.lastIndexOf(suffix);
  if (markerIndex < 0) {
    return null;
  }
  return normalizedEntryPath.slice(0, markerIndex);
};

export const checkYtdlpVersion = async (
  options: DownloaderVersionInfoOptions,
): Promise<DownloaderVersionInfo> => {
  const status = await options.getRuntimeDependencyStatus();
  const pinnedPackage = options.resolvePinnedManagedPythonPackage("yt-dlp");
  const latest = pinnedPackage.packageVersion;
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
  const runtimeRoot = runtimeRootFromEntrypoint(entryPath, options.platform);
  const metadata = runtimeRoot && options.readManagedPythonRuntimeMetadata
    ? await options.readManagedPythonRuntimeMetadata("yt-dlp", runtimeRoot)
    : null;
  const pythonVersion = normalizeOptionalString(metadata?.pythonVersion)
    ?? normalizeOptionalString(metadata?.bundledPythonVersion);
  const pythonPath = normalizeOptionalString(metadata?.pythonPath) ?? status.python.path;
  const parsedPythonVersion = parseVersionTuple(pythonVersion);
  const minPython = pinnedPackage.minPython ?? null;
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
    pythonVersion,
    pythonPath,
    pythonSupportsLatestStable:
      parsedPythonVersion && minPython
        ? compareVersionTuples(parsedPythonVersion, minPython) >= 0
        : null,
    updateChannel: entryPath ? "managed_python_package" : "unavailable",
  };
};

export const getGalleryDlInfo = async (
  options: Omit<DownloaderVersionInfoOptions, "getUserDataDir">,
): Promise<DownloaderVersionInfo> => {
  const status = await options.getRuntimeDependencyStatus();
  if (status.galleryDl.state !== "ready" || !status.galleryDl.path) {
    return {
      current: "missing",
      latest: options.resolvePinnedManagedPythonPackage("gallery-dl").packageVersion,
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
  const latest = options.resolvePinnedManagedPythonPackage("gallery-dl").packageVersion;

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
    pythonPath: status.python.path,
    pythonSupportsLatestStable: null,
    updateChannel: "managed_python_package",
  };
};
