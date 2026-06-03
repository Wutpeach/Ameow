import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const extensionRoot = join(repoRoot, "browser-extension");
const outputRoot = join(repoRoot, "docs-screenshot-captures");
const electronEntry = join(repoRoot, "dist-electron", "electron", "main.mjs");
const electronExecutable = join(repoRoot, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
const rendererDevServerUrl = "http://localhost:1420";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const extensionDeviceScaleFactor = 4;
const desktopDeviceScaleFactor = 4;

function npmInvocation(args) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    return {
      command: process.execPath,
      args: [npmExecPath, ...args],
    };
  }

  return {
    command: npmCommand,
    args,
  };
}

const extensionStates = {
  connected: {
    status: { state: "connected", connected: true, statusText: "Connected" },
    launcher: {
      status: { enabled: true, mounted: true, visible: true, hiddenForSite: false },
      config: { disabledSitePatterns: [] },
    },
    media: {
      success: true,
      pageUrl: "https://www.bilibili.com/video/BV1AmeowDemo",
      pageTitle: "Ameow demo video",
      scannedAt: Date.now(),
      videos: [
        {
          id: "demo-video-main",
          mediaType: "video",
          title: "Ameow demo video",
          url: "https://example.com/ameow-demo-video.mp4",
          host: "bilibili.com",
          source: "video_element",
          extension: "mp4",
          width: 1920,
          height: 1080,
        },
      ],
      audios: [],
      images: [],
    },
  },
  disconnected: {
    status: { state: "offline", connected: false, statusText: "Offline" },
    launcher: {
      status: { enabled: true, mounted: false, visible: false, hiddenForSite: false },
      config: { disabledSitePatterns: [] },
    },
    media: {
      success: true,
      pageUrl: "https://www.bilibili.com/video/BV1AmeowDemo",
      pageTitle: "Ameow demo video",
      scannedAt: Date.now(),
      videos: [],
      audios: [],
      images: [],
    },
  },
};

const extensionTargets = [
  {
    state: "connected",
    fileName: "extension-popup-connected.png",
  },
  {
    state: "disconnected",
    fileName: "extension-popup-disconnected.png",
  },
];

const desktopTargets = [
  {
    target: "desktop-main-window-expanded",
    fileName: "desktop-main-window-expanded.png",
  },
  {
    target: "desktop-download-active",
    fileName: "desktop-download-active.png",
  },
  {
    target: "desktop-transcode-active",
    fileName: "desktop-transcode-active.png",
  },
  {
    target: "desktop-settings-hub",
    fileName: "desktop-settings-hub.png",
  },
  {
    target: "desktop-settings-appearance",
    fileName: "desktop-settings-appearance.png",
  },
  {
    target: "desktop-settings-saving",
    fileName: "desktop-settings-saving.png",
  },
  {
    target: "desktop-settings-sites",
    fileName: "desktop-settings-sites.png",
  },
  {
    target: "desktop-settings-plugins",
    fileName: "desktop-settings-plugins.png",
  },
  {
    target: "desktop-settings-system",
    fileName: "desktop-settings-system.png",
  },
];

const browserContentTargets = [
  {
    target: "browser-floating-launcher-entry",
    fileName: "browser-floating-launcher-entry.png",
  },
];

function contentTypeFor(filePath) {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".png") return "image/png";
  return "application/octet-stream";
}

