import { spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  isCurrentHostTarget,
  parseArgs,
  platformForTarget,
  resolvePythonRuntimeSpec,
  resolveRuntimeTarget,
} from "./python-runtime.mjs";
import { PYTHON_RUNTIME_MANIFEST } from "./runtime-manifest.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(repoRoot, "dist-release");

const normalizeArch = (arch) => {
  if (arch === "aarch64") {
    return "arm64";
  }
  if (arch === "x86_64") {
    return "x64";
  }
  if (arch === "arm64" || arch === "x64") {
    return arch;
  }
  throw new Error(`Unsupported macOS architecture: ${arch}`);
};

const targetForArch = (arch) => resolveRuntimeTarget("darwin", normalizeArch(arch));

const candidateAppBundleRoots = (arch) => {
  const normalized = normalizeArch(arch);
  return [
    normalized === "arm64" ? path.join(outputRoot, "mac-arm64") : path.join(outputRoot, "mac"),
    path.join(outputRoot, "mac"),
    path.join(outputRoot, "mac-arm64"),
  ].filter((entry, index, entries) => entries.indexOf(entry) === index);
};

const findAppBundle = (arch) => {
  for (const root of candidateAppBundleRoots(arch)) {
    if (!existsSync(root)) {
      continue;
    }
    const entry = readdirSync(root, { withFileTypes: true }).find(
      (candidate) => candidate.isDirectory() && candidate.name.endsWith(".app"),
    );
    if (entry) {
      return path.join(root, entry.name);
    }
  }
  throw new Error(`No .app bundle found under ${outputRoot} for arch ${arch}`);
};

const assertPathExists = (entryPath, label) => {
  if (!existsSync(entryPath)) {
    throw new Error(`Missing ${label}: ${entryPath}`);
  }
};

const assertPathMissing = (entryPath, label) => {
  if (existsSync(entryPath)) {
    throw new Error(`Unexpected ${label}: ${entryPath}`);
  }
};

