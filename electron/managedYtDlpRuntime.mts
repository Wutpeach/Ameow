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
  installedAtMs: number | null;
  updatedAtMs: number | null;
};

const isMac = process.platform === "darwin";

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
    installedAtMs: typeof metadata?.installedAtMs === "number" ? metadata.installedAtMs : null,
    updatedAtMs: typeof metadata?.updatedAtMs === "number" ? metadata.updatedAtMs : null,
  };
};

export const detectSystemPython3 = async (): Promise<string> => {
  const candidates = ["/usr/bin/python3", "/opt/homebrew/bin/python3", "/usr/local/bin/python3"];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }
    try {
      await runCapturedCommand(candidate, ["--version"]);
      return candidate;
    } catch {
      // continue
    }
  }
  throw new Error("Python 3 is required on macOS to bootstrap managed yt-dlp, but no working python3 was found.");
};

const ensureVirtualenvReady = async (
  python3Path: string,
  paths: ManagedYtDlpPaths,
): Promise<void> => {
  if (existsSync(paths.pythonPath) && existsSync(paths.ytDlpPath)) {
    return;
  }
  await mkdir(paths.root, { recursive: true });
  await runCapturedCommand(python3Path, ["-m", "venv", paths.venvDir]);
};

const writeMetadata = async (
  paths: ManagedYtDlpPaths,
  payload: {
    version: string;
    pythonVersion: string;
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
  desiredVersion,
  onStage,
}: {
  configDir: string;
  target: string;
  desiredVersion?: string | null;
  onStage?(stage: "checking" | "installing" | "verifying"): void | Promise<void>;
}): Promise<{ ytDlpPath: string; version: string; pythonVersion: string }> => {
  if (!isManagedYtDlpSupported()) {
    throw new Error("Managed yt-dlp bootstrap is only supported on macOS.");
  }
  const paths = buildManagedYtDlpPaths(configDir, target);
  await onStage?.("checking");
  const systemPython = await detectSystemPython3();
  await ensureVirtualenvReady(systemPython, paths);
  const installTarget = desiredVersion ? `yt-dlp==${desiredVersion}` : "yt-dlp";
  await onStage?.("installing");
  await runCapturedCommand(paths.pythonPath, ["-m", "pip", "install", "--upgrade", "pip"]);
  await runCapturedCommand(paths.pythonPath, ["-m", "pip", "install", "--upgrade", installTarget]);
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
): Promise<{ version: string; path: string } | null> => {
  const paths = buildManagedYtDlpPaths(configDir, target);
  if (!existsSync(paths.ytDlpPath)) {
    return null;
  }
  return {
    version: await getYtDlpVersion(paths.ytDlpPath),
    path: paths.ytDlpPath,
  };
};
