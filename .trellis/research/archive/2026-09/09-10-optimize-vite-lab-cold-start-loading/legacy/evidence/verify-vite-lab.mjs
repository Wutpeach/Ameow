import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createConnection, createServer } from "node:net";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { resolveConfig } from "vite";

const phaseIndex = process.argv.indexOf("--phase");
const phase = phaseIndex === -1 ? "after" : process.argv[phaseIndex + 1];
const force = process.argv.includes("--force");
const twoLabOnly = process.argv.includes("--two-lab-only");
const ordinaryLabOnly = process.argv.includes("--ordinary-lab-only");
const lifecycleOnly = process.argv.includes("--lifecycle-only");
const openOnly = process.argv.includes("--open-only");
assert.ok(["before", "after"].includes(phase), "Use --phase before or --phase after.");

const evidenceDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(evidenceDir, "../../../..");
const runId = `${phase}-${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}`;
const outputDir = resolve(evidenceDir, "runs", runId);
const labConfig = resolve(repositoryRoot, "vite.lab.config.ts");
const rendererConfig = resolve(repositoryRoot, "vite.config.ts");
const viteBin = resolve(repositoryRoot, "node_modules/vite/bin/vite.js");
const openRecorder = resolve(evidenceDir, "record-vite-open.js");
const cacheParent = resolve(repositoryRoot, "node_modules/.vite-lab");
await mkdir(cacheParent, { recursive: true });
const ownedCacheRoot = await mkdtemp(resolve(cacheParent, "verify-"));
const lifecycleCacheRoot = resolve(ownedCacheRoot, "lifecycle");
const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
const execute = promisify(execFile);
const ownedRuns = new Set();
const viewport = { width: 1440, height: 1000 };

async function reservePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Could not reserve a port."));
      server.close((error) => error ? reject(error) : resolvePort(address.port));
    });
  });
}

