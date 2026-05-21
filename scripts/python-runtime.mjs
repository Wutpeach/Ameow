import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import {
  access,
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

import { PYTHON_RUNTIME_MANIFEST } from "./runtime-manifest.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const repoRoot = path.resolve(__dirname, "..");
export const binariesDir = path.join(repoRoot, "desktop-assets", "binaries");
export const pythonRuntimeManifestPath = path.join(
  binariesDir,
  ".official-python-runtimes.json",
);

const runtimeStoreFrom = (options = {}) => {
  const storeBinariesDir = options.binariesDir ?? binariesDir;
  return {
    binariesDir: storeBinariesDir,
    manifestPath: options.manifestPath ?? path.join(storeBinariesDir, ".official-python-runtimes.json"),
  };
};

const fileExists = async (entryPath) => {
  try {
    await access(entryPath);
    return true;
  } catch {
    return false;
  }
};

export const parseArgs = (argv) => {
  const parsed = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  parsed._ = positional;
  return parsed;
};

export const resolveRuntimeTarget = (
  platformName = process.platform,
  archName = process.arch,
) => {
  if (platformName === "win32" && archName === "x64") {
    return "x86_64-pc-windows-msvc";
  }
  if (platformName === "darwin" && archName === "arm64") {
    return "aarch64-apple-darwin";
  }
  if (platformName === "darwin" && archName === "x64") {
    return "x86_64-apple-darwin";
  }
  throw new Error(`Unsupported Python runtime target: ${platformName}-${archName}`);
};

export const isCurrentHostTarget = (
  target,
  platformName = process.platform,
  archName = process.arch,
) => target === resolveRuntimeTarget(platformName, archName);

export const resolveTargetFromBuilderArgs = (argv = process.argv.slice(2)) => {
  const builderArgs = new Set(argv);
  const platformName = builderArgs.has("--win")
    ? "win32"
    : builderArgs.has("--mac")
      ? "darwin"
      : process.platform;
  const archName = builderArgs.has("--x64")
    ? "x64"
    : builderArgs.has("--arm64")
      ? "arm64"
      : process.arch;
  return resolveRuntimeTarget(platformName, archName);
};

export const platformForTarget = (target) => {
  if (target.endsWith("-windows-msvc")) {
    return "win32";
  }
  if (target.endsWith("-apple-darwin")) {
    return "darwin";
  }
  throw new Error(`Unsupported Python runtime target triple: ${target}`);
};

export const resolvePythonRuntimeSpec = (target) => {
  const spec = PYTHON_RUNTIME_MANIFEST.targets[target];
  if (!spec) {
    throw new Error(`Unsupported Python runtime target triple: ${target}`);
  }
  return spec;
};

export const resolveBundledPythonRuntimeDir = (target) =>
  path.join(binariesDir, `python-${target}`);

export const resolveBundledPythonRuntimeDirForStore = (target, options = {}) =>
  path.join(runtimeStoreFrom(options).binariesDir, `python-${target}`);

export const resolveBundledPythonExecutable = (target, options = {}) =>
  path.join(
    resolveBundledPythonRuntimeDirForStore(target, options),
    resolvePythonRuntimeSpec(target).executableRelativePath,
  );

export const assertBundledPythonRuntimeReady = async (target, options = {}) => {
  const spec = resolvePythonRuntimeSpec(target);
  const pythonDir = resolveBundledPythonRuntimeDirForStore(target, options);
  const pythonPath = resolveBundledPythonExecutable(target, options);
  const manifest = await readPythonRuntimeManifest(options);
  const manifestEntry = manifest.runtimes[target] ?? null;

  if (!manifestEntry) {
    throw new Error(`Bundled Python runtime manifest is missing target ${target}`);
  }

  const matchesPinnedAsset = manifestEntry.assetName === spec.assetName
    && manifestEntry.releaseTag === PYTHON_RUNTIME_MANIFEST.releaseTag
    && manifestEntry.sha256 === spec.sha256
    && manifestEntry.executableRelativePath === spec.executableRelativePath;
  if (!matchesPinnedAsset) {
    throw new Error(`Bundled Python runtime manifest is stale for target ${target}`);
  }

  if (!await fileExists(pythonPath)) {
    throw new Error(`Bundled Python runtime executable is missing for target ${target}: ${pythonPath}`);
  }

  return {
    target,
    path: pythonDir,
    executable: pythonPath,
    pythonVersion: PYTHON_RUNTIME_MANIFEST.pythonVersion,
  };
};

const emptyPythonRuntimeManifest = () => ({
  schemaVersion: 1,
  runtimes: {},
});

export const readPythonRuntimeManifest = async (options = {}) => {
  return readPythonRuntimeManifestFromStore(options);
};

export const readPythonRuntimeManifestFromStore = async (options = {}) => {
  try {
    const raw = await readFile(runtimeStoreFrom(options).manifestPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.runtimes === "object") {
      return parsed;
    }
  } catch {
    return emptyPythonRuntimeManifest();
  }
  return emptyPythonRuntimeManifest();
};

export const writePythonRuntimeManifest = async (manifest, options = {}) => {
  const store = runtimeStoreFrom(options);
  await mkdir(store.binariesDir, { recursive: true });
  await writeFile(store.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
};

const replaceDirectory = async (targetPath, temporaryPath) => {
  await rm(targetPath, { recursive: true, force: true }).catch(() => {});
  try {
    await rename(temporaryPath, targetPath);
    return;
  } catch (error) {
    if (!(error instanceof Error) || !String(error.message).includes("EXDEV")) {
      if ((error?.code ?? null) !== "EXDEV") {
        throw error;
      }
    }
  }
  await cp(temporaryPath, targetPath, { recursive: true, force: true });
  await rm(temporaryPath, { recursive: true, force: true }).catch(() => {});
};

const sha256Hex = async (filePath) => {
  const buffer = await readFile(filePath);
  return createHash("sha256").update(buffer).digest("hex");
};

const verifyDownloadedArchive = async (archivePath, spec) => {
  const archiveStats = await stat(archivePath);
  if (archiveStats.size !== spec.size) {
    throw new Error(
      `Python runtime archive size mismatch for ${spec.assetName}: expected ${spec.size}, received ${archiveStats.size}`,
    );
  }
  const actualSha256 = await sha256Hex(archivePath);
  if (actualSha256.toLowerCase() !== spec.sha256.toLowerCase()) {
    throw new Error(
      `Python runtime archive checksum mismatch for ${spec.assetName}: expected ${spec.sha256}, received ${actualSha256}`,
    );
  }
};

const runCommand = async (
  command,
  args,
  options = {},
) => {
  const child = spawn(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: {
      ...process.env,
      ...options.env,
    },
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

  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code}`));
    });
  });

  return { stdout, stderr };
};

const downloadToFile = async (url, outputPath) => {
  const response = await fetch(url, {
    headers: {
      Accept: "application/octet-stream",
      "User-Agent": "Ameow-python-runtime-bootstrap",
    },
  });
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await pipeline(Readable.fromWeb(response.body), createWriteStream(outputPath));
};

const extractArchive = async (archivePath, destinationPath) => {
  await rm(destinationPath, { recursive: true, force: true });
  await mkdir(destinationPath, { recursive: true });
  await runCommand("tar", ["-xzf", archivePath, "-C", destinationPath]);
};

const smokeCheckBundledPython = async (pythonPath, platformName) => {
  await runCommand(pythonPath, ["--version"]);
  await runCommand(pythonPath, ["-c", "import sqlite3, ssl; print('ok')"]);

  const tempDir = await mkdtemp(path.join(tmpdir(), "ameow-python-runtime-smoke-"));
  const venvDir = path.join(tempDir, "venv");
  const venvArgs = ["-m", "venv", venvDir];
  const venvPython = platformName === "win32"
    ? path.join(venvDir, "Scripts", "python.exe")
    : path.join(venvDir, "bin", "python");

  try {
    await runCommand(pythonPath, venvArgs);
    await runCommand(venvPython, ["-m", "pip", "--version"]);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
};

export const smokeBundledPythonRuntime = async (target) => {
  const platformName = platformForTarget(target);
  const pythonPath = resolveBundledPythonExecutable(target);
  await smokeCheckBundledPython(pythonPath, platformName);
  return pythonPath;
};

export const ensureOfficialBundledPythonRuntime = async (
  target,
  options = {},
) => {
  const spec = resolvePythonRuntimeSpec(target);
  const pythonDir = resolveBundledPythonRuntimeDirForStore(target, options);
  const pythonPath = resolveBundledPythonExecutable(target, options);
  const manifest = await readPythonRuntimeManifestFromStore(options);
  const manifestEntry = manifest.runtimes[target] ?? null;
  const force = options.force === true;

  if (!force && manifestEntry) {
    const matchesPinnedAsset = manifestEntry.assetName === spec.assetName
      && manifestEntry.releaseTag === PYTHON_RUNTIME_MANIFEST.releaseTag
      && manifestEntry.sha256 === spec.sha256;
    if (matchesPinnedAsset && await fileExists(pythonPath)) {
      if (isCurrentHostTarget(target)) {
        await smokeCheckBundledPython(pythonPath, spec.platform);
      }
      return {
        target,
        path: pythonDir,
        executable: pythonPath,
        state: "present",
        pythonVersion: PYTHON_RUNTIME_MANIFEST.pythonVersion,
      };
    }
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), "ameow-python-runtime-"));
  const archivePath = path.join(tempDir, spec.assetName);
  const extractRoot = path.join(tempDir, "extract");
  const extractedPythonDir = path.join(extractRoot, "python");
  const stagedDir = path.join(tempDir, `python-${target}`);

  try {
    await downloadToFile(spec.downloadUrl, archivePath);
    await verifyDownloadedArchive(archivePath, spec);
    await extractArchive(archivePath, extractRoot);
    if (!await fileExists(extractedPythonDir)) {
      throw new Error(`Python runtime archive did not expose the expected root directory: ${spec.assetName}`);
    }
    await rename(extractedPythonDir, stagedDir);
    const stagedPython = path.join(stagedDir, spec.executableRelativePath);
    if (spec.platform !== "win32") {
      await chmod(stagedPython, 0o755).catch(() => {});
    }
    if (isCurrentHostTarget(target)) {
      await smokeCheckBundledPython(stagedPython, spec.platform);
    }
    await mkdir(runtimeStoreFrom(options).binariesDir, { recursive: true });
    await replaceDirectory(pythonDir, stagedDir);
    manifest.runtimes[target] = {
      target,
      releaseTag: PYTHON_RUNTIME_MANIFEST.releaseTag,
      pythonVersion: PYTHON_RUNTIME_MANIFEST.pythonVersion,
      assetName: spec.assetName,
      downloadUrl: spec.downloadUrl,
      sha256: spec.sha256,
      size: spec.size,
      executableRelativePath: spec.executableRelativePath,
      preparedAt: new Date().toISOString(),
    };
    await writePythonRuntimeManifest(manifest, options);
    return {
      target,
      path: pythonDir,
      executable: pythonPath,
      state: force ? "refreshed" : "downloaded",
      pythonVersion: PYTHON_RUNTIME_MANIFEST.pythonVersion,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    await unlink(archivePath).catch(() => {});
  }
};
