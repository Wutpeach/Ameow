import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

type RunCommandOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

type ManagedYtDlpPaths = {
  root: string;
  venvDir: string;
  pythonPath: string;
  ytDlpPath: string;
  metadataPath: string;
};

type ManagedYtDlpStatus = {
  version: string | null;
  pythonVersion: string | null;
  pythonPath: string | null;
  pythonSupportsLatestStable: boolean | null;
  installedAtMs: number | null;
  updatedAtMs: number | null;
};

type SystemPythonInfo = {
  command: string;
  resolvedPath: string;
  version: string;
  versionTuple: [number, number, number];
  supportsLatestStable: boolean;
};

const isMac = process.platform === "darwin";
const PYPI_SIMPLE_INDEX_URL = "https://pypi.org/simple";
const MANAGED_YTDLP_MIN_PYTHON: [number, number, number] = [3, 10, 0];

const normalizeVersionString = (value: string | null | undefined): string | null => {
  const normalized = value?.trim().replace(/^v/i, "");
  return normalized ? normalized : null;
};

const runCapturedCommand = async (
  command: string,
  args: string[],
  options: RunCommandOptions = {},
): Promise<{ stdout: string; stderr: string }> => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
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
  child.once("error", reject);
  child.once("close", (code) => {
    if (code === 0) {
      resolve({ stdout, stderr });
      return;
    }
    reject(new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code}`));
  });
});

const readJsonFile = async (filePath: string): Promise<Record<string, unknown> | null> => {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
};

const parsePythonVersionTuple = (
  value: string | null | undefined,
): [number, number, number] | null => {
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

export const managedYtDlpMinimumPythonVersion = (): string =>
  `${MANAGED_YTDLP_MIN_PYTHON[0]}.${MANAGED_YTDLP_MIN_PYTHON[1]}`;

export const pythonSupportsLatestManagedYtDlp = (
  version: string | null | undefined,
): boolean => {
  const tuple = parsePythonVersionTuple(version);
  return tuple ? compareVersionTuples(tuple, MANAGED_YTDLP_MIN_PYTHON) >= 0 : false;
};

const replaceFile = async (targetPath: string, temporaryPath: string): Promise<void> => {
  try {
    await unlink(targetPath).catch(() => {});
    await rename(temporaryPath, targetPath);
  } catch {
    await writeFile(targetPath, await readFile(temporaryPath));
    await unlink(temporaryPath).catch(() => {});
  }
};

export const isManagedYtDlpSupported = (): boolean => isMac;

export const buildManagedYtDlpPaths = (
  configDir: string,
  target: string,
): ManagedYtDlpPaths => {
  const root = join(configDir, "runtimes", "yt-dlp", target);
  const venvDir = join(root, "venv");
  return {
    root,
    venvDir,
    pythonPath: join(venvDir, "bin", "python3"),
    ytDlpPath: join(venvDir, "bin", "yt-dlp"),
    metadataPath: join(root, "metadata.json"),
  };
};

export const readManagedYtDlpStatus = async (
  paths: ManagedYtDlpPaths,
): Promise<ManagedYtDlpStatus> => {
  const metadata = await readJsonFile(paths.metadataPath);
  return {
    version: typeof metadata?.ytDlpVersion === "string" ? metadata.ytDlpVersion : null,
    pythonVersion: typeof metadata?.pythonVersion === "string" ? metadata.pythonVersion : null,
    pythonPath: typeof metadata?.pythonPath === "string" ? metadata.pythonPath : null,
    pythonSupportsLatestStable:
      typeof metadata?.pythonSupportsLatestStable === "boolean"
        ? metadata.pythonSupportsLatestStable
        : null,
    installedAtMs: typeof metadata?.installedAtMs === "number" ? metadata.installedAtMs : null,
    updatedAtMs: typeof metadata?.updatedAtMs === "number" ? metadata.updatedAtMs : null,
  };
};

const inspectSystemPython3 = async (command: string): Promise<SystemPythonInfo | null> => {
  try {
    const { stdout } = await runCapturedCommand(command, [
      "-c",
      "import sys; print(sys.executable); print('.'.join(str(part) for part in sys.version_info[:3]))",
    ]);
    const [resolvedPathRaw, versionRaw] = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const versionTuple = parsePythonVersionTuple(versionRaw);
    if (!resolvedPathRaw || !versionRaw || !versionTuple) {
      return null;
    }
    return {
      command,
      resolvedPath: resolvedPathRaw,
      version: versionRaw,
      versionTuple,
      supportsLatestStable: pythonSupportsLatestManagedYtDlp(versionRaw),
    };
  } catch {
    return null;
  }
};

export const detectSystemPython3 = async (): Promise<SystemPythonInfo> => {
  const candidates = [
    process.env.FLOWSELECT_PYTHON3_PATH?.trim() || null,
    "/opt/homebrew/bin/python3",
    "/usr/local/bin/python3",
    "/usr/bin/python3",
    "python3",
  ].filter((candidate): candidate is string => Boolean(candidate));
  const inspected: SystemPythonInfo[] = [];
  const seenResolvedPaths = new Set<string>();

  for (const candidate of candidates) {
    if (candidate.includes("/") && !existsSync(candidate)) {
      continue;
    }
    const info = await inspectSystemPython3(candidate);
    if (!info || seenResolvedPaths.has(info.resolvedPath)) {
      continue;
    }
    seenResolvedPaths.add(info.resolvedPath);
    inspected.push(info);
  }

  if (inspected.length === 0) {
    throw new Error("Python 3 is required on macOS to bootstrap managed yt-dlp, but no working python3 was found.");
  }

  const compatibleCandidates = inspected
    .filter((candidate) => candidate.supportsLatestStable)
    .sort((left, right) => compareVersionTuples(right.versionTuple, left.versionTuple));
  if (compatibleCandidates.length > 0) {
    return compatibleCandidates[0];
  }

  return inspected.sort((left, right) => compareVersionTuples(right.versionTuple, left.versionTuple))[0];
};

const ensureVirtualenvReady = async (
  systemPython: SystemPythonInfo,
  paths: ManagedYtDlpPaths,
): Promise<void> => {
  if (existsSync(paths.pythonPath) && existsSync(paths.ytDlpPath)) {
    try {
      const venvPythonVersion = await getPythonVersion(paths.pythonPath);
      const venvSupportsLatestStable = pythonSupportsLatestManagedYtDlp(venvPythonVersion);
      if (!venvSupportsLatestStable && systemPython.supportsLatestStable) {
        await rm(paths.venvDir, { recursive: true, force: true });
      } else {
        return;
      }
    } catch {
      await rm(paths.venvDir, { recursive: true, force: true });
    }
  }
  await mkdir(paths.root, { recursive: true });
  await runCapturedCommand(systemPython.resolvedPath, ["-m", "venv", paths.venvDir]);
};

const writeMetadata = async (
  paths: ManagedYtDlpPaths,
  payload: {
    version: string;
    pythonVersion: string;
    pythonPath: string;
    pythonSupportsLatestStable: boolean;
    installedAtMs?: number | null;
    updatedAtMs: number;
    runtimeTarget: string;
  },
): Promise<void> => {
  const previous = await readManagedYtDlpStatus(paths);
  const nextPayload = {
    source: "managed-python-package",
    ytDlpVersion: payload.version,
    pythonVersion: payload.pythonVersion,
    pythonPath: payload.pythonPath,
    pythonSupportsLatestStable: payload.pythonSupportsLatestStable,
    installedAtMs: previous.installedAtMs ?? payload.installedAtMs ?? payload.updatedAtMs,
    updatedAtMs: payload.updatedAtMs,
    runtimeTarget: payload.runtimeTarget,
  };
  const tempDir = await mkdtemp(join(tmpdir(), "flowselect-ytdlp-metadata-"));
  const tempPath = join(tempDir, basename(paths.metadataPath));
  try {
    await writeFile(tempPath, `${JSON.stringify(nextPayload, null, 2)}\n`, "utf8");
    await mkdir(dirname(paths.metadataPath), { recursive: true });
    await replaceFile(paths.metadataPath, tempPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
};

const getPythonVersion = async (pythonPath: string): Promise<string> => {
  const { stdout, stderr } = await runCapturedCommand(pythonPath, ["--version"]);
  return (stdout || stderr).trim();
};

const getYtDlpVersion = async (ytDlpPath: string): Promise<string> => {
  const { stdout, stderr } = await runCapturedCommand(ytDlpPath, ["--version"]);
  return normalizeVersionString((stdout || stderr).split(/\r?\n/).find(Boolean) ?? "") ?? "unknown";
};

export const ensureManagedYtDlpReady = async ({
  configDir,
  target,
  onStage,
}: {
  configDir: string;
  target: string;
  onStage?(stage: "checking" | "installing" | "verifying"): void | Promise<void>;
}): Promise<{ ytDlpPath: string; version: string; pythonVersion: string }> => {
  if (!isManagedYtDlpSupported()) {
    throw new Error("Managed yt-dlp bootstrap is only supported on macOS.");
  }
  const paths = buildManagedYtDlpPaths(configDir, target);
  await onStage?.("checking");
  const systemPython = await detectSystemPython3();
  await ensureVirtualenvReady(systemPython, paths);
  await onStage?.("installing");
  await runCapturedCommand(paths.pythonPath, [
    "-m",
    "pip",
    "install",
    "--upgrade",
    "--index-url",
    PYPI_SIMPLE_INDEX_URL,
    "--no-cache-dir",
    "yt-dlp",
  ]);
  if (!existsSync(paths.ytDlpPath)) {
    throw new Error(`Managed yt-dlp entrypoint is missing after install: ${paths.ytDlpPath}`);
  }
  if (process.platform !== "win32") {
    await chmod(paths.ytDlpPath, 0o755).catch(() => {});
    await chmod(paths.pythonPath, 0o755).catch(() => {});
  }
  await onStage?.("verifying");
  const [version, pythonVersion] = await Promise.all([
    getYtDlpVersion(paths.ytDlpPath),
    getPythonVersion(paths.pythonPath),
  ]);
  const timestamp = Date.now();
  await writeMetadata(paths, {
    version,
    pythonVersion,
    pythonPath: systemPython.resolvedPath,
    pythonSupportsLatestStable: systemPython.supportsLatestStable,
    updatedAtMs: timestamp,
    runtimeTarget: target,
  });
  return {
    ytDlpPath: paths.ytDlpPath,
    version,
    pythonVersion,
  };
};

export const getManagedYtDlpVersion = async (
  configDir: string,
  target: string,
): Promise<{
  version: string;
  path: string;
  pythonVersion: string | null;
  pythonPath: string | null;
  pythonSupportsLatestStable: boolean;
} | null> => {
  const paths = buildManagedYtDlpPaths(configDir, target);
  if (!existsSync(paths.ytDlpPath)) {
    return null;
  }
  const metadata = await readManagedYtDlpStatus(paths);
  return {
    version: await getYtDlpVersion(paths.ytDlpPath),
    path: paths.ytDlpPath,
    pythonVersion: metadata.pythonVersion,
    pythonPath: metadata.pythonPath,
    pythonSupportsLatestStable:
      metadata.pythonSupportsLatestStable
      ?? pythonSupportsLatestManagedYtDlp(metadata.pythonVersion),
  };
};