function startStaticServer(rootDir) {
  const server = createServer((request, response) => {
    const rawUrl = request.url ?? "/";
    const url = new URL(rawUrl, "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname);
    const relativePath = pathname === "/" ? "popup.html" : pathname.replace(/^\/+/, "");

    if (relativePath === "__docs_launcher_test.html") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <title>Ameow launcher screenshot fixture page</title>
    <style>
      html, body { margin: 0; min-height: 100%; }
      body {
        min-height: 100vh;
        background: #f6f7fb;
        color: #1f2937;
        font-family: "SF Pro Text", "Segoe UI", Arial, sans-serif;
      }
      main {
        width: min(960px, calc(100vw - 64px));
        margin: 0 auto;
        padding: 72px 0;
      }
      .hero {
        height: 420px;
        border-radius: 18px;
        background: linear-gradient(135deg, #ffffff 0%, #e5eefc 100%);
        box-shadow: 0 20px 60px rgba(31, 41, 55, 0.14);
      }
    </style>
  </head>
  <body>
    <main><div class="hero" aria-hidden="true"></div></main>
  </body>
</html>`);
      return;
    }

    const filePath = resolve(rootDir, relativePath);

    if (!filePath.startsWith(resolve(rootDir))) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    if (!existsSync(filePath)) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, { "Content-Type": contentTypeFor(filePath) });
    createReadStream(filePath).pipe(response);
  });

  return new Promise((resolveServer, rejectServer) => {
    server.once("error", rejectServer);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectServer);
      const address = server.address();
      if (!address || typeof address === "string") {
        rejectServer(new Error("Unable to resolve docs screenshot static server address."));
        return;
      }
      resolveServer({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

async function closeServer(server) {
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) {
        rejectClose(error);
        return;
      }
      resolveClose();
    });
  });
}

async function readPngDimensions(filePath) {
  const buffer = await readFile(filePath);
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== pngSignature) {
    throw new Error(`Not a PNG file: ${filePath}`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function createChromeMockScript(stateName) {
  const state = extensionStates[stateName];
  return `
    (() => {
      const state = ${JSON.stringify(state)};
      const listeners = [];
      const storage = {
        defaultVideoDownloadQuality: "balanced",
        defaultDirectDownloadQuality: "balanced",
        ameowCurrentLanguage: "zh-CN",
      };

      function clone(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
      }

      function sendMessage(message, callback) {
        let response = null;
        switch (message?.type) {
          case "get_language":
            response = { language: "zh-CN" };
            break;
          case "get_status":
          case "connect":
            response = clone(state.status);
            break;
          case "get_launcher_controls_state":
            response = clone(state.launcher);
            break;
          case "get_media_scan_cache":
          case "scan_page_media":
            response = { cached: true, result: clone(state.media), ...clone(state.media) };
            break;
          case "get_theme":
            response = { theme: "black" };
            break;
          default:
            response = { success: true };
            break;
        }
        queueMicrotask(() => callback?.(response));
      }

      window.chrome = {
        runtime: {
          lastError: null,
          getManifest() {
            return { version: "0.3.0", name: "Ameow" };
          },
          getURL(path) {
            return new URL(path, window.location.href).toString();
          },
          sendMessage,
          onMessage: {
            addListener(listener) {
              listeners.push(listener);
            },
            removeListener(listener) {
              const index = listeners.indexOf(listener);
              if (index >= 0) listeners.splice(index, 1);
            },
          },
        },
        storage: {
          local: {
            get(keys, callback) {
              const result = {};
              const requested = Array.isArray(keys) ? keys : [keys];
              for (const key of requested) {
                if (typeof key === "string" && key in storage) {
                  result[key] = storage[key];
                }
              }
              queueMicrotask(() => callback?.(result));
            },
            set(payload, callback) {
              Object.assign(storage, payload);
              queueMicrotask(() => callback?.());
            },
          },
          onChanged: {
            addListener() {},
            removeListener() {},
          },
        },
        tabs: {
          create() {},
        },
      };
    })();
  `;
}

function createLauncherChromeMockScript() {
  return `
    (() => {
      const storage = {
        defaultVideoDownloadQuality: "balanced",
        defaultDirectDownloadQuality: "balanced",
        ameowCurrentLanguage: "zh-CN",
        ameowFloatingLauncherConfig: {
          enabled: true,
          side: "right",
          verticalPosition: 0.5,
          locked: false,
          disabledSitePatterns: [],
        },
      };
      const runtimeListeners = [];

      function clone(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
      }

      function sendMessage(message, callback) {
        let response = { success: true };
        switch (message?.type) {
          case "get_language":
            response = { language: "zh-CN" };
            break;
          case "get_theme":
            response = { theme: "black" };
            break;
          case "get_status":
            response = { state: "connected", connected: true, statusText: "Connected" };
            break;
          case "ameow_launcher_status":
            response = { success: true };
            break;
          case "ameow_download_current_content":
            response = { success: true };
            break;
          default:
            response = { success: true };
            break;
        }
        queueMicrotask(() => callback?.(response));
      }

      window.chrome = {
        runtime: {
          lastError: null,
          getURL(path) {
            return new URL(path, window.location.href).toString();
          },
          sendMessage,
          onMessage: {
            addListener(listener) {
              runtimeListeners.push(listener);
            },
            removeListener(listener) {
              const index = runtimeListeners.indexOf(listener);
              if (index >= 0) runtimeListeners.splice(index, 1);
            },
          },
        },
        storage: {
          local: {
            get(keys, callback) {
              const result = {};
              const requested = Array.isArray(keys) ? keys : [keys];
              for (const key of requested) {
                if (typeof key === "string" && key in storage) {
                  result[key] = clone(storage[key]);
                }
              }
              queueMicrotask(() => callback?.(result));
            },
            set(payload, callback) {
              Object.assign(storage, payload);
              queueMicrotask(() => callback?.());
            },
          },
          onChanged: {
            addListener() {},
            removeListener() {},
          },
        },
      };
    })();
  `;
}

async function ensureChromiumInstalled() {
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error([
      "Unable to launch Playwright Chromium.",
      "Run: npx playwright install chromium",
      message,
    ].join("\n"));
  } finally {
    await browser?.close();
  }
}

async function captureExtensionScreenshots() {
  console.log("Capturing real extension popup screenshots...");
  await ensureChromiumInstalled();
  const { server, baseUrl } = await startStaticServer(extensionRoot);
  const browser = await chromium.launch({ headless: true });

  try {
    for (const target of extensionTargets) {
      const page = await browser.newPage({
        viewport: { width: 420, height: 720 },
        deviceScaleFactor: extensionDeviceScaleFactor,
      });
      await page.addInitScript(createChromeMockScript(target.state));
      await page.goto(`${baseUrl}/popup.html`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => document.querySelector("main.ameow-popup"));
      await page.waitForFunction(() => document.querySelector("#popupVersion")?.textContent?.includes("0.3.0"));

      const popup = page.locator("main.ameow-popup").first();
      const outputPath = join(outputRoot, target.fileName);
      await popup.screenshot({ path: outputPath, animations: "disabled" });
      await page.close();
    }
  } finally {
    await browser.close();
    await closeServer(server);
  }
}

async function captureBrowserContentScreenshots() {
  console.log("Capturing real browser content-script screenshots...");
  await ensureChromiumInstalled();
  const { server, baseUrl } = await startStaticServer(extensionRoot);
  const browser = await chromium.launch({ headless: true });

  try {
    for (const target of browserContentTargets) {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: extensionDeviceScaleFactor,
      });
      await page.addInitScript(createLauncherChromeMockScript());
      await page.goto(`${baseUrl}/__docs_launcher_test.html`, { waitUntil: "networkidle" });

      for (const scriptName of [
        "locale-utils.js",
        "launcher-config.js",
        "capture-evidence.js",
        "direct-download-quality.js",
        "floating-launcher.js",
      ]) {
        await page.addScriptTag({ path: join(extensionRoot, scriptName) });
      }

      await page.waitForFunction(() => {
        const root = document.querySelector("#ameow-floating-launcher-root");
        return Boolean(root?.shadowRoot?.querySelector(".ameow-launcher-handle"));
      });
      await page.waitForTimeout(600);

      const launcherHandle = page.locator("#ameow-floating-launcher-root .ameow-launcher-handle").first();
      await launcherHandle.screenshot({
        path: join(outputRoot, target.fileName),
        animations: "disabled",
      });
      await page.close();
    }
  } finally {
    await browser.close();
    await closeServer(server);
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
      shell: false,
      ...options,
    });

    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      if (signal) {
        rejectRun(new Error(`${command} exited with signal ${signal}`));
        return;
      }
      if (code !== 0) {
        rejectRun(new Error(`${command} exited with code ${code ?? 1}`));
        return;
      }
      resolveRun();
    });
  });
}

function spawnOwnedProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "pipe",
    shell: false,
    ...options,
  });

  child.stdout?.on("data", (chunk) => {
    process.stdout.write(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    process.stderr.write(chunk);
  });

  return child;
}

async function waitForHttpReady(url, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until timeout.
    }
    await new Promise((resolveDelay) => {
      setTimeout(resolveDelay, 300);
    });
  }
  throw new Error(`Timed out waiting for renderer dev server: ${url}`);
}

async function stopOwnedProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  await new Promise((resolveStop) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
      resolveStop();
    }, 5000);

    child.once("exit", () => {
      clearTimeout(timeout);
      resolveStop();
    });
    child.kill("SIGTERM");
  });
}

async function stopOwnedProcessTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise((resolveStop) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
      killer.once("exit", resolveStop);
      killer.once("error", resolveStop);
    });
    return;
  }

  await stopOwnedProcess(child);
}

async function captureDesktopScreenshot() {
  console.log("Capturing real Electron desktop screenshots...");
  const electronBuild = npmInvocation(["run", "electron:build"]);
  await runCommand(electronBuild.command, electronBuild.args);

  const devRenderer = npmInvocation(["run", "dev:renderer"]);
  const viteProcess = spawnOwnedProcess(devRenderer.command, devRenderer.args);
  try {
    await waitForHttpReady(rendererDevServerUrl);
    for (const target of desktopTargets) {
      const outputPath = join(outputRoot, target.fileName);
      const userDataDir = await mkdtemp(join(tmpdir(), `ameow-docs-screenshot-${target.target}-`));
      try {
        await runCommand(electronExecutable, [electronEntry], {
          env: {
            ...process.env,
            AMEOW_DOCS_SCREENSHOT_TARGET: target.target,
            AMEOW_DOCS_SCREENSHOT_OUTPUT: outputPath,
            AMEOW_DOCS_SCREENSHOT_DEVICE_SCALE_FACTOR: String(desktopDeviceScaleFactor),
            AMEOW_DOCS_SCREENSHOT_USER_DATA: userDataDir,
            AMEOW_ELECTRON_DEV_SERVER_URL: rendererDevServerUrl,
          },
        });
      } finally {
        await rm(userDataDir, { recursive: true, force: true });
      }
    }
  } finally {
    await stopOwnedProcessTree(viteProcess);
  }
}

async function writeReadme() {
  const files = [
    ...desktopTargets.map((target) => target.fileName),
    ...extensionTargets.map((target) => target.fileName),
    ...browserContentTargets.map((target) => target.fileName),
  ];
  const lines = [
    "# Ameow Screenshot Captures",
    "",
    "这些图片是为文档二次加工准备的高清、干净界面截图素材。",
    "",
    "运行命令：",
    "",
    "```text",
    "npm run docs:screenshots",
    "```",
    "",
    "输出文件：",
    "",
  ];

  for (const file of files) {
    const filePath = join(outputRoot, file);
    const stats = await stat(filePath);
    const dimensions = await readPngDimensions(filePath);
    lines.push(`- ${file} (${dimensions.width}x${dimensions.height}, ${stats.size} bytes)`);
  }

  lines.push(
    "",
    "来源说明：",
    "",
    `- \`desktop-main-window-expanded.png\`、\`desktop-download-active.png\`、\`desktop-transcode-active.png\`：真实 Electron 主窗口，通过 \`webContents.capturePage()\` 捕获；DPR ${desktopDeviceScaleFactor}；下载/转码状态由真实 UI Lab 事件驱动。`,
    `- \`desktop-settings-*.png\`：真实 Electron 设置窗口，通过 \`webContents.capturePage()\` 捕获；DPR ${desktopDeviceScaleFactor}；截图流程使用临时 userData，避免泄露本机配置。`,
    `- \`extension-popup-connected.png\`：真实 \`browser-extension/popup.html\`、\`popup.css\`、\`popup.js\` 渲染；DPR ${extensionDeviceScaleFactor}；脚本只 mock Chrome Extension API 返回值。`,
    "- `extension-popup-disconnected.png`：同上，mock 为 Offline/Disconnected 状态。",
    `- \`browser-floating-launcher-entry.png\`：真实 \`floating-launcher.js\` 与 \`floating-launcher.css\` 注入本地测试页面后截图；DPR ${extensionDeviceScaleFactor}；脚本只 mock Chrome Extension API 返回值。`,
    "",
  );

  await writeFile(join(outputRoot, "README.md"), `${lines.join("\n")}\n`, "utf8");
}

async function assertOutputs() {
  const files = [
    ...desktopTargets.map((target) => target.fileName),
    ...extensionTargets.map((target) => target.fileName),
    ...browserContentTargets.map((target) => target.fileName),
  ];

  for (const file of files) {
    const stats = await stat(join(outputRoot, file));
    if (stats.size <= 0) {
      throw new Error(`Generated screenshot is empty: ${file}`);
    }
  }
}

async function main() {
  await mkdir(outputRoot, { recursive: true });
  await captureExtensionScreenshots();
  await captureBrowserContentScreenshots();
  await captureDesktopScreenshot();
  await assertOutputs();
  await writeReadme();

  const readme = await readFile(join(outputRoot, "README.md"), "utf8");
  console.log(readme);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
