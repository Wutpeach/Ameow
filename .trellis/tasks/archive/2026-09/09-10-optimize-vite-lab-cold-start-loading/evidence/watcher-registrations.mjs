import assert from "node:assert/strict";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(import.meta.url);
const evidence = dirname(script);
const root = resolve(evidence, "../../../..");
const phase = process.argv[2];
assert.ok(["before", "after", "after-final"].includes(phase));
const output = resolve(evidence, `watcher-registrations-${phase}.json`);
if (process.argv.includes("--child")) {
  const registrations = new Map();
  const groups = {};
  const started = Date.now();
  let server;
  const snapshot = () => {
    const watched = server?.watcher.getWatched();
    fs.writeFileSync(output, JSON.stringify({ elapsedMs: Date.now() - started, pid: process.pid,
      registrations: [...registrations.values()].reduce((a, b) => a + b, 0), uniquePaths: registrations.size,
      groups, watchedDirectories: watched ? Object.keys(watched).length : null,
      watchedEntries: watched ? Object.values(watched).reduce((n, entries) => n + entries.length, 0) : null,
      paths: [...registrations.keys()], watched }, null, 2));
  };
  const original = fs.watch;
  fs.watch = function(path, ...args) {
    const absolute = resolve(String(path));
    registrations.set(absolute, (registrations.get(absolute) ?? 0) + 1);
    const local = relative(root, absolute).replaceAll("\\", "/");
    const key = local.split("/")[0];
    groups[key] ??= { path: resolve(root, key), registrations: 0, examples: [] };
    groups[key].registrations++;
    if (groups[key].examples.length < 5) groups[key].examples.push(absolute);
    if (registrations.size % 500 === 0) snapshot();
    return original.call(this, path, ...args);
  };
  syncBuiltinESMExports();
  const { createServer } = await import("vite");
  server = await createServer({ configFile: resolve(root, "vite.lab.config.ts"), server: { port: 49971, open: false }, optimizeDeps: { noDiscovery: true, include: [] } });
  snapshot();
  setTimeout(async () => { snapshot(); await server.close(); process.exit(0); }, 15_000);
} else {
  assert.equal(fs.existsSync(output), false, "Preserve historical inventory.");
  fs.writeFileSync(resolve(evidence, `watcher-registrations-${phase}-config.ts`), fs.readFileSync(resolve(root, "vite.lab.config.ts")), { flag: "wx" });
  const cacheParent = resolve(root, "node_modules/.vite-lab");
  fs.mkdirSync(cacheParent, { recursive: true });
  const cacheRoot = fs.mkdtempSync(resolve(cacheParent, "watcher-sample-"));
  const log = fs.openSync(resolve(evidence, `watcher-registrations-${phase}.log`), "wx");
  const child = spawn(process.execPath, [script, phase, "--child"], { cwd: root, env: { ...process.env, LAB_TEST_CACHE_ROOT: cacheRoot, BROWSER: "none", DEBUG: "" }, stdio: ["ignore", log, log], windowsHide: true });
  let forced = false;
  const timer = setTimeout(() => { forced = true; child.kill(); }, 45_000);
  try {
    await once(child, "exit");
    assert.throws(() => process.kill(child.pid, 0), { code: "ESRCH" });
    assert.ok(fs.existsSync(output), "Inventory must be persisted before native watcher calls.");
    const result = JSON.parse(fs.readFileSync(output, "utf8"));
    console.log(JSON.stringify({ ...result, paths: undefined, watched: undefined, forced }));
    fs.writeFileSync(resolve(evidence, `watcher-registrations-${phase}-cleanup.json`), JSON.stringify({ pid: child.pid, forced, exited: true, cacheRoot, removed: true }));
  } finally {
    clearTimeout(timer);
    fs.closeSync(log);
    assert.equal(dirname(cacheRoot), cacheParent);
    assert.ok(cacheRoot.startsWith(resolve(cacheParent, "watcher-sample-")));
    fs.rmSync(cacheRoot, { recursive: true, force: true });
  }
}
