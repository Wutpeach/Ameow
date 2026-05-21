import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type {
  ElectronRuntimeEnvironment,
  RuntimeBinaryPaths,
} from "./contracts.js";
import {
  denoBinaryNameFor,
  ffmpegBinaryNameFor,
  ffprobeBinaryNameFor,
  pythonBinaryNameFor,
  resolveRuntimeTarget,
} from "./platform.js";
import type {
  RuntimeDependencySource,
  RuntimeDependencyStatusEntry,
  RuntimeDependencyStatusSnapshot,
} from "../types/runtimeDependencies.js";

const createStatusEntry = (
  state: "ready" | "missing",
  source: RuntimeDependencySource | null,
  entryPath: string | null,
  error: string | null,
  overrides: Partial<RuntimeDependencyStatusEntry> = {},
): RuntimeDependencyStatusEntry => ({
  state,
  source,
  path: entryPath,
  error,
  ...overrides,
});

const readyStatus = (
  entryPath: string,
  source: RuntimeDependencySource,
  overrides: Partial<RuntimeDependencyStatusEntry> = {},
): RuntimeDependencyStatusEntry => createStatusEntry("ready", source, entryPath, null, overrides);

const missingStatus = (
  error: string,
  overrides: Partial<RuntimeDependencyStatusEntry> = {},
): RuntimeDependencyStatusEntry =>
  createStatusEntry("missing", null, null, error, overrides);

const resolveBundledPythonRootCandidates = (
  environment: ElectronRuntimeEnvironment,
): string[] => {
  const target = resolveRuntimeTarget(environment.platform, environment.arch);
  return [
    path.join(environment.repoRoot, "desktop-assets", "binaries", `python-${target}`),
    ...(environment.resourceDir
      ? [
          path.join(environment.resourceDir, "binaries", `python-${target}`),
          path.join(environment.resourceDir, "app", "desktop-assets", "binaries", `python-${target}`),
        ]
      : []),
    ...(environment.executableDir
      ? [path.join(environment.executableDir, "binaries", `python-${target}`)]
      : []),
  ];
};

export const resolveBundledPythonExecutable = (
  pythonRoot: string,
  environment: Pick<ElectronRuntimeEnvironment, "platform">,
): string => (
  environment.platform === "win32"
    ? path.join(pythonRoot, pythonBinaryNameFor(environment.platform))
    : path.join(pythonRoot, "bin", pythonBinaryNameFor(environment.platform))
);

export const resolveBundledPythonRuntime = (
  environment: ElectronRuntimeEnvironment,
): {
  root: string;
  executable: string;
} => {
  const candidateRoots = resolveBundledPythonRootCandidates(environment);
  const existingRoot = candidateRoots.find((candidate) =>
    fileExists(resolveBundledPythonExecutable(candidate, environment)));
  const root = existingRoot ?? candidateRoots[0] ?? "";
  return {
    root,
    executable: resolveBundledPythonExecutable(root, environment),
  };
};

const runtimeRootFor = (
  environment: ElectronRuntimeEnvironment,
  componentId: string,
): string => {
  const root = path.join(
    environment.configDir,
    "runtimes",
    componentId,
    resolveRuntimeTarget(environment.platform, environment.arch),
  );
  mkdirSync(root, { recursive: true });
  return root;
};

const managedFfmpegPathsFor = (
  environment: ElectronRuntimeEnvironment,
): { ffmpeg: string; ffprobe: string } => {
  const root = runtimeRootFor(environment, "ffmpeg");
  const realRoot = environment.platform === "win32" ? path.join(root, "real") : root;
  return {
    ffmpeg: path.join(realRoot, ffmpegBinaryNameFor(environment.platform)),
    ffprobe: path.join(realRoot, ffprobeBinaryNameFor(environment.platform)),
  };
};

const managedDenoPathFor = (environment: ElectronRuntimeEnvironment): string => {
  const root = runtimeRootFor(environment, "deno");
  const realRoot = environment.platform === "win32" ? path.join(root, "real") : root;
  return path.join(realRoot, denoBinaryNameFor(environment.platform));
};

const managedYtDlpPathFor = (environment: ElectronRuntimeEnvironment): string => {
  return resolveManagedYtDlpRuntimePaths(environment).entrypoint;
};

const managedGalleryDlPathFor = (environment: ElectronRuntimeEnvironment): string =>
  resolveManagedGalleryDlRuntimePaths(environment).entrypoint;

const managedDouyinDlPathFor = (environment: ElectronRuntimeEnvironment): string => {
  return resolveManagedDouyinRuntimePaths(environment).entrypoint;
};

export const resolveManagedDouyinRuntimePaths = (
  environment: ElectronRuntimeEnvironment,
): {
  root: string;
  venvDir: string;
  python: string;
  entrypoint: string;
} => {
  const root = runtimeRootFor(environment, "douyin-dl");
  const executableDir = path.join(
    root,
    "venv",
    environment.platform === "win32" ? "Scripts" : "bin",
  );
  return {
    root,
    venvDir: path.join(root, "venv"),
    python: path.join(executableDir, environment.platform === "win32" ? "python.exe" : "python"),
    entrypoint: path.join(executableDir, environment.platform === "win32" ? "douyin-dl.exe" : "douyin-dl"),
  };
};

