import { existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  rm,
  stat,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

import {
  ensureOfficialBundledPythonRuntime,
  parseArgs,
  repoRoot,
  resolveRuntimeTarget,
} from "./python-runtime.mjs";
const DEFAULT_DOUYIN_URL = "https://www.douyin.com/video/7493088730088770870";

const usage = () => [
  "Usage:",
  "  npm run runtime:smoke:douyin-session -- help",
  "  npm run runtime:smoke:douyin-session -- <cookies-file> [url]",
  "  node ./scripts/smoke-douyin-dl-session-download.mjs --cookies-file <path> [--url <douyin-url>]",
  "  node ./scripts/smoke-douyin-dl-session-download.mjs --site-session <path-to-douyin.json> [--url <douyin-url>]",
  "",
  "The cookies file must contain Netscape cookies, a Cookie header/string, or an Ameow site-session JSON file.",
  "The script does not print cookie contents.",
].join("\n");

const requireNonEmptyFile = async (entryPath, label) => {
  if (!entryPath || !existsSync(entryPath)) {
    throw new Error(`Missing ${label}: ${entryPath || "(empty)"}`);
  }
  const stats = await stat(entryPath);
  if (stats.size <= 0) {
    throw new Error(`${label} is empty: ${entryPath}`);
  }
  return stats;
};

const defaultOutputDir = () => path.join(
  repoRoot,
  "build",
  "external-download-smoke",
  "douyin-dl-session",
);

const runCommand = async (command, args) => {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });

  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code ?? 1}`));
    });
  });
};

const shouldRedactKey = (key) => /cookie|cookies/i.test(key);

const sanitizeErrorContext = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeErrorContext(entry));
  }
  if (!value || typeof value !== "object") {
    return value ?? null;
  }
  const sanitized = {};
  for (const [key, entry] of Object.entries(value)) {
    sanitized[key] = shouldRedactKey(key) ? "[redacted]" : sanitizeErrorContext(entry);
  }
  return sanitized;
};

const readCookiesInput = async (entryPath) => {
  const resolvedPath = path.resolve(entryPath);
  const raw = await readFile(resolvedPath, "utf8");
  if (!raw.trim()) {
    throw new Error(`Douyin cookies file is empty: ${resolvedPath}`);
  }

  try {
    const parsed = JSON.parse(raw);
    const cookiesNetscape = typeof parsed?.cookiesNetscape === "string"
      ? parsed.cookiesNetscape.trim()
      : "";
    if (cookiesNetscape) {
      return {
        cookies: cookiesNetscape,
        sourcePath: resolvedPath,
        sourceType: "site-session",
      };
    }
  } catch {
    // Raw Netscape/Cookie-header inputs are valid and intentionally not JSON.
  }

  return {
    cookies: raw,
    sourcePath: resolvedPath,
    sourceType: "raw-cookies",
  };
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const positional = Array.isArray(args._) ? args._ : [];
  if (args.help === "true" || args.h === "true" || positional.includes("help")) {
    console.log(usage());
    return;
  }

  const cookiesFile = typeof args["site-session"] === "string"
    ? args["site-session"]
    : typeof args["cookies-file"] === "string"
    ? args["cookies-file"]
    : positional[0];
  if (!cookiesFile) {
    throw new Error(`Missing Douyin cookies file.\n${usage()}`);
  }

  const sourceUrl = typeof args.url === "string" && args.url.trim()
    ? args.url.trim()
    : positional[1] ?? DEFAULT_DOUYIN_URL;
  const outputDir = typeof args["output-dir"] === "string" && args["output-dir"].trim()
    ? path.resolve(args["output-dir"].trim())
    : defaultOutputDir();
  const fresh = args.fresh !== "false";
  const target = resolveRuntimeTarget();
  const cookiesInput = await readCookiesInput(cookiesFile);
  const cookies = cookiesInput.cookies;

  if (fresh) {
    await rm(outputDir, { recursive: true, force: true }).catch(() => {});
  }
  await mkdir(outputDir, { recursive: true });

  if (args["skip-build"] !== "true") {
    await runCommand("npm", ["run", "electron:build"]);
  }

  const { ensureManagedDouyinDlRuntimeReady } = await import(
    "../dist-electron/electron/managedRuntimeBootstrap.mjs"
  );
  const { runDouyinDlDownload } = await import(
    "../dist-electron/src/electron-runtime/douyinDlDownload.js"
  );

  const bundledPython = await ensureOfficialBundledPythonRuntime(target, { force: false });
  const activities = [];
  const bootstrapOptions = {
    configDir: path.join(outputDir, "config"),
    platform: process.platform,
    arch: process.arch,
    fetch,
    bundledPythonRoot: bundledPython.path,
    bundledPythonPath: bundledPython.executable,
    onActivity(activity) {
      activities.push(`${activity.component}:${activity.stage}`);
    },
  };
  const douyinDl = await ensureManagedDouyinDlRuntimeReady(
    "smoke_douyin_dl_session_download",
    bootstrapOptions,
  );

  const traceId = `douyin-session-${Date.now()}`;
  const context = {
    traceId,
    plan: {
      providerId: "douyin",
      enginePlans: [{
        engineId: "douyin-dl",
        sourceUrl,
      }],
    },
    enginePlan: {
      engineId: "douyin-dl",
      sourceUrl,
    },
    intent: {
      originalUrl: sourceUrl,
      pageUrl: sourceUrl,
      siteId: "douyin",
      cookies,
    },
    outputDir,
    outputStem: "douyin-session",
    config: {},
    userDataDir: path.join(outputDir, "user-data"),
    binaries: {
      ytDlp: null,
      galleryDl: null,
      douyinDl,
      ffmpeg: null,
      ffprobe: null,
      deno: null,
    },
    abortSignal: new AbortController().signal,
    onProgress() {},
  };

  try {
    const result = await runDouyinDlDownload(context);
    if (!result.success || !result.file_path) {
      throw new Error("douyin-dl session smoke did not return a successful output path");
    }
    const outputStats = await requireNonEmptyFile(result.file_path, "douyin-dl output");
    console.log(JSON.stringify({
      state: "ok",
      target,
      sourceUrl,
      cookiesSourceType: cookiesInput.sourceType,
      cookiesSourcePath: cookiesInput.sourcePath,
      outputDir,
      outputPath: result.file_path,
      outputSize: outputStats.size,
      bundledPythonPath: bundledPython.executable,
      douyinDl,
      activities,
    }, null, 2));
  } catch (error) {
    const runtimeError = error && typeof error === "object" ? error : null;
    console.error(JSON.stringify({
      state: "failed",
      target,
      sourceUrl,
      cookiesSourceType: cookiesInput.sourceType,
      cookiesSourcePath: cookiesInput.sourcePath,
      outputDir,
      bundledPythonPath: bundledPython.executable,
      douyinDl,
      name: runtimeError?.name ?? null,
      code: runtimeError?.code ?? null,
      message: error instanceof Error ? error.message : String(error),
      context: sanitizeErrorContext(runtimeError?.context),
      activities,
    }, null, 2));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
