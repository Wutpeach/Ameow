import assert from 'node:assert/strict';
import { cp, readFile, writeFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
export const PRODUCT_HOST = 'org.ameow.browser_sessions';
async function javascriptFiles(directory) {
  const files = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) files.push(...await javascriptFiles(path));
    else if (item.name.endsWith('.js')) files.push(path);
  }
  return files;
}
export async function prepareIsolatedExtension(source, target, host) {
  assert(/^org\.ameow\.browser_sessions\.fixture\.[a-z0-9_]+$/.test(host));
  await cp(source, target, { recursive: true, errorOnExist: true, force: false });
  const guard = '(' + installNativeGuard.toString() + ')(' + JSON.stringify(host) + ');\n';
  const files = [];
  for (const path of await javascriptFiles(target)) {
    const original = await readFile(path, 'utf8');
    const text = guard + original.replaceAll(PRODUCT_HOST, host);
    assert(!text.includes('"' + PRODUCT_HOST + '"') && !text.includes("'" + PRODUCT_HOST + "'"), 'no literal production native target in any runtime entry/chunk');
    await writeFile(path, text);
    files.push({ path: relative(target, path).replaceAll('\\', '/'), sha256: createHash('sha256').update(text).digest('hex'), guarded: true });
  }
  const manifest = JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8'));
  assert(files.some(f => f.path === manifest.background.service_worker));
  const popup = await readFile(join(target, manifest.action.default_popup), 'utf8');
  for (const match of popup.matchAll(/<script[^>]+src="([^"]+)"/g)) assert(files.some(f => f.path === match[1]), 'every popup entry is guarded');
  const receipt = { host, files, originalBuild: JSON.parse(await readFile(join(source, 'build.json'), 'utf8')), guard: 'all JS entries/chunks; API calls reject other hosts before invoking browser', fallback: false };
  await writeFile(join(target, 'fixture-build.json'), JSON.stringify(receipt, null, 2));
  return receipt;
}
export function installNativeGuard(allowedHost) {
  // AMEOW_FIXTURE_NATIVE_GUARD: test-only fail-closed boundary, before the real API.
  if (globalThis.ameowFixtureNativeGuard) {
    if (globalThis.ameowFixtureNativeGuard !== allowedHost) throw Error('TEST_NATIVE_HOST_MISMATCH');
    return;
  }
  globalThis.ameowFixtureNativeGuard = allowedHost;
  const api = globalThis.chrome;
  if (!api?.runtime) throw Error('TEST_EXTENSION_RUNTIME_MISSING');
  const operations = ['ping', 'list', 'authorize', 'sync', 'revoke', 'report_failure', 'submit'];
  function record(method, host, payload) {
    const operation = operations.includes(payload?.operation?.operation) ? payload.operation.operation : 'connection';
    void api.storage.local.set({ ['fixture_native_audit_' + crypto.randomUUID()]: { at: Date.now(), method, host: host === allowedHost ? allowedHost : 'FORBIDDEN', operation, allowed: host === allowedHost } });
    if (host !== allowedHost) throw Error('TEST_NATIVE_HOST_FORBIDDEN');
  }
  if (typeof api.runtime.connectNative === 'function') {
    const connect = api.runtime.connectNative.bind(api.runtime);
    api.runtime.connectNative = host => {
      record('connectNative', host);
      const port = connect(host), post = port.postMessage.bind(port);
      port.postMessage = message => { record('port.postMessage', host, message); return post(message); };
      return port;
    };
  }
  if (typeof api.runtime.sendNativeMessage === 'function') {
    const send = api.runtime.sendNativeMessage.bind(api.runtime);
    api.runtime.sendNativeMessage = (host, message, ...rest) => { record('sendNativeMessage', host, message); return send(host, message, ...rest); };
  }
}
export async function assertRuntimeIsolation(worker, host) {
  const result = await worker.evaluate(({ host, production }) => {
    if (globalThis.ameowFixtureNativeGuard !== host) throw Error('Missing live native guard');
    const rejected = [];
    for (const method of ['connectNative', 'sendNativeMessage']) {
      try { chrome.runtime[method](production, { operation: { operation: 'ping' } }); }
      catch (e) { rejected.push({ method, error: e.message }); }
    }
    return rejected;
  }, { host, production: PRODUCT_HOST });
  assert.equal(result.length, 2);
  assert(result.every(r => r.error === 'TEST_NATIVE_HOST_FORBIDDEN'));
  return { productionCallsBlockedBeforeAPI: result };
}
export async function nativeAudit(worker) {
  return worker.evaluate(async () => Object.entries(await chrome.storage.local.get(null)).filter(([k]) => k.startsWith('fixture_native_audit_')).map(([, v]) => v));
}
