import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, rm, stat } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { resolveConfig } from "vite";

const requiredScenarios = ["compact-pointer", "download-queued", "transcode-failed", "runtime-failed"];
const scenarios = [...requiredScenarios, "download-active"];
const outputArgument = process.argv.indexOf("--output");
const outputDir = resolve(process.cwd(), outputArgument === -1 ? "docs-screenshot-captures/lab" : process.argv[outputArgument + 1]);

const reservePort = () => new Promise((resolvePort, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (address === null || typeof address === "string") return reject(new Error("Could not reserve a Lab port."));
    server.close((error) => error ? reject(error) : resolvePort(address.port));
  });
});

const waitForServer = async (url) => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) })).ok) return;
    } catch {
      // Vite has not bound the port yet.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Lab server did not become ready: ${url}`);
};

async function capture() {
const port = await reservePort();
const baseUrl = `http://127.0.0.1:${port}`;
const labConfig = await resolveConfig({ configFile: "vite.lab.config.ts", server: { port } }, "serve", "development");
assert.equal(labConfig.server.port, port, "Lab capture must resolve the requested Vite port.");
const cacheDir = labConfig.cacheDir;
const cacheExisted = await stat(cacheDir).then(() => true, (error) => {
  if (error && error.code === "ENOENT") return false;
  throw error;
});
const vite = spawn(process.execPath, [
  "node_modules/vite/bin/vite.js",
  "--config", "vite.lab.config.ts",
  "--host", "127.0.0.1",
  "--port", String(port),
], { cwd: process.cwd(), stdio: "inherit" });

try {
  await once(vite, "spawn");
  await mkdir(outputDir, { recursive: true });
  await waitForServer(`${baseUrl}/lab.html`);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 480, height: 480 }, deviceScaleFactor: 1 });
    const failures = [];
    let mainDocumentNavigations = 0;
    page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
    page.on("requestfailed", (request) => failures.push(`requestfailed: ${request.url()}`));
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) mainDocumentNavigations += 1;
    });

    await page.goto(`${baseUrl}/lab.html?scenario=${scenarios[0]}&theme=black&reducedMotion=true&capture=true`, { waitUntil: "domcontentloaded" });
    for (const scenario of scenarios) {
      if (scenario !== scenarios[0]) {
        await page.evaluate((nextScenario) => {
          const url = new URL(window.location.href);
          url.searchParams.set("scenario", nextScenario);
          window.history.pushState(null, "", url);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }, scenario);
      }
      const ready = page.locator(`[data-lab-ready][data-lab-selected-scenario="${scenario}"]`);
      await ready.waitFor({ state: "attached", timeout: 15_000 });
      assert.equal(await ready.getAttribute("data-lab-selected-scenario"), scenario);
      await page.screenshot({ path: resolve(outputDir, `${scenario}.png`), animations: "disabled" });
    }
    assert.equal(mainDocumentNavigations, 1, "scenario changes must not request another document");
    assert.deepEqual(failures, [], "Lab capture had page or request failures");
    console.log(`Lab screenshots written to ${outputDir}`);
  } finally {
    await browser.close();
  }
} finally {
  await stopVite(vite);
  // An inherited override belongs to its caller, even if its cache was absent.
  await cleanCaptureCache(cacheDir, port, cacheExisted || process.env.LAB_TEST_CACHE_ROOT !== undefined);
}
}

async function stopVite(vite) {
  if (!vite.pid) return; // A rejected spawn has no process to await.
  if (vite.exitCode !== null || vite.signalCode !== null) return;
  const exited = once(vite, "exit");
  vite.kill();
  let timer;
  try {
    await Promise.race([exited, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Lab capture Vite process did not exit.")), 10_000);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

async function cleanCaptureCache(cacheDir, port, preserve) {
  if (preserve) return;
  assert.ok(Number.isInteger(port) && port > 0 && port <= 65535);
  const expected = resolve("node_modules/.vite-lab", String(port));
  assert.equal(resolve(cacheDir), expected, "Refusing cleanup outside the exact capture port cache.");
  await rm(expected, { recursive: true, force: true });
  console.log(`Lab capture cache cleaned: ${expected}`);
}

if (process.argv.includes("--cleanup-self-check")) {
  const port = await reservePort();
  const cacheDir = resolve("node_modules/.vite-lab", String(port));
  await mkdir(resolve("node_modules/.vite-lab"), { recursive: true });
  await mkdir(cacheDir); // Exclusive creation: never claim an existing cache.
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"]);
  try {
    await once(child, "spawn");
    await cleanCaptureCache(cacheDir, port, true);
    assert.ok((await stat(cacheDir)).isDirectory(), "Preexisting/override cache must survive.");
    await assert.rejects(cleanCaptureCache(resolve(cacheDir, ".."), port, false), /exact capture port cache/);
  } finally {
    await stopVite(child);
    if (child.pid) assert.throws(() => process.kill(child.pid, 0), { code: "ESRCH" });
    await cleanCaptureCache(cacheDir, port, false);
  }
  await assert.rejects(stat(cacheDir), { code: "ENOENT" });
  const failed = spawn(resolve(cacheDir, "nonexistent-executable"));
  await assert.rejects(once(failed, "spawn"), { code: "ENOENT" });
  await stopVite(failed);
  console.log("Capture cleanup self-check passed: path guard, preservation, exit, removal, failed spawn.");
} else {
  await capture();
}
