import { once } from "node:events";
import { createWriteStream, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { spawn } from "node:child_process";

import {
  denoBinaryNameFor,
  ffmpegBinaryNameFor,
  ffprobeBinaryNameFor,
  galleryDlBinaryNameFor,
  resolveRuntimeTarget,
  ytDlpBinaryNameFor,
} from "../src/electron-runtime/platform.js";
import type { RuntimeDependencyManagedComponent } from "../src/types/runtimeDependencies.js";
import { ensureManagedYtDlpReady } from "./managedYtDlpRuntime.mjs";

export type ManagedRuntimeStage = "checking" | "downloading" | "installing" | "verifying";

export type ManagedRuntimeActivity = {
  component: RuntimeDependencyManagedComponent;
  stage: ManagedRuntimeStage;
  downloadedBytes?: number | null;
  totalBytes?: number | null;
};

export type ManagedRuntimeBootstrapOptions = {
  configDir: string;
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
  fetch: typeof fetch;
  log?(message: string): void;
  onActivity?(activity: ManagedRuntimeActivity): void | Promise<void>;
  now?(): number;
};

type PinnedDownloaderToolId = "yt-dlp" | "gallery-dl";

type PinnedDownloaderRelease = {
  version: string;
  latestCacheFileName: string;
  releaseDownloadBaseUrl: string;
  assetNameByPlatform: Partial<Record<NodeJS.Platform, string>>;
  sha256ByTarget: Record<string, string>;
};

type RuntimeArtifactSpec = {
  component: RuntimeDependencyManagedComponent;
  target: string;
  downloadUrls: string[];
  sha256: string;
  size: number;
};

const PINNED_DOWNLOADER_RELEASES: Record<PinnedDownloaderToolId, PinnedDownloaderRelease> = {
  "yt-dlp": {
    version: "2026.03.17",
    latestCacheFileName: "ytdlp-latest.json",
    releaseDownloadBaseUrl: "https://github.com/yt-dlp/yt-dlp/releases/download/2026.03.17",
    assetNameByPlatform: {
      win32: "yt-dlp.exe",
      darwin: "yt-dlp_macos",
    },
    sha256ByTarget: {
      "x86_64-pc-windows-msvc": "3db811b366b2da47337d2fcfdfe5bbd9a258dad3f350c54974f005df115a1545",
      "aarch64-apple-darwin": "e80c47b3ce712acee51d5e3d4eace2d181b44d38f1942c3a32e3c7ff53cd9ed5",
    },
  },
  "gallery-dl": {
    version: "1.32.0-dev:2026.03.30",
    latestCacheFileName: "gallery-dl-latest.json",
    releaseDownloadBaseUrl: "https://github.com/gdl-org/builds/releases/download/2026.03.30",
    assetNameByPlatform: {
      win32: "gallery-dl_windows.exe",
      darwin: "gallery-dl_macos",
    },
    sha256ByTarget: {
      "x86_64-pc-windows-msvc": "e8ea5d324d073d9a844a4e5c57a6c203bb75137548081194888834e6a94b22ec",
      "aarch64-apple-darwin": "e0e1c68c64ad12b0ebd2d08f32de5eee14eaa8cc2c7bae13db4c4120f03ba116",
    },
  },
};

const RUNTIME_DOWNLOAD_STALL_TIMEOUT_MS = 30_000;

export const resolvePinnedDownloaderRelease = (
  toolId: PinnedDownloaderToolId,
): PinnedDownloaderRelease => {
  const config = (PINNED_DOWNLOADER_RELEASES as Partial<Record<string, PinnedDownloaderRelease>>)[toolId];
  if (!config) {
    throw new Error(`Unsupported pinned downloader tool: ${toolId}`);
  }
  return config;
};

export const currentManagedRuntimeTarget = (
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch,
): string => resolveRuntimeTarget(platform, arch);

const runtimeRoot = (
  options: ManagedRuntimeBootstrapOptions,
  componentId: string,
): string => join(
  options.configDir,
  "runtimes",
  componentId,
  currentManagedRuntimeTarget(options.platform, options.arch),
);

export const managedDenoPath = (options: ManagedRuntimeBootstrapOptions): string => {
  const root = runtimeRoot(options, "deno");
  const realRoot = options.platform === "win32" ? join(root, "real") : root;
  return join(realRoot, denoBinaryNameFor(options.platform));
};

export const managedFfmpegPaths = (
  options: ManagedRuntimeBootstrapOptions,
): { ffmpeg: string; ffprobe: string } => {
  const root = runtimeRoot(options, "ffmpeg");
  const realRoot = options.platform === "win32" ? join(root, "real") : root;
  return {
    ffmpeg: join(realRoot, ffmpegBinaryNameFor(options.platform)),
    ffprobe: join(realRoot, ffprobeBinaryNameFor(options.platform)),
  };
};

export const managedYtDlpPaths = (
  options: ManagedRuntimeBootstrapOptions,
): {
  root: string;
  venvDir: string;
  python: string;
  ytDlp: string;
  metadata: string;
} => {
  const root = runtimeRoot(options, "yt-dlp");
  return {
    root,
    venvDir: join(root, "venv"),
    python: join(root, "venv", "bin", "python3"),
    ytDlp: options.platform === "darwin"
      ? join(root, "venv", "bin", "yt-dlp")
      : join(root, "real", ytDlpBinaryNameFor(options.platform, options.arch)),
    metadata: join(root, "metadata.json"),
  };
};

export const managedGalleryDlPath = (options: ManagedRuntimeBootstrapOptions): string => {
  const root = runtimeRoot(options, "gallery-dl");
  const realRoot = options.platform === "win32" ? join(root, "real") : root;
  return join(realRoot, galleryDlBinaryNameFor(options.platform, options.arch));
};

const summarizeBootstrapError = (error: unknown): string => (
  error instanceof Error && error.message ? error.message : String(error ?? "unknown error")
);

const sha256Hex = async (filePath: string): Promise<string> => {
  const buffer = await readFile(filePath);
  return createHash("sha256").update(buffer).digest("hex");
};

const verifyDownloadedRuntimeAsset = async (
  tempPath: string,
  expectedSize: number,
  expectedSha256: string,
  assetLabel: string,
): Promise<void> => {
  const fileStats = await stat(tempPath);
  if (expectedSize > 0 && fileStats.size !== expectedSize) {
    throw new Error(
      `${assetLabel} size mismatch: expected ${expectedSize}, received ${fileStats.size}`,
    );
  }
  const actualSha256 = await sha256Hex(tempPath);
  if (actualSha256.toLowerCase() !== String(expectedSha256).toLowerCase()) {
    throw new Error(
      `${assetLabel} checksum mismatch: expected ${expectedSha256}, received ${actualSha256}`,
    );
  }
};

const escapePowerShellLiteral = (value: string): string => value.replace(/'/g, "''");

const runUtilityCommand = async (
  command: string,
  args: string[],
  options: { cwd?: string } = {},
): Promise<void> => {
  const child = spawn(command, args, {
    cwd: options.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  await new Promise<void>((resolveProcess, rejectProcess) => {
    child.once("error", rejectProcess);
    child.once("close", (code) => {
      if (code === 0) {
        resolveProcess();
        return;
      }
      rejectProcess(new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code}`));
    });
  });
};

const extractZipArchive = async (
  archivePath: string,
  destinationPath: string,
  platform: NodeJS.Platform,
): Promise<void> => {
  await rm(destinationPath, { recursive: true, force: true });
  await mkdir(destinationPath, { recursive: true });

  if (platform === "win32") {
    const command = `Expand-Archive -LiteralPath '${escapePowerShellLiteral(archivePath)}' -DestinationPath '${escapePowerShellLiteral(destinationPath)}' -Force`;
    await runUtilityCommand("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      command,
    ]);
    return;
  }

  if (platform === "darwin") {
    await runUtilityCommand("/usr/bin/ditto", ["-x", "-k", archivePath, destinationPath]);
    return;
  }

  throw new Error(`Unsupported zip extraction platform: ${platform}`);
};

const findFileRecursive = async (
  rootDir: string,
  targetFileName: string,
): Promise<string | null> => {
  const entries = await readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = join(rootDir, entry.name);
    if (entry.isFile() && entry.name === targetFileName) {
      return entryPath;
    }
    if (entry.isDirectory()) {
      const nested = await findFileRecursive(entryPath, targetFileName);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
};

const downloadToFile = async (
  url: string,
  destinationPath: string,
  options: ManagedRuntimeBootstrapOptions & {
    timeoutMs?: number;
    timeoutErrorMessage?: string;
    headers?: Record<string, string>;
    onProgress?(progress: { downloaded: number; total: number }): void;
  },
): Promise<void> => {
  const rawTimeoutMs = options.timeoutMs;
  const timeoutMs = Number.isFinite(rawTimeoutMs) && rawTimeoutMs && rawTimeoutMs > 0
    ? rawTimeoutMs
    : null;
  const timeoutErrorMessage = options.timeoutErrorMessage
    ?? `Request timed out after ${Math.round((timeoutMs ?? 0) / 1000)}s`;
  const controller = timeoutMs ? new AbortController() : null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;
  let writable: ReturnType<typeof createWriteStream> | null = null;

  const resetTimeout = (): void => {
    if (!controller || !timeoutMs) {
      return;
    }
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  };

  try {
    resetTimeout();
    const response = await options.fetch(url, {
      headers: options.headers,
      signal: controller?.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    await mkdir(dirname(destinationPath), { recursive: true });

    const total = Number.parseInt(response.headers.get("content-length") ?? "0", 10);
    writable = createWriteStream(destinationPath);
    const reader = response.body.getReader();
    let downloaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      resetTimeout();
      const chunk = Buffer.from(value);
      downloaded += chunk.length;
      if (!writable.write(chunk)) {
        await once(writable, "drain");
      }
      options.onProgress?.({
        downloaded,
        total: Number.isFinite(total) ? total : 0,
      });
    }

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    await new Promise<void>((resolveWrite, rejectWrite) => {
      writable?.once("error", rejectWrite);
      writable?.end(() => {
        resolveWrite();
      });
    });
  } catch (error) {
    writable?.destroy(error as Error);
    if (timedOut) {
      throw new Error(timeoutErrorMessage);
    }
    throw error;
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
};

export const replaceFile = async (targetPath: string, temporaryPath: string): Promise<void> => {
  try {
    await unlink(targetPath).catch(() => {});
    await rename(temporaryPath, targetPath);
  } catch {
    await copyFile(temporaryPath, targetPath);
    await unlink(temporaryPath).catch(() => {});
  }
};

const downloadRuntimeAssetWithFallbacks = async (
  downloadUrls: string[],
  expectedSize: number,
  expectedSha256: string,
  tempPath: string,
  componentId: RuntimeDependencyManagedComponent,
  options: ManagedRuntimeBootstrapOptions,
): Promise<string> => {
  let lastError: unknown = null;
  const timeoutErrorMessage =
    `request timed out after ${Math.round(RUNTIME_DOWNLOAD_STALL_TIMEOUT_MS / 1000)}s`;
  for (const downloadUrl of downloadUrls) {
    try {
      await rm(tempPath, { force: true });
      await downloadToFile(downloadUrl, tempPath, {
        ...options,
        timeoutMs: RUNTIME_DOWNLOAD_STALL_TIMEOUT_MS,
        timeoutErrorMessage,
        onProgress: ({ downloaded, total }) => {
          void options.onActivity?.({
            component: componentId,
            stage: "downloading",
            downloadedBytes: downloaded,
            totalBytes: total > 0 ? total : expectedSize,
          });
        },
      });
      await options.onActivity?.({
        component: componentId,
        stage: "verifying",
        downloadedBytes: expectedSize,
        totalBytes: expectedSize,
      });
      await verifyDownloadedRuntimeAsset(
        tempPath,
        expectedSize,
        expectedSha256,
        `${componentId} runtime asset`,
      );
      return downloadUrl;
    } catch (error) {
      lastError = error;
      await rm(tempPath, { force: true }).catch(() => {});
    }
  }

  throw new Error(
    `Failed to download managed ${componentId} runtime: ${summarizeBootstrapError(lastError)}`,
  );
};

export const selectDenoRuntimeArtifactSpec = (
  options: Pick<ManagedRuntimeBootstrapOptions, "platform" | "arch">,
): RuntimeArtifactSpec => {
  const target = currentManagedRuntimeTarget(options.platform, options.arch);
  if (target === "x86_64-pc-windows-msvc") {
    return {
      component: "deno",
      target,
      downloadUrls: [
        "https://dl.deno.land/release/v2.7.1/deno-x86_64-pc-windows-msvc.zip",
        "https://github.com/denoland/deno/releases/download/v2.7.1/deno-x86_64-pc-windows-msvc.zip",
      ],
      sha256: "94d71d4772436de27a0495933ca4bab7b6895992622b65baeaf4b7995dae1e69",
      size: 47277539,
    };
  }
  if (target === "aarch64-apple-darwin") {
    return {
      component: "deno",
      target,
      downloadUrls: [
        "https://dl.deno.land/release/v2.7.1/deno-aarch64-apple-darwin.zip",
        "https://github.com/denoland/deno/releases/download/v2.7.1/deno-aarch64-apple-darwin.zip",
      ],
      sha256: "bc3392a0f50be9a1ecb68596530319308639a6f69d99678a0018c47e23a10c1f",
      size: 42170253,
    };
  }
  if (target === "x86_64-apple-darwin") {
    return {
      component: "deno",
      target,
      downloadUrls: [
        "https://dl.deno.land/release/v2.7.1/deno-x86_64-apple-darwin.zip",
        "https://github.com/denoland/deno/releases/download/v2.7.1/deno-x86_64-apple-darwin.zip",
      ],
      sha256: "5478393fc9893c6f3516cee7579453a990834ceebf5ff44aaced2d0f285302d7",
      size: 45229858,
    };
  }
  throw new Error(`Unsupported managed deno runtime target: ${target}`);
};

export const selectFfmpegRuntimeArtifactSpec = (
  options: Pick<ManagedRuntimeBootstrapOptions, "platform" | "arch">,
): RuntimeArtifactSpec => {
  const target = currentManagedRuntimeTarget(options.platform, options.arch);
  if (target === "x86_64-pc-windows-msvc") {
    return {
      component: "ffmpeg",
      target,
      downloadUrls: [
        "https://github.com/Tyrrrz/FFmpegBin/releases/download/8.0.1/ffmpeg-windows-x64.zip",
      ],
      sha256: "29f9f067e8ffad75d5c0e96ec142e665228cb12cdb05fd5cc39eeb9c68962a40",
      size: 72093901,
    };
  }
  if (target === "aarch64-apple-darwin") {
    return {
      component: "ffmpeg",
      target,
      downloadUrls: [
        "https://github.com/Tyrrrz/FFmpegBin/releases/download/8.0.1/ffmpeg-osx-arm64.zip",
      ],
      sha256: "0447ba1f4a2f2a10c05985bd1815da61b968ad42fe91d35b502bfc7abffcad0a",
      size: 69575396,
    };
  }
  if (target === "x86_64-apple-darwin") {
    return {
      component: "ffmpeg",
      target,
      downloadUrls: [
        "https://github.com/Tyrrrz/FFmpegBin/releases/download/8.0.1/ffmpeg-osx-x64.zip",
      ],
      sha256: "53c438fe89dd242c95a1cb94a80e1744a9c40798f87eccf6eba564c92e4d1851",
      size: 75898458,
    };
  }
  throw new Error(`Unsupported managed ffmpeg runtime target: ${target}`);
};

const resolvePinnedDownloaderReleaseAssetName = (
  toolId: PinnedDownloaderToolId,
  options: ManagedRuntimeBootstrapOptions,
): string => {
  const config = resolvePinnedDownloaderRelease(toolId);
  const assetName = config.assetNameByPlatform[options.platform];
  if (!assetName) {
    throw new Error(`${toolId} managed runtime is not supported on ${options.platform}`);
  }
  return assetName;
};

export const selectPinnedDownloaderReleaseAsset = (
  toolId: PinnedDownloaderToolId,
  options: ManagedRuntimeBootstrapOptions,
): { assetName: string; downloadUrl: string } => {
  const assetName = resolvePinnedDownloaderReleaseAssetName(toolId, options);
  const config = resolvePinnedDownloaderRelease(toolId);
  return {
    assetName,
    downloadUrl: `${config.releaseDownloadBaseUrl}/${assetName}`,
  };
};

export const writeDownloaderLatestCache = async (
  toolId: PinnedDownloaderToolId,
  version: string,
  options: ManagedRuntimeBootstrapOptions,
): Promise<void> => {
  const cachePath = join(
    options.configDir,
    resolvePinnedDownloaderRelease(toolId).latestCacheFileName,
  );
  await writeFile(
    cachePath,
    JSON.stringify({
      version,
      fetchedAtMs: options.now?.() ?? Date.now(),
    }),
    "utf8",
  );
};

const ensureManagedDownloaderReleaseReady = async (
  toolId: PinnedDownloaderToolId,
  targetPath: string,
  trigger: string,
  options: ManagedRuntimeBootstrapOptions,
): Promise<string> => {
  const pinned = resolvePinnedDownloaderRelease(toolId);
  if (existsSync(targetPath)) {
    return targetPath;
  }

  const target = currentManagedRuntimeTarget(options.platform, options.arch);
  const expectedSha256 = pinned.sha256ByTarget[target];
  if (!expectedSha256) {
    throw new Error(`Pinned ${toolId} runtime checksum is not configured for ${target}`);
  }

  const asset = selectPinnedDownloaderReleaseAsset(toolId, options);
  const browserDownloadUrl = asset.downloadUrl;
  const componentId: RuntimeDependencyManagedComponent = toolId === "gallery-dl" ? "galleryDl" : "ytDlp";
  const tempDir = await mkdtemp(join(tmpdir(), `ameow-${toolId.replace(/[^a-z0-9]/gi, "-")}-`));
  const tempPath = join(tempDir, basename(targetPath));

  try {
    options.log?.(`Bootstrapping managed ${toolId} runtime (${trigger})`);
    await downloadRuntimeAssetWithFallbacks(
      [browserDownloadUrl],
      0,
      expectedSha256,
      tempPath,
      componentId,
      options,
    );
    await options.onActivity?.({
      component: componentId,
      stage: "installing",
      downloadedBytes: null,
      totalBytes: null,
    });
    await mkdir(dirname(targetPath), { recursive: true });
    if (options.platform !== "win32") {
      await chmod(tempPath, 0o755);
    }
    await replaceFile(targetPath, tempPath);
    await writeDownloaderLatestCache(toolId, pinned.version, options);
    return targetPath;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
};

export const ensureManagedDenoRuntimeReady = async (
  trigger: string,
  options: ManagedRuntimeBootstrapOptions,
): Promise<string> => {
  const targetPath = managedDenoPath(options);
  if (existsSync(targetPath)) {
    return targetPath;
  }

  const artifact = selectDenoRuntimeArtifactSpec(options);
  const tempDir = await mkdtemp(join(tmpdir(), "ameow-deno-"));
  const archivePath = join(tempDir, "deno.zip");
  const extractDir = join(tempDir, "extract");
  const tempTargetPath = join(tempDir, basename(targetPath));

  try {
    options.log?.(`Bootstrapping managed deno runtime (${trigger})`);
    await downloadRuntimeAssetWithFallbacks(
      artifact.downloadUrls,
      artifact.size,
      artifact.sha256,
      archivePath,
      "deno",
      options,
    );
    await options.onActivity?.({
      component: "deno",
      stage: "installing",
      downloadedBytes: artifact.size,
      totalBytes: artifact.size,
    });
    await extractZipArchive(archivePath, extractDir, options.platform);
    const extractedBinaryPath = await findFileRecursive(extractDir, denoBinaryNameFor(options.platform));
    if (!extractedBinaryPath) {
      throw new Error(`Failed to find ${denoBinaryNameFor(options.platform)} inside managed deno archive`);
    }
    await mkdir(dirname(targetPath), { recursive: true });
    await copyFile(extractedBinaryPath, tempTargetPath);
    if (options.platform !== "win32") {
      await chmod(tempTargetPath, 0o755);
    }
    await replaceFile(targetPath, tempTargetPath);
    return targetPath;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
};

export const ensureManagedFfmpegRuntimeReady = async (
  trigger: string,
  options: ManagedRuntimeBootstrapOptions,
): Promise<string> => {
  const paths = managedFfmpegPaths(options);
  if (existsSync(paths.ffmpeg) && existsSync(paths.ffprobe)) {
    return paths.ffmpeg;
  }

  const artifact = selectFfmpegRuntimeArtifactSpec(options);
  const tempDir = await mkdtemp(join(tmpdir(), "ameow-ffmpeg-"));
  const archivePath = join(tempDir, "ffmpeg.zip");
  const extractDir = join(tempDir, "extract");
  const tempFfmpegPath = join(tempDir, basename(paths.ffmpeg));
  const tempFfprobePath = join(tempDir, basename(paths.ffprobe));

  try {
    options.log?.(`Bootstrapping managed ffmpeg runtime (${trigger})`);
    await downloadRuntimeAssetWithFallbacks(
      artifact.downloadUrls,
      artifact.size,
      artifact.sha256,
      archivePath,
      "ffmpeg",
      options,
    );
    await options.onActivity?.({
      component: "ffmpeg",
      stage: "installing",
      downloadedBytes: artifact.size,
      totalBytes: artifact.size,
    });
    await extractZipArchive(archivePath, extractDir, options.platform);
    const extractedFfmpegPath = await findFileRecursive(extractDir, ffmpegBinaryNameFor(options.platform));
    const extractedFfprobePath = await findFileRecursive(extractDir, ffprobeBinaryNameFor(options.platform));
    if (!extractedFfmpegPath || !extractedFfprobePath) {
      throw new Error(
        `Failed to find ${ffmpegBinaryNameFor(options.platform)} and ${ffprobeBinaryNameFor(options.platform)} inside managed ffmpeg archive`,
      );
    }
    await mkdir(dirname(paths.ffmpeg), { recursive: true });
    await copyFile(extractedFfmpegPath, tempFfmpegPath);
    await copyFile(extractedFfprobePath, tempFfprobePath);
    if (options.platform !== "win32") {
      await chmod(tempFfmpegPath, 0o755);
      await chmod(tempFfprobePath, 0o755);
    }
    await replaceFile(paths.ffmpeg, tempFfmpegPath);
    await replaceFile(paths.ffprobe, tempFfprobePath);
    return paths.ffmpeg;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
};

export const ensureManagedYtDlpRuntimeReady = async (
  trigger: string,
  options: ManagedRuntimeBootstrapOptions & { forceReinstall?: boolean },
): Promise<string> => {
  const paths = managedYtDlpPaths(options);
  if (!options.forceReinstall && existsSync(paths.ytDlp)) {
    return paths.ytDlp;
  }

  if (options.platform !== "darwin") {
    return await ensureManagedDownloaderReleaseReady(
      "yt-dlp",
      paths.ytDlp,
      trigger,
      options,
    );
  }

  options.log?.(`Bootstrapping managed yt-dlp runtime (${trigger})`);
  const runtime = await ensureManagedYtDlpReady({
    configDir: options.configDir,
    target: currentManagedRuntimeTarget(options.platform, options.arch),
    targetVersion: resolvePinnedDownloaderRelease("yt-dlp").version,
    onStage: async (stage) => {
      await options.onActivity?.({
        component: "ytDlp",
        stage,
        downloadedBytes: stage === "installing" ? 1 : null,
        totalBytes: stage === "installing" ? 1 : null,
      });
    },
  });
  return runtime.ytDlpPath;
};

export const ensureManagedGalleryDlRuntimeReady = async (
  trigger: string,
  options: ManagedRuntimeBootstrapOptions & { forceReinstall?: boolean },
): Promise<string> => {
  const targetPath = managedGalleryDlPath(options);
  if (!options.forceReinstall && existsSync(targetPath)) {
    return targetPath;
  }

  return await ensureManagedDownloaderReleaseReady(
    "gallery-dl",
    targetPath,
    trigger,
    options,
  );
};
