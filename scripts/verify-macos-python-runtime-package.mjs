import { spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
    await runCommand(pythonPath, ["-m", "venv", venvDir]);
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

const readCommandVersion = async (command) => {
  const { stdout, stderr } = await runCommand(command, ["--version"]);
  return `${stdout}\n${stderr}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "unknown";
};

const smokePackagedDownloaderBootstrap = async (details, verifierOptions = {}) => {
  const bootstrapPath = path.join(
    details.appResourcesDir,
    "dist-electron",
    "electron",
    "managedRuntimeBootstrap.mjs",
  );
  assertPathExists(bootstrapPath, "compiled managed runtime bootstrap");
  assertPathExists(
    path.join(details.appResourcesDir, "dist-electron", "src", "electron-runtime", "platform.js"),
    "compiled electron runtime platform helper",
  );
  assertPathExists(
    path.join(details.appResourcesDir, "dist-electron", "electron", "managedPythonPackageManifest.mjs"),
    "compiled managed Python package manifest",
  );

  const bootstrap = await import(pathToFileURL(bootstrapPath).href);
  const configDir = mkdtempSync(path.join(tmpdir(), "ameow-macos-packaged-downloaders-"));
  const activities = [];
  const bootstrapOptions = {
    configDir,
    platform: "darwin",
    arch: details.arch === "arm64" ? "arm64" : "x64",
    fetch,
    bundledPythonRoot: details.pythonRoot,
    bundledPythonPath: details.pythonExecutable,
    onActivity(activity) {
      activities.push(`${activity.component}:${activity.stage}`);
    },
  };
  const keepConfigDir = verifierOptions.keepConfigDir === true;

  try {
    const ytDlp = await bootstrap.ensureManagedYtDlpRuntimeReady("verify_macos_package", bootstrapOptions);
    const galleryDl = await bootstrap.ensureManagedGalleryDlRuntimeReady("verify_macos_package", bootstrapOptions);
    const douyinDl = await bootstrap.ensureManagedDouyinDlRuntimeReady("verify_macos_package", bootstrapOptions);
    const paths = {
      ytDlp,
      galleryDl,
      douyinDl,
      ytDlpPython: bootstrap.managedYtDlpPaths(bootstrapOptions).python,
      galleryDlExpected: bootstrap.managedGalleryDlPath(bootstrapOptions),
      douyinDlExpected: bootstrap.managedDouyinDlPath(bootstrapOptions),
    };

    for (const [label, entryPath] of Object.entries(paths)) {
      assertPathExists(entryPath, `managed downloader ${label}`);
    }

    const versions = {
      "yt-dlp": await readCommandVersion(ytDlp),
      "gallery-dl": await readCommandVersion(galleryDl),
      "douyin-dl": await readCommandVersion(douyinDl),
    };
    const expectedVersions = {
      "yt-dlp": bootstrap.resolvePinnedManagedPythonPackage("yt-dlp").packageVersion,
      "gallery-dl": bootstrap.resolvePinnedManagedPythonPackage("gallery-dl").packageVersion,
      "douyin-dl": bootstrap.resolvePinnedManagedPythonPackage("douyin-dl").packageVersion,
    };

    for (const [toolId, expected] of Object.entries(expectedVersions)) {
      if (versions[toolId] !== expected) {
        throw new Error(`${toolId} version mismatch: expected ${expected}, received ${versions[toolId]}`);
      }
    }

    return {
      attempted: true,
      configDir,
      configDirRetained: keepConfigDir,
      bootstrapPath,
      entries: paths,
      versions,
      expectedVersions,
      activities,
    };
  } catch (error) {
    throw error;
  } finally {
    if (!keepConfigDir) {
      rmSync(configDir, { recursive: true, force: true });
    }
  }
};

const smokePackagedDownloaderRelocationRebuild = async (details, verifierOptions = {}) => {
  const bootstrapPath = path.join(
    details.appResourcesDir,
    "dist-electron",
    "electron",
    "managedRuntimeBootstrap.mjs",
  );
  assertPathExists(bootstrapPath, "compiled managed runtime bootstrap");
  const bootstrap = await import(pathToFileURL(bootstrapPath).href);
  const configDir = mkdtempSync(path.join(tmpdir(), "ameow-macos-packaged-relocation-config-"));
  const movedRuntimeDir = mkdtempSync(path.join(tmpdir(), "ameow-macos-packaged-relocation-runtime-"));
  const movedPythonRoot = path.join(movedRuntimeDir, path.basename(details.pythonRoot));
  const keepConfigDir = verifierOptions.keepConfigDir === true;
  const activities = [];

  const createOptions = (pythonRoot, pythonExecutable) => ({
    configDir,
    platform: "darwin",
    arch: details.arch === "arm64" ? "arm64" : "x64",
    fetch,
    bundledPythonRoot: pythonRoot,
    bundledPythonPath: pythonExecutable,
    onActivity(activity) {
      activities.push(`${activity.component}:${activity.stage}`);
    },
  });

  const ensureAllDownloaders = async (options) => {
    const ytDlp = await bootstrap.ensureManagedYtDlpRuntimeReady("verify_macos_package_relocation", options);
    const galleryDl = await bootstrap.ensureManagedGalleryDlRuntimeReady("verify_macos_package_relocation", options);
    const douyinDl = await bootstrap.ensureManagedDouyinDlRuntimeReady("verify_macos_package_relocation", options);
    return {
      ytDlp,
      galleryDl,
      douyinDl,
      ytDlpMetadata: bootstrap.managedYtDlpPaths(options).metadata,
    };
  };

  try {
    const firstOptions = createOptions(details.pythonRoot, details.pythonExecutable);
    const first = await ensureAllDownloaders(firstOptions);
    const firstMetadata = readJson(first.ytDlpMetadata);

    cpSync(details.pythonRoot, movedPythonRoot, { recursive: true });
    const movedPythonExecutable = path.join(movedPythonRoot, path.relative(details.pythonRoot, details.pythonExecutable));
    assertPathExists(movedPythonExecutable, "relocated bundled Python executable");

    const secondOptions = createOptions(movedPythonRoot, movedPythonExecutable);
    const second = await ensureAllDownloaders(secondOptions);
    const secondMetadata = readJson(second.ytDlpMetadata);

    if (firstMetadata.bundledPythonPath === secondMetadata.bundledPythonPath) {
      throw new Error("Relocation rebuild did not update bundledPythonPath metadata");
    }
    if (secondMetadata.bundledPythonPath !== movedPythonExecutable) {
      throw new Error("Relocation rebuild did not record the relocated Python executable");
    }

    for (const [label, entryPath] of Object.entries({
      ytDlp: second.ytDlp,
      galleryDl: second.galleryDl,
      douyinDl: second.douyinDl,
    })) {
      assertPathExists(entryPath, `relocated managed downloader ${label}`);
    }

    return {
      attempted: true,
      configDir,
      configDirRetained: keepConfigDir,
      firstBundledPythonPath: firstMetadata.bundledPythonPath,
      secondBundledPythonPath: secondMetadata.bundledPythonPath,
      rebuilt: firstMetadata.bundledPythonPath !== secondMetadata.bundledPythonPath,
      activities,
    };
  } finally {
    rmSync(movedRuntimeDir, { recursive: true, force: true });
    if (!keepConfigDir) {
      rmSync(configDir, { recursive: true, force: true });
    }
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

  const downloaderBootstrap = {
    attempted: false,
    skippedReason: null,
    result: null,
  };
  const downloaderBootstrapRequired = options.requireDownloaderBootstrap === true;
  if (options.staticOnly === true) {
    downloaderBootstrap.skippedReason = "static_only";
  } else if (!canExecute) {
    downloaderBootstrap.skippedReason = `non_host_target:${target}`;
    if (downloaderBootstrapRequired) {
      throw new Error(`Cannot bootstrap packaged downloaders for non-host target ${target}`);
    }
  } else if (options.verifyDownloaderBootstrap === true || downloaderBootstrapRequired) {
    downloaderBootstrap.attempted = true;
    downloaderBootstrap.result = await smokePackagedDownloaderBootstrap({
      arch,
      appResourcesDir,
      pythonRoot,
      pythonExecutable,
    }, {
      keepConfigDir: options.keepConfigDir === true,
    });
  } else {
    downloaderBootstrap.skippedReason = "not_requested";
  }

  const relocationRebuild = {
    attempted: false,
    skippedReason: null,
    result: null,
  };
  const relocationRebuildRequired = options.requireRelocationRebuild === true;
  if (options.staticOnly === true) {
    relocationRebuild.skippedReason = "static_only";
  } else if (!canExecute) {
    relocationRebuild.skippedReason = `non_host_target:${target}`;
    if (relocationRebuildRequired) {
      throw new Error(`Cannot verify relocation rebuild for non-host target ${target}`);
    }
  } else if (options.verifyRelocationRebuild === true || relocationRebuildRequired) {
    relocationRebuild.attempted = true;
    relocationRebuild.result = await smokePackagedDownloaderRelocationRebuild({
      arch,
      appResourcesDir,
      pythonRoot,
      pythonExecutable,
    }, {
      keepConfigDir: options.keepConfigDir === true,
    });
  } else {
    relocationRebuild.skippedReason = "not_requested";
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
    downloaderBootstrap,
    relocationRebuild,
  };
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const positional = Array.isArray(args._) ? args._ : [];
  const positionalFlags = new Set([
    "static-only",
    "require-execution",
    "verify-downloader-bootstrap",
    "require-downloader-bootstrap",
    "verify-relocation-rebuild",
    "require-relocation-rebuild",
    "keep-config-dir",
  ]);
  const positionalValues = positional.filter((value) => !positionalFlags.has(value));
  const result = await verifyMacosPackage({
    arch: typeof args.arch === "string" ? args.arch : positionalValues[0],
    app: typeof args.app === "string" ? args.app : positionalValues[1],
    staticOnly: args["static-only"] === "true" || positional.includes("static-only"),
    requireExecution: args["require-execution"] === "true" || positional.includes("require-execution"),
    verifyDownloaderBootstrap: args["verify-downloader-bootstrap"] === "true"
      || positional.includes("verify-downloader-bootstrap"),
    requireDownloaderBootstrap: args["require-downloader-bootstrap"] === "true"
      || positional.includes("require-downloader-bootstrap"),
    verifyRelocationRebuild: args["verify-relocation-rebuild"] === "true"
      || positional.includes("verify-relocation-rebuild"),
    requireRelocationRebuild: args["require-relocation-rebuild"] === "true"
      || positional.includes("require-relocation-rebuild"),
    keepConfigDir: args["keep-config-dir"] === "true" || positional.includes("keep-config-dir"),
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