const runCommand = async (command, args, options = {}) => {
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

const smokePackagedPython = async (pythonPath) => {
  const version = await runCommand(pythonPath, ["--version"]);
  await runCommand(pythonPath, ["-c", "import sqlite3, ssl; print('ok')"]);

  const tempDir = mkdtempSync(path.join(tmpdir(), "ameow-macos-packaged-python-smoke-"));
  const venvDir = path.join(tempDir, "venv");
  const venvPython = path.join(venvDir, "bin", "python");

  try {
    await runCommand(pythonPath, ["-m", "venv", "--copies", venvDir]);
    const pip = await runCommand(venvPython, ["-m", "pip", "--version"]);
    return {
      pythonVersion: `${version.stdout}\n${version.stderr}`.trim(),
      pipVersion: `${pip.stdout}\n${pip.stderr}`.trim(),
      venvPython,
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
};

const readJson = (entryPath) => JSON.parse(readFileSync(entryPath, "utf8"));

const verifyManifestEntry = (manifestPath, target) => {
  const manifest = readJson(manifestPath);
  const entry = manifest?.runtimes?.[target] ?? null;
  const spec = resolvePythonRuntimeSpec(target);
  if (!entry) {
    throw new Error(`Python runtime manifest is missing target ${target}`);
  }
  if (
    entry.releaseTag !== PYTHON_RUNTIME_MANIFEST.releaseTag
    || entry.pythonVersion !== PYTHON_RUNTIME_MANIFEST.pythonVersion
    || entry.assetName !== spec.assetName
    || entry.sha256 !== spec.sha256
    || entry.executableRelativePath !== spec.executableRelativePath
  ) {
    throw new Error(`Python runtime manifest entry is stale for target ${target}`);
  }
  return entry;
};

const hasPackagedResourceDirWiring = (source) =>
  /resourceDir\s*:\s*app\.isPackaged\s*\?\s*process\.resourcesPath\s*:\s*null/.test(source);

const verifyMacosPackage = async (options) => {
  const arch = normalizeArch(options.arch ?? process.arch);
  const target = targetForArch(arch);
  const spec = resolvePythonRuntimeSpec(target);
  const appBundlePath = path.resolve(options.app ?? findAppBundle(arch));
  const resourcesDir = path.join(appBundlePath, "Contents", "Resources");
  const appResourcesDir = path.join(resourcesDir, "app");
  const binariesDir = path.join(appResourcesDir, "desktop-assets", "binaries");
  const pythonRoot = path.join(binariesDir, `python-${target}`);
  const pythonExecutable = path.join(pythonRoot, spec.executableRelativePath);
  const pythonManifestPath = path.join(binariesDir, ".official-python-runtimes.json");
  const managedPackageManifestPath = path.join(
    appResourcesDir,
    "dist-electron",
    "electron",
    "managedPythonPackageManifest.mjs",
  );
  const mainPath = path.join(appResourcesDir, "dist-electron", "electron", "main.mjs");

  assertPathExists(appBundlePath, ".app bundle");
  assertPathExists(pythonExecutable, "bundled Python executable");
  assertPathExists(pythonManifestPath, "bundled Python manifest");
  assertPathExists(managedPackageManifestPath, "managed Python package manifest");
  assertPathExists(mainPath, "compiled Electron main");

  const manifestEntry = verifyManifestEntry(pythonManifestPath, target);
  const mainSource = readFileSync(mainPath, "utf8");
  if (!hasPackagedResourceDirWiring(mainSource)) {
    throw new Error("Compiled Electron main does not use process.resourcesPath for packaged resourceDir");
  }

  assertPathMissing(
    path.join(binariesDir, ".official-downloader-binaries.json"),
    "legacy downloader manifest",
  );

  const binaryEntries = readdirSync(binariesDir).sort();
  const legacyDownloaderEntries = binaryEntries.filter((entry) =>
    entry.startsWith("yt-dlp") || entry.startsWith("gallery-dl"));
  if (legacyDownloaderEntries.length > 0) {
    throw new Error(`Legacy standalone downloader assets remain: ${legacyDownloaderEntries.join(", ")}`);
  }

  const pythonEntries = binaryEntries.filter((entry) => entry.startsWith("python-"));
  const unexpectedPythonEntries = pythonEntries.filter((entry) => entry !== `python-${target}`);
  if (unexpectedPythonEntries.length > 0) {
    throw new Error(`Unexpected Python runtimes packaged for ${target}: ${unexpectedPythonEntries.join(", ")}`);
  }

  const executionRequired = options.requireExecution === true;
  const canExecute = process.platform === "darwin" && platformForTarget(target) === process.platform
    && isCurrentHostTarget(target);
  const execution = {
    attempted: false,
    skippedReason: null,
    result: null,
  };

  if (options.staticOnly === true) {
    execution.skippedReason = "static_only";
  } else if (!canExecute) {
    execution.skippedReason = `non_host_target:${target}`;
    if (executionRequired) {
      throw new Error(`Cannot execute packaged Python for non-host target ${target}`);
    }
  } else {
    execution.attempted = true;
    execution.result = await smokePackagedPython(pythonExecutable);
  }

  return {
    state: "ok",
    arch,
    target,
    appBundlePath,
    resourcesDir,
    binariesDir,
    pythonRoot,
    pythonExecutable,
    pythonManifestPath,
    managedPackageManifestPath,
    mainPath,
    pythonExecutableSize: statSync(pythonExecutable).size,
    manifestEntry,
    binaryEntries,
    execution,
  };
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const positional = Array.isArray(args._) ? args._ : [];
  const positionalFlags = new Set(["static-only", "require-execution"]);
  const positionalValues = positional.filter((value) => !positionalFlags.has(value));
  const result = await verifyMacosPackage({
    arch: typeof args.arch === "string" ? args.arch : positionalValues[0],
    app: typeof args.app === "string" ? args.app : positionalValues[1],
    staticOnly: args["static-only"] === "true" || positional.includes("static-only"),
    requireExecution: args["require-execution"] === "true" || positional.includes("require-execution"),
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