export const resolveManagedYtDlpRuntimePaths = (
  environment: ElectronRuntimeEnvironment,
): {
  root: string;
  venvDir: string;
  python: string;
  entrypoint: string;
} => {
  const root = runtimeRootFor(environment, "yt-dlp");
  const executableDir = path.join(
    root,
    "venv",
    environment.platform === "win32" ? "Scripts" : "bin",
  );
  return {
    root,
    venvDir: path.join(root, "venv"),
    python: path.join(executableDir, environment.platform === "win32" ? "python.exe" : "python"),
    entrypoint: path.join(executableDir, environment.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"),
  };
};

export const resolveManagedGalleryDlRuntimePaths = (
  environment: ElectronRuntimeEnvironment,
): {
  root: string;
  venvDir: string;
  python: string;
  entrypoint: string;
} => {
  const root = runtimeRootFor(environment, "gallery-dl");
  const executableDir = path.join(
    root,
    "venv",
    environment.platform === "win32" ? "Scripts" : "bin",
  );
  return {
    root,
    venvDir: path.join(root, "venv"),
    python: path.join(executableDir, environment.platform === "win32" ? "python.exe" : "python"),
    entrypoint: path.join(executableDir, environment.platform === "win32" ? "gallery-dl.exe" : "gallery-dl"),
  };
};

const fileExists = (entryPath: string): boolean => {
  try {
    return existsSync(entryPath);
  } catch {
    return false;
  }
};

const resolveManagedStatus = (
  label: string,
  candidates: string[],
): RuntimeDependencyStatusEntry => {
  const allExist = candidates.every((candidate) => fileExists(candidate));
  if (allExist) {
    return readyStatus(candidates[0] ?? "", "managed");
  }
  return missingStatus(
    `Missing managed ${label} runtime. Expected ${JSON.stringify(candidates)}`,
  );
};

const resolveYtDlpStatus = (
  environment: ElectronRuntimeEnvironment,
): RuntimeDependencyStatusEntry => {
  const managedPath = managedYtDlpPathFor(environment);

  if (fileExists(managedPath)) {
    return readyStatus(managedPath, "managed", {
      expectedSource: "managed",
    });
  }

  return missingStatus(
    `Missing managed yt-dlp runtime. Expected ${JSON.stringify([managedPath])}`,
    {
      expectedSource: "managed",
    },
  );
};

const resolvePythonStatus = (
  environment: ElectronRuntimeEnvironment,
): RuntimeDependencyStatusEntry => {
  const runtime = resolveBundledPythonRuntime(environment);
  if (runtime.root && fileExists(runtime.executable)) {
    return readyStatus(runtime.executable, "bundled", {
      expectedSource: "bundled",
    });
  }
  return createStatusEntry(
    "missing",
    null,
    runtime.executable || null,
    `Missing bundled Python runtime. Expected executable at ${runtime.executable}`,
    {
      expectedSource: "bundled",
    },
  );
};

const resolveYtDlpBinaryPath = (environment: ElectronRuntimeEnvironment): string => {
  const status = resolveYtDlpStatus(environment);
  if (status.path) {
    return status.path;
  }
  return managedYtDlpPathFor(environment);
};

export const resolveRuntimeBinaryPaths = (
  environment: ElectronRuntimeEnvironment,
): RuntimeBinaryPaths => {
  const ffmpegPaths = managedFfmpegPathsFor(environment);
  return {
    ytDlp: resolveYtDlpBinaryPath(environment),
    galleryDl: managedGalleryDlPathFor(environment),
    douyinDl: managedDouyinDlPathFor(environment),
    ffmpeg: ffmpegPaths.ffmpeg,
    ffprobe: ffmpegPaths.ffprobe,
    deno: managedDenoPathFor(environment),
  };
};

export const inspectRuntimeDependencyStatus = (
  environment: ElectronRuntimeEnvironment,
): RuntimeDependencyStatusSnapshot => {
  const ffmpegPaths = managedFfmpegPathsFor(environment);
  const denoPath = managedDenoPathFor(environment);
  const galleryDlPaths = resolveManagedGalleryDlRuntimePaths(environment);
  const douyinDlPath = managedDouyinDlPathFor(environment);

  return {
    python: resolvePythonStatus(environment),
    ytDlp: resolveYtDlpStatus(environment),
    galleryDl: fileExists(galleryDlPaths.entrypoint)
      ? readyStatus(galleryDlPaths.entrypoint, "managed", { expectedSource: "managed" })
      : missingStatus(`Missing managed gallery-dl runtime. Expected ${JSON.stringify([galleryDlPaths.entrypoint])}`, {
          expectedSource: "managed",
        }),
    douyinDl: fileExists(douyinDlPath)
      ? readyStatus(douyinDlPath, "managed", { expectedSource: "managed" })
      : missingStatus(`Missing managed douyin-dl runtime. Expected ${JSON.stringify([douyinDlPath])}`, {
          expectedSource: "managed",
        }),
    ffmpeg: resolveManagedStatus("ffmpeg", [ffmpegPaths.ffmpeg, ffmpegPaths.ffprobe]),
    deno: resolveManagedStatus("deno", [denoPath]),
  };
};
