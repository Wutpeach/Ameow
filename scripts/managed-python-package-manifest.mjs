import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const compiledManifestPath = path.join(
  repoRoot,
  "dist-electron",
  "electron",
  "managedPythonPackageManifest.mjs",
);
const sourceManifestPath = path.join(repoRoot, "electron", "managedPythonPackageManifest.mts");

let manifestModulePromise = null;

const runCommand = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });

  child.once("error", reject);
  child.once("close", (code) => {
    if (code === 0) {
      resolve();
      return;
    }
    reject(new Error(`${command} exited with code ${code ?? 1}`));
  });
});

const shouldRebuildManifest = async () => {
  try {
    const [sourceStats, compiledStats] = await Promise.all([
      stat(sourceManifestPath),
      stat(compiledManifestPath),
    ]);
    return compiledStats.mtimeMs < sourceStats.mtimeMs;
  } catch {
    return true;
  }
};

const loadCompiledManifest = async () => {
  if (await shouldRebuildManifest()) {
    manifestModulePromise = null;
    await runCommand("npm", ["run", "electron:build"]);
  }
  manifestModulePromise ??= import(pathToFileURL(compiledManifestPath).href);
  return await manifestModulePromise;
};

export const loadManagedPythonPackageSpecs = async () => {
  const module = await loadCompiledManifest();
  return module.MANAGED_PYTHON_PACKAGE_SPECS;
};

export const resolveManagedPythonPackageSpec = async (toolId) => {
  const module = await loadCompiledManifest();
  return module.resolvePinnedManagedPythonPackage(toolId);
};