async function waitForPort(port, child) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Vite exited before listening on ${port}.`);
    const listening = await new Promise((resolveListening) => {
      const socket = createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.destroy();
        resolveListening(true);
      });
      socket.once("error", () => resolveListening(false));
    });
    if (listening) return;
    await delay(50);
  }
  throw new Error(`Vite did not listen on ${port} within two minutes.`);
}

async function snapshotCache(cacheDir) {
  try {
    const entries = await readdir(cacheDir);
    const metadata = await stat(cacheDir);
    return { cacheDir, exists: true, modifiedAt: metadata.mtime.toISOString(), entries };
  } catch (error) {
    if (error && error.code === "ENOENT") return { cacheDir, exists: false, entries: [] };
    throw error;
  }
}

async function resolveViteConfig(configFile, cacheRoot, port) {
  const previousCacheRoot = process.env.LAB_TEST_CACHE_ROOT;
  if (cacheRoot) process.env.LAB_TEST_CACHE_ROOT = cacheRoot;
  else delete process.env.LAB_TEST_CACHE_ROOT;
  try {
    const config = await resolveConfig({ configFile, server: { port }, ...(cacheRoot && configFile === rendererConfig ? { cacheDir: resolve(cacheRoot, String(port)) } : {}) }, "serve", "development");
    return { cacheDir: config.cacheDir, entries: config.optimizeDeps.entries, port: config.server.port, strictPort: config.server.strictPort };
  } finally {
    if (previousCacheRoot === undefined) delete process.env.LAB_TEST_CACHE_ROOT;
    else process.env.LAB_TEST_CACHE_ROOT = previousCacheRoot;
  }
}

async function waitForOptimizerMetadata(run) {
  const metadata = resolve(run.config.cacheDir, "deps", "_metadata.json");
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      await stat(metadata);
      return Date.now();
    } catch (error) {
      if (!error || error.code !== "ENOENT") throw error;
    }
    await delay(50);
  }
  return null;
}

function optimizerEvidence(run, metadataAt) {
  return {
    cacheMetadataDetectedMs: metadataAt === null ? null : metadataAt - run.startedAt,
    logSpans: run.logEvents
      .filter(({ text }) => text.includes("vite:deps") || text.includes("vite:transform"))
      .map(({ at, text }) => ({ processLaunchMs: at - run.startedAt, text })),
  };
}

async function startVite({ configFile, cacheRoot, force = false, command = "vite", port: requestedPort }) {
  if (force) assert.ok(cacheRoot && resolve(cacheRoot).startsWith(`${ownedCacheRoot}${sep}`), "Forced optimization requires this run's owned cache.");
  const port = requestedPort ?? await reservePort();
  const config = await resolveViteConfig(configFile, cacheRoot, port);
  if (cacheRoot) assert.equal(config.cacheDir, resolve(cacheRoot, String(port)).replaceAll("\\", "/"), "Test cache must keep the effective Vite port as its final path segment.");
  const cacheBefore = await snapshotCache(config.cacheDir);
  if (force) assert.equal(cacheBefore.exists, false, "Forced optimization requires an empty task-owned cache.");
  let effectiveConfigFile = configFile;
  if (configFile === rendererConfig && cacheRoot) {
    effectiveConfigFile = resolve(outputDir, `ordinary-${port}.config.mjs`);
    await writeFile(effectiveConfigFile, `import base from ${JSON.stringify(pathToFileURL(rendererConfig).href)}; export default async env => ({ ...await base(env), cacheDir: ${JSON.stringify(config.cacheDir)} });`);
  }
  await writeFile(resolve(outputDir, `server-${port}.json`), JSON.stringify({ config, cacheBefore, force, command }, null, 2));
  const startedAt = Date.now();
  const commandArgs = command === "npm"
    ? ["run", "dev:lab", "--", "--host", "127.0.0.1", "--port", String(port)]
    : [viteBin, "--config", effectiveConfigFile, "--host", "127.0.0.1", "--port", String(port), ...(force ? ["--force"] : [])];
  const executable = command === "npm" ? (process.platform === "win32" ? "npm.cmd" : "npm") : process.execPath;
  let log = "";
  const logEvents = [];
  let readyAt = null;
  const childEnv = {
    ...process.env,
    BROWSER: command === "npm" ? openRecorder : "none",
    DEBUG: "vite:deps",
    FORCE_COLOR: "0",
  };
  if (cacheRoot) childEnv.LAB_TEST_CACHE_ROOT = cacheRoot;
  else delete childEnv.LAB_TEST_CACHE_ROOT;
  const child = spawn(executable, commandArgs, {
    cwd: repositoryRoot,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
    shell: command === "npm" && process.platform === "win32",
    windowsHide: true,
    detached: process.platform !== "win32",
  });
  const onOutput = (chunk) => {
    const text = chunk.toString();
    log += text;
    logEvents.push({ at: Date.now(), text });
    if (readyAt === null && text.includes("ready in")) readyAt = Date.now();
  };
  child.stdout.on("data", onOutput);
  child.stderr.on("data", onOutput);
  const run = {
    child,
    baseUrl: `http://127.0.0.1:${port}`,
    startedAt,
    get log() { return log; },
    get readyAt() { return readyAt; },
    config,
    cacheBefore,
    logEvents,
    cleanupCache: Boolean(cacheRoot && !cacheBefore.exists),
    command: `${executable} ${commandArgs.join(" ")}`,
  };
  ownedRuns.add(run);
  try {
    await once(child, "spawn");
    await waitForPort(port, child);
    return run;
  } catch (error) {
    try {
      await writeFile(resolve(outputDir, `startup-${port}.log`), run.log);
    } finally {
      await stopVite(run);
    }
    throw error;
  }
}

