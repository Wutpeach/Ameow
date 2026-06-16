import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { loadManagedPythonPackageSpecs } from "./managed-python-package-manifest.mjs";
import {
  ensureOfficialBundledPythonRuntime,
  parseArgs,
  repoRoot,
  resolveRuntimeTarget,
} from "./python-runtime.mjs";
import {
  ensureManagedGalleryDlRuntimeReady,
  ensureManagedYtDlpRuntimeReady,
  managedGalleryDlPath,
  managedYtDlpPaths,
} from "../dist-electron/electron/managedRuntimeBootstrap.mjs";

const runCommand = async (command, args) => {
  const child = spawn(command, args, {
    cwd: repoRoot,
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

const readCommandVersion = async (command) => {
  const { stdout, stderr } = await runCommand(command, ["--version"]);
  return `${stdout}\n${stderr}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "unknown";
};

const defaultConfigDir = () => path.join(
  repoRoot,
  "build",
  "manual-runtime-smoke",
  "unicode-config-测试",
);

const assertExists = (label, entryPath) => {
  if (!existsSync(entryPath)) {
    throw new Error(`${label} is missing: ${entryPath}`);
  }
};

const localFixturePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l+3g7wAAAABJRU5ErkJggg==",
  "base64",
);
const localFixtureVideo = Buffer.from("ameow local smoke video");

const listenLocalFixtureServer = async () => {
  const server = createServer((request, response) => {
    if (request.url === "/pixel.png") {
      response.writeHead(200, {
        "content-type": "image/png",
        "content-length": localFixturePng.length,
      });
      response.end(localFixturePng);
      return;
    }
    if (request.url === "/sample.mp4") {
      response.writeHead(200, {
        "content-type": "video/mp4",
        "content-length": localFixtureVideo.length,
      });
      response.end(localFixtureVideo);
      return;
    }
    response.writeHead(404);
    response.end("missing");
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Local fixture server did not expose a TCP port");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
};

const assertNonEmptyFile = async (label, entryPath) => {
  const fileStats = await stat(entryPath);
  if (fileStats.size <= 0) {
    throw new Error(`${label} is empty: ${entryPath}`);
  }
};

const runLocalExecutionSmoke = async (ytDlp, galleryDl, configDir) => {
  const outputDir = path.join(configDir, "local-execution-smoke");
  await rm(outputDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(outputDir, { recursive: true });
  const fixtureServer = await listenLocalFixtureServer();

  try {
    const ytDlpOutput = path.join(outputDir, "yt-dlp.%(ext)s");
    const ytDlpResultPath = path.join(outputDir, "yt-dlp.mp4");
    const galleryDlResultPath = path.join(outputDir, "gallery-dl.png");

    await runCommand(ytDlp, [
      "--ignore-config",
      "--no-warnings",
      "-o",
      ytDlpOutput,
      `${fixtureServer.baseUrl}/sample.mp4`,
    ]);
    await runCommand(galleryDl, [
      "--config-ignore",
      "--directory",
      outputDir,
      "--filename",
      "gallery-dl.{extension}",
      `${fixtureServer.baseUrl}/pixel.png`,
    ]);

    await assertNonEmptyFile("yt-dlp local output", ytDlpResultPath);
    await assertNonEmptyFile("gallery-dl local output", galleryDlResultPath);

    return {
      outputDir,
      files: (await readdir(outputDir)).sort(),
      ytDlpOutput: ytDlpResultPath,
      galleryDlOutput: galleryDlResultPath,
    };
  } finally {
    await fixtureServer.close();
  }
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configDir = typeof args.configDir === "string" && args.configDir.trim()
    ? path.resolve(args.configDir.trim())
    : defaultConfigDir();
  const fresh = args.fresh !== "false";
  const target = resolveRuntimeTarget();
  const bundledPython = await ensureOfficialBundledPythonRuntime(target, { force: false });
  const activities = [];

  if (fresh) {
    await rm(configDir, { recursive: true, force: true }).catch(() => {});
  }
  await mkdir(configDir, { recursive: true });

  const options = {
    configDir,
    platform: process.platform,
    arch: process.arch,
    fetch,
    bundledPythonRoot: bundledPython.path,
    bundledPythonPath: bundledPython.executable,
    onActivity(activity) {
      activities.push(`${activity.component}:${activity.stage}`);
    },
  };

  const ytDlp = await ensureManagedYtDlpRuntimeReady("smoke_managed_python_downloaders", options);
  const galleryDl = await ensureManagedGalleryDlRuntimeReady("smoke_managed_python_downloaders", options);
  const managedPackageSpecs = await loadManagedPythonPackageSpecs();

  const ytDlpPython = managedYtDlpPaths(options).python;
  assertExists("yt-dlp", ytDlp);
  assertExists("yt-dlp venv Python", ytDlpPython);
  assertExists("gallery-dl", managedGalleryDlPath(options));

  const versions = {
    "yt-dlp": await readCommandVersion(ytDlp),
    "gallery-dl": await readCommandVersion(galleryDl),
  };

  for (const [toolId, version] of Object.entries(versions)) {
    const expected = managedPackageSpecs[toolId]?.packageVersion;
    if (expected && version !== expected) {
      throw new Error(`${toolId} version mismatch: expected ${expected}, received ${version}`);
    }
  }

  const localExecution = await runLocalExecutionSmoke(ytDlp, galleryDl, configDir);

  console.log(JSON.stringify({
    target,
    configDir,
    bundledPythonPath: bundledPython.executable,
    entries: {
      ytDlp,
      galleryDl,
    },
    versions,
    localExecution,
    activities,
    state: "ok",
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
