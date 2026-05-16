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
  galleryDlBinaryNameFor,
  resolveRuntimeTarget,
  ytDlpBinaryNameFor,
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

const firstCandidate = (candidates: string[]): string | null => candidates[0] ?? null;

const existingCandidate = (candidates: string[]): string | null =>
  candidates.find((candidate) => existsSync(candidate)) ?? null;

const resolveBundledCandidates = (
  environment: ElectronRuntimeEnvironment,
  fileName: string,
): string[] => {
  const candidates = [
    path.join(environment.repoRoot, "desktop-assets", "binaries", fileName),
  ];
  if (environment.resourceDir) {
    candidates.push(path.join(environment.resourceDir, "binaries", fileName));
  }
  if (environment.executableDir) {
    candidates.push(path.join(environment.executableDir, "binaries", fileName));
  }
  return candidates;
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
  const root = runtimeRootFor(environment, "yt-dlp");
  if (environment.platform === "win32") {
    return path.join(root, "real", ytDlpBinaryNameFor(environment.platform, environment.arch));
  }
  return path.join(root, "venv", "bin", "yt-dlp");
};

const managedGalleryDlPathFor = (environment: ElectronRuntimeEnvironment): string => {
  const root = runtimeRootFor(environment, "gallery-dl");
  const realRoot = environment.platform === "win32" ? path.join(root, "real") : root;
  return path.join(realRoot, galleryDlBinaryNameFor(environment.platform, environment.arch));
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
  const bundledCandidates = resolveBundledCandidates(
    environment,
    ytDlpBinaryNameFor(environment.platform, environment.arch),
  );
  const managedPath = managedYtDlpPathFor(environment);
  const bundledPath = existingCandidate(bundledCandidates);

  if (fileExists(managedPath)) {
    return readyStatus(managedPath, "managed", {
      expectedSource: "managed",
      fallbackSource: bundledPath ? "bundled" : null,
      fallbackPath: bundledPath,
    });
  }

  if (bundledPath) {
    return missingStatus(
      `Missing managed yt-dlp runtime. Bundled macOS fallback is available at ${bundledPath}`,
      {
      expectedSource: "managed",
      fallbackSource: "bundled",
      fallbackPath: bundledPath,
    });
  }

  return missingStatus(
    `Missing managed yt-dlp runtime. Expected ${JSON.stringify([managedPath])}; bundled fallback checked ${JSON.stringify(bundledCandidates)}`,
    {
      expectedSource: "managed",
      fallbackSource: "bundled",
      fallbackPath: firstCandidate(bundledCandidates),
    },
  );
};

const resolveYtDlpBinaryPath = (environment: ElectronRuntimeEnvironment): string => {
  const status = resolveYtDlpStatus(environment);
  if (status.path) {
    return status.path;
  }
  if (status.fallbackPath && fileExists(status.fallbackPath)) {
    return status.fallbackPath;
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
  const galleryDlPath = managedGalleryDlPathFor(environment);

  return {
    ytDlp: resolveYtDlpStatus(environment),
    galleryDl: fileExists(galleryDlPath)
      ? readyStatus(galleryDlPath, "managed", { expectedSource: "managed" })
      : missingStatus(`Missing managed gallery-dl runtime. Expected ${JSON.stringify([galleryDlPath])}`, {
          expectedSource: "managed",
        }),
    ffmpeg: resolveManagedStatus("ffmpeg", [ffmpegPaths.ffmpeg, ffmpegPaths.ffprobe]),
    deno: resolveManagedStatus("deno", [denoPath]),
  };
};