async function stopVite(run, { preserveCache = false } = {}) {
  const { child } = run;
  if (!ownedRuns.has(run)) return;
  if (child.pid && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit");
    if (process.platform === "win32") {
      try {
        await execute("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 10_000 });
      } catch (error) {
        if (child.exitCode === null && child.signalCode === null) throw error;
      }
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
    let timer;
    try {
      await Promise.race([exited, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Owned process ${child.pid} did not exit.`)), 10_000);
      })]);
    } finally {
      clearTimeout(timer);
    }
  }
  if (run.cleanupCache && !preserveCache) {
    assert.ok(resolve(run.config.cacheDir).startsWith(`${ownedCacheRoot}${sep}`), "Refusing cleanup outside this run's exclusive node_modules cache root.");
    assert.equal(run.cacheBefore.exists, false, "Never remove a preexisting cache.");
    await rm(run.config.cacheDir, { recursive: true, force: true });
  }
  ownedRuns.delete(run);
}

function assertNoOptimizerErrors(log) {
  assert.doesNotMatch(log, /EPERM|EACCES|missing optimized|optimized dependency.*not found/i);
}

async function visitLab(page, run, label, scenario, options = {}) {
  const failures = [];
  const warnings = [];
  let navigations = 0;
  const listeners = {
    pageerror: (error) => failures.push(`pageerror: ${error.message}`),
    requestfailed: (request) => failures.push(`requestfailed: ${request.url()}`),
    console: (message) => {
      if (message.type() !== "error") return;
      const event = `console: ${message.text()}`;
      if (message.text() === "Unsupported style property %s. Did you mean %s? -electron-corner-smoothing ElectronCornerSmoothing") warnings.push(event);
      else failures.push(event);
    },
    response: (response) => { if (response.status() >= 400) failures.push(`HTTP ${response.status()}: ${response.url()}`); },
    request: (request) => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations += 1; },
  };
  for (const [event, listener] of Object.entries(listeners)) page.on(event, listener);
  try {
    const navigationStartedAt = Date.now();
    const navigationOptions = { waitUntil: "domcontentloaded", timeout: options.timeout ?? 120_000 };
    const response = options.reload
      ? await page.reload(navigationOptions)
      : await page.goto(`${run.baseUrl}/lab.html?scenario=compact-pointer`, navigationOptions);
    await page.locator("[data-lab-workspace]").waitFor({ state: "visible", timeout: 120_000 });
    await page.locator("[data-lab-stage-viewport]").waitFor({ state: "visible", timeout: 120_000 });
    await page.waitForFunction(() => {
      const rect = document.querySelector("[data-lab-stage-viewport]")?.getBoundingClientRect();
      return rect && rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.left >= 0
        && rect.bottom <= innerHeight && rect.right <= innerWidth;
    });
    const visibleAt = Date.now();
    const workspace = page.locator("[data-lab-workspace]");
    assert.notEqual(await workspace.getAttribute("data-lab-selected-scenario"), scenario, "Click must change scenario.");
    await page.locator(`[data-lab-scenario="${scenario}"]`).click();
    await page.waitForFunction((selected) => document.querySelector("[data-lab-workspace]")?.getAttribute("data-lab-selected-scenario") === selected
      && new URL(location.href).searchParams.get("scenario") === selected, scenario);
    const interactiveAt = Date.now();
    const navigationTiming = await page.evaluate(() => {
      const entry = performance.getEntriesByType("navigation")[0];
      return { responseStartMs: entry.responseStart, responseEndMs: entry.responseEnd,
        domContentLoadedEventEndMs: entry.domContentLoadedEventEnd };
    });
    const browserCacheTransfers = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => ({
      name: entry.name,
      initiatorType: entry.initiatorType,
      startTimeMs: entry.startTime,
      requestStartMs: entry.requestStart,
      responseStartMs: entry.responseStart,
      responseEndMs: entry.responseEnd,
      durationMs: entry.duration,
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
    })));
    await page.screenshot({ path: resolve(outputDir, `${label}.png`), animations: "disabled" });
    assert.equal(response?.status(), 200, "Lab HTML must respond successfully.");
    assert.equal(navigations, 1, "Scenario click must not cause a document reload.");
    assert.deepEqual(failures, [], "Lab must have no console, HTTP, page or request errors.");
    return { processLaunchToVisibleMs: visibleAt - run.startedAt,
      navigationToVisibleMs: visibleAt - navigationStartedAt,
      navigationToInteractiveMs: interactiveAt - navigationStartedAt, navigationTiming,
      browserCacheTransfers, warnings,
      processLaunchToReadyLogMs: run.readyAt === null ? null : run.readyAt - run.startedAt };
  } finally {
    for (const [event, listener] of Object.entries(listeners)) page.off(event, listener);
  }
}

async function warmRefreshes(page, run, labelPrefix = "warm") {
  const results = [];
  for (const [index, scenario] of ["compact-pointer", "download-queued"].entries()) {
    results.push(await visitLab(page, run, `${labelPrefix}-${index + 1}`, scenario, { reload: true }));
  }
  assertNoOptimizerErrors(run.log);
  return results;
}

async function runLifecycle(browser, cacheRoot) {
  const run = await startVite({ configFile: labConfig, cacheRoot, force });
  const optimizerMetadataAt = run.cacheBefore.exists ? null : waitForOptimizerMetadata(run);
  try {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    try {
      const page = await context.newPage();
      const cold = await visitLab(page, run, "cold", "download-queued");
      const warm = await warmRefreshes(page, run);
      let hmr;
      let restart;
      if (process.argv.includes("--hmr-restart")) {
        const probeName = `__watcher_probe_${run.config.port}.css`;
        const probePath = resolve(repositoryRoot, "src/lab", probeName);
        const initial = ":root { --lab-watcher-probe: before; }\n";
        const changed = ":root { --lab-watcher-probe: after; }\n";
        let expected = initial;
        await writeFile(probePath, initial, { flag: "wx" });
        try {
          await page.evaluate((name) => import(`/src/lab/${name}`), probeName);
          await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue("--lab-watcher-probe").trim() === "before");
          assert.equal(await readFile(probePath, "utf8"), initial);
          const changedAt = Date.now();
          await writeFile(probePath, changed);
          expected = changed;
          await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue("--lab-watcher-probe").trim() === "after", { timeout: 30_000 });
          hmr = { probePath, browserAppliedMs: Date.now() - changedAt };
        } finally {
          assert.equal(await readFile(probePath, "utf8"), expected, "Preserve a probe if another writer changed it.");
          await rm(probePath);
        }
        const metadataPath = resolve(run.config.cacheDir, "deps/_metadata.json");
        const metadataBefore = await readFile(metadataPath);
        const metadataStat = await stat(metadataPath);
        await writeFile(resolve(outputDir, "lifecycle.log"), run.log);
        await stopVite(run, { preserveCache: true });
        const restarted = await startVite({ configFile: labConfig, cacheRoot, port: run.config.port });
        try {
          const visit = await visitLab(page, restarted, "restart", "download-queued");
          assert.deepEqual(await readFile(metadataPath), metadataBefore, "Restart must reuse optimizer metadata.");
          assert.equal((await stat(metadataPath)).mtimeMs, metadataStat.mtimeMs, "Restart must not rewrite optimizer metadata.");
          assert.match(restarted.log, /Hash is consistent.*Skipping/i);
          assertNoOptimizerErrors(restarted.log);
          restart = { command: restarted.command, config: restarted.config, cacheBefore: restarted.cacheBefore, visit, metadataSha256: createHash("sha256").update(metadataBefore).digest("hex"), unchangedMetadata: true, log: restarted.log };
          await writeFile(resolve(outputDir, "restart.log"), restarted.log);
        } finally { await stopVite(restarted); }
      }
      return { command: run.command, config: run.config, cacheBefore: run.cacheBefore, cacheAfter: await snapshotCache(run.config.cacheDir), cold, warm,
        hmr, restart, optimizer: optimizerEvidence(run, await optimizerMetadataAt), log: run.log };
    } finally {
      await context.close();
    }
  } finally {
    await stopVite(run);
  }
}

async function runAfterConcurrency(browser) {
  const ordinary = await startVite({ configFile: rendererConfig, cacheRoot: resolve(ownedCacheRoot, "ordinary"), force: true });
  const lab = await startVite({ configFile: labConfig, cacheRoot: resolve(ownedCacheRoot, "ordinary-lab"), force: true });
  try {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    try {
      const ordinaryPage = await context.newPage();
      const labPage = await context.newPage();
      const [ordinaryResponse, labResult] = await Promise.all([
        ordinaryPage.goto(`${ordinary.baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 240_000 }),
        visitLab(labPage, lab, "ordinary-plus-lab", "download-queued", { timeout: 240_000 }),
      ]);
      const ordinaryRefresh = await ordinaryPage.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
      assert.equal(ordinaryResponse?.status(), 200, "Ordinary Vite must serve its production entry.");
      assert.equal(ordinaryRefresh?.status(), 200, "Ordinary Vite must refresh its production entry.");
      const labWarm = await warmRefreshes(labPage, lab, "ordinary-plus-lab-warm");
      assert.notEqual(ordinary.config.cacheDir, lab.config.cacheDir, "Ordinary Vite and Lab must use different cache directories.");
      assertNoOptimizerErrors(ordinary.log);
      assertNoOptimizerErrors(lab.log);
      return { ordinaryConfig: ordinary.config, labConfig: lab.config, ordinaryCommand: ordinary.command, labCommand: lab.command, labResult, labWarm, ordinaryOptimizer: optimizerEvidence(ordinary, null), labOptimizer: optimizerEvidence(lab, null), ordinaryStartedAt: ordinary.startedAt, labStartedAt: lab.startedAt, ordinaryLog: ordinary.log, labLog: lab.log };
    } finally {
      await context.close();
    }
  } finally {
    await writeFile(resolve(outputDir, "ordinary-vite.log"), ordinary.log);
    await writeFile(resolve(outputDir, "ordinary-plus-lab.log"), lab.log);
    await Promise.all([stopVite(ordinary), stopVite(lab)]);
  }
}

async function runTwoLabs(browser) {
  const cacheRoot = resolve(ownedCacheRoot, "two-lab");
  const first = await startVite({ configFile: labConfig, cacheRoot, force: true });
  const second = await startVite({ configFile: labConfig, cacheRoot, force: true });
  try {
    const firstConfig = first.config;
    const secondConfig = second.config;
    assert.notEqual(firstConfig.cacheDir, secondConfig.cacheDir, "Different Lab ports must use different cache directories.");
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    try {
      const [firstPage, secondPage] = await Promise.all([context.newPage(), context.newPage()]);
      const [firstResult, secondResult] = await Promise.all([
        visitLab(firstPage, first, "two-lab-first", "download-queued"),
        visitLab(secondPage, second, "two-lab-second", "download-queued"),
      ]);
      const [firstWarm, secondWarm] = await Promise.all([
        warmRefreshes(firstPage, first, "two-lab-first-warm"),
        warmRefreshes(secondPage, second, "two-lab-second-warm"),
      ]);
      assertNoOptimizerErrors(first.log);
      assertNoOptimizerErrors(second.log);
      return { firstConfig, secondConfig, firstCommand: first.command, secondCommand: second.command, firstResult, secondResult, firstWarm, secondWarm, firstStartedAt: first.startedAt, secondStartedAt: second.startedAt, firstOptimizer: optimizerEvidence(first, null), secondOptimizer: optimizerEvidence(second, null), firstLog: first.log, secondLog: second.log };
    } finally {
      await context.close();
    }
  } finally {
    await writeFile(resolve(outputDir, "two-lab-first.log"), first.log);
    await writeFile(resolve(outputDir, "two-lab-second.log"), second.log);
    await Promise.all([stopVite(first), stopVite(second)]);
  }
}

async function verifyOpenTarget() {
  const recordPath = resolve(outputDir, "npm-dev-lab-open.txt");
  await writeFile(recordPath, "");
  const previousRecord = process.env.LAB_OPEN_RECORD;
  process.env.LAB_OPEN_RECORD = recordPath;
  try {
    const run = await startVite({ configFile: labConfig, cacheRoot: resolve(ownedCacheRoot, "open"), command: "npm" });
    try {
      const deadline = Date.now() + 30_000;
      let openedUrl = "";
      while (Date.now() < deadline) {
        openedUrl = await readFile(recordPath, "utf8");
        if (openedUrl.trim()) break;
        await delay(50);
      }
      assert.ok(openedUrl.trim(), "npm run dev:lab must trigger an automatic browser open.");
      const opened = new URL(openedUrl.trim());
      assert.equal(opened.pathname, "/lab.html", "npm run dev:lab must open /lab.html.");
      return { command: run.command, openedUrl: opened.href, log: run.log };
    } finally {
      await writeFile(resolve(outputDir, "npm-dev-lab.log"), run.log);
      await stopVite(run);
    }
  } finally {
    if (previousRecord === undefined) delete process.env.LAB_OPEN_RECORD;
    else process.env.LAB_OPEN_RECORD = previousRecord;
  }
}

async function checkCleanup() {
  assert.equal(process.platform, "win32", "This focused npm-tree check targets Windows.");
  await writeFile(resolve(outputDir, "package.json"), JSON.stringify({ private: true, scripts: { hold: "node hold.cjs" } }));
  await writeFile(resolve(outputDir, "hold.cjs"), `const { spawn } = require("node:child_process");
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
console.log("OWNED " + process.pid + " " + child.pid);
setInterval(() => {}, 1000);
`);
  const child = spawn("npm.cmd", ["--prefix", outputDir, "run", "hold"], { shell: true, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  const run = { child };
  ownedRuns.add(run);
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  let pids;
  try {
    await once(child, "spawn");
    const deadline = Date.now() + 10_000;
    while (!output.includes("OWNED ") && Date.now() < deadline) await delay(50);
    const match = output.match(/OWNED (\d+) (\d+)/);
    assert.ok(match, output);
    pids = [child.pid, Number(match[1]), Number(match[2])];
  } finally {
    await stopVite(run);
  }
  for (const pid of pids) assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  // Exercise startVite's own failed-startup cleanup, without any real Vite cache.
  const failingConfig = resolve(outputDir, "fail-start.config.mjs");
  await writeFile(failingConfig, `export default { cacheDir: ${JSON.stringify(resolve(outputDir, "unused-cache"))}, plugins: [{ name: "fail-start", configureServer() { throw new Error("Intentional startup failure"); } }] };`);
  await assert.rejects(startVite({ configFile: failingConfig }), /exited before listening/);
  assert.equal(ownedRuns.size, 0);
  const result = { pids, allExited: true, failedStartupRejected: true, output };
  await writeFile(resolve(outputDir, "cleanup-check.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}

await mkdir(outputDir, { recursive: true });
const sourceFiles = ["vite.lab.config.ts", "vite.config.ts", "package.json", "package-lock.json", "src/lab/lab-main.tsx", "src/lab/lab.css", "postcss.config.js"];
const sourceHashes = {};
await mkdir(resolve(outputDir, "source"));
for (const file of sourceFiles) {
  const contents = await readFile(resolve(repositoryRoot, file));
  sourceHashes[file] = createHash("sha256").update(contents).digest("hex");
  await writeFile(resolve(outputDir, "source", file.replaceAll("/", "__")), contents);
}
await writeFile(resolve(outputDir, "source-hashes.json"), JSON.stringify(sourceHashes, null, 2));
await writeFile(resolve(outputDir, "runner-snapshot.mjs"), await readFile(fileURLToPath(import.meta.url)));
try {
if (process.argv.includes("--cleanup-self-check")) {
  await checkCleanup();
} else {
const browser = await chromium.launch({ headless: true });
try {
  const normalLabConfig = await resolveViteConfig(labConfig, undefined, 1421);
  const lifecycle = twoLabOnly || ordinaryLabOnly || openOnly ? { skipped: true } : await runLifecycle(browser, lifecycleCacheRoot);
  const result = {
    phase,
    force,
    environment: { node: process.version, platform: process.platform, browser: browser.version(), viewport, browserCachePolicy: "default; no routing or cache disabling" },
    normalLabConfig,
    lifecycle,
  };
  if (!twoLabOnly && !ordinaryLabOnly && !openOnly) await writeFile(resolve(outputDir, "lifecycle.log"), lifecycle.log);
  if (phase === "after" && !lifecycleOnly) {
    if (openOnly) {
      if (!process.argv.includes("--skip-open")) result.openTarget = await verifyOpenTarget();
    } else if (ordinaryLabOnly) {
      result.concurrency = await runAfterConcurrency(browser);
      result.openTarget = await verifyOpenTarget();
      await writeFile(resolve(outputDir, "ordinary-vite.log"), result.concurrency.ordinaryLog);
      await writeFile(resolve(outputDir, "ordinary-plus-lab.log"), result.concurrency.labLog);
      if (result.openTarget) await writeFile(resolve(outputDir, "npm-dev-lab.log"), result.openTarget.log);
    } else {
      if (!twoLabOnly) result.concurrency = await runAfterConcurrency(browser);
      result.twoLabStress = await runTwoLabs(browser);
      if (!twoLabOnly) {
        result.openTarget = await verifyOpenTarget();
        await writeFile(resolve(outputDir, "ordinary-vite.log"), result.concurrency.ordinaryLog);
        await writeFile(resolve(outputDir, "ordinary-plus-lab.log"), result.concurrency.labLog);
        await writeFile(resolve(outputDir, "npm-dev-lab.log"), result.openTarget.log);
      }
    }
  }
  await writeFile(resolve(outputDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Vite Lab ${phase} evidence written to ${outputDir}`);
} catch (error) {
  await writeFile(resolve(outputDir, "error.txt"), `${error.stack || error}\n`);
  throw error;
} finally {
  const cleanup = await Promise.allSettled([...ownedRuns].map(stopVite));
  await browser.close();
  const failures = cleanup.filter((result) => result.status === "rejected");
  if (failures.length) throw new AggregateError(failures.map((result) => result.reason), "Owned process cleanup failed");
}
}
} finally {
  assert.equal(ownedRuns.size, 0, "All owned processes must settle before cache cleanup.");
  assert.equal(dirname(ownedCacheRoot), cacheParent);
  assert.ok(ownedCacheRoot.startsWith(resolve(cacheParent, "verify-")));
  await rm(ownedCacheRoot, { recursive: true, force: true });
  await writeFile(resolve(outputDir, "cleanup.json"), JSON.stringify({ ownedCacheRoot, removed: true, ownedRuns: ownedRuns.size }));
}
