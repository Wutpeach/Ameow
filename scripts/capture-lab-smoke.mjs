import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { chromium } from "playwright";

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
      if ((await fetch(url)).ok) return;
    } catch {
      // Vite has not bound the port yet.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Lab server did not become ready: ${url}`);
};

const port = await reservePort();
const baseUrl = `http://127.0.0.1:${port}`;
const vite = spawn(process.execPath, [
  "node_modules/vite/bin/vite.js",
  "--config", "vite.lab.config.ts",
  "--host", "127.0.0.1",
  "--port", String(port),
], { cwd: process.cwd(), stdio: "inherit" });

try {
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
  vite.kill();
}
